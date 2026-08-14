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
    "Hips": [-0.001, 0, 0, 1],
    "Spine": [-0.0106, 0, 0, 0.9999],
    "LeftShoulder": [0.5154, 0.5155, -0.484, 0.4841],
    "LeftArm": [0.6155, 0.1007, 0.1618, 0.7647],
    "LeftForeArm": [0.146, 0.1877, -0.1011, 0.966],
    "LeftHand": [0.0059, 0.001, -0.0107, 0.9999],
    "LeftHandIndex1": [0.032, -0.0026, 0.1823, 0.9827],
    "LeftHandIndex2": [-0.01, 0.0147, 0.1294, 0.9914],
    "LeftHandIndex3": [-0.0002, 0.0005, 0.1278, 0.9918],
    "LeftHandMiddle1": [0.0185, -0.0176, 0.1366, 0.9903],
    "LeftHandMiddle2": [0.0017, -0.0022, 0.132, 0.9912],
    "LeftHandMiddle3": [-0.0125, 0.0164, 0.1262, 0.9918],
    "LeftHandPinky1": [-0.0095, -0.0405, 0.0871, 0.9953],
    "LeftHandPinky2": [0.0101, -0.0118, 0.1334, 0.9909],
    "LeftHandPinky3": [0.0079, -0.0089, 0.1361, 0.9906],
    "LeftHandRing1": [0.0092, -0.0289, 0.1017, 0.9944],
    "LeftHandRing2": [0.0017, -0.0019, 0.1349, 0.9909],
    "LeftHandRing3": [-0.0109, 0.0138, 0.134, 0.9908],
    "LeftHandThumb1": [0.1297, -0.0251, 0.4398, 0.8883],
    "LeftHandThumb2": [0.0592, 0.0426, -0.2047, 0.9761],
    "LeftHandThumb3": [-0.0276, 0.07, 0.0783, 0.9941],
    "RightShoulder": [0.5155, -0.5154, 0.4841, 0.484],
    "RightArm": [-0.628, 0.0989, 0.1572, -0.7557],
    "RightForeArm": [-0.0013, -0.1522, -0.1401, 0.9784],
    "RightHand": [0.0059, -0.001, 0.0107, 0.9999],
    "RightHandIndex1": [0.032, 0.0026, -0.1823, 0.9827],
    "RightHandIndex2": [-0.01, -0.0147, -0.1294, 0.9914],
    "RightHandIndex3": [-0.0002, -0.0005, -0.1278, 0.9918],
    "RightHandMiddle1": [0.0185, 0.0176, -0.1366, 0.9903],
    "RightHandMiddle2": [0.0017, 0.0022, -0.132, 0.9912],
    "RightHandMiddle3": [-0.0125, -0.0164, -0.1262, 0.9918],
    "RightHandPinky1": [-0.0095, 0.0405, -0.0871, 0.9953],
    "RightHandPinky2": [0.0101, 0.0118, -0.1334, 0.9909],
    "RightHandPinky3": [0.0079, 0.0089, -0.1361, 0.9906],
    "RightHandRing1": [0.0092, 0.0289, -0.1017, 0.9944],
    "RightHandRing2": [0.0017, 0.0019, -0.1349, 0.9909],
    "RightHandRing3": [-0.0109, -0.0138, -0.134, 0.9908],
    "RightHandThumb1": [0.1393, 0.0045, -0.3219, 0.9365],
    "RightHandThumb2": [0.0614, -0.0481, 0.3291, 0.9411],
    "RightHandThumb3": [-0.0281, -0.0665, 0.0511, 0.9961]
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

    if (state.vrm) {
        // VRM Idle Pose: Lower arms naturally using directions
        const baseLeftArm = new THREE.Vector3(-1, 0, 0);
        const baseRightArm = new THREE.Vector3(1, 0, 0);
        
        alignBoneInstant(state.mappedAvatarBones.LeftArm, IDLE_ARM_DIRECTIONS.LeftArm, baseLeftArm);
        alignBoneInstant(state.mappedAvatarBones.LeftForeArm, IDLE_ARM_DIRECTIONS.LeftForeArm, baseLeftArm);
        
        alignBoneInstant(state.mappedAvatarBones.RightArm, IDLE_ARM_DIRECTIONS.RightArm, baseRightArm);
        alignBoneInstant(state.mappedAvatarBones.RightForeArm, IDLE_ARM_DIRECTIONS.RightForeArm, baseRightArm);
        
        // Curl fingers slightly for natural hands
        curlAllFingers(5);
    } else {
        // Apply the custom idle pose quaternions captured by the user
        Object.keys(CUSTOM_IDLE_POSE).forEach(boneName => {
            const bone = state.mappedAvatarBones[boneName];
            if (bone) {
                const q = CUSTOM_IDLE_POSE[boneName];
                bone.quaternion.set(q[0], q[1], q[2], q[3]);
            }
        });
    }

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
