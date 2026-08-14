import * as THREE from 'three';
import { state, el } from './state.js';

// --- VRM to MMD bone mappings ---
const VRM_TO_MMD_BONE_MAP = {
    'Hips': '下半身', // Lower body (translates and rotates)
    'Spine': '上半身', // Upper body
    'Neck': '首',
    'Head': '頭',
    'LeftShoulder': '左肩',
    'LeftArm': '左腕',
    'LeftForeArm': '左ひじ',
    'LeftHand': '左手首',
    'RightShoulder': '右肩',
    'RightArm': '右腕',
    'RightForeArm': '右ひじ',
    'RightHand': '右手首',
    'LeftUpLeg': '左足',
    'LeftLeg': '左ひざ',
    'LeftFoot': '左足首',
    'RightUpLeg': '右足',
    'RightLeg': '右ひざ',
    'RightFoot': '右足首',
    
    // Left Hand Fingers
    'LeftHandThumb1': '左親指１',
    'LeftHandThumb2': '左親指２',
    'LeftHandThumb3': '左親指３',
    'LeftHandIndex1': '左人指１',
    'LeftHandIndex2': '左人指２',
    'LeftHandIndex3': '左人指３',
    'LeftHandMiddle1': '左中指１',
    'LeftHandMiddle2': '左中指２',
    'LeftHandMiddle3': '左中指３',
    'LeftHandRing1': '左薬指１',
    'LeftHandRing2': '左薬指２',
    'LeftHandRing3': '左薬指３',
    'LeftHandPinky1': '左小指１',
    'LeftHandPinky2': '左小指２',
    'LeftHandPinky3': '左小指３',
    
    // Right Hand Fingers
    'RightHandThumb1': '右親指１',
    'RightHandThumb2': '右親指２',
    'RightHandThumb3': '右親指３',
    'RightHandIndex1': '右人指１',
    'RightHandIndex2': '右人指２',
    'RightHandIndex3': '右人指３',
    'RightHandMiddle1': '右中指１',
    'RightHandMiddle2': '右中指２',
    'RightHandMiddle3': '右中指３',
    'RightHandRing1': '右薬指１',
    'RightHandRing2': '右薬指２',
    'RightHandRing3': '右薬指３',
    'RightHandPinky1': '右小指１',
    'RightHandPinky2': '右小指２',
    'RightHandPinky3': '右小指３'
};

// --- VRM to MMD Morph (facial blendshape) mappings ---
const VRM_TO_MMD_MORPH_MAP = {
    'blink': 'まばたき',
    'blinkLeft': 'ウィンク',
    'blinkRight': 'ウィンク右',
    'aa': 'あ',
    'ih': 'い',
    'ou': 'う',
    'ee': 'え',
    'oh': 'お'
};

// --- Helper: String to SJIS Array ---
function unicodeToSjis(text, lengthFixed) {
    if (typeof Encoding === 'undefined') {
        console.error("Encoding library encoding.js is not loaded.");
        const arr = new Uint8Array(lengthFixed || 0);
        for(let i=0; i<Math.min(text.length, arr.length); i++) {
            arr[i] = text.charCodeAt(i) & 0xFF;
        }
        return arr;
    }
    const unicodeArray = Encoding.stringToCode(text);
    const sjisArray = Encoding.convert(unicodeArray, {
        to: 'SJIS',
        from: 'UNICODE'
    });
    
    if (lengthFixed) {
        const fixed = new Uint8Array(lengthFixed);
        for (let i = 0; i < fixed.length; i++) {
            fixed[i] = (i < sjisArray.length) ? sjisArray[i] : 0;
        }
        return fixed;
    }
    return new Uint8Array(sjisArray);
}

// --- Helper: Binary stream writer ---
class BinaryStream {
    constructor(buffer, littleEndian = true) {
        this.dv = new DataView(buffer);
        this.offset = 0;
        this.littleEndian = littleEndian;
    }
    
    setUint8(v) {
        this.dv.setUint8(this.offset, v);
        this.offset += 1;
    }
    
    setUint32(v) {
        this.dv.setUint32(this.offset, v, this.littleEndian);
        this.offset += 4;
    }
    
    setFloat32(v) {
        this.dv.setFloat32(this.offset, v, this.littleEndian);
        this.offset += 4;
    }
    
    writeBytes(arr) {
        for (let i = 0; i < arr.length; i++) {
            this.setUint8(arr[i]);
        }
    }
    
    writeSjisString(text, lengthFixed) {
        const bytes = unicodeToSjis(text, lengthFixed);
        this.writeBytes(bytes);
    }
}

// --- VMD File Exporter ---
export function exportVMDFile(filename, boneFrames, morphFrames) {
    // Magic header: "Vocaloid Motion Data 0002" (30 bytes)
    // Model name: "VRM Mocap Studio" (20 bytes)
    // Bone frame count: 4 bytes
    // Bone keyframes: boneFrames.length * 111 bytes
    // Morph frame count: 4 bytes
    // Morph keyframes: morphFrames.length * 23 bytes
    // Camera keys: 4 bytes (0)
    // Light keys: 4 bytes (0)
    // Self shadow keys: 4 bytes (0)
    
    const boneCount = boneFrames.length;
    const morphCount = morphFrames.length;
    
    const bytesLength = 30 + 20 + 
                        (4 + boneCount * 111) + 
                        (4 + morphCount * 23) + 
                        4 + 4 + 4;
    
    const buffer = new ArrayBuffer(bytesLength);
    const bs = new BinaryStream(buffer, true);
    
    // 1. Magic Header (30 bytes)
    bs.writeSjisString("Vocaloid Motion Data 0002", 30);
    
    // 2. Model Name (20 bytes)
    bs.writeSjisString("Bone Rigger Studio", 20);
    
    // 3. Bone Keyframes
    bs.setUint32(boneCount);
    const interp = new Uint8Array([20,20,20,20,20,20,20,20, 107,107,107,107,107,107,107,107]);
    
    boneFrames.forEach(k => {
        // Bone name (15 bytes)
        bs.writeSjisString(k.name, 15);
        
        // Frame index (1 frame = 1/30 second)
        bs.setUint32(Math.round(k.time * 30));
        
        // Position offset (MMD coordinates: invert Z for position)
        bs.setFloat32(k.pos[0]);
        bs.setFloat32(k.pos[1]);
        bs.setFloat32(-k.pos[2]);
        
        // Rotation quaternion (MMD coordinates: invert X and Y for rotation)
        bs.setFloat32(-k.rot[0]);
        bs.setFloat32(-k.rot[1]);
        bs.setFloat32(k.rot[2]);
        bs.setFloat32(k.rot[3]);
        
        // Interpolation curves (64 bytes)
        for (let i = 0; i < 4; i++) {
            bs.writeBytes(interp);
        }
    });
    
    // 4. Morph Keyframes
    bs.setUint32(morphCount);
    morphFrames.forEach(k => {
        // Morph name (15 bytes)
        bs.writeSjisString(k.name, 15);
        
        // Frame index
        bs.setUint32(Math.round(k.time * 30));
        
        // Morph weight
        bs.setFloat32(k.weight);
    });
    
    // 5. Camera, Light, and SelfShadow frame counts (set to 0)
    bs.setUint32(0); // Camera keys
    bs.setUint32(0); // Light keys
    bs.setUint32(0); // Self shadow keys
    
    // Trigger download
    try {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        console.log(`VMD Motion recorded: ${boneCount} bone keys, ${morphCount} morph keys. Exported as ${filename}`);
    } catch (err) {
        console.error("VMD motion export failed:", err);
        alert("Failed to export VMD: " + err.message);
    }
}

// --- Recording controller handlers ---

export function startRecording() {
    if (!state.mocapActive) {
        alert("Please start Motion Capture before recording.");
        return;
    }
    
    state.mocapRecording.active = true;
    state.mocapRecording.paused = false;
    state.mocapRecording.startTime = performance.now();
    state.mocapRecording.recordedTime = 0;
    state.mocapRecording.boneFrames = [];
    state.mocapRecording.morphFrames = [];
    
    if (el.mocapRecordingPanel) {
        el.mocapRecordingPanel.classList.add('active-recording');
    }
    if (el.btnRecordStart) {
        el.btnRecordStart.classList.add('recording');
        el.btnRecordStart.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        el.btnRecordStart.title = "Recording In Progress";
    }
    if (el.btnRecordPause) {
        el.btnRecordPause.classList.remove('hidden');
        el.btnRecordPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
        el.btnRecordPause.title = "Pause Recording";
    }
    if (el.btnRecordStop) {
        el.btnRecordStop.classList.remove('hidden');
    }
    
    console.log("MoCap Motion Recording Started.");
}

export function pauseRecording() {
    if (!state.mocapRecording.active) return;
    
    state.mocapRecording.paused = !state.mocapRecording.paused;
    
    if (state.mocapRecording.paused) {
        el.btnRecordPause.innerHTML = '<i class="fa-solid fa-play"></i>';
        el.btnRecordPause.title = "Resume Recording";
        el.btnRecordStart.innerHTML = '<i class="fa-solid fa-circle"></i>';
        el.mocapRecordingPanel.classList.remove('active-recording');
        console.log("MoCap Motion Recording Paused.");
    } else {
        el.btnRecordPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
        el.btnRecordPause.title = "Pause Recording";
        el.btnRecordStart.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        el.mocapRecordingPanel.classList.add('active-recording');
        console.log("MoCap Motion Recording Resumed.");
    }
}

export function stopAndExportRecording() {
    if (!state.mocapRecording.active) return;
    
    state.mocapRecording.active = false;
    state.mocapRecording.paused = false;
    
    if (el.mocapRecordingPanel) {
        el.mocapRecordingPanel.classList.remove('active-recording');
    }
    if (el.btnRecordStart) {
        el.btnRecordStart.classList.remove('recording');
        el.btnRecordStart.innerHTML = '<i class="fa-solid fa-circle"></i>';
        el.btnRecordStart.title = "Start Recording";
    }
    if (el.btnRecordPause) {
        el.btnRecordPause.classList.add('hidden');
    }
    if (el.btnRecordStop) {
        el.btnRecordStop.classList.add('hidden');
    }
    if (el.recTimer) {
        el.recTimer.innerText = "00:00.0";
    }
    
    if (state.mocapRecording.boneFrames.length === 0) {
        alert("Recording stopped, but no motion data was captured.");
        return;
    }
    
    const filename = `mocap-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.vmd`;
    exportVMDFile(filename, state.mocapRecording.boneFrames, state.mocapRecording.morphFrames);
}

// --- Update Timer display ---
export function updateRecordingTimer() {
    if (!state.mocapRecording.active || state.mocapRecording.paused) return;
    
    // Accumulate time
    const delta = state.mocapFrameDeltaSeconds;
    state.mocapRecording.recordedTime += delta;
    
    const totalSec = state.mocapRecording.recordedTime;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const tenths = Math.floor((totalSec * 10) % 10);
    
    if (el.recTimer) {
        el.recTimer.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    }
}

// --- Sample keyframes at current timestamp ---
export function sampleRecordingFrame() {
    if (!state.mocapRecording.active || state.mocapRecording.paused) return;
    
    const time = state.mocapRecording.recordedTime;
    
    // Sample bone rotations & positions
    Object.keys(state.mappedAvatarBones).forEach(boneName => {
        const bone = state.mappedAvatarBones[boneName];
        if (!bone) return;
        
        const mmdBoneName = VRM_TO_MMD_BONE_MAP[boneName];
        if (!mmdBoneName) return;
        
        // Root translation (hips) should be recorded
        const isRoot = (boneName === 'Hips');
        const pos = isRoot ? [bone.position.x, bone.position.y - 0.9, bone.position.z] : [0, 0, 0];
        
        const q = bone.quaternion;
        state.mocapRecording.boneFrames.push({
            time: time,
            name: mmdBoneName,
            pos: pos,
            rot: [q.x, q.y, q.z, q.w]
        });
    });
    
    // Sample facial morph targets (if VRM loaded)
    if (state.vrm && state.vrm.expressionManager) {
        const manager = state.vrm.expressionManager;
        
        Object.keys(VRM_TO_MMD_MORPH_MAP).forEach(vrmMorph => {
            const mmdMorphName = VRM_TO_MMD_MORPH_MAP[vrmMorph];
            const exprVal = manager.getValue(vrmMorph);
            
            if (typeof exprVal === 'number' && exprVal > 0.001) {
                state.mocapRecording.morphFrames.push({
                    time: time,
                    name: mmdMorphName,
                    weight: exprVal
                });
            }
        });
    }
}
