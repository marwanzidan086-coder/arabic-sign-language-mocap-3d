import * as THREE from 'three';
import { state } from './state.js';
import { MOCAP_FALLBACK_RESPONSE, MOCAP_HAND_RELAX_RESPONSE } from './mocap-core.js';
import { getFrameSmoothing } from './mocap-filters.js';

export const IDLE_ARM_DIRECTIONS = {
    LeftArm: new THREE.Vector3(-0.20, -0.96, -0.05).normalize(),
    LeftForeArm: new THREE.Vector3(-0.20, -0.96, 0.10).normalize(),
    RightArm: new THREE.Vector3(0.20, -0.96, -0.05).normalize(),
    RightForeArm: new THREE.Vector3(0.20, -0.96, 0.10).normalize()
};

export const HAND_BONE_SUFFIXES = [
    'Hand',
    'HandThumb1', 'HandThumb2', 'HandThumb3',
    'HandIndex1', 'HandIndex2', 'HandIndex3',
    'HandMiddle1', 'HandMiddle2', 'HandMiddle3',
    'HandRing1', 'HandRing2', 'HandRing3',
    'HandPinky1', 'HandPinky2', 'HandPinky3'
];

export const mocapIdleQuaternions = new Map();

export function alignBoneInstant(bone, direction, baseDir) {
    if (!bone || !direction) return;
    const tempQuaternion = new THREE.Quaternion();
    const dir = direction.clone().normalize();
    const restData = state.mocapRestData.get(bone.uuid);
    const qWorld = new THREE.Quaternion();

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

    bone.quaternion.copy(qLocal);
    bone.updateMatrixWorld(true);
}

export function curlAllFingers(degrees) {
    const rad = degrees * Math.PI / 180;
    const sides = ['Left', 'Right'];
    const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
    
    sides.forEach(side => {
        fingers.forEach(finger => {
            for (let i = 1; i <= 3; i++) {
                const boneName = `${side}Hand${finger}${i}`;
                const bone = state.mappedAvatarBones[boneName];
                if (bone) {
                    const initial = state.boneMap.get(bone.uuid);
                    if (initial) {
                        bone.quaternion.copy(initial.quaternion);
                        const curlQ = new THREE.Quaternion();
                        if (finger === 'Thumb') {
                            const axis = new THREE.Vector3(0, side === 'Left' ? 1 : -1, 1).normalize();
                            curlQ.setFromAxisAngle(axis, rad * 0.7);
                        } else {
                            const axis = new THREE.Vector3(0, 0, side === 'Left' ? 1 : -1);
                            curlQ.setFromAxisAngle(axis, rad);
                        }
                        bone.quaternion.multiply(curlQ);
                    }
                }
            }
        });
    });
}

export const CUSTOM_IDLE_POSE = {
    "LeftShoulder": [0, 0, 0, 1],
    "RightShoulder": [0, 0, 0, 1],
    "LeftArm": [0.0001, 0.0163, 0.6258, 0.7798],
    "LeftForeArm": [-0.0934, -0.0762, -0.0024, 0.9927],
    "RightArm": [0.0001, -0.018, -0.6367, 0.7709],
    "RightForeArm": [0.0934, -0.0762, -0.0024, -0.9927],
    "LeftHand": [0, 0, 0, 1],
    "RightHand": [0, 0, 0, 1],
    "Neck": [0, 0, 0, 1],
    "Head": [0, 0, 0, 1],
    "Spine": [0, 0, 0, 1],
    "Hips": [0, 0, 0, 1],
    "LeftUpLeg": [0, 0, 0, 1],
    "LeftLeg": [0, 0, 0, 1],
    "LeftFoot": [0, 0, 0, 1],
    "RightUpLeg": [0, 0, 0, 1],
    "RightLeg": [0, 0, 0, 1],
    "RightFoot": [0, 0, 0, 1],
    "LeftHandThumb1": [0, 0.0216, 0.0216, 0.9995],
    "LeftHandThumb2": [0, 0.0216, 0.0216, 0.9995],
    "LeftHandThumb3": [0, 0.0216, 0.0216, 0.9995],
    "LeftHandIndex1": [0, 0, 0.0436, 0.999],
    "LeftHandIndex2": [0, 0, 0.0436, 0.999],
    "LeftHandIndex3": [0, 0, 0.0436, 0.999],
    "LeftHandMiddle1": [0, 0, 0.0436, 0.999],
    "LeftHandMiddle2": [0, 0, 0.0436, 0.999],
    "LeftHandMiddle3": [0, 0, 0.0436, 0.999],
    "LeftHandRing1": [0, 0, 0.0436, 0.999],
    "LeftHandRing2": [0, 0, 0.0436, 0.999],
    "LeftHandRing3": [0, 0, 0.0436, 0.999],
    "LeftHandPinky1": [0, 0, 0.0436, 0.999],
    "LeftHandPinky2": [0, 0, 0.0436, 0.999],
    "LeftHandPinky3": [0, 0, 0.0436, 0.999],
    "RightHandThumb1": [0, -0.0216, 0.0216, 0.9995],
    "RightHandThumb2": [0, -0.0216, 0.0216, 0.9995],
    "RightHandThumb3": [0, -0.0216, 0.0216, 0.9995],
    "RightHandIndex1": [0, 0, -0.0436, 0.999],
    "RightHandIndex2": [0, 0, -0.0436, 0.999],
    "RightHandIndex3": [0, 0, -0.0436, 0.999],
    "RightHandMiddle1": [0, 0, -0.0436, 0.999],
    "RightHandMiddle2": [0, 0, -0.0436, 0.999],
    "RightHandMiddle3": [0, 0, -0.0436, 0.999],
    "RightHandRing1": [0, 0, -0.0436, 0.999],
    "RightHandRing2": [0, 0, -0.0436, 0.999],
    "RightHandRing3": [0, 0, -0.0436, 0.999],
    "RightHandPinky1": [0, 0, -0.0436, 0.999],
    "RightHandPinky2": [0, 0, -0.0436, 0.999],
    "RightHandPinky3": [0, 0, -0.0436, 0.999]
};

export function applyIdlePose() {
    if (!state.model || Object.keys(state.mappedAvatarBones).length === 0) return;

    // Reset all bones to their original T-pose positions/rotations first
    state.bones.forEach(bone => {
        const initial = state.boneMap.get(bone.uuid);
        if (initial) {
            bone.position.copy(initial.position);
            bone.quaternion.copy(initial.quaternion);
            bone.scale.copy(initial.scale);
        }
    });

    // Force update world matrices of the model so alignBoneInstant reads fresh parent orientations
    state.model.updateMatrixWorld(true);

    // Apply the custom default idle pose quaternions
    Object.keys(CUSTOM_IDLE_POSE).forEach(boneName => {
        const bone = state.mappedAvatarBones[boneName];
        if (bone) {
            const q = CUSTOM_IDLE_POSE[boneName];
            bone.quaternion.set(q[0], q[1], q[2], q[3]);
        }
    });

    state.bones.forEach(b => b.updateMatrixWorld(true));
}

export function cacheIdlePoseQuaternions() {
    mocapIdleQuaternions.clear();
    applyIdlePose();
    state.bones.forEach(bone => {
        mocapIdleQuaternions.set(bone.uuid, bone.quaternion.clone());
    });
}

export function relaxBoneToRest(bone, smoothingResponse = MOCAP_HAND_RELAX_RESPONSE) {
    if (!bone) return;

    const idleQ = mocapIdleQuaternions.get(bone.uuid);
    if (!idleQ) return;

    bone.quaternion.slerp(idleQ, getFrameSmoothing(smoothingResponse));
    bone.updateMatrixWorld(true);
}

export function relaxHandToRest(side, smoothingResponse = MOCAP_HAND_RELAX_RESPONSE) {
    HAND_BONE_SUFFIXES.forEach(suffix => {
        relaxBoneToRest(state.mappedAvatarBones[`${side}${suffix}`], smoothingResponse);
    });
}

export function lowerArmNaturally(side) {
    const arm = state.mappedAvatarBones[`${side}Arm`];
    const forearm = state.mappedAvatarBones[`${side}ForeArm`];
    if (arm) relaxBoneToRest(arm, MOCAP_FALLBACK_RESPONSE);
    if (forearm) relaxBoneToRest(forearm, MOCAP_FALLBACK_RESPONSE);
    
    const upLeg = state.mappedAvatarBones[`${side}UpLeg`];
    const leg = state.mappedAvatarBones[`${side}Leg`];
    const foot = state.mappedAvatarBones[`${side}Foot`];
    if (upLeg) relaxBoneToRest(upLeg, MOCAP_FALLBACK_RESPONSE);
    if (leg) relaxBoneToRest(leg, MOCAP_FALLBACK_RESPONSE);
    if (foot) relaxBoneToRest(foot, MOCAP_FALLBACK_RESPONSE);

    if (state.mappedAvatarBones.Hips) {
        const initialHips = state.boneMap.get(state.mappedAvatarBones.Hips.uuid);
        if (initialHips) {
            state.mappedAvatarBones.Hips.position.lerp(initialHips.position, getFrameSmoothing(MOCAP_FALLBACK_RESPONSE));
        }
    }

    relaxHandToRest(side, MOCAP_HAND_RELAX_RESPONSE);
}
