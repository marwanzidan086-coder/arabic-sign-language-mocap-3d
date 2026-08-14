import * as THREE from 'three';
import { state } from './state.js';

export function getFrameSmoothing(response) {
    return 1 - Math.exp(-response * state.mocapFrameDeltaSeconds);
}

// ====== One-Euro Filter & Quaternion Smoother ======
export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.007, derivativeCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.derivativeCutoff = derivativeCutoff;
        this.x = null;
        this.dx = null;
        this.lastTime = null;
    }

    filter(value, timestamp) {
        if (this.lastTime === null) {
            this.x = value;
            this.dx = 0;
            this.lastTime = timestamp;
            return value;
        }

        const dt = Math.max(timestamp - this.lastTime, 1e-5);
        this.lastTime = timestamp;

        const rawDx = (value - this.x) / dt;
        const edx = this._smoothingFactor(dt, this.derivativeCutoff);
        this.dx = this.dx + edx * (rawDx - this.dx);

        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        const alpha = this._smoothingFactor(dt, cutoff);
        this.x = this.x + alpha * (value - this.x);

        return this.x;
    }

    _smoothingFactor(dt, cutoff) {
        const r = 2 * Math.PI * cutoff * dt;
        return r / (r + 1);
    }

    reset() {
        this.x = null;
        this.dx = null;
        this.lastTime = null;
    }
}

export class QuaternionSmoother {
    constructor(minCutoff = 0.8, beta = 0.03) {
        this.filters = {
            x: new OneEuroFilter(minCutoff, beta),
            y: new OneEuroFilter(minCutoff, beta),
            z: new OneEuroFilter(minCutoff, beta),
            w: new OneEuroFilter(minCutoff, beta)
        };
    }

    smooth(quaternion, timestamp) {
        const q = new THREE.Quaternion(
            this.filters.x.filter(quaternion.x, timestamp),
            this.filters.y.filter(quaternion.y, timestamp),
            this.filters.z.filter(quaternion.z, timestamp),
            this.filters.w.filter(quaternion.w, timestamp)
        );
        return q.normalize();
    }

    reset() {
        Object.values(this.filters).forEach(f => f.reset());
    }
}

export const boneSmoothers = new Map();

export function getBoneSmoother(bone) {
    if (!boneSmoothers.has(bone.uuid)) {
        const isFinger = bone.name && bone.name.includes('Hand') && bone.name !== 'LeftHand' && bone.name !== 'RightHand';
        const isHandWrist = bone.name === 'LeftHand' || bone.name === 'RightHand';
        const isArmOrLeg = bone.name && (bone.name.includes('Arm') || bone.name.includes('Leg') || bone.name.includes('Shoulder'));
        
        let minCutoff = 0.8;
        let beta = 0.03;
        
        if (isFinger) {
            minCutoff = 2.2; // highly responsive for finger signing (increased slightly for snappiness)
            beta = 0.004;
        } else if (isHandWrist) {
            minCutoff = 1.6; // highly responsive wrist rotation
            beta = 0.01;
        } else if (isArmOrLeg) {
            minCutoff = 1.3; // snappier arm and leg tracking
            beta = 0.02;
        }
        
        boneSmoothers.set(bone.uuid, new QuaternionSmoother(minCutoff, beta));
    }
    return boneSmoothers.get(bone.uuid);
}

export function resetAllSmoothers() {
    boneSmoothers.forEach(s => s.reset());
}

export function clearAllBoneSmoothers() {
    boneSmoothers.clear();
}
