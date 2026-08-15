import * as THREE from 'three';
import { state } from './state.js';
import { CUSTOM_IDLE_POSE, applyIdlePose, alignBoneInstant, IDLE_ARM_DIRECTIONS } from './mocap-idle.js';

let activeSignAnimation = null;

// Helper to set individual finger curl (0 = extended, 1 = curled into fist)
export function setFingerCurls(side, { thumb = 0, index = 0, middle = 0, ring = 0, pinky = 0 }) {
  const curls = { Thumb: thumb, Index: index, Middle: middle, Ring: ring, Pinky: pinky };
  const sign = side === 'Left' ? 1 : -1;

  Object.entries(curls).forEach(([finger, curlVal]) => {
    const rad = curlVal * (Math.PI * 0.48); // ~85 deg max curl
    for (let i = 1; i <= 3; i++) {
      const boneName = `${side}Hand${finger}${i}`;
      const bone = state.mappedAvatarBones[boneName];
      if (bone) {
        const initial = state.boneMap.get(bone.uuid);
        if (initial) {
          bone.quaternion.copy(initial.quaternion);
          const curlQ = new THREE.Quaternion();
          if (finger === 'Thumb') {
            // Anatomical opposition axis for thumb
            const axis = new THREE.Vector3(0, side === 'Left' ? 1 : -1, 1).normalize();
            curlQ.setFromAxisAngle(axis, curlVal * Math.PI * 0.35);
          } else {
            const axis = new THREE.Vector3(0, 0, sign);
            const jointMultiplier = i === 1 ? 0.7 : (i === 2 ? 1.0 : 0.85);
            curlQ.setFromAxisAngle(axis, rad * jointMultiplier);
          }
          bone.quaternion.multiply(curlQ);
        }
      }
    }
  });
}

// 5 Dedicated Master Motion Curves for Standard Arabic Signs (Anatomically Calibrated for VRM -X Right / +X Left)
export const PRETRAINED_SIGN_MOTIONS = {
  'مرحبا': {
    duration: 2200,
    animate(progress) {
      const rArm = state.mappedAvatarBones.RightArm;
      const rForeArm = state.mappedAvatarBones.RightForeArm;
      if (!rArm || !rForeArm) return;

      let lift = 0;
      let wave = 0;

      if (progress < 0.25) {
        const t = progress / 0.25;
        lift = t * t * (3 - 2 * t);
      } else if (progress < 0.75) {
        lift = 1.0;
        const waveT = (progress - 0.25) / 0.50;
        wave = Math.sin(waveT * Math.PI * 4); // 2 full waves
      } else {
        const t = (progress - 0.75) / 0.25;
        lift = 1.0 - t * t * (3 - 2 * t);
      }

      // Upper arm moves to right side (-X) and lifts up
      const baseArmDir = IDLE_ARM_DIRECTIONS.RightArm;
      const targetArmDir = new THREE.Vector3(-0.35, -0.05, 0.30).normalize();
      const currentArmDir = new THREE.Vector3().lerpVectors(baseArmDir, targetArmDir, lift).normalize();
      alignBoneInstant(rArm, currentArmDir, new THREE.Vector3(-1, 0, 0));

      // Forearm points upright with natural lateral wave
      const baseForeDir = IDLE_ARM_DIRECTIONS.RightForeArm;
      const targetForeDir = new THREE.Vector3(-0.08 + wave * 0.25, 0.90, 0.15).normalize();
      const currentForeDir = new THREE.Vector3().lerpVectors(baseForeDir, targetForeDir, lift).normalize();
      alignBoneInstant(rForeArm, currentForeDir, new THREE.Vector3(-1, 0, 0));

      // Open hand waving
      setFingerCurls('Right', { thumb: 0.05, index: 0.05, middle: 0.05, ring: 0.08, pinky: 0.1 });
    }
  },

  'شكرا': {
    duration: 2200,
    animate(progress) {
      const rArm = state.mappedAvatarBones.RightArm;
      const rForeArm = state.mappedAvatarBones.RightForeArm;
      if (!rArm || !rForeArm) return;

      let lift = 0;
      let sweep = 0;

      if (progress < 0.25) {
        const t = progress / 0.25;
        lift = t * t * (3 - 2 * t);
      } else if (progress < 0.75) {
        lift = 1.0;
        const t = (progress - 0.25) / 0.50;
        sweep = t * t * (3 - 2 * t);
      } else {
        const t = (progress - 0.75) / 0.25;
        lift = 1.0 - t * t * (3 - 2 * t);
        sweep = 1.0 - t;
      }

      // Hand moves from chin forward
      const baseArmDir = IDLE_ARM_DIRECTIONS.RightArm;
      const targetArmDir = new THREE.Vector3(-0.15, 0.05 - sweep * 0.25, 0.35 + sweep * 0.30).normalize();
      const currentArmDir = new THREE.Vector3().lerpVectors(baseArmDir, targetArmDir, lift).normalize();
      alignBoneInstant(rArm, currentArmDir, new THREE.Vector3(-1, 0, 0));

      const baseForeDir = IDLE_ARM_DIRECTIONS.RightForeArm;
      const targetForeDir = new THREE.Vector3(-0.05, 0.65 - sweep * 0.45, 0.35 + sweep * 0.50).normalize();
      const currentForeDir = new THREE.Vector3().lerpVectors(baseForeDir, targetForeDir, lift).normalize();
      alignBoneInstant(rForeArm, currentForeDir, new THREE.Vector3(-1, 0, 0));

      // Flat respectful hand
      setFingerCurls('Right', { thumb: 0.1, index: 0.05, middle: 0.05, ring: 0.05, pinky: 0.05 });
    }
  },

  'نعم': {
    duration: 2200,
    animate(progress) {
      const rArm = state.mappedAvatarBones.RightArm;
      const rForeArm = state.mappedAvatarBones.RightForeArm;
      if (!rArm || !rForeArm) return;

      let lift = 0;
      let nod = 0;

      if (progress < 0.25) {
        const t = progress / 0.25;
        lift = t * t * (3 - 2 * t);
      } else if (progress < 0.75) {
        lift = 1.0;
        const nodT = (progress - 0.25) / 0.50;
        nod = Math.sin(nodT * Math.PI * 4); // 2 nods
      } else {
        const t = (progress - 0.75) / 0.25;
        lift = 1.0 - t * t * (3 - 2 * t);
      }

      const baseArmDir = IDLE_ARM_DIRECTIONS.RightArm;
      const targetArmDir = new THREE.Vector3(-0.18, -0.20, 0.40).normalize();
      const currentArmDir = new THREE.Vector3().lerpVectors(baseArmDir, targetArmDir, lift).normalize();
      alignBoneInstant(rArm, currentArmDir, new THREE.Vector3(-1, 0, 0));

      const baseForeDir = IDLE_ARM_DIRECTIONS.RightForeArm;
      const targetForeDir = new THREE.Vector3(-0.05, 0.45 + nod * 0.20, 0.70).normalize();
      const currentForeDir = new THREE.Vector3().lerpVectors(baseForeDir, targetForeDir, lift).normalize();
      alignBoneInstant(rForeArm, currentForeDir, new THREE.Vector3(-1, 0, 0));

      // Solid Thumbs-Up: Thumb UP (0), others curled (1)
      const fingerCurlVal = 0.95 * lift;
      setFingerCurls('Right', {
        thumb: 0.0,
        index: fingerCurlVal,
        middle: fingerCurlVal,
        ring: fingerCurlVal,
        pinky: fingerCurlVal
      });
    }
  },

  'أحبك': {
    duration: 2400,
    animate(progress) {
      const rArm = state.mappedAvatarBones.RightArm;
      const rForeArm = state.mappedAvatarBones.RightForeArm;
      if (!rArm || !rForeArm) return;

      let lift = 0;
      let sway = 0;

      if (progress < 0.25) {
        const t = progress / 0.25;
        lift = t * t * (3 - 2 * t);
      } else if (progress < 0.75) {
        lift = 1.0;
        const t = (progress - 0.25) / 0.50;
        sway = Math.sin(t * Math.PI * 2) * 0.10;
      } else {
        const t = (progress - 0.75) / 0.25;
        lift = 1.0 - t * t * (3 - 2 * t);
      }

      const baseArmDir = IDLE_ARM_DIRECTIONS.RightArm;
      const targetArmDir = new THREE.Vector3(-0.20, -0.10, 0.38).normalize();
      const currentArmDir = new THREE.Vector3().lerpVectors(baseArmDir, targetArmDir, lift).normalize();
      alignBoneInstant(rArm, currentArmDir, new THREE.Vector3(-1, 0, 0));

      const baseForeDir = IDLE_ARM_DIRECTIONS.RightForeArm;
      const targetForeDir = new THREE.Vector3(-0.05 + sway, 0.75, 0.40).normalize();
      const currentForeDir = new THREE.Vector3().lerpVectors(baseForeDir, targetForeDir, lift).normalize();
      alignBoneInstant(rForeArm, currentForeDir, new THREE.Vector3(-1, 0, 0));

      // ILY Sign: Thumb = 0, Index = 0, Pinky = 0, Middle = 0.95, Ring = 0.95
      const foldVal = 0.95 * lift;
      setFingerCurls('Right', {
        thumb: 0.0,
        index: 0.0,
        middle: foldVal,
        ring: foldVal,
        pinky: 0.0
      });
    }
  },

  'السلام عليكم': {
    duration: 2500,
    animate(progress) {
      const rArm = state.mappedAvatarBones.RightArm;
      const rForeArm = state.mappedAvatarBones.RightForeArm;
      const lArm = state.mappedAvatarBones.LeftArm;
      const lForeArm = state.mappedAvatarBones.LeftForeArm;

      if (!rArm || !rForeArm || !lArm || !lForeArm) return;

      let lift = 0;
      let spread = 0;

      if (progress < 0.25) {
        const t = progress / 0.25;
        lift = t * t * (3 - 2 * t);
      } else if (progress < 0.75) {
        lift = 1.0;
        const t = (progress - 0.25) / 0.50;
        spread = t * t * (3 - 2 * t);
      } else {
        const t = (progress - 0.75) / 0.25;
        lift = 1.0 - t * t * (3 - 2 * t);
        spread = 1.0 - t;
      }

      // Right Arm (Moves outward to -X)
      const baseArmR = IDLE_ARM_DIRECTIONS.RightArm;
      const targetArmR = new THREE.Vector3(-0.15 - spread * 0.45, -0.05, 0.35 + spread * 0.15).normalize();
      const currentArmR = new THREE.Vector3().lerpVectors(baseArmR, targetArmR, lift).normalize();
      alignBoneInstant(rArm, currentArmR, new THREE.Vector3(-1, 0, 0));

      const baseForeR = IDLE_ARM_DIRECTIONS.RightForeArm;
      const targetForeR = new THREE.Vector3(-0.08 - spread * 0.40, 0.55, 0.45).normalize();
      const currentForeR = new THREE.Vector3().lerpVectors(baseForeR, targetForeR, lift).normalize();
      alignBoneInstant(rForeArm, currentForeR, new THREE.Vector3(-1, 0, 0));

      // Left Arm (Moves outward to +X)
      const baseArmL = IDLE_ARM_DIRECTIONS.LeftArm;
      const targetArmL = new THREE.Vector3(0.15 + spread * 0.45, -0.05, 0.35 + spread * 0.15).normalize();
      const currentArmL = new THREE.Vector3().lerpVectors(baseArmL, targetArmL, lift).normalize();
      alignBoneInstant(lArm, currentArmL, new THREE.Vector3(1, 0, 0));

      const baseForeL = IDLE_ARM_DIRECTIONS.LeftForeArm;
      const targetForeL = new THREE.Vector3(0.08 + spread * 0.40, 0.55, 0.45).normalize();
      const currentForeL = new THREE.Vector3().lerpVectors(baseForeL, targetForeL, lift).normalize();
      alignBoneInstant(lForeArm, currentForeL, new THREE.Vector3(1, 0, 0));

      // Open hands
      setFingerCurls('Right', { thumb: 0.05, index: 0.05, middle: 0.05, ring: 0.05, pinky: 0.05 });
      setFingerCurls('Left', { thumb: 0.05, index: 0.05, middle: 0.05, ring: 0.05, pinky: 0.05 });
    }
  }
};

export function playProceduralSign(gestureName, onComplete) {
  stopActiveSignAnimation();

  const motion = PRETRAINED_SIGN_MOTIONS[gestureName];
  if (!motion) return false;

  const startTime = performance.now();
  const duration = motion.duration;

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / duration);

    motion.animate(progress);

    if (state.bones) {
      state.bones.forEach(b => b.updateMatrixWorld(true));
    }

    if (progress < 1.0) {
      activeSignAnimation = requestAnimationFrame(step);
    } else {
      activeSignAnimation = null;
      applyIdlePose();
      if (onComplete) onComplete();
    }
  }

  activeSignAnimation = requestAnimationFrame(step);
  return true;
}

export function stopActiveSignAnimation() {
  if (activeSignAnimation) {
    cancelAnimationFrame(activeSignAnimation);
    activeSignAnimation = null;
  }
}
