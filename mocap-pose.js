import * as THREE from 'three';
import { state } from './state.js';
import { getBoneSmoother } from './mocap-filters.js';
import { clampUpperArmDirection, clampShoulderBoneRotation, constrainElbowDirection, clampFingerRotation } from './mocap-constraints.js';
import { mocapIdleQuaternions, relaxBoneToRest } from './mocap-idle.js';
import { getBlendFactor, isPoseLandmarkUsable, isPoseArmReliable, MOCAP_TRACK_RESPONSE, MOCAP_FALLBACK_RESPONSE } from './mocap-core.js';
import { getFrameSmoothing } from './mocap-filters.js';

// MOCAP_DEPTH_SCALE constraint
import { MOCAP_DEPTH_SCALE } from './mocap-constraints.js';

// ====== Phase 4: Arm Spatial Intelligence System ======
export const ArmAnalysis = {
    getFullArmDirection(landmarks, side) {
        const shoulderIdx = side === 'Left' ? 11 : 12;
        const wristIdx = side === 'Left' ? 15 : 16;
        return {
            dx: landmarks[wristIdx].x - landmarks[shoulderIdx].x,
            dy: landmarks[wristIdx].y - landmarks[shoulderIdx].y,
            dz: landmarks[wristIdx].z - landmarks[shoulderIdx].z
        };
    },

    classifyArmPose(landmarks, side) {
        const dir = this.getFullArmDirection(landmarks, side);
        const magnitude = Math.sqrt(dir.dx*dir.dx + dir.dy*dir.dy + dir.dz*dir.dz);
        if (magnitude === 0) return { verticalPose: 'DOWN', depthPose: 'NEUTRAL', lateralPose: 'NEUTRAL', magnitude: 0 };
        
        const nx = dir.dx / magnitude;
        const ny = dir.dy / magnitude;
        const nz = dir.dz / magnitude;

        let verticalPose = 'HORIZONTAL';
        if (ny < -0.5) verticalPose = 'UP';
        else if (ny > 0.5) verticalPose = 'DOWN';

        let depthPose = 'NEUTRAL';
        if (nz < -0.35) depthPose = 'FORWARD';
        else if (nz > 0.35) depthPose = 'BACKWARD';

        let lateralPose = 'NEUTRAL';
        const sideSign = side === 'Left' ? -1 : 1;
        if (nx * sideSign > 0.4) lateralPose = 'EXTENDED';
        else if (nx * sideSign < -0.3) lateralPose = 'CROSSED';

        return { verticalPose, depthPose, lateralPose, magnitude };
    },

    getHandToHeadDistance(landmarks, side) {
        const wristIdx = side === 'Left' ? 15 : 16;
        const nose = landmarks[0];
        const wrist = landmarks[wristIdx];
        if (!nose || !wrist) return 999;
        
        return Math.sqrt(
            (wrist.x - nose.x) ** 2 + 
            (wrist.y - nose.y) ** 2 + 
            (wrist.z - nose.z) ** 2
        );
    },

    getElbowAngle(landmarks, side) {
        const indices = side === 'Left' ? [11, 13, 15] : [12, 14, 16];
        const shoulder = landmarks[indices[0]];
        const elbow = landmarks[indices[1]];
        const wrist = landmarks[indices[2]];
        if (!shoulder || !elbow || !wrist) return 180;
        
        const v1 = {
            x: shoulder.x - elbow.x,
            y: shoulder.y - elbow.y,
            z: shoulder.z - elbow.z
        };
        const v2 = {
            x: wrist.x - elbow.x,
            y: wrist.y - elbow.y,
            z: wrist.z - elbow.z
        };
        
        const dot = v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
        const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
        const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z);
        if (mag1 * mag2 === 0) return 180;
        
        return Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2)))) * (180 / Math.PI);
    },

    getArmExtension(landmarks, side) {
        const shoulderIdx = side === 'Left' ? 11 : 12;
        const wristIdx = side === 'Left' ? 15 : 16;
        const elbowIdx = side === 'Left' ? 13 : 14;
        if (!landmarks[shoulderIdx] || !landmarks[wristIdx] || !landmarks[elbowIdx]) return 1;
        
        const directDist = Math.sqrt(
            (landmarks[wristIdx].x - landmarks[shoulderIdx].x) ** 2 +
            (landmarks[wristIdx].y - landmarks[shoulderIdx].y) ** 2 +
            (landmarks[wristIdx].z - landmarks[shoulderIdx].z) ** 2
        );
        
        const seg1 = Math.sqrt(
            (landmarks[elbowIdx].x - landmarks[shoulderIdx].x) ** 2 +
            (landmarks[elbowIdx].y - landmarks[shoulderIdx].y) ** 2 +
            (landmarks[elbowIdx].z - landmarks[shoulderIdx].z) ** 2
        );
        const seg2 = Math.sqrt(
            (landmarks[wristIdx].x - landmarks[elbowIdx].x) ** 2 +
            (landmarks[wristIdx].y - landmarks[elbowIdx].y) ** 2 +
            (landmarks[wristIdx].z - landmarks[elbowIdx].z) ** 2
        );
        
        if (seg1 + seg2 === 0) return 1;
        return directDist / (seg1 + seg2);
    }
};

export function alignBone(bone, startJoint, endJoint, baseDir, smoothingResponse = MOCAP_TRACK_RESPONSE, nowSec = performance.now() / 1000) {
    if (!bone || !startJoint || !endJoint) return;
    
    const tempQuaternion = new THREE.Quaternion();
    let dir;
    if (startJoint instanceof THREE.Vector3) {
        dir = new THREE.Vector3().subVectors(endJoint, startJoint).normalize();
    } else {
        const dx = (endJoint.x - startJoint.x);
        const dy = -(endJoint.y - startJoint.y);
        const dz = (endJoint.z - startJoint.z) * MOCAP_DEPTH_SCALE;
        dir = new THREE.Vector3(dx, dy, dz).normalize();
    }

    if (dir.lengthSq() === 0 || isNaN(dir.x) || isNaN(dir.y) || isNaN(dir.z)) return;

    if (bone.name === 'LeftArm' || bone.name === 'RightArm') {
        const side = bone.name.startsWith('Left') ? 'Left' : 'Right';
        dir = clampUpperArmDirection(dir, side);
    }

    if ((bone.name === 'LeftForeArm' || bone.name === 'RightForeArm') && bone.parent && bone.parent.isBone) {
        dir = constrainElbowDirection(bone.parent, dir);
        const side = bone.name.startsWith('Left') ? 'Left' : 'Right';
        if (side === 'Left') {
            if (dir.y < -0.2) {
                dir.x = Math.min(dir.x, -0.15); // force outward
            }
        } else {
            if (dir.y < -0.2) {
                dir.x = Math.max(dir.x, 0.15); // force outward
            }
        }
        dir.normalize();
    }
    
    const qWorld = new THREE.Quaternion();
    const restData = state.mocapRestData.get(bone.uuid);

    if (restData) {
        tempQuaternion.setFromUnitVectors(restData.restWorldDirection, dir);
        qWorld.copy(tempQuaternion).multiply(restData.restWorldQuaternion);
    } else {
        qWorld.setFromUnitVectors(baseDir, dir);
    }
    
    let qLocal = qWorld.clone();
    if (bone.parent) {
        const qParentWorld = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(qParentWorld);
        qLocal = qParentWorld.clone().invert().multiply(qWorld);
    }
    
    // Blend-in from Idle Pose
    const isBodyBone = bone.name.includes('Arm') || bone.name.includes('Shoulder') || bone.name === 'Spine' || bone.name === 'Hips';
    if (isBodyBone) {
        const blend = getBlendFactor();
        if (blend < 1.0) {
            const idleQ = mocapIdleQuaternions.get(bone.uuid) || (state.boneMap.get(bone.uuid) ? state.boneMap.get(bone.uuid).quaternion : new THREE.Quaternion());
            qLocal.copy(idleQ).slerp(qLocal, blend);
        }
    }
    
    // Smoothing using One-Euro Filter (local space)
    const smoother = getBoneSmoother(bone);
    const smoothedLocal = smoother.smooth(qLocal, nowSec);
    
    bone.quaternion.copy(smoothedLocal);
    bone.updateMatrixWorld(true);
}

export function mapHandToAvatar(landmarks, worldLandmarks, side, nowSec = performance.now() / 1000) {
    if (!state.model || Object.keys(state.mappedAvatarBones).length === 0) return;
    
    const targetSide = side;
    const isWorld = worldLandmarks && worldLandmarks.length >= 21;
    const joints = isWorld ? worldLandmarks.map(wl => new THREE.Vector3(wl.x, -wl.y, -wl.z)) : landmarks;
    
    if (!joints || joints.length < 21) return;
    
    const handBone = state.mappedAvatarBones[`${targetSide}Hand`];
    if (handBone) {
        // Calculate hand forward and normal vectors to build a stable LookRotation
        const forward = new THREE.Vector3().subVectors(joints[9], joints[0]).normalize();
        const vIndex = new THREE.Vector3().subVectors(joints[5], joints[0]);
        const vPinky = new THREE.Vector3().subVectors(joints[17], joints[0]);
        const normal = new THREE.Vector3().crossVectors(vIndex, vPinky).normalize();

        const targetX = (targetSide === 'Left') ? forward.clone().negate() : forward.clone();
        const targetY = (targetSide === 'Left') ? normal.clone() : normal.clone().negate();
        const targetZ = new THREE.Vector3().crossVectors(targetX, targetY).normalize();

        const basisM = new THREE.Matrix4().makeBasis(targetX, targetY, targetZ);
        const targetWorldQ = new THREE.Quaternion().setFromRotationMatrix(basisM);

        const parentWorldQ = new THREE.Quaternion();
        const localQ = new THREE.Quaternion();
        if (handBone.parent) {
            handBone.parent.getWorldQuaternion(parentWorldQ);
            localQ.copy(parentWorldQ).invert().multiply(targetWorldQ);
        } else {
            localQ.copy(targetWorldQ);
        }

        const smoother = getBoneSmoother(handBone);
        handBone.quaternion.copy(smoother.smooth(localQ, nowSec));
        handBone.updateMatrixWorld(true);
    }

    // Stable angular finger bending simulation
    const fingers = [
        { name: 'Thumb', joints: [1, 2, 3, 4] },
        { name: 'Index', joints: [5, 6, 7, 8] },
        { name: 'Middle', joints: [9, 10, 11, 12] },
        { name: 'Ring', joints: [13, 14, 15, 16] },
        { name: 'Pinky', joints: [17, 18, 19, 20] }
    ];

    fingers.forEach(f => {
        const bone1 = state.mappedAvatarBones[`${targetSide}Hand${f.name}1`];
        const bone2 = state.mappedAvatarBones[`${targetSide}Hand${f.name}2`];
        const bone3 = state.mappedAvatarBones[`${targetSide}Hand${f.name}3`];

        if (bone1 || bone2 || bone3) {
            // Calculate bend angle at joint 1
            const v1_2 = new THREE.Vector3().subVectors(joints[f.joints[0]], joints[f.joints[1]]).normalize();
            const v2_3 = new THREE.Vector3().subVectors(joints[f.joints[2]], joints[f.joints[1]]).normalize();
            let bend1 = Math.PI - v1_2.angleTo(v2_3);
            if (isNaN(bend1)) bend1 = 0;

            // Calculate bend angle at joint 2
            const v2_3_b = new THREE.Vector3().subVectors(joints[f.joints[1]], joints[f.joints[2]]).normalize();
            const v3_4 = new THREE.Vector3().subVectors(joints[f.joints[3]], joints[f.joints[2]]).normalize();
            let bend2 = Math.PI - v2_3_b.angleTo(v3_4);
            if (isNaN(bend2)) bend2 = 0;

            // Clamp bends within realistic limits
            bend1 = THREE.MathUtils.clamp(bend1, 0, Math.PI / 2);
            bend2 = THREE.MathUtils.clamp(bend2, 0, Math.PI / 2);

            const sign = (targetSide === 'Left') ? 1 : -1;
            
            // Use custom diagonal bend axis for Thumb to match physical biomechanics
            const bendAxis = (f.name === 'Thumb')
                ? new THREE.Vector3(0, (targetSide === 'Left') ? 1 : -1, 1).normalize()
                : new THREE.Vector3(0, 0, 1);
            
            const thumbSign = (f.name === 'Thumb') ? 1 : sign;
            
            // Distribute bends to finger joints
            const q1 = new THREE.Quaternion().setFromAxisAngle(bendAxis, thumbSign * bend1 * 0.7);
            const q2 = new THREE.Quaternion().setFromAxisAngle(bendAxis, thumbSign * bend1);
            const q3 = new THREE.Quaternion().setFromAxisAngle(bendAxis, thumbSign * bend2);

            if (bone1) {
                bone1.quaternion.copy(getBoneSmoother(bone1).smooth(q1, nowSec));
                bone1.updateMatrixWorld(true);
            }
            if (bone2) {
                bone2.quaternion.copy(getBoneSmoother(bone2).smooth(q2, nowSec));
                bone2.updateMatrixWorld(true);
            }
            if (bone3) {
                bone3.quaternion.copy(getBoneSmoother(bone3).smooth(q3, nowSec));
                bone3.updateMatrixWorld(true);
            }
        }
    });
}

export function mapPoseToAvatar(landmarks, worldLandmarks, nowSec) {
    if (!state.model || Object.keys(state.mappedAvatarBones).length === 0) return;
    
    // Safety check: Ensure landmarks are loaded
    if (!landmarks || landmarks.length < 33) return;
    
    const upperBodyVisible = landmarks[11] && landmarks[12] &&
        (landmarks[11].visibility ?? 1) > 0.25 &&
        (landmarks[12].visibility ?? 1) > 0.25;
    if (!upperBodyVisible) return;
    
    const baseLeftArm = new THREE.Vector3(-1, 0, 0);
    const baseRightArm = new THREE.Vector3(1, 0, 0);
    const baseSpine = new THREE.Vector3(0, 1, 0);
    
    const isWorld = worldLandmarks && worldLandmarks.length >= 33;
    
    // تصحيح فوري ومعايرة إسقاط المتجهات الفراغية لمنع انعكاس المحاور الدورانية (X-Flip Correction)
    const joints = isWorld 
        ? worldLandmarks.map(wl => new THREE.Vector3(wl.x, -wl.y, -wl.z)) // إزالة القلب التلقائي غير الصحيح
        : landmarks.map(lm => new THREE.Vector3(-(lm.x - 0.5), 0.5 - lm.y, -lm.z * MOCAP_DEPTH_SCALE));
        
    if (!joints || joints.length < 33 || !joints[11] || !joints[12] || !joints[23] || !joints[24]) return;
        
    const hipsCenter = new THREE.Vector3(
        (landmarks[23] && landmarks[24]) ? (landmarks[23].x + landmarks[24].x) / 2 : 0.5,
        (landmarks[23] && landmarks[24]) ? (landmarks[23].y + landmarks[24].y) / 2 : 0.65,
        (landmarks[23] && landmarks[24]) ? (landmarks[23].z + landmarks[24].z) / 2 : 0
    );
    
    const hipsVisible = landmarks[23] && landmarks[24] &&
        (landmarks[23].visibility ?? 1) > 0.25 &&
        (landmarks[24].visibility ?? 1) > 0.25;
        
    // --- Hip Translation (X, Y, and Z depth/distance) ---
    if (state.mappedAvatarBones.Hips) {
        const hipsBone = state.mappedAvatarBones.Hips;
        const initial = state.boneMap.get(hipsBone.uuid);
        const baseHipsPos = initial ? initial.position : new THREE.Vector3(0, 0.9, 0);
        
        if (hipsVisible) {
            const shoulderWidth = Math.sqrt(
                (landmarks[11].x - landmarks[12].x) ** 2 +
                (landmarks[11].y - landmarks[12].y) ** 2
            );
            
            const calibratedWidth = state.mocapCalibration.isCalibrated ? state.mocapCalibration.calibratedShoulderWidth : 0.22;
            const calibratedHipsY = state.mocapCalibration.isCalibrated ? state.mocapCalibration.calibratedHipsY : 0.65;
            
            let currentDepth = 2.0;
            let targetX = 0;
            let targetY = 0;
            let targetZ = 0;
            
            if (shoulderWidth > 0.001 && !isNaN(shoulderWidth)) {
                currentDepth = THREE.MathUtils.clamp(2.0 * (calibratedWidth / shoulderWidth), 0.8, 5.0);
                
                const kx = 0.85;
                const ky = 0.85;
                
                // تصحيح اتجاه حركة الحوض الأفقية لـ تتطابق مع حودتك الحقيقية يميناً ويساراً
                targetX = THREE.MathUtils.clamp((hipsCenter.x - 0.5) * currentDepth * kx, -1.5, 1.5);
                targetY = THREE.MathUtils.clamp(-(hipsCenter.y - calibratedHipsY) * currentDepth * ky, -1.0, 1.0);
                
                const directionMultiplier = state.vrm ? 1.0 : -1.0;
                targetZ = (currentDepth - 2.0) * directionMultiplier;
            }
            
            const smoothFactor = 0.08;
            hipsBone.position.x += (targetX - hipsBone.position.x) * smoothFactor;
            hipsBone.position.y += ((baseHipsPos.y + targetY) - hipsBone.position.y) * smoothFactor;
            hipsBone.position.z += ((baseHipsPos.z + targetZ) - hipsBone.position.z) * smoothFactor;
        } else {
            const smoothFactor = getFrameSmoothing(MOCAP_FALLBACK_RESPONSE);
            hipsBone.position.lerp(baseHipsPos, smoothFactor);
        }
    }
    
    // Calculate centers using joints space
    const shoulderCenter = new THREE.Vector3().addVectors(joints[11], joints[12]).multiplyScalar(0.5);
    const hipsCenterVec = (joints[23] && joints[24]) 
        ? new THREE.Vector3().addVectors(joints[23], joints[24]).multiplyScalar(0.5)
        : new THREE.Vector3(0, -0.65, 0);
    
    // Spine alignment
    if (state.mappedAvatarBones.Spine 
        && isPoseLandmarkUsable(landmarks[11], 0.2)
        && isPoseLandmarkUsable(landmarks[12], 0.2)
        && hipsVisible) {
        
        alignBone(state.mappedAvatarBones.Spine, hipsCenterVec, shoulderCenter, baseSpine, MOCAP_TRACK_RESPONSE, nowSec);
        
        const dx_shoulders = joints[11].x - joints[12].x;
        const dz_shoulders = joints[11].z - joints[12].z;
        const yawAngle = Math.atan2(dz_shoulders, dx_shoulders);
        
        const maxTwist = 35 * Math.PI / 180;
        const clampedYaw = THREE.MathUtils.clamp(yawAngle, -maxTwist, maxTwist);
        
        const twistQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), clampedYaw);
        state.mappedAvatarBones.Spine.quaternion.multiply(twistQ);
        state.mappedAvatarBones.Spine.updateMatrixWorld(true);
    } else if (state.mappedAvatarBones.Spine) {
        relaxBoneToRest(state.mappedAvatarBones.Spine, MOCAP_FALLBACK_RESPONSE);
    }
    
    // تصحيح ربط جهات الأطراف الأساسية: اليمين الفيزيائي يحرك اليمين الافتراضي واليسار يحرك اليسار
    if (isPoseLandmarkUsable(landmarks[11], 0.2) && isPoseLandmarkUsable(landmarks[12], 0.2)) {
        if (state.mappedAvatarBones.LeftShoulder) {
            alignBone(state.mappedAvatarBones.LeftShoulder, shoulderCenter, joints[11], baseLeftArm, MOCAP_TRACK_RESPONSE * 0.4, nowSec);
            clampShoulderBoneRotation(state.mappedAvatarBones.LeftShoulder);
        }
        if (state.mappedAvatarBones.RightShoulder) {
            alignBone(state.mappedAvatarBones.RightShoulder, shoulderCenter, joints[12], baseRightArm, MOCAP_TRACK_RESPONSE * 0.4, nowSec);
            clampShoulderBoneRotation(state.mappedAvatarBones.RightShoulder);
        }
    }
    
    // الطرف الأيسر للكاميرا (11, 13, 15) يقود الذراع اليسرى للأفاتار (True Non-Mirrored Mapping)
    const leftShoulderUsable = isPoseLandmarkUsable(landmarks[11], 0.25);
    const leftElbowUsable = isPoseLandmarkUsable(landmarks[13], 0.2);
    const leftWristUsable = isPoseLandmarkUsable(landmarks[15], 0.15);
    
    const leftArm = state.mappedAvatarBones.LeftArm;
    const leftForearm = state.mappedAvatarBones.LeftForeArm;
    
    if (leftArm && leftForearm) {
        if (leftShoulderUsable && leftElbowUsable && leftWristUsable) {
            const dirArmL = new THREE.Vector3().subVectors(joints[13], joints[11]).normalize();
            const dirForearmL = new THREE.Vector3().subVectors(joints[15], joints[13]).normalize();

            let normalL = new THREE.Vector3().crossVectors(dirArmL, dirForearmL);
            if (normalL.lengthSq() < 1e-5) {
                const temp = Math.abs(dirArmL.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
                normalL.crossVectors(dirArmL, temp).normalize();
            } else {
                normalL.normalize();
            }

            const targetXL = dirArmL.clone().negate();
            const targetZL = normalL.clone();
            const targetYL = new THREE.Vector3().crossVectors(targetZL, targetXL).normalize();

            const basisM_L = new THREE.Matrix4().makeBasis(targetXL, targetYL, targetZL);
            const targetWorldQL = new THREE.Quaternion().setFromRotationMatrix(basisM_L);

            const parentWorldQ = new THREE.Quaternion();
            const localQ = new THREE.Quaternion();
            if (leftArm.parent) {
                leftArm.parent.getWorldQuaternion(parentWorldQ);
                localQ.copy(parentWorldQ).invert().multiply(targetWorldQL);
            } else {
                localQ.copy(targetWorldQL);
            }

            const smoother = getBoneSmoother(leftArm);
            leftArm.quaternion.copy(smoother.smooth(localQ, nowSec));
            leftArm.updateMatrixWorld(true);

            let bendL = dirArmL.angleTo(dirForearmL);
            bendL = THREE.MathUtils.clamp(bendL, 0, 140 * Math.PI / 180);

            const forearmLocalQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendL);
            const smootherFore = getBoneSmoother(leftForearm);
            leftForearm.quaternion.copy(smootherFore.smooth(forearmLocalQ, nowSec));
            leftForearm.updateMatrixWorld(true);
        } else {
            relaxBoneToRest(leftArm, MOCAP_FALLBACK_RESPONSE);
            relaxBoneToRest(leftForearm, MOCAP_FALLBACK_RESPONSE);
        }
    }
    
    // الطرف الأيمن للكاميرا (12, 14, 16) يقود الذراع اليمنى للأفاتار
    const rightShoulderUsable = isPoseLandmarkUsable(landmarks[12], 0.25);
    const rightElbowUsable = isPoseLandmarkUsable(landmarks[14], 0.2);
    const rightWristUsable = isPoseLandmarkUsable(landmarks[16], 0.15);
    
    const rightArm = state.mappedAvatarBones.RightArm;
    const rightForearm = state.mappedAvatarBones.RightForeArm;
    
    if (rightArm && rightForearm) {
        if (rightShoulderUsable && rightElbowUsable && rightWristUsable) {
            const dirArmR = new THREE.Vector3().subVectors(joints[14], joints[12]).normalize();
            const dirForearmR = new THREE.Vector3().subVectors(joints[16], joints[14]).normalize();

            let normalR = new THREE.Vector3().crossVectors(dirArmR, dirForearmR);
            if (normalR.lengthSq() < 1e-5) {
                const temp = Math.abs(dirArmR.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
                normalR.crossVectors(dirArmR, temp).normalize();
            } else {
                normalR.normalize();
            }

            const targetXR = dirArmR.clone();
            const targetZR = normalR.clone();
            const targetYR = new THREE.Vector3().crossVectors(targetZR, targetXR).normalize();

            const basisM_R = new THREE.Matrix4().makeBasis(targetXR, targetYR, targetZR);
            const targetWorldQR = new THREE.Quaternion().setFromRotationMatrix(basisM_R);

            const parentWorldQ = new THREE.Quaternion();
            const localQ = new THREE.Quaternion();
            if (rightArm.parent) {
                rightArm.parent.getWorldQuaternion(parentWorldQ);
                localQ.copy(parentWorldQ).invert().multiply(targetWorldQR);
            } else {
                localQ.copy(targetWorldQR);
            }

            const smoother = getBoneSmoother(rightArm);
            rightArm.quaternion.copy(smoother.smooth(localQ, nowSec));
            rightArm.updateMatrixWorld(true);

            let bendR = dirArmR.angleTo(dirForearmR);
            bendR = THREE.MathUtils.clamp(bendR, 0, 140 * Math.PI / 180);

            const forearmLocalQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendR);
            const smootherFore = getBoneSmoother(rightForearm);
            rightForearm.quaternion.copy(smootherFore.smooth(forearmLocalQ, nowSec));
            rightForearm.updateMatrixWorld(true);
        } else {
            relaxBoneToRest(rightArm, MOCAP_FALLBACK_RESPONSE);
            relaxBoneToRest(rightForearm, MOCAP_FALLBACK_RESPONSE);
        }
    }
    
    // --- Head & Neck Tracking ---
    if (state.mappedAvatarBones.Head && isWorld && worldLandmarks[7] && worldLandmarks[8] && worldLandmarks[0]) {
        const headBone = state.mappedAvatarBones.Head;
        const neckBone = state.mappedAvatarBones.Neck;
        
        const leftEar = worldLandmarks[7];
        const rightEar = worldLandmarks[8];
        
        const earsUsable = isPoseLandmarkUsable(leftEar, 0.15) && isPoseLandmarkUsable(rightEar, 0.15);
        const eyesUsable = isPoseLandmarkUsable(worldLandmarks[3], 0.15) && isPoseLandmarkUsable(worldLandmarks[6], 0.15);
        
        let ptLeft = null;
        let ptRight = null;
        
        if (earsUsable) {
            ptLeft = joints[7];
            ptRight = joints[8];
        } else if (eyesUsable) {
            ptLeft = joints[3];
            ptRight = joints[6];
        }
        
        if (ptLeft && ptRight) {
            const headCenter = new THREE.Vector3().addVectors(ptLeft, ptRight).multiplyScalar(0.5);
            const neckDir = new THREE.Vector3().subVectors(headCenter, shoulderCenter).normalize();
            const xBasis = new THREE.Vector3().subVectors(ptLeft, ptRight).normalize();
            const zBasis = new THREE.Vector3().crossVectors(xBasis, neckDir).normalize();
            const yBasis = new THREE.Vector3().crossVectors(zBasis, xBasis).normalize();
            
            const basisMatrix = new THREE.Matrix4().makeBasis(xBasis, yBasis, zBasis);
            const targetQ = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);
            
            let qLocalHead = targetQ.clone();
            if (headBone.parent) {
                const qParentWorld = new THREE.Quaternion();
                headBone.parent.getWorldQuaternion(qParentWorld);
                qLocalHead = qParentWorld.clone().invert().multiply(targetQ);
            }
            
            const smootherHead = getBoneSmoother(headBone);
            headBone.quaternion.copy(smootherHead.smooth(qLocalHead, nowSec));
            headBone.updateMatrixWorld(true);
            
            if (neckBone) {
                alignBone(neckBone, shoulderCenter, headCenter, new THREE.Vector3(0, 1, 0), MOCAP_TRACK_RESPONSE, nowSec);
            }
        }
    } else {
        if (state.mappedAvatarBones.Head) relaxBoneToRest(state.mappedAvatarBones.Head, MOCAP_FALLBACK_RESPONSE);
        if (state.mappedAvatarBones.Neck) relaxBoneToRest(state.mappedAvatarBones.Neck, MOCAP_FALLBACK_RESPONSE);
    }
    
    // --- Leg Tracking (Non-Mirrored Fix) ---
    // اليسار الفيزيائي يقود اليسار الافتراضي
    if (state.mappedAvatarBones.LeftUpLeg && hipsVisible && isPoseLandmarkUsable(landmarks[25], 0.2)) {
        alignBone(state.mappedAvatarBones.LeftUpLeg, joints[23], joints[25], new THREE.Vector3(0, -1, 0), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.LeftUpLeg) {
        relaxBoneToRest(state.mappedAvatarBones.LeftUpLeg, MOCAP_FALLBACK_RESPONSE);
    }
    
    if (state.mappedAvatarBones.LeftLeg && hipsVisible && isPoseLandmarkUsable(landmarks[25], 0.2) && isPoseLandmarkUsable(landmarks[27], 0.2)) {
        alignBone(state.mappedAvatarBones.LeftLeg, joints[25], joints[27], new THREE.Vector3(0, -1, 0), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.LeftLeg) {
        relaxBoneToRest(state.mappedAvatarBones.LeftLeg, MOCAP_FALLBACK_RESPONSE);
    }
    
    if (state.mappedAvatarBones.LeftFoot && hipsVisible && isPoseLandmarkUsable(landmarks[27], 0.2) && isPoseLandmarkUsable(landmarks[31], 0.2)) {
        alignBone(state.mappedAvatarBones.LeftFoot, joints[27], joints[31], new THREE.Vector3(0, 0, 1), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.LeftFoot) {
        relaxBoneToRest(state.mappedAvatarBones.LeftFoot, MOCAP_FALLBACK_RESPONSE);
    }
    
    // اليمين الفيزيائي يقود اليمين الافتراضي
    if (state.mappedAvatarBones.RightUpLeg && hipsVisible && isPoseLandmarkUsable(landmarks[26], 0.2)) {
        alignBone(state.mappedAvatarBones.RightUpLeg, joints[24], joints[26], new THREE.Vector3(0, -1, 0), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.RightUpLeg) {
        relaxBoneToRest(state.mappedAvatarBones.RightUpLeg, MOCAP_FALLBACK_RESPONSE);
    }
    
    if (state.mappedAvatarBones.RightLeg && hipsVisible && isPoseLandmarkUsable(landmarks[26], 0.2) && isPoseLandmarkUsable(landmarks[28], 0.2)) {
        alignBone(state.mappedAvatarBones.RightLeg, joints[26], joints[28], new THREE.Vector3(0, -1, 0), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.RightLeg) {
        relaxBoneToRest(state.mappedAvatarBones.RightLeg, MOCAP_FALLBACK_RESPONSE);
    }
    
    if (state.mappedAvatarBones.RightFoot && hipsVisible && isPoseLandmarkUsable(landmarks[28], 0.2) && isPoseLandmarkUsable(landmarks[32], 0.2)) {
        alignBone(state.mappedAvatarBones.RightFoot, joints[28], joints[32], new THREE.Vector3(0, 0, 1), MOCAP_TRACK_RESPONSE, nowSec);
    } else if (state.mappedAvatarBones.RightFoot) {
        relaxBoneToRest(state.mappedAvatarBones.RightFoot, MOCAP_FALLBACK_RESPONSE);
    }
    
    state.bones.forEach(b => b.updateMatrixWorld(true));
}
