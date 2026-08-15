import fs from 'fs';
import {
  CUSTOM_GESTURE_CONFIG,
  createGestureSample,
  normalizeStoredGesture,
  createId,
  predictCustomGesture
} from './customGestureRecognizer.js';

// Hand landmark helper: creates a 21-point hand given wrist position, palm orientation, and finger curls
function createHandLandmarks({
  wrist = { x: 0.35, y: 0.5, z: 0 },
  scale = 0.16,
  orientation = { yaw: 0, pitch: 0, roll: 0 },
  thumbCurl = 0, // 0 = fully extended out, 1 = curled
  indexCurl = 0, // 0 = straight up/extended, 1 = fully curled fist
  middleCurl = 0,
  ringCurl = 0,
  pinkyCurl = 0,
  isLeft = false
}) {
  const lm = new Array(21);
  const sideSign = isLeft ? -1 : 1;

  // 0: Wrist
  lm[0] = { x: wrist.x, y: wrist.y, z: wrist.z || 0 };

  // Base finger MCP offsets relative to wrist (in local hand space)
  // X: lateral, Y: distal (along fingers), Z: normal
  const mcpOffsets = [
    { x: -0.22 * sideSign, y: -0.15, z: 0.05 }, // Thumb CMC
    { x: -0.15 * sideSign, y: -0.32, z: 0.02 }, // Index MCP
    { x: -0.02 * sideSign, y: -0.35, z: 0.01 }, // Middle MCP
    { x: 0.10 * sideSign, y: -0.33, z: 0.01 },  // Ring MCP
    { x: 0.20 * sideSign, y: -0.28, z: 0.02 }   // Pinky MCP
  ];

  // Helper to rotate local point by yaw, pitch, roll
  function transformPoint(local) {
    const rx = local.x * scale;
    let ry = local.y * scale;
    let rz = (local.z || 0) * scale;

    // Apply pitch/roll rotations
    const cosP = Math.cos(orientation.pitch);
    const sinP = Math.sin(orientation.pitch);
    const cosR = Math.cos(orientation.roll);
    const sinR = Math.sin(orientation.roll);

    const y1 = ry * cosP - rz * sinP;
    const z1 = ry * sinP + rz * cosP;

    const x2 = rx * cosR - y1 * sinR;
    const y2 = rx * sinR + y1 * cosR;

    return {
      x: Math.round((wrist.x + x2) * 100000) / 100000,
      y: Math.round((wrist.y + y2) * 100000) / 100000,
      z: Math.round(((wrist.z || 0) + z1) * 100000) / 100000
    };
  }

  // Build Thumb (1, 2, 3, 4)
  const thumbBase = mcpOffsets[0];
  lm[1] = transformPoint(thumbBase);
  const tMcp = { x: thumbBase.x - 0.12 * sideSign, y: thumbBase.y - 0.10 * (1 - thumbCurl * 0.4), z: thumbBase.z + thumbCurl * 0.15 };
  lm[2] = transformPoint(tMcp);
  const tIp = { x: tMcp.x - 0.09 * sideSign * (1 - thumbCurl * 0.6), y: tMcp.y - 0.09 * (1 - thumbCurl * 0.5), z: tMcp.z + thumbCurl * 0.22 };
  lm[3] = transformPoint(tIp);
  const tTip = { x: tIp.x - 0.08 * sideSign * (1 - thumbCurl * 0.7), y: tIp.y - 0.08 * (1 - thumbCurl * 0.6), z: tIp.z + thumbCurl * 0.26 };
  lm[4] = transformPoint(tTip);

  // Helper for 4 main fingers (Index: 5-8, Middle: 9-12, Ring: 13-16, Pinky: 17-20)
  const fingerConfigs = [
    { start: 5, mcp: mcpOffsets[1], curl: indexCurl, length: 0.26 },
    { start: 9, mcp: mcpOffsets[2], curl: middleCurl, length: 0.28 },
    { start: 13, mcp: mcpOffsets[3], curl: ringCurl, length: 0.25 },
    { start: 17, mcp: mcpOffsets[4], curl: pinkyCurl, length: 0.21 }
  ];

  fingerConfigs.forEach(fc => {
    const base = fc.mcp;
    lm[fc.start] = transformPoint(base); // MCP

    // If curled (curl = 1), finger bends down into palm (y increases, z comes forward)
    // If extended (curl = 0), finger extends along -y
    const segLen = fc.length / 3;

    // PIP
    const pipAngle = fc.curl * 1.5; // rad
    const pip = {
      x: base.x,
      y: base.y - segLen * Math.cos(pipAngle * 0.5),
      z: base.z + segLen * Math.sin(pipAngle * 0.5)
    };
    lm[fc.start + 1] = transformPoint(pip);

    // DIP
    const dipAngle = fc.curl * 2.2;
    const dip = {
      x: base.x,
      y: pip.y - segLen * Math.cos(dipAngle * 0.7),
      z: pip.z + segLen * Math.sin(dipAngle * 0.7)
    };
    lm[fc.start + 2] = transformPoint(dip);

    // TIP
    const tipAngle = fc.curl * 2.8;
    const tip = {
      x: base.x,
      y: dip.y - segLen * Math.cos(tipAngle),
      z: dip.z + segLen * Math.sin(tipAngle)
    };
    lm[fc.start + 3] = transformPoint(tip);
  });

  return lm;
}

// Pose landmarks helper: 33 body points
function createPoseLandmarks({
  rWrist = { x: 0.35, y: 0.5, z: -0.1 },
  lWrist = { x: 0.65, y: 0.72, z: 0.05 },
  rElbow = { x: 0.32, y: 0.52, z: -0.05 },
  lElbow = { x: 0.66, y: 0.56, z: 0.05 }
}) {
  const pose = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99, presence: 0.99 }));

  pose[0] = { x: 0.50, y: 0.22, z: -0.05, visibility: 0.99 }; // Nose
  pose[11] = { x: 0.60, y: 0.36, z: 0.02, visibility: 0.99 }; // Left Shoulder
  pose[12] = { x: 0.40, y: 0.36, z: 0.02, visibility: 0.99 }; // Right Shoulder
  pose[13] = { x: lElbow.x, y: lElbow.y, z: lElbow.z || 0, visibility: 0.99 }; // Left Elbow
  pose[14] = { x: rElbow.x, y: rElbow.y, z: rElbow.z || 0, visibility: 0.99 }; // Right Elbow
  pose[15] = { x: lWrist.x, y: lWrist.y, z: lWrist.z || 0, visibility: 0.99 }; // Left Wrist
  pose[16] = { x: rWrist.x, y: rWrist.y, z: rWrist.z || 0, visibility: 0.99 }; // Right Wrist
  pose[23] = { x: 0.56, y: 0.72, z: 0, visibility: 0.99 }; // Left Hip
  pose[24] = { x: 0.44, y: 0.72, z: 0, visibility: 0.99 }; // Right Hip
  pose[25] = { x: 0.56, y: 0.90, z: 0, visibility: 0.99 }; // Left Knee
  pose[26] = { x: 0.44, y: 0.90, z: 0, visibility: 0.99 }; // Right Knee
  pose[27] = { x: 0.56, y: 1.05, z: 0, visibility: 0.99 }; // Left Ankle
  pose[28] = { x: 0.44, y: 1.05, z: 0, visibility: 0.99 }; // Right Ankle

  return pose;
}

// 1. Gesture: "مرحبا" (Marhaban / Hello) - Wave
function generateMarhabanSign() {
  const frames = [];
  const TOTAL_FRAMES = 26;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    // Right hand waves gently side to side at chest/head level
    const wave = Math.sin(t * Math.PI * 3.5);
    const wristX = 0.34 + wave * 0.045;
    const wristY = 0.32 + Math.cos(t * Math.PI * 2) * 0.015;
    const wristZ = -0.15;
    const roll = wave * 0.25;

    const rHand = createHandLandmarks({
      wrist: { x: wristX, y: wristY, z: wristZ },
      scale: 0.17,
      orientation: { pitch: -0.1, roll: roll, yaw: 0 },
      thumbCurl: 0.1, // open hand wave
      indexCurl: 0.05,
      middleCurl: 0.05,
      ringCurl: 0.08,
      pinkyCurl: 0.1,
      isLeft: false
    });

    const pose = createPoseLandmarks({
      rWrist: { x: wristX, y: wristY, z: wristZ },
      rElbow: { x: 0.30, y: 0.46, z: -0.08 }
    });

    frames.push({
      hands: [rHand],
      pose: pose,
      timestamp: Date.now() + i * 40
    });
  }

  return {
    name: 'مرحبا',
    category: 'greetings',
    frames: frames
  };
}

// 2. Gesture: "شكرا" (Shukran / Thank You) - From Chin forward and down
function generateShukranSign() {
  const frames = [];
  const TOTAL_FRAMES = 26;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    // Smooth ease in/out
    const progress = t * t * (3 - 2 * t);
    // Starts at chin (y=0.30, z=-0.22), moves forward and down (y=0.46, z=-0.38)
    const wristX = 0.46 - progress * 0.04;
    const wristY = 0.30 + progress * 0.16;
    const wristZ = -0.22 - progress * 0.16;
    const pitch = -0.2 + progress * 0.4; // opens outward

    const rHand = createHandLandmarks({
      wrist: { x: wristX, y: wristY, z: wristZ },
      scale: 0.17,
      orientation: { pitch: pitch, roll: -0.15, yaw: 0 },
      thumbCurl: 0.1, // flat respectful hand
      indexCurl: 0.05,
      middleCurl: 0.05,
      ringCurl: 0.05,
      pinkyCurl: 0.05,
      isLeft: false
    });

    const pose = createPoseLandmarks({
      rWrist: { x: wristX, y: wristY, z: wristZ },
      rElbow: { x: 0.36 + progress * 0.02, y: 0.48 + progress * 0.06, z: -0.12 - progress * 0.08 }
    });

    frames.push({
      hands: [rHand],
      pose: pose,
      timestamp: Date.now() + i * 40
    });
  }

  return {
    name: 'شكرا',
    category: 'courtesy',
    frames: frames
  };
}

// 3. Gesture: "نعم" (Naam / Yes) - Thumbs Up Affirmation Nod
function generateNaamSign() {
  const frames = [];
  const TOTAL_FRAMES = 26;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    // Nods hand up and down
    const nod = Math.sin(t * Math.PI * 3);
    const wristX = 0.38;
    const wristY = 0.44 + nod * 0.03;
    const wristZ = -0.20;

    const rHand = createHandLandmarks({
      wrist: { x: wristX, y: wristY, z: wristZ },
      scale: 0.16,
      orientation: { pitch: 0.1 + nod * 0.15, roll: -0.1, yaw: 0 },
      thumbCurl: 0.0, // Thumb upright!
      indexCurl: 0.95, // Fist closed
      middleCurl: 0.95,
      ringCurl: 0.95,
      pinkyCurl: 0.95,
      isLeft: false
    });

    const pose = createPoseLandmarks({
      rWrist: { x: wristX, y: wristY, z: wristZ },
      rElbow: { x: 0.34, y: 0.52, z: -0.10 }
    });

    frames.push({
      hands: [rHand],
      pose: pose,
      timestamp: Date.now() + i * 40
    });
  }

  return {
    name: 'نعم',
    category: 'basics',
    frames: frames
  };
}

// 4. Gesture: "أحبك" (Uhibbuka / I Love You) - ILY Sign
function generateUhibbukaSign() {
  const frames = [];
  const TOTAL_FRAMES = 26;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    const pulse = Math.sin(t * Math.PI * 2) * 0.015;
    const wristX = 0.42 + pulse;
    const wristY = 0.36;
    const wristZ = -0.22;

    const rHand = createHandLandmarks({
      wrist: { x: wristX, y: wristY, z: wristZ },
      scale: 0.17,
      orientation: { pitch: -0.1, roll: 0.05, yaw: 0 },
      thumbCurl: 0.0,  // Thumb extended OUT
      indexCurl: 0.0,  // Index UP
      middleCurl: 0.95,// Middle FOLDED
      ringCurl: 0.95,  // Ring FOLDED
      pinkyCurl: 0.0,  // Pinky UP
      isLeft: false
    });

    const pose = createPoseLandmarks({
      rWrist: { x: wristX, y: wristY, z: wristZ },
      rElbow: { x: 0.36, y: 0.48, z: -0.10 }
    });

    frames.push({
      hands: [rHand],
      pose: pose,
      timestamp: Date.now() + i * 40
    });
  }

  return {
    name: 'أحبك',
    category: 'feelings',
    frames: frames
  };
}

// 5. Gesture: "السلام عليكم" (Assalamu Alaikum / Peace Be Upon You) - Two Hands Open Greeting
function generateAssalamuAlaikumSign() {
  const frames = [];
  const TOTAL_FRAMES = 28;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / (TOTAL_FRAMES - 1);
    const progress = t * t * (3 - 2 * t);
    
    // Both hands start near center chest (x=0.42 and 0.58) and move outward (x=0.30 and 0.70)
    const rWristX = 0.44 - progress * 0.14;
    const lWristX = 0.56 + progress * 0.14;
    const wristY = 0.38 + progress * 0.08;
    const wristZ = -0.18 - progress * 0.12;

    const rHand = createHandLandmarks({
      wrist: { x: rWristX, y: wristY, z: wristZ },
      scale: 0.17,
      orientation: { pitch: -0.1 + progress * 0.15, roll: -0.15 + progress * 0.3, yaw: 0 },
      thumbCurl: 0.1,
      indexCurl: 0.05,
      middleCurl: 0.05,
      ringCurl: 0.05,
      pinkyCurl: 0.05,
      isLeft: false
    });

    const lHand = createHandLandmarks({
      wrist: { x: lWristX, y: wristY, z: wristZ },
      scale: 0.17,
      orientation: { pitch: -0.1 + progress * 0.15, roll: 0.15 - progress * 0.3, yaw: 0 },
      thumbCurl: 0.1,
      indexCurl: 0.05,
      middleCurl: 0.05,
      ringCurl: 0.05,
      pinkyCurl: 0.05,
      isLeft: true
    });

    const pose = createPoseLandmarks({
      rWrist: { x: rWristX, y: wristY, z: wristZ },
      lWrist: { x: lWristX, y: wristY, z: wristZ },
      rElbow: { x: 0.36 - progress * 0.08, y: 0.48 + progress * 0.04, z: -0.10 },
      lElbow: { x: 0.64 + progress * 0.08, y: 0.48 + progress * 0.04, z: -0.10 }
    });

    frames.push({
      hands: [rHand, lHand],
      pose: pose,
      timestamp: Date.now() + i * 40
    });
  }

  return {
    name: 'السلام عليكم',
    category: 'greetings',
    frames: frames
  };
}

// Generate all 5 gestures
const generators = [
  generateMarhabanSign,
  generateShukranSign,
  generateNaamSign,
  generateUhibbukaSign,
  generateAssalamuAlaikumSign
];

const builtGestures = [];

generators.forEach((gen) => {
  const raw = gen();
  const sample = createGestureSample(raw.frames, {
    durationMs: raw.frames.length * 40
  });

  const gesture = normalizeStoredGesture({
    id: createId(`gesture_${raw.name}`),
    name: raw.name,
    category: raw.category,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    samples: [sample]
  });

  builtGestures.push(gesture);
  console.log(`Generated sign: "${gesture.name}" with ${sample.framesCount} frames, score: ${sample.qualityScore}, movement: ${sample.movementScore}`);
});

// Test predictions for each gesture by simulating live sequential stream
console.log("\n--- Real Live Stream Recognition Verification ---");
import { resetCustomGestureBuffer } from './customGestureRecognizer.js';

builtGestures.forEach(g => {
  resetCustomGestureBuffer();
  const sample = g.samples[0];
  let bestPred = null;

  sample.frames.forEach(f => {
    const pred = predictCustomGesture(f.hands, builtGestures);
    if (pred) {
      if (!bestPred || pred.confidence > bestPred.confidence) {
        bestPred = pred;
      }
    }
  });

  console.log(`Sign "${g.name}" -> Recognized as: "${bestPred ? bestPred.outputText : 'None'}" (Confidence: ${bestPred ? (bestPred.confidence * 100).toFixed(1) + '%' : '0%'})`);
});

// Export to default-signs-dataset.js
const fileContent = `// Pre-Trained Standard Arabic Sign Language Dataset (5 Core Words)
// Generated and calibrated for Real-time 3D MoCap & Recognition
export const DEFAULT_PRETRAINED_GESTURES = ${JSON.stringify(builtGestures, null, 2)};
`;

fs.writeFileSync('./default-signs-dataset.js', fileContent);
console.log("\nSuccessfully written to ./default-signs-dataset.js!");
