import * as THREE from 'three';
import { FilesetResolver, PoseLandmarker, HandLandmarker, FaceLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";
import { state, el } from './state.js';
import { onNewLandmarks, isPlayingCustomSign } from './trainer.js';

import { resetAllSmoothers, getFrameSmoothing } from './mocap-filters.js';
import { cacheElbowHingeAxes } from './mocap-constraints.js';
import {
    applyIdlePose,
    cacheIdlePoseQuaternions,
    lowerArmNaturally,
    relaxHandToRest,
    HAND_BONE_SUFFIXES
} from './mocap-idle.js';
import { mapHandToAvatar, mapPoseToAvatar } from './mocap-pose.js';
import { sampleRecordingFrame, updateRecordingTimer } from './mocap-recorder.js';

// --- MoCap Constraints & Timing Constants ---
export const MOCAP_TRACK_RESPONSE = 14;
export const MOCAP_FALLBACK_RESPONSE = 5.8;
export const MOCAP_HAND_RELAX_RESPONSE = 8.5;
export const MOCAP_TRACK_LOST_GRACE_MS = 600;
export const MOCAP_POSE_VISIBILITY_THRESHOLD = 0.08;
export const MOCAP_HAND_CONFIDENCE_THRESHOLD = 0.45;

const mocapTracking = {
    lastFrameTime: 0,
    sides: {
        Left: { lastPoseSeen: performance.now(), lastHandSeen: performance.now() },
        Right: { lastPoseSeen: performance.now(), lastHandSeen: performance.now() }
    }
};

// ====== Phase 7: Smart Startup & Warmup Config ======
export const MOCAP_WARMUP_FRAMES = 15;
export const MOCAP_BLEND_IN_DURATION_MS = 1500;
export let mocapWarmupCounter = 0;
export let mocapBlendStartTime = 0;

export function getBlendFactor() {
    if (mocapWarmupCounter < MOCAP_WARMUP_FRAMES) return 0;
    const elapsed = performance.now() - mocapBlendStartTime;
    const blendProgress = Math.min(1, elapsed / MOCAP_BLEND_IN_DURATION_MS);
    return blendProgress * blendProgress * (3 - 2 * blendProgress); // smoothstep
}

export function resetMoCapTrackingState(now = performance.now()) {
    state.mocapFrameDeltaSeconds = 1 / 60;
    mocapTracking.lastFrameTime = now;
    state.mocapRestHipsWebcam = null;

    Object.values(mocapTracking.sides).forEach(sideState => {
        sideState.lastPoseSeen = now;
        sideState.lastHandSeen = now;
    });
}

export function updateMoCapFrameTiming(now) {
    if (!mocapTracking.lastFrameTime) {
        mocapTracking.lastFrameTime = now;
        state.mocapFrameDeltaSeconds = 1 / 60;
        return;
    }

    state.mocapFrameDeltaSeconds = THREE.MathUtils.clamp((now - mocapTracking.lastFrameTime) / 1000, 1 / 120, 1 / 15);
    mocapTracking.lastFrameTime = now;
}

export function getPoseLandmarkScore(lm) {
    if (!lm) return 0;
    const visibility = (typeof lm.visibility === 'number') ? lm.visibility : 1;
    const presence = (typeof lm.presence === 'number') ? lm.presence : 1;
    return Math.min(visibility, presence);
}

export function isLandmarkInFrame(lm, margin = 0.1) {
    if (!lm) return false;
    return lm.x >= -margin && lm.x <= 1 + margin && lm.y >= -margin && lm.y <= 1 + margin;
}

export function isPoseLandmarkUsable(lm, margin = 0.1) {
    return getPoseLandmarkScore(lm) >= MOCAP_POSE_VISIBILITY_THRESHOLD && isLandmarkInFrame(lm, margin);
}

export function isPoseArmReliable(landmarks, side) {
    const indices = (side === 'Left') ? [11, 13, 15] : [12, 14, 16];
    const shoulder = landmarks[indices[0]];
    const elbow = landmarks[indices[1]];
    const wrist = landmarks[indices[2]];

    return isPoseLandmarkUsable(shoulder, 0.15)
        && isPoseLandmarkUsable(elbow, 0.08)
        && isPoseLandmarkUsable(wrist, 0.05);
}

export function isHandDetectionReliable(handedness, landmarks) {
    if (!handedness || !landmarks) return false;
    const score = (typeof handedness.score === 'number') ? handedness.score : 1;
    return score >= 0.25;
}

export function applyTrackingFallbacks(now) {
    ['Left', 'Right'].forEach(side => {
        const sideState = mocapTracking.sides[side];
        const poseMissingFor = now - sideState.lastPoseSeen;
        const handMissingFor = now - sideState.lastHandSeen;

        if (poseMissingFor > MOCAP_TRACK_LOST_GRACE_MS) {
            lowerArmNaturally(side);
            return;
        }

        if (handMissingFor > MOCAP_TRACK_LOST_GRACE_MS) {
            relaxHandToRest(side);
        }
    });
}

// ------ Overlay Render Details ------
const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]
];

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
];

let frameCount = 0;
let fps = 0;
let fpsIntervalTime = 0;

function updateFPS() {
    const now = performance.now();
    frameCount++;
    if (now - fpsIntervalTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - fpsIntervalTime));
        frameCount = 0;
        fpsIntervalTime = now;
    }
    return fps;
}

function drawPoseSkeleton(ctx, landmarks, width, height) {
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.lineCap = 'round';
    
    POSE_CONNECTIONS.forEach(([i, j]) => {
        const ptA = landmarks[i];
        const ptB = landmarks[j];
        if (ptA && ptB) {
            ctx.beginPath();
            ctx.moveTo(ptA.x * width, ptA.y * height);
            ctx.lineTo(ptB.x * width, ptB.y * height);
            ctx.stroke();
        }
    });
    
    ctx.shadowBlur = 0;
    landmarks.forEach((lm, idx) => {
        if (idx > 0 && idx < 11) return;
        
        let color = '#ffffff';
        if (idx === 0) color = '#ffff00';
        else if (idx === 11 || idx === 12) color = '#00ffcc';
        else if (idx === 13 || idx === 15) color = '#00bbff';
        else if (idx === 14 || idx === 16) color = '#cc33ff';
        else if (idx === 23 || idx === 24) color = '#33cc33';
        else if (idx >= 25 && idx <= 28) color = '#ff9900';
        else return;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, 7, 0, 2 * Math.PI);
        ctx.stroke();
    });
}

function drawHandSkeleton(ctx, landmarks, width, height) {
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#00ffcc';
    
    HAND_CONNECTIONS.forEach(([i, j]) => {
        const ptA = landmarks[i];
        const ptB = landmarks[j];
        if (ptA && ptB) {
            ctx.beginPath();
            ctx.moveTo(ptA.x * width, ptA.y * height);
            ctx.lineTo(ptB.x * width, ptB.y * height);
            ctx.stroke();
        }
    });
    
    ctx.shadowBlur = 0;
    landmarks.forEach((lm) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, 3, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function drawSciFiHUD(ctx, width, height, poseLandmarks, poseWorldLandmarks) {
    ctx.save();
    
    // Draw corner tech borders
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.lineWidth = 1.5;
    
    const margin = 10;
    const len = 15;
    // Top Left Corner
    ctx.beginPath(); ctx.moveTo(margin, margin + len); ctx.lineTo(margin, margin); ctx.lineTo(margin + len, margin); ctx.stroke();
    // Top Right Corner
    ctx.beginPath(); ctx.moveTo(width - margin, margin + len); ctx.lineTo(width - margin, margin); ctx.lineTo(width - margin - len, margin); ctx.stroke();
    // Bottom Left Corner
    ctx.beginPath(); ctx.moveTo(margin, height - margin - len); ctx.lineTo(margin, height - margin); ctx.lineTo(margin + len, height - margin); ctx.stroke();
    // Bottom Right Corner
    ctx.beginPath(); ctx.moveTo(width - margin, height - margin - len); ctx.lineTo(width - margin, height - margin); ctx.lineTo(width - margin - len, height - margin); ctx.stroke();
    
    // Title/Status
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 4;
    ctx.fillText("SYSTEM: CORE_MOCAP_v2.0", margin + 12, height - margin - 22);
    
    // Calibration status
    if (state.mocapCalibration.calibrating) {
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.fillText("STATUS: CALIBRATING...", margin + 12, height - margin - 10);
        
        // Draw centering guide box
        ctx.strokeStyle = 'rgba(255, 234, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(width * 0.25, height * 0.15, width * 0.5, height * 0.75);
    } else if (state.mocapCalibration.isCalibrated) {
        ctx.fillStyle = '#00ffcc';
        ctx.shadowColor = '#00ffcc';
        ctx.fillText("STATUS: CALIBRATED", margin + 12, height - margin - 10);
        
        // Compute and draw metrics
        if (poseLandmarks) {
            const leftShoulder = poseLandmarks[11];
            const rightShoulder = poseLandmarks[12];
            if (leftShoulder && rightShoulder) {
                const currentWidth = Math.sqrt(
                    (leftShoulder.x - rightShoulder.x) ** 2 +
                    (leftShoulder.y - rightShoulder.y) ** 2
                );
                
                // Camera Distance
                const depth = 2.0 * (state.mocapCalibration.calibratedShoulderWidth / currentWidth);
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(width - 150, 45, 140, 60);
                ctx.strokeStyle = '#00ffcc';
                ctx.lineWidth = 1;
                ctx.strokeRect(width - 150, 45, 140, 60);
                
                ctx.fillStyle = '#a4e4ec';
                ctx.shadowBlur = 0;
                ctx.font = '9px "JetBrains Mono", monospace';
                ctx.fillText(`CAM DEPTH: ${depth.toFixed(2)}m`, width - 140, 60);
                
                if (poseWorldLandmarks && poseWorldLandmarks[15] && poseWorldLandmarks[16] && poseWorldLandmarks[0]) {
                    const wl = poseWorldLandmarks;
                    
                    // Left hand to head (nose) distance in physical meters
                    const lDist = Math.sqrt(
                        (wl[15].x - wl[0].x) ** 2 +
                        (wl[15].y - wl[0].y) ** 2 +
                        (wl[15].z - wl[0].z) ** 2
                    );
                    // Right hand to head (nose) distance in physical meters
                    const rDist = Math.sqrt(
                        (wl[16].x - wl[0].x) ** 2 +
                        (wl[16].y - wl[0].y) ** 2 +
                        (wl[16].z - wl[0].z) ** 2
                    );
                    
                    ctx.fillText(`L-HAND TO HEAD: ${lDist.toFixed(2)}m`, width - 140, 78);
                    ctx.fillText(`R-HAND TO HEAD: ${rDist.toFixed(2)}m`, width - 140, 94);
                    
                    // Draw lines from hands to head on the overlay for sci-fi tracking feedback!
                    const nosePx = poseLandmarks[0];
                    const lWristPx = poseLandmarks[15];
                    const rWristPx = poseLandmarks[16];
                    
                    ctx.strokeStyle = 'rgba(0, 187, 255, 0.4)';
                    ctx.lineWidth = 1;
                    if (nosePx && lWristPx && (lWristPx.visibility ?? 1) > 0.3) {
                        ctx.beginPath();
                        ctx.moveTo(nosePx.x * width, nosePx.y * height);
                        ctx.lineTo(lWristPx.x * width, lWristPx.y * height);
                        ctx.stroke();
                    }
                    if (nosePx && rWristPx && (rWristPx.visibility ?? 1) > 0.3) {
                        ctx.beginPath();
                        ctx.moveTo(nosePx.x * width, nosePx.y * height);
                        ctx.lineTo(rWristPx.x * width, rWristPx.y * height);
                        ctx.stroke();
                    }
                }
            }
        }
    } else {
        ctx.fillStyle = '#ff4d4d';
        ctx.shadowColor = '#ff4d4d';
        ctx.fillText("STATUS: UNCALIBRATED (Press Calibrate)", margin + 12, height - margin - 10);
    }
    
    ctx.restore();
}

// ====== Face & Eye Tracking Mapping ======
export function mapFaceToAvatar(faceResults) {
    if (!state.vrm || !state.vrm.expressionManager || !faceResults || !faceResults.faceBlendshapes || faceResults.faceBlendshapes.length === 0) return;
    
    const blendshapes = {};
    faceResults.faceBlendshapes[0].categories.forEach(item => {
        blendshapes[item.categoryName] = item.score;
    });
    
    const manager = state.vrm.expressionManager;
    
    // Blinking
    const blinkLeft = blendshapes['eyeBlinkLeft'] || 0;
    const blinkRight = blendshapes['eyeBlinkRight'] || 0;
    manager.setValue('blinkLeft', blinkLeft);
    manager.setValue('blinkRight', blinkRight);
    
    // Jaw Open -> Mouth AA
    const jawOpen = blendshapes['jawOpen'] || 0;
    manager.setValue('aa', jawOpen);
    
    // Mouth smile -> happy
    const smileLeft = blendshapes['mouthSmileLeft'] || 0;
    const smileRight = blendshapes['mouthSmileRight'] || 0;
    const smileVal = (smileLeft + smileRight) / 2;
    manager.setValue('happy', smileVal * 0.8);
    
    // Lips shape (look for vowels: ih, ou, ee, oh)
    const mouthFunnel = blendshapes['mouthFunnel'] || 0;
    const mouthPucker = blendshapes['mouthPucker'] || 0;
    
    // Funnel & Pucker combine to drive 'oh' and 'ou'
    manager.setValue('oh', mouthFunnel);
    manager.setValue('ou', mouthPucker);
    
    // Simple logic for ee and ih
    const mouthPressLeft = blendshapes['mouthPressLeft'] || 0;
    const mouthPressRight = blendshapes['mouthPressRight'] || 0;
    manager.setValue('ih', (mouthPressLeft + mouthPressRight) * 0.75);
    
    const mouthStretchLeft = blendshapes['mouthStretchLeft'] || 0;
    const mouthStretchRight = blendshapes['mouthStretchRight'] || 0;
    manager.setValue('ee', (mouthStretchLeft + mouthStretchRight) * 0.5);

    // Eye gaze tracking
    if (state.eyeLookTrackingEnabled && state.vrm.lookAt) {
        const lookInLeft = blendshapes['eyeLookInLeft'] || 0;
        const lookOutLeft = blendshapes['eyeLookOutLeft'] || 0;
        const lookInRight = blendshapes['eyeLookInRight'] || 0;
        const lookOutRight = blendshapes['eyeLookOutRight'] || 0;
        const lookUpLeft = blendshapes['eyeLookUpLeft'] || 0;
        const lookUpRight = blendshapes['eyeLookUpRight'] || 0;
        const lookDownLeft = blendshapes['eyeLookDownLeft'] || 0;
        const lookDownRight = blendshapes['eyeLookDownRight'] || 0;

        const hGaze = ((lookOutLeft - lookInLeft) + (lookInRight - lookOutRight)) / 2;
        const vGaze = ((lookUpLeft + lookUpRight) - (lookDownLeft + lookDownRight)) / 2;

        state.vrm.lookAt.applier.lookAt(new THREE.Vector3(hGaze * 18, vGaze * 12, 1));
    }
}

function drawFaceOverlay(ctx, landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return;
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.shadowBlur = 0;
    
    // Draw outer boundary & nose/brows lines to show density
    const drawLine = (i, j) => {
        const ptA = landmarks[i];
        const ptB = landmarks[j];
        if (ptA && ptB) {
            ctx.beginPath();
            ctx.moveTo(ptA.x * width, ptA.y * height);
            ctx.lineTo(ptB.x * width, ptB.y * height);
            ctx.stroke();
        }
    };

    // Draw mesh connection segments (Facial Mesh Tesselation segments to give that "millions of elements" look)
    // Using a step-based traversal of landmark indices to form a beautiful web-like structural grid
    for (let i = 0; i < landmarks.length; i += 4) {
        // Draw links to nearest neighbors in the index array to simulate a dense mesh representation
        if (landmarks[i + 1]) drawLine(i, i + 1);
        if (landmarks[i + 2]) drawLine(i, i + 2);
        if (landmarks[i + 4]) drawLine(i, i + 4);
        
        // Cross connections to construct triangulated face structures
        if (i % 8 === 0 && landmarks[i + 8]) {
            drawLine(i, i + 8);
        }
    }

    // Highlight key contours with higher opacity
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.6)';
    ctx.lineWidth = 1.2;
    
    const drawClosedLoop = (indices) => {
        ctx.beginPath();
        indices.forEach((idx, idxInLoop) => {
            const pt = landmarks[idx];
            if (pt) {
                if (idxInLoop === 0) ctx.moveTo(pt.x * width, pt.y * height);
                else ctx.lineTo(pt.x * width, pt.y * height);
            }
        });
        ctx.closePath();
        ctx.stroke();
    };
    
    const leftEyeIndices = [33, 160, 158, 133, 153, 144];
    const rightEyeIndices = [362, 385, 387, 263, 373, 380];
    const lipsIndices = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
    const faceOutlineIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    
    drawClosedLoop(leftEyeIndices);
    drawClosedLoop(rightEyeIndices);
    drawClosedLoop(lipsIndices);
    drawClosedLoop(faceOutlineIndices);
}

export function predictWebcam() {
    if (!state.mocapActive) return;
    
    try {
        const video = el.webcamVideo;
        const canvas = el.webcamOverlay;
        const ctx = canvas.getContext('2d');
        
        if (video.readyState >= 2) {
            // Support local video synchronicity by using video currentTime as the timestamp anchor
            const trackingTimestamp = (state.mocapSource === 'video') ? video.currentTime * 1000 : performance.now();
            const nowSec = trackingTimestamp / 1000;
            updateMoCapFrameTiming(performance.now());
            
            const poseResults = state.poseLandmarker ? state.poseLandmarker.detectForVideo(video, trackingTimestamp) : null;
            const handResults = state.handLandmarker ? state.handLandmarker.detectForVideo(video, trackingTimestamp) : null;
            const faceResults = (state.faceTrackingEnabled && state.faceLandmarker) ? state.faceLandmarker.detectForVideo(video, trackingTimestamp) : null;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const currentFps = updateFPS();
            ctx.fillStyle = '#00ffcc';
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.fillText(`FPS: ${currentFps}`, 12, 22);
            
            const hasPose = poseResults && poseResults.landmarks && poseResults.landmarks.length > 0;
            const hasHands = handResults && handResults.landmarks && handResults.landmarks.length > 0;
            const hasFace = faceResults && faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0;
            
            const poseLandmarks = hasPose && poseResults.landmarks[0].length >= 33 ? poseResults.landmarks[0] : null;
            const poseWorldLandmarks = hasPose && poseResults.worldLandmarks && poseResults.worldLandmarks.length > 0 && poseResults.worldLandmarks[0].length >= 33 ? poseResults.worldLandmarks[0] : null;
            
            const hasReliablePose = poseLandmarks
                && (isPoseArmReliable(poseLandmarks, 'Left') || isPoseArmReliable(poseLandmarks, 'Right'));
            const hasReliableHands = hasHands && handResults.landmarks.some((handLandmarks, idx) => {
                const handedness = handResults.handedness && handResults.handedness[idx] && handResults.handedness[idx][0];
                return isHandDetectionReliable(handedness, handLandmarks);
            });
            const hasReliableTarget = hasReliablePose || hasReliableHands || hasFace;
            
            ctx.fillStyle = hasReliableTarget ? '#00ffcc' : '#ff4d4d';
            ctx.beginPath();
            ctx.arc(80, 18, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.fillStyle = '#a4e4ec';
            ctx.font = '10px "Outfit", sans-serif';
            ctx.fillText(hasReliableTarget ? "TRACKING" : "NO TARGET", 89, 21);
            
            // Draw skeletal overlays
            if (poseLandmarks) {
                mocapTracking.sides.Left.lastPoseSeen = performance.now();
                mocapTracking.sides.Right.lastPoseSeen = performance.now();
                drawPoseSkeleton(ctx, poseLandmarks, canvas.width, canvas.height);
                if (mocapWarmupCounter < MOCAP_WARMUP_FRAMES) {
                    mocapWarmupCounter++;
                }
                
                // Collect frames for calibration
                if (state.mocapCalibration.calibrating) {
                    const leftShoulder = poseLandmarks[11];
                    const rightShoulder = poseLandmarks[12];
                    if (leftShoulder && rightShoulder) {
                        const shoulderWidth = Math.sqrt(
                            (leftShoulder.x - rightShoulder.x) ** 2 +
                            (leftShoulder.y - rightShoulder.y) ** 2
                        );
                        const nose = poseLandmarks[0];
                        const hipsCenterY = (poseLandmarks[23] && poseLandmarks[24]) ? (poseLandmarks[23].y + poseLandmarks[24].y) / 2 : 0.65;
                        const headToHips = nose ? Math.abs(hipsCenterY - nose.y) : 0.45;
                        
                        state.mocapCalibration.calibratedFrames.push({
                            shoulderWidth,
                            headToHips,
                            hipsY: hipsCenterY
                        });
                    }
                }
                
                if (!isPlayingCustomSign) {
                    mapPoseToAvatar(poseLandmarks, poseWorldLandmarks, nowSec);
                }
            }
            
            if (hasHands) {
                handResults.landmarks.forEach((handLandmarks, idx) => {
                    const handedness = handResults.handedness && handResults.handedness[idx] && handResults.handedness[idx][0];
                    const side = handedness ? handedness.categoryName : null;
                    
                    if (side && mocapTracking.sides[side] && isHandDetectionReliable(handedness, handLandmarks)) {
                        mocapTracking.sides[side].lastHandSeen = performance.now();
                        drawHandSkeleton(ctx, handLandmarks, canvas.width, canvas.height);
                        
                        const handWorldLandmarks = handResults.worldLandmarks && handResults.worldLandmarks[idx] && handResults.worldLandmarks[idx].length >= 21 ? handResults.worldLandmarks[idx] : null;
                        if (!isPlayingCustomSign) {
                            mapHandToAvatar(handLandmarks, handWorldLandmarks, side, nowSec);
                        }
                    }
                });
            }

            // Map and Draw Face blendshapes
            if (hasFace) {
                const faceLandmarks = faceResults.faceLandmarks[0];
                drawFaceOverlay(ctx, faceLandmarks, canvas.width, canvas.height);
                if (!isPlayingCustomSign) {
                    mapFaceToAvatar(faceResults);
                }
            }

            // Feed landmarks to Gesture Trainer
            onNewLandmarks(
                hasHands ? handResults.landmarks : [], 
                poseLandmarks,
                hasHands ? handResults.worldLandmarks : [],
                poseWorldLandmarks
            );

            drawSciFiHUD(ctx, canvas.width, canvas.height, poseLandmarks, poseWorldLandmarks);
            
            // Check tracking loss and apply fallback only if they have not been updated in this loop
            applyTrackingFallbacks(performance.now());
            
            // Sample motion capture recording
            if (state.mocapRecording.active && !state.mocapRecording.paused) {
                updateRecordingTimer();
                sampleRecordingFrame();
            }
        }
    } catch (err) {
        console.error("Error in MoCap tracking loop:", err);
    }
    
    requestAnimationFrame(predictWebcam);
}

let preloadPromise = null;
export async function preloadMoCapModels() {
    if (preloadPromise) return preloadPromise;
    
    preloadPromise = (async () => {
        try {
            console.log("Preloading MediaPipe MoCap models in background...");
            if (el.webcamLoaderText) {
                el.webcamLoaderText.innerText = "Initializing tracking AI...";
            }
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
            );
            
            if (!state.poseLandmarker) {
                state.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    outputSegmentationMasks: false
                });
            }

            if (!state.handLandmarker) {
                state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2
                });
            }

            if (!state.faceLandmarker) {
                state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    outputFaceBlendshapes: true,
                    numFaces: 1
                });
            }
            
            console.log("MediaPipe MoCap models preloaded successfully.");
            if (el.webcamLoaderText && !state.mocapActive) {
                el.webcamLoaderText.innerText = "MoCap Ready";
            }
        } catch (err) {
            console.error("Error preloading MoCap models:", err);
            preloadPromise = null;
            throw err;
        }
    })();
    
    return preloadPromise;
}

export async function startMoCap() {
    if (state.bones.length === 0) {
        alert("No skeleton bones detected in the current avatar. Load a rigged model first.");
        return;
    }
    
    el.webcamLoader.style.display = 'flex';
    el.webcamLoader.style.opacity = '1';
    
    if (state.mocapSource === 'video') {
        el.webcamLoaderText.innerText = "Loading video file feed...";
    } else {
        el.webcamLoaderText.innerText = "Accessing webcam feed...";
    }
    
    try {
        if (state.mocapSource === 'video') {
            if (!el.webcamVideo.src && !el.webcamVideo.srcObject) {
                alert("Please select a video file first.");
                el.webcamLoader.style.display = 'none';
                return;
            }
            el.webcamVideo.loop = true;
            el.webcamVideo.muted = true;
            await el.webcamVideo.play();
            
            el.webcamOverlay.width = el.webcamVideo.videoWidth || 640;
            el.webcamOverlay.height = el.webcamVideo.videoHeight || 480;
        } else {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480 },
                    audio: false
                });
            } catch (constraintsError) {
                console.warn("Camera resolution constraints failed, trying basic fallback...", constraintsError);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }
            state.webcamStream = stream;
            el.webcamVideo.srcObject = stream;
            
            el.webcamVideo.onloadedmetadata = () => {
                el.webcamOverlay.width = el.webcamVideo.videoWidth;
                el.webcamOverlay.height = el.webcamVideo.videoHeight;
            };
        }
        
        if (!state.poseLandmarker || !state.handLandmarker || !state.faceLandmarker) {
            el.webcamLoaderText.innerText = "Finishing AI model setup...";
            await preloadMoCapModels();
        }
        
        el.webcamLoader.style.opacity = '0';
        setTimeout(() => {
            if (state.mocapActive) el.webcamLoader.style.display = 'none';
        }, 300);
        
        el.webcamStatusDot.classList.add('active');
        el.btnToggleMocap.classList.add('active');
        el.btnToggleMocap.innerHTML = '<i class="fa-solid fa-stop"></i> Stop MoCap';
        
        state.mocapActive = true;
        resetMoCapTrackingState(performance.now());
        resetAllSmoothers();
        
        mocapWarmupCounter = 0;
        mocapBlendStartTime = performance.now();
        fpsIntervalTime = performance.now();
        
        requestAnimationFrame(predictWebcam);
    } catch (err) {
        console.error("MoCap startup failed:", err);
        alert("MoCap failed to start:\n" + err.name + ": " + err.message + "\n\nPlease check console logs, camera permissions, or video file.");
        stopMoCap();
    }
}

export function stopMoCap(resetToIdle = false) {
    state.mocapActive = false;
    resetMoCapTrackingState();
    
    if (state.mocapSource === 'video') {
        if (el.webcamVideo) {
            el.webcamVideo.pause();
        }
    } else {
        if (state.webcamStream) {
            state.webcamStream.getTracks().forEach(track => track.stop());
            state.webcamStream = null;
        }
        if (el.webcamVideo) {
            el.webcamVideo.srcObject = null;
        }
    }
    
    // Stop recording if active
    if (state.mocapRecording && state.mocapRecording.active) {
        state.mocapRecording.active = false;
        state.mocapRecording.paused = false;
        if (el.mocapRecordingPanel) el.mocapRecordingPanel.classList.remove('active-recording');
        if (el.btnRecordStart) {
            el.btnRecordStart.classList.remove('recording');
            el.btnRecordStart.innerHTML = '<i class="fa-solid fa-circle"></i>';
        }
        if (el.btnRecordPause) el.btnRecordPause.classList.add('hidden');
        if (el.btnRecordStop) el.btnRecordStop.classList.add('hidden');
        if (el.recTimer) el.recTimer.innerText = "00:00.0";
    }
    
    const canvas = el.webcamOverlay;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    el.webcamStatusDot.classList.remove('active');
    el.webcamLoader.style.display = 'flex';
    el.webcamLoader.style.opacity = '1';
    el.webcamLoaderText.innerText = "MoCap Inactive";
    el.btnToggleMocap.classList.remove('active');
    el.btnToggleMocap.innerHTML = '<i class="fa-solid fa-play"></i> Start MoCap';
    
    if (resetToIdle) {
        applyIdlePose();
    }
    if (state.onStopMoCap) state.onStopMoCap();
}

export function toggleMocapMode() {
    if (state.mocapActive) {
        stopMoCap();
    } else {
        if (state.onStartMoCap) state.onStartMoCap();
        startMoCap();
    }
}
