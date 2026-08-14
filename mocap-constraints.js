// FILE: mocap-constraints.js
import * as THREE from 'three';
import { state } from './state.js';

export const MOCAP_DEPTH_SCALE = 1.6;

// ====== 1. نظام منع اختراق الذراع للجسم (Arm Penetration Prevention) ======
export function clampUpperArmDirection(dir, side) {
    // منع الذراع من الرجوع خلف الظهر بزاوية مرعبة (محور Z في نظام الأفاتار)
    dir.z = Math.max(dir.z, -0.25);
    
    // منع اليد من الدخول داخل الصدر والبطن (Inward Penetration Barrier)
    if (side === 'Left') {
        if (dir.y < -0.1) {
            dir.x = Math.min(dir.x, -0.20); // حجز مسافة أمان خارج الجسم لليد اليسرى
        } else {
            dir.x = Math.min(dir.x, -0.05);
        }
    } else {
        if (dir.y < -0.1) {
            dir.x = Math.max(dir.x, 0.20); // حجز مسافة أمان خارج الجسم لليد اليمنى
        } else {
            dir.x = Math.max(dir.x, 0.05);
        }
    }
    dir.normalize();
    return dir;
}

// ====== 2. كبح حركة الترقوة والكتف ======
export function clampShoulderBoneRotation(shoulderBone) {
    const tempEuler = new THREE.Euler();
    tempEuler.setFromQuaternion(shoulderBone.quaternion, 'XYZ');
    const maxAngleRad = 10 * Math.PI / 180; // حد أقصى لحركة رفع الأكتاف الباطنية 10 درجات فقط
    tempEuler.x = THREE.MathUtils.clamp(tempEuler.x, -maxAngleRad, maxAngleRad);
    tempEuler.y = THREE.MathUtils.clamp(tempEuler.y, -maxAngleRad, maxAngleRad);
    tempEuler.z = THREE.MathUtils.clamp(tempEuler.z, -maxAngleRad, maxAngleRad);
    shoulderBone.quaternion.setFromEuler(tempEuler);
    shoulderBone.updateMatrixWorld(true);
}

// ====== 3. كبح مفاصل الأصابع والمعصم (Finger Fracture Prevention) ======
// هذه الدالة الجديدة تمنع الأصابع من الانثناء العكسي أو الانكسار الجانبي غير الطبيعي
export function clampFingerRotation(bone, side, fingerName) {
    const tempEuler = new THREE.Euler();
    tempEuler.setFromQuaternion(bone.quaternion, 'XYZ');
    
    // في VRM، الانثناء الطبيعي للأصابع (القبضة) يعتمد على تدوير محور محدد.
    // نضع قيود ميكانيكية حيوية صارمة: لا يمكن للإصبع أن ينثني للخلف (عكس التوجيه التشريحي)
    if (fingerName.includes('Thumb')) {
        // الإبهام له حركة حرة ومختلفة تشريحياً
        tempEuler.x = THREE.MathUtils.clamp(tempEuler.x, -0.2, 0.5);
        tempEuler.y = THREE.MathUtils.clamp(tempEuler.y, -0.3, 0.3);
        tempEuler.z = THREE.MathUtils.clamp(tempEuler.z, -0.4, 0.4);
    } else {
        // الأصابع الأربعة الأخرى: حركة مفصلية نقية (ممنوع الانفراج العكسي للخلف 0 ومسموح بقبضة كاملة)
        const sideFactor = (side === 'Left') ? 1 : -1;
        
        tempEuler.x = THREE.MathUtils.clamp(tempEuler.x, -0.1, 0.1); // منع الالتواء الجانبي
        tempEuler.y = THREE.MathUtils.clamp(tempEuler.y, -0.1, 0.1); 
        
        // المحور Z هو المسؤول عن فتح وإغلاق الأصابع في الهياكل العظمية القياسية
        if (side === 'Left') {
            tempEuler.z = THREE.MathUtils.clamp(tempEuler.z, 0.0, 1.6); // من وضع مستقيم تماماً إلى قبضة مغلقة
        } else {
            tempEuler.z = THREE.MathUtils.clamp(tempEuler.z, -1.6, 0.0);
        }
    }
    
    bone.quaternion.setFromEuler(tempEuler);
}

// ====== 4. نظام التوجيه الميكانيكي الحركي للكوع ======
export function cacheElbowHingeAxes() {
    state.elbowConstraintsData.clear();
    const sides = ['Left', 'Right'];
    sides.forEach(side => {
        const upperArm = state.mappedAvatarBones[`${side}Arm`];
        if (!upperArm) return;
        
        const restData = state.mocapRestData.get(upperArm.uuid);
        if (!restData) return;

        const restUpperArmDir = restData.restWorldDirection.clone();
        const restBendingDir = new THREE.Vector3(0, 0, 1);
        const restHingeAxis = new THREE.Vector3().crossVectors(restUpperArmDir, restBendingDir);
        
        if (restHingeAxis.lengthSq() < 0.0001) {
            restHingeAxis.set(1, 0, 0); 
        } else {
            restHingeAxis.normalize();
        }
        const qRestUpperWorldInvert = restData.restWorldQuaternion.clone().invert();
        const localHingeAxis = restHingeAxis.clone().applyQuaternion(qRestUpperWorldInvert).normalize();
        const localBendingDir = restBendingDir.clone().applyQuaternion(qRestUpperWorldInvert).normalize();

        state.elbowConstraintsData.set(upperArm.uuid, {
            localHingeAxis,
            localBendingDir
        });
    });
}

export function constrainElbowDirection(upperArmBone, targetForearmDir) {
    const constraints = state.elbowConstraintsData.get(upperArmBone.uuid);
    if (!constraints) return targetForearmDir;

    const upperArmDir = new THREE.Vector3();
    const elbowPosition = new THREE.Vector3();
    const shoulderPosition = new THREE.Vector3();
    
    upperArmBone.getWorldPosition(shoulderPosition);
    const side = upperArmBone.name.startsWith('Left') ? 'Left' : 'Right';
    const elbowBone = state.mappedAvatarBones[`${side}ForeArm`];
    if (!elbowBone) return targetForearmDir;
    elbowBone.getWorldPosition(elbowPosition);
    upperArmDir.subVectors(elbowPosition, shoulderPosition).normalize();

    const qUpperWorld = new THREE.Quaternion();
    upperArmBone.getWorldQuaternion(qUpperWorld);

    const hingeAxis = constraints.localHingeAxis.clone().applyQuaternion(qUpperWorld).normalize();
    const bendingDir = constraints.localBendingDir.clone().applyQuaternion(qUpperWorld).normalize();

    const projection = targetForearmDir.clone().projectOnPlane(hingeAxis);
    if (projection.lengthSq() < 0.0001) {
        return upperArmDir;
    }
    const constrainedDir = projection.normalize();

    const cosTheta = constrainedDir.dot(upperArmDir);
    const sinTheta = constrainedDir.dot(bendingDir);
    let theta = Math.atan2(sinTheta, cosTheta);

    // كبح مفصل الكوع البشري (من 0 ممدود بالكامل إلى 140 درجة كحد أقصى للثني وممنوع الكسر العكسي)
    theta = THREE.MathUtils.clamp(theta, 0, 140 * Math.PI / 180);

    const finalDir = new THREE.Vector3()
        .addScaledVector(upperArmDir, Math.cos(theta))
        .addScaledVector(bendingDir, Math.sin(theta))
        .normalize();

    return finalDir;
}
