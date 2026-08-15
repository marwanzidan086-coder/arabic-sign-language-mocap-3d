import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { state, el } from './state.js';
import {
    buildJointSpheres,
    cleanupJointSpheres,
    normalizeModelTransform,
    updateSkeletonHelperVisuals,
    syncVisualHelpersMode,
    triggerViewportResize,
    updateThemeBackground,
    updateGizmoModeUI,
    setRoomEnvironment
} from './viewport.js';
import {
    applyIdlePose,
    cacheIdlePoseQuaternions,
    cacheElbowHingeAxes,
    resetMoCapTrackingState,
    toggleMocapMode,
    preloadMoCapModels,
    stopMoCap,
    clearAllBoneSmoothers
} from './mocap.js';
import { startRecording, pauseRecording, stopAndExportRecording } from './mocap-recorder.js';

// Register transform callback so viewport can notify UI
state.onTransformChange = updateInspectorInputsFromBone;
state.onStopMoCap = () => {
    selectBone(null);
    updateInspectorInputsFromBone();
    if (el.btnCalibrateMocap) {
        el.btnCalibrateMocap.style.display = 'none';
        el.btnCalibrateMocap.classList.remove('active');
        el.btnCalibrateMocap.innerHTML = '<i class="fa-solid fa-arrows-to-eye"></i> Calibrate';
    }
};
state.onStartMoCap = () => {
    selectBone(null);
    if (el.btnCalibrateMocap) {
        el.btnCalibrateMocap.style.display = 'inline-flex';
    }
};

// --- Selection Logic ---
export function selectBone(bone) {
    state.selectedBone = bone;

    if (bone) {
        if (state.devMode && state.activeGizmoMode !== 'select') {
            state.transformControls.attach(bone);
        } else {
            state.transformControls.detach();
        }

        document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('selected'));
        const activeNode = document.getElementById(`outliner-bone-${bone.uuid}`);
        if (activeNode) {
            activeNode.classList.add('selected');
            expandOutlinerAncestors(activeNode);
            activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        el.noSelectionMsg.classList.add('hidden');
        el.inspectorPanel.classList.remove('hidden');

        el.selectedBoneName.innerText = bone.name || "Unnamed Joint";
        el.selectedBoneIndex.innerText = state.bones.indexOf(bone);
        el.selectedBoneParent.innerText = (bone.parent && bone.parent.isBone) ? (bone.parent.name || "Parent") : "None (Root)";

        updateInspectorInputsFromBone();
    } else {
        state.transformControls.detach();
        document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('selected'));
        el.noSelectionMsg.classList.remove('hidden');
        el.inspectorPanel.classList.add('hidden');
    }
}

function expandOutlinerAncestors(node) {
    let parent = node.parentElement;
    while (parent && parent !== el.boneTree) {
        if (parent.classList.contains('tree-children')) {
            parent.classList.add('expanded');
            const parentNode = parent.parentElement;
            if (parentNode) {
                const toggle = parentNode.querySelector('.tree-toggle');
                if (toggle) toggle.classList.add('expanded');
            }
        }
        parent = parent.parentElement;
    }
}

// --- Inspector values synchronization ---
export function updateInspectorInputsFromBone() {
    if (!state.selectedBone) return;
    const bone = state.selectedBone;
    const pos = bone.position;
    el.posX.value = pos.x; el.posXNum.value = pos.x.toFixed(3);
    el.posY.value = pos.y; el.posYNum.value = pos.y.toFixed(3);
    el.posZ.value = pos.z; el.posZNum.value = pos.z.toFixed(3);

    const tempEuler = new THREE.Euler();
    const rot = tempEuler.setFromQuaternion(bone.quaternion, 'XYZ');
    const rx = THREE.MathUtils.radToDeg(rot.x);
    const ry = THREE.MathUtils.radToDeg(rot.y);
    const rz = THREE.MathUtils.radToDeg(rot.z);

    el.rotX.value = rx; el.rotXNum.value = Math.round(rx);
    el.rotY.value = ry; el.rotYNum.value = Math.round(ry);
    el.rotZ.value = rz; el.rotZNum.value = Math.round(rz);

    const scl = bone.scale;
    el.sclX.value = scl.x; el.sclXNum.value = scl.x.toFixed(2);
    el.sclY.value = scl.y; el.sclYNum.value = scl.y.toFixed(2);
    el.sclZ.value = scl.z; el.sclZNum.value = scl.z.toFixed(2);
}

export function updateBoneFromInspectorInputs() {
    if (!state.selectedBone) return;
    const bone = state.selectedBone;

    const px = parseFloat(el.posX.value);
    const py = parseFloat(el.posY.value);
    const pz = parseFloat(el.posZ.value);
    bone.position.set(px, py, pz);

    const rx = THREE.MathUtils.degToRad(parseFloat(el.rotX.value));
    const ry = THREE.MathUtils.degToRad(parseFloat(el.rotY.value));
    const rz = THREE.MathUtils.degToRad(parseFloat(el.rotZ.value));
    
    const tempEuler = new THREE.Euler();
    tempEuler.set(rx, ry, rz, 'XYZ');
    bone.quaternion.setFromEuler(tempEuler);

    const sx = parseFloat(el.sclX.value);
    const sy = parseFloat(el.sclY.value);
    const sz = parseFloat(el.sclZ.value);
    bone.scale.set(sx, sy, sz);

    bone.updateMatrixWorld(true);
}

// --- Presentation Mode Toggle (Clean vs Dev UI) ---
export function toggleDevMode(forceState) {
    state.devMode = (forceState !== undefined) ? forceState : !state.devMode;
    
    if (state.devMode) {
        document.body.classList.remove('clean-mode');
        document.body.classList.add('dev-mode');
        el.btnToggleDev.classList.add('active');
        el.btnToggleDev.innerHTML = '<i class="fa-solid fa-rectangle-xmark"></i> <span>Close Editor</span>';
        
        if (state.selectedBone && state.activeGizmoMode !== 'select') {
            state.transformControls.attach(state.selectedBone);
        }
    } else {
        document.body.classList.remove('dev-mode');
        document.body.classList.add('clean-mode');
        el.btnToggleDev.classList.remove('active');
        el.btnToggleDev.innerHTML = '<i class="fa-solid fa-gears"></i> <span>Developer Console</span>';
        
        state.transformControls.detach();
    }

    syncVisualHelpersMode();

    setTimeout(() => {
        triggerViewportResize();
    }, 150);
}

// --- Load Model ---
export function loadModel(urlOrBuffer) {
    if (el.modelLoadingScreen) {
        el.modelLoadingScreen.classList.remove('fade-out');
        if (el.modelLoadProgressBar) el.modelLoadProgressBar.style.width = '20%';
        if (el.modelLoadStepText) el.modelLoadStepText.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري تنزيل ملف المجسم ثلاثي الأبعاد...';
        if (el.modelLoadPercent) el.modelLoadPercent.innerText = '20%';
    }

    el.modelName.innerText = "Loading Model...";
    el.modelJoints.innerText = "0 Joints";
    el.modelVertices.innerText = "0 Vertices";
    el.boneTree.innerHTML = '<div class="tree-loading"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing model skeletal structure...</div>';

    selectBone(null);

    if (state.model) {
        state.modelGroup.remove(state.model);
        state.model.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        state.model = null;
    }
    
    if (state.vrm) {
        state.vrm = null;
    }
    
    if (state.skeletonHelper) {
        state.scene.remove(state.skeletonHelper);
        state.skeletonHelper = null;
    }
    
    cleanupJointSpheres();

    state.bones = [];
    state.boneMap.clear();
    clearAllBoneSmoothers();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const onLoadProgress = (xhr) => {
        if (xhr.lengthComputable && xhr.total > 0) {
            const percent = Math.min(85, Math.round((xhr.loaded / xhr.total) * 75) + 15);
            if (el.modelLoadProgressBar) el.modelLoadProgressBar.style.width = `${percent}%`;
            if (el.modelLoadPercent) el.modelLoadPercent.innerText = `${percent}%`;
        }
    };
    
    const onLoadSuccess = (gltf) => {
        if (el.modelLoadProgressBar) el.modelLoadProgressBar.style.width = '90%';
        if (el.modelLoadStepText) el.modelLoadStepText.innerHTML = '<i class="fa-solid fa-person-running fa-fade"></i> تهيئة الهيكل العظمي والمفاصل الحركية...';
        if (el.modelLoadPercent) el.modelLoadPercent.innerText = '90%';

        const vrm = gltf.userData.vrm;
        if (vrm) {
            state.vrm = vrm;
            state.model = vrm.scene;
        } else {
            state.vrm = null;
            state.model = gltf.scene;
        }
        state.modelGroup.add(state.model);

        let vertexCount = 0;
        state.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (child.geometry && child.geometry.attributes.position) {
                    vertexCount += child.geometry.attributes.position.count;
                }
                
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        mat.transparent = state.meshOpacity < 0.999;
                        mat.opacity = state.meshOpacity;
                        mat.wireframe = state.wireframe;
                        mat.depthWrite = true;
                        mat.depthTest = true;
                        mat.side = THREE.FrontSide;
                    });
                }
            }
        });

        let foundBones = [];
        if (state.vrm) {
            const vrmBoneMapping = {
                'LeftShoulder': 'leftShoulder',
                'RightShoulder': 'rightShoulder',
                'LeftArm': 'leftUpperArm',
                'LeftForeArm': 'leftLowerArm',
                'RightArm': 'rightUpperArm',
                'RightForeArm': 'rightLowerArm',
                'LeftHand': 'leftHand',
                'RightHand': 'rightHand',
                'Neck': 'neck',
                'Head': 'head',
                'Spine': 'spine',
                'Hips': 'hips',
                'LeftUpLeg': 'leftUpperLeg',
                'LeftLeg': 'leftLowerLeg',
                'LeftFoot': 'leftFoot',
                'RightUpLeg': 'rightUpperLeg',
                'RightLeg': 'rightLowerLeg',
                'RightFoot': 'rightFoot',
                'LeftHandThumb1': 'leftThumbMetacarpal',
                'LeftHandThumb2': 'leftThumbProximal',
                'LeftHandThumb3': 'leftThumbDistal',
                'LeftHandIndex1': 'leftIndexProximal',
                'LeftHandIndex2': 'leftIndexIntermediate',
                'LeftHandIndex3': 'leftIndexDistal',
                'LeftHandMiddle1': 'leftMiddleProximal',
                'LeftHandMiddle2': 'leftMiddleIntermediate',
                'LeftHandMiddle3': 'leftMiddleDistal',
                'LeftHandRing1': 'leftRingProximal',
                'LeftHandRing2': 'leftRingIntermediate',
                'LeftHandRing3': 'leftRingDistal',
                'LeftHandPinky1': 'leftLittleProximal',
                'LeftHandPinky2': 'leftLittleIntermediate',
                'LeftHandPinky3': 'leftLittleDistal',
                'RightHandThumb1': 'rightThumbMetacarpal',
                'RightHandThumb2': 'rightThumbProximal',
                'RightHandThumb3': 'rightThumbDistal',
                'RightHandIndex1': 'rightIndexProximal',
                'RightHandIndex2': 'rightIndexIntermediate',
                'RightHandIndex3': 'rightIndexDistal',
                'RightHandMiddle1': 'rightMiddleProximal',
                'RightHandMiddle2': 'rightMiddleIntermediate',
                'RightHandMiddle3': 'rightMiddleDistal',
                'RightHandRing1': 'rightRingProximal',
                'RightHandRing2': 'rightRingIntermediate',
                'RightHandRing3': 'rightRingDistal',
                'RightHandPinky1': 'rightLittleProximal',
                'RightHandPinky2': 'rightLittleIntermediate',
                'RightHandPinky3': 'rightLittleDistal'
            };
            for (const [key, vrmBoneName] of Object.entries(vrmBoneMapping)) {
                const node = state.vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
                if (node) {
                    node.name = key;
                    node.isBone = true;
                    if (!foundBones.includes(node)) {
                        foundBones.push(node);
                    }
                }
            }
        } else {
            state.model.traverse(child => {
                if (child.isBone) {
                    foundBones.push(child);
                }
            });
        }

        state.bones = foundBones;

        const MoCapBoneNames = [
            'LeftShoulder', 'RightShoulder',
            'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 
            'LeftHand', 'RightHand', 
            'Neck', 'Head', 'Spine', 'Hips',
            'LeftUpLeg', 'LeftLeg', 'LeftFoot',
            'RightUpLeg', 'RightLeg', 'RightFoot',
            'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
            'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
            'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
            'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
            'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
            'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
            'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
            'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
            'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
            'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3'
        ];
        state.mappedAvatarBones = {};
        state.mocapRestData.clear();
        
        state.bones.forEach(bone => {
            if (MoCapBoneNames.includes(bone.name)) {
                state.mappedAvatarBones[bone.name] = bone;
            }
        });
        
        state.bones.forEach(bone => {
            state.boneMap.set(bone.uuid, {
                position: bone.position.clone(),
                rotation: bone.rotation.clone(),
                scale: bone.scale.clone(),
                quaternion: bone.quaternion.clone()
            });
        });

        normalizeModelTransform();
        
        // Populate mocapRestData
        state.modelGroup.updateMatrixWorld(true);
        Object.values(state.mappedAvatarBones).forEach(bone => {
            bone.updateMatrixWorld(true);
            const restWorldQuaternion = new THREE.Quaternion();
            bone.getWorldQuaternion(restWorldQuaternion);

            let restWorldDirection = new THREE.Vector3(0, 1, 0);
            const start = new THREE.Vector3();
            const end = new THREE.Vector3();
            bone.getWorldPosition(start);
            const childBone = bone.children.find(child => child.isBone);
            if (childBone) {
                childBone.getWorldPosition(end);
                const childDirection = end.sub(start);
                if (childDirection.lengthSq() > 0.000001) {
                    restWorldDirection = childDirection.normalize();
                }
            } else {
                restWorldDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(restWorldQuaternion).normalize();
            }

            state.mocapRestData.set(bone.uuid, {
                restWorldDirection,
                restWorldQuaternion
            });
        });

        cacheElbowHingeAxes();
        resetMoCapTrackingState();
        cacheIdlePoseQuaternions();

        if (state.bones.length > 0) {
            state.skeletonHelper = new THREE.SkeletonHelper(state.model);
            state.scene.add(state.skeletonHelper);
            buildJointSpheres();
            buildOutlinerTree();
            syncVisualHelpersMode();
        } else {
            el.boneTree.innerHTML = '<div class="tree-loading" style="color: #ff4d4d;"><i class="fa-solid fa-triangle-exclamation"></i> Model contains no skeletal joint nodes!</div>';
        }

        let displayName = state.vrm ? "Local VRM Model" : "Local GLB Model";
        if (typeof urlOrBuffer === 'string') {
            displayName = urlOrBuffer.split('/').pop();
        }
        el.modelName.innerText = displayName;
        el.modelJoints.innerText = `${state.bones.length} Joints`;
        el.modelVertices.innerText = `${(vertexCount / 1000).toFixed(1)}k Verts`;

        updateMeshVisibility();

        if (el.modelLoadProgressBar) el.modelLoadProgressBar.style.width = '100%';
        if (el.modelLoadStepText) el.modelLoadStepText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #00ffcc;"></i> اكتمل تجهيز الشخصية 3D بنجاح!';
        if (el.modelLoadPercent) el.modelLoadPercent.innerText = '100%';

        setTimeout(() => {
            if (el.modelLoadingScreen) {
                el.modelLoadingScreen.classList.add('fade-out');
            }
        }, 600);
    };

    const onLoadError = (error) => {
        console.error("Error loading model:", error);
        el.modelName.innerText = "Error Loading File";
        el.boneTree.innerHTML = '<div class="tree-loading" style="color: #ff4d4d;"><i class="fa-solid fa-circle-xmark"></i> Failed to parse model. Check console.</div>';
        
        if (el.modelLoadStepText) el.modelLoadStepText.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #f43f5e;"></i> فشل تنزيل ملف المجسم!';
        setTimeout(() => {
            if (el.modelLoadingScreen) {
                el.modelLoadingScreen.classList.add('fade-out');
            }
        }, 1200);
    };

    if (typeof urlOrBuffer === 'string') {
        loader.load(urlOrBuffer, onLoadSuccess, onLoadProgress, onLoadError);
    } else {
        loader.parse(urlOrBuffer, '', onLoadSuccess, onLoadError);
    }
}

// --- Outliner Tree Generator ---
export function buildOutlinerTree() {
    el.boneTree.innerHTML = '';
    if (state.bones.length === 0) return;

    const rootBones = state.bones.filter(b => !b.parent || !b.parent.isBone);
    if (rootBones.length === 0 && state.bones.length > 0) {
        rootBones.push(state.bones[0]);
    }

    rootBones.forEach(rootBone => {
        const domNode = createTreeDomNode(rootBone);
        el.boneTree.appendChild(domNode);
    });
}

function createTreeDomNode(bone) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    nodeEl.id = `outliner-bone-${bone.uuid}`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'tree-node-content';
    
    const toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle';
    
    const childBones = bone.children.filter(c => c.isBone);
    const hasChildren = childBones.length > 0;
    
    if (hasChildren) {
        toggleEl.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        toggleEl.classList.add('expanded');
    } else {
        toggleEl.classList.add('hidden');
    }
    
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.innerHTML = '<i class="fa-solid fa-genderless"></i>';

    const labelEl = document.createElement('span');
    labelEl.className = 'tree-label';
    labelEl.innerText = bone.name || `Joint_${state.bones.indexOf(bone)}`;

    contentEl.appendChild(toggleEl);
    contentEl.appendChild(iconEl);
    contentEl.appendChild(labelEl);
    nodeEl.appendChild(contentEl);

    if (hasChildren) {
        const childrenEl = document.createElement('div');
        childrenEl.className = 'tree-children expanded';
        
        childBones.forEach(childBone => {
            const childDom = createTreeDomNode(childBone);
            childrenEl.appendChild(childDom);
        });
        
        nodeEl.appendChild(childrenEl);

        toggleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = childrenEl.classList.toggle('expanded');
            toggleEl.classList.toggle('expanded', isExpanded);
        });
    }

    contentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBone(bone);
    });

    return nodeEl;
}

// --- Outliner Filtering ---
export function filterOutlinerNodes(query) {
    const nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(node => {
        const label = node.querySelector('.tree-label').innerText.toLowerCase();
        const matches = label.includes(query);
        
        if (query.length > 0 && matches) {
            node.classList.add('active-highlight');
        } else {
            node.classList.remove('active-highlight');
        }

        if (query === "") {
            node.style.display = 'block';
            const children = node.querySelector('.tree-children');
            if (children) {
                const toggle = node.querySelector('.tree-toggle');
                const isExpanded = toggle.classList.contains('expanded');
                children.classList.toggle('expanded', isExpanded);
            }
        } else {
            const hasMatchDescendants = checkDescendantsMatch(node, query);
            if (matches || hasMatchDescendants) {
                node.style.display = 'block';
                const children = node.querySelector('.tree-children');
                if (children) {
                    children.classList.add('expanded');
                    const toggle = node.querySelector('.tree-toggle');
                    if (toggle) toggle.classList.add('expanded');
                }
            } else {
                node.style.display = 'none';
            }
        }
    });
}

function checkDescendantsMatch(node, query) {
    const childrenContainer = node.querySelector('.tree-children');
    if (!childrenContainer) return false;
    
    const labels = childrenContainer.querySelectorAll('.tree-label');
    for (let i = 0; i < labels.length; i++) {
        if (labels[i].innerText.toLowerCase().includes(query)) return true;
    }
    return false;
}

export function updateMeshVisibility() {
    if (state.model) {
        state.model.traverse(child => {
            if (child.isMesh) {
                child.visible = state.showMesh;
            }
        });
    }
}

export function updateMeshProperties() {
    if (state.model) {
        state.model.traverse(child => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    mat.wireframe = state.wireframe;
                    mat.opacity = state.meshOpacity;
                    mat.transparent = state.meshOpacity < 1.0;
                });
            }
        });
    }
}

export function setGizmoMode(mode) {
    state.activeGizmoMode = mode;
    
    if (mode === 'select') {
        state.transformControls.detach();
    } else if (state.selectedBone) {
        state.transformControls.attach(state.selectedBone);
        state.transformControls.setMode(mode);
    }
    
    updateGizmoModeUI();
}

function readAndLoadFile(file) {
    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.glb') && !filename.endsWith('.gltf') && !filename.endsWith('.vrm')) {
        alert("Unsupported format. Please upload a GLB, GLTF, or VRM model.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        loadModel(buffer);
    };
    reader.readAsArrayBuffer(file);
}

export function setupDragAndDrop() {
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        el.dropOverlay.classList.add('active');
    });

    el.dropOverlay.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    el.dropOverlay.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || e.relatedTarget.id === 'app') {
            el.dropOverlay.classList.remove('active');
        }
    });

    el.dropOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropOverlay.classList.remove('active');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            readAndLoadFile(file);
        }
    });
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function showPoseExportModal(jsonStr) {
    // Attempt automatic clipboard copy immediately
    let autoCopied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(jsonStr).then(() => {
            autoCopied = true;
        }).catch(err => {
            console.warn('Auto copy failed:', err);
        });
    }

    const modal = document.createElement('div');
    modal.id = 'export-pose-modal-popup';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(15, 23, 42, 0.75)';
    modal.style.backdropFilter = 'blur(16px)';
    modal.style.webkitBackdropFilter = 'blur(16px)';
    modal.style.zIndex = '30000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.fontFamily = '"Cairo", "Plus Jakarta Sans", sans-serif';
    modal.style.animation = 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    
    const content = document.createElement('div');
    content.className = 'glass-card';
    content.style.width = '550px';
    content.style.maxWidth = '92vw';
    content.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    content.style.border = '1px solid rgba(0, 242, 254, 0.4)';
    content.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 242, 254, 0.2)';
    content.style.borderRadius = '18px';
    content.style.padding = '24px';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '16px';
    content.style.color = '#f8fafc';
    
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(0, 242, 254, 0.15); border: 1px solid rgba(0, 242, 254, 0.4); display: flex; align-items: center; justify-content: center; color: #00f2fe; font-size: 18px;">
                <i class="fa-solid fa-file-export"></i>
            </div>
            <div>
                <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff;">تصدير وضعية الأفاتار (Pose Export)</h3>
                <span style="font-size: 12px; color: #94a3b8;">Custom Avatar Joint Quaternions</span>
            </div>
        </div>
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.style.background = 'rgba(239, 68, 68, 0.15)';
    closeBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    closeBtn.style.color = '#f87171';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.width = '32px';
    closeBtn.style.height = '32px';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.transition = 'all 0.2s';
    closeBtn.onclick = () => modal.remove();
    header.appendChild(closeBtn);
    
    const banner = document.createElement('div');
    banner.style.padding = '12px 16px';
    banner.style.borderRadius = '10px';
    banner.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
    banner.style.border = '1px solid rgba(16, 185, 129, 0.35)';
    banner.style.color = '#34d399';
    banner.style.fontSize = '13px';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '10px';
    banner.innerHTML = `
        <i class="fa-solid fa-circle-check" style="font-size: 18px;"></i>
        <span><b>تم نسخ كود الوضعية تلقائياً إلى الحافظة!</b> انسخ النص أدناه أو أرسله مباشرة في الشات لجعله الوضعية الافتراضية.</span>
    `;

    const textarea = document.createElement('textarea');
    textarea.value = jsonStr;
    textarea.readOnly = true;
    textarea.style.width = '100%';
    textarea.style.height = '180px';
    textarea.style.backgroundColor = '#0b0f19';
    textarea.style.color = '#38bdf8';
    textarea.style.border = '1px solid rgba(56, 189, 248, 0.25)';
    textarea.style.borderRadius = '10px';
    textarea.style.padding = '12px';
    textarea.style.boxSizing = 'border-box';
    textarea.style.fontFamily = '"JetBrains Mono", monospace';
    textarea.style.fontSize = '11.5px';
    textarea.style.resize = 'none';
    textarea.style.lineHeight = '1.5';
    textarea.onclick = () => textarea.select();
    
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.gap = '10px';
    footer.style.flexWrap = 'wrap';

    const countInfo = document.createElement('span');
    countInfo.style.fontSize = '12px';
    countInfo.style.color = '#94a3b8';
    countInfo.innerHTML = `📊 تم التقاط وتصدير جميع المفاصل`;
    footer.appendChild(countInfo);

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '10px';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary font-arabic';
    copyBtn.style.padding = '8px 18px';
    copyBtn.style.fontSize = '13px';
    copyBtn.style.fontWeight = '700';
    copyBtn.style.background = 'linear-gradient(135deg, #0284c7, #06b6d4)';
    copyBtn.style.color = '#ffffff';
    copyBtn.style.border = 'none';
    copyBtn.style.borderRadius = '8px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ الكود (Copy JSON)';
    
    const performFallbackCopy = () => {
        textarea.focus();
        textarea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ بنجاح!';
            } else {
                copyBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> انسخ يدوياً عبر Ctrl+C';
            }
        } catch (err) {
            console.error('Fallback copy failed', err);
            copyBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> انسخ يدوياً عبر Ctrl+C';
        }
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ الكود (Copy JSON)', 2500);
    };

    copyBtn.onclick = () => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(jsonStr)
                .then(() => {
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ بنجاح!';
                    setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ الكود (Copy JSON)', 2500);
                })
                .catch(err => {
                    console.warn('navigator.clipboard error, trying fallback:', err);
                    performFallbackCopy();
                });
        } else {
            performFallbackCopy();
        }
    };
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn btn-secondary font-arabic';
    downloadBtn.style.padding = '8px 16px';
    downloadBtn.style.fontSize = '13px';
    downloadBtn.style.borderRadius = '8px';
    downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> تحميل كملف JSON';
    downloadBtn.onclick = () => {
        try {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'avatar-custom-pose.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('Blob download failed', err);
            alert('تحميل الملف فشل. الرجاء نسخ النص يدوياً بدلاً من ذلك.');
        }
    };
    
    btnGroup.appendChild(copyBtn);
    btnGroup.appendChild(downloadBtn);
    footer.appendChild(btnGroup);
    
    content.appendChild(header);
    content.appendChild(banner);
    content.appendChild(textarea);
    content.appendChild(footer);
    modal.appendChild(content);
    
    document.body.appendChild(modal);
    
    // Auto-select text for immediate manual copying if desired
    setTimeout(() => {
        textarea.focus();
        textarea.select();
    }, 100);
}

export function exportCurrentPose() {
    if (!state.model || Object.keys(state.mappedAvatarBones).length === 0) {
        alert("يرجى التأكد من تحميل النموذج وتعيين المفاصل أولاً.");
        return;
    }
    
    const poseData = {};
    Object.keys(state.mappedAvatarBones).forEach(boneName => {
        const bone = state.mappedAvatarBones[boneName];
        if (bone) {
            poseData[boneName] = [
                parseFloat(bone.quaternion.x.toFixed(4)),
                parseFloat(bone.quaternion.y.toFixed(4)),
                parseFloat(bone.quaternion.z.toFixed(4)),
                parseFloat(bone.quaternion.w.toFixed(4))
            ];
        }
    });

    const jsonStr = JSON.stringify(poseData, null, 2);
    showPoseExportModal(jsonStr);
}

export function startPoseCaptureCountdown() {
    if (!state.mocapActive) {
        alert("يرجى تشغيل الكاميرا (Start MoCap) أولاً لتتمكن من استخدام المؤقت لالتقاط وضعيتك من مسافة.");
        return;
    }
    
    // Create countdown overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.zIndex = '20000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = '"Cairo", "Outfit", sans-serif';
    
    const countText = document.createElement('div');
    countText.style.fontSize = '120px';
    countText.style.fontWeight = 'bold';
    countText.style.color = '#00ffcc';
    countText.style.textShadow = '0 0 25px rgba(0, 255, 204, 0.9)';
    countText.style.transition = 'transform 0.1s ease';
    countText.innerText = '5';
    
    const labelText = document.createElement('div');
    labelText.style.fontSize = '22px';
    labelText.style.color = '#ffffff';
    labelText.style.marginTop = '20px';
    labelText.style.textAlign = 'center';
    labelText.style.direction = 'rtl';
    labelText.innerHTML = 'قف أمام الكاميرا واتخذ الوضعية المطلوبة...<br><span style="font-size: 14px; color: #a4e4ec;">Get into position in front of the camera...</span>';
    
    overlay.appendChild(countText);
    overlay.appendChild(labelText);
    document.body.appendChild(overlay);
    
    let count = 5;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countText.innerText = count.toString();
            countText.style.transform = 'scale(1.3)';
            setTimeout(() => countText.style.transform = 'scale(1)', 100);
        } else {
            clearInterval(interval);
            countText.innerText = '📸';
            labelText.innerHTML = 'تم التقاط الوضعية وتجميدها!<br><span style="font-size: 14px; color: #a4e4ec;">Pose captured & frozen!</span>';
            
            setTimeout(() => {
                // 1. Capture current bone quaternions
                const poseData = {};
                Object.keys(state.mappedAvatarBones).forEach(boneName => {
                    const bone = state.mappedAvatarBones[boneName];
                    if (bone) {
                        poseData[boneName] = {
                            quaternion: [
                                parseFloat(bone.quaternion.x.toFixed(4)),
                                parseFloat(bone.quaternion.y.toFixed(4)),
                                parseFloat(bone.quaternion.z.toFixed(4)),
                                parseFloat(bone.quaternion.w.toFixed(4))
                            ]
                        };
                    }
                });
                
                // 2. Stop MoCap but keep it frozen (pass false for resetToIdle)
                stopMoCap(false);
                
                // 3. Force restore the captured quaternions to the bones
                Object.keys(poseData).forEach(boneName => {
                    const bone = state.mappedAvatarBones[boneName];
                    if (bone) {
                        const q = poseData[boneName].quaternion;
                        bone.quaternion.set(q[0], q[1], q[2], q[3]);
                    }
                });
                state.bones.forEach(b => b.updateMatrixWorld(true));
                
                // 4. Update the sliders in the inspector
                updateInspectorInputsFromBone();
                
                // 5. Open the export modal
                const jsonStr = JSON.stringify(poseData, null, 2);
                showPoseExportModal(jsonStr);
                
                overlay.remove();
            }, 800);
        }
    }, 1000);
}

export function startMoCapCalibration() {
    if (!state.mocapActive) {
        alert("يرجى تفعيل تتبع الحركة (Start MoCap) أولاً للبدء بالمعايرة.");
        return;
    }

    state.mocapCalibration.calibrating = true;
    state.mocapCalibration.countdown = 3;
    state.mocapCalibration.countdownStartTime = performance.now();
    state.mocapCalibration.calibratedFrames = [];
    
    if (el.btnCalibrateMocap) {
        el.btnCalibrateMocap.classList.add('active');
        el.btnCalibrateMocap.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Calibrating...';
    }

    // Visual overlay
    const overlay = document.createElement('div');
    overlay.id = 'mocap-calibration-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(10, 85, 94, 0.75)';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.zIndex = '20000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = '"Cairo", "Outfit", sans-serif';
    
    const countText = document.createElement('div');
    countText.style.fontSize = '120px';
    countText.style.fontWeight = 'bold';
    countText.style.color = '#00ffcc';
    countText.style.textShadow = '0 0 25px rgba(0, 255, 204, 0.9)';
    countText.innerText = '3';
    
    const labelText = document.createElement('div');
    labelText.style.fontSize = '24px';
    labelText.style.color = '#ffffff';
    labelText.style.marginTop = '20px';
    labelText.style.textAlign = 'center';
    labelText.style.direction = 'rtl';
    labelText.innerHTML = 'يرجى الوقوف بشكل مستقيم ومواجهة الكاميرا مع فرد الذراعين جانباً قليلاً...<br><span style="font-size: 14px; color: #a4e4ec;">Stand straight, face the camera, and spread your arms slightly...</span>';
    
    overlay.appendChild(countText);
    overlay.appendChild(labelText);
    document.body.appendChild(overlay);
    
    let count = 3;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countText.innerText = count.toString();
        } else {
            clearInterval(interval);
            countText.innerText = '🎯';
            labelText.innerHTML = 'جاري تسجيل القياسات...<br><span style="font-size: 14px; color: #a4e4ec;">Recording measurements...</span>';
            
            // Wait 1.5 seconds to record stable frames, then calculate calibration
            setTimeout(() => {
                state.mocapCalibration.calibrating = false;
                state.mocapCalibration.isCalibrated = true;
                
                // If we collected calibration frames, average them
                if (state.mocapCalibration.calibratedFrames.length > 0) {
                    let avgWidth = 0;
                    let avgHeight = 0;
                    let avgHipsY = 0;
                    
                    state.mocapCalibration.calibratedFrames.forEach(f => {
                        avgWidth += f.shoulderWidth;
                        avgHeight += f.headToHips;
                        avgHipsY += f.hipsY;
                    });
                    
                    state.mocapCalibration.calibratedShoulderWidth = Math.max(0.1, Math.min(0.4, avgWidth / state.mocapCalibration.calibratedFrames.length));
                    state.mocapCalibration.calibratedHeadToHips = Math.max(0.25, Math.min(0.6, avgHeight / state.mocapCalibration.calibratedFrames.length));
                    state.mocapCalibration.calibratedHipsY = Math.max(0.45, Math.min(0.75, avgHipsY / state.mocapCalibration.calibratedFrames.length));
                    
                    console.log("MoCap Calibration successful:", {
                        shoulderWidth: state.mocapCalibration.calibratedShoulderWidth,
                        headToHips: state.mocapCalibration.calibratedHeadToHips,
                        hipsY: state.mocapCalibration.calibratedHipsY
                    });
                } else {
                    state.mocapCalibration.calibratedShoulderWidth = 0.22;
                    state.mocapCalibration.calibratedHeadToHips = 0.45;
                    state.mocapCalibration.calibratedHipsY = 0.65;
                }
                
                if (el.btnCalibrateMocap) {
                    el.btnCalibrateMocap.classList.remove('active');
                    el.btnCalibrateMocap.innerHTML = '<i class="fa-solid fa-arrows-to-eye"></i> Calibrate';
                }
                
                overlay.remove();
            }, 1500);
        }
    }, 1000);
}

export function setupEventListeners() {
    window.addEventListener('resize', triggerViewportResize);

    state.renderer.domElement.addEventListener('pointerdown', (e) => {
        if (!state.devMode) return;
        if (e.button !== 0) return;
        
        const rect = state.renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, state.camera);
        
        if (state.showJoints && state.jointHelpersGroup) {
            const intersects = raycaster.intersectObjects(state.jointHelpersGroup.children);
            if (intersects.length > 0) {
                const clickedSphere = intersects[0].object;
                const bone = clickedSphere.userData.bone;
                if (bone) {
                    selectBone(bone);
                    return;
                }
            }
        }
    });

    el.btnToggleDev.addEventListener('click', () => {
        toggleDevMode();
    });

    el.btnToggleMocap.addEventListener('click', () => {
        toggleMocapMode();
    });

    // --- MoCap Source Selector Handlers ---
    if (el.btnSrcCamera) {
        el.btnSrcCamera.addEventListener('click', () => {
            if (state.mocapActive) stopMoCap();
            state.mocapSource = 'camera';
            el.btnSrcCamera.classList.add('active');
            el.btnSrcVideo.classList.remove('active');
            console.log("MoCap source changed to Webcam Camera.");
        });
    }

    if (el.btnSrcVideo) {
        el.btnSrcVideo.addEventListener('click', () => {
            el.videoFileInput.click();
        });
    }

    if (el.videoFileInput) {
        el.videoFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (state.mocapActive) stopMoCap();
                const url = URL.createObjectURL(file);
                el.webcamVideo.srcObject = null;
                el.webcamVideo.src = url;
                state.mocapSource = 'video';
                el.btnSrcCamera.classList.remove('active');
                el.btnSrcVideo.classList.add('active');
                console.log("Local MoCap video file loaded:", file.name);
                alert(`Video file loaded: ${file.name}\nClick "Start MoCap" to run tracking.`);
            }
        });
    }

    // --- Motion Recording HUD Button Handlers ---
    if (el.btnRecordStart) {
        el.btnRecordStart.addEventListener('click', () => {
            if (!state.mocapRecording.active) {
                startRecording();
            }
        });
    }

    if (el.btnRecordPause) {
        el.btnRecordPause.addEventListener('click', () => {
            pauseRecording();
        });
    }

    if (el.btnRecordStop) {
        el.btnRecordStop.addEventListener('click', () => {
            stopAndExportRecording();
        });
    }

    if (el.btnCalibrateMocap) {
        el.btnCalibrateMocap.addEventListener('click', () => {
            startMoCapCalibration();
        });
    }

    el.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            el.tabBtns.forEach(b => b.classList.remove('active'));
            el.tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    el.spaceLocal.addEventListener('click', () => {
        state.transformSpace = 'local';
        el.spaceLocal.classList.add('active');
        el.spaceWorld.classList.remove('active');
        state.transformControls.setSpace('local');
        el.gizmoSpaceText.innerText = "Space: LOCAL";
    });
    el.spaceWorld.addEventListener('click', () => {
        state.transformSpace = 'world';
        el.spaceLocal.classList.remove('active');
        el.spaceWorld.classList.add('active');
        state.transformControls.setSpace('world');
        el.gizmoSpaceText.innerText = "Space: WORLD";
    });

    const bindSliderAndNumber = (slider, numInput, callback) => {
        slider.addEventListener('input', () => {
            numInput.value = parseFloat(slider.value).toFixed(slider.step.includes('0.0') ? 3 : 0);
            callback();
        });
        numInput.addEventListener('change', () => {
            slider.value = numInput.value;
            callback();
        });
    };

    bindSliderAndNumber(el.rotX, el.rotXNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.rotY, el.rotYNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.rotZ, el.rotZNum, updateBoneFromInspectorInputs);
    
    bindSliderAndNumber(el.posX, el.posXNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.posY, el.posYNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.posZ, el.posZNum, updateBoneFromInspectorInputs);
    
    bindSliderAndNumber(el.sclX, el.sclXNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.sclY, el.sclYNum, updateBoneFromInspectorInputs);
    bindSliderAndNumber(el.sclZ, el.sclZNum, updateBoneFromInspectorInputs);

    el.resetRot.addEventListener('click', () => {
        el.rotX.value = el.rotXNum.value = 0;
        el.rotY.value = el.rotYNum.value = 0;
        el.rotZ.value = el.rotZNum.value = 0;
        updateBoneFromInspectorInputs();
    });
    el.resetPos.addEventListener('click', () => {
        el.posX.value = el.posXNum.value = 0;
        el.posY.value = el.posYNum.value = 0;
        el.posZ.value = el.posZNum.value = 0;
        updateBoneFromInspectorInputs();
    });
    el.resetScl.addEventListener('click', () => {
        el.sclX.value = el.sclXNum.value = 1;
        el.sclY.value = el.sclYNum.value = 1;
        el.sclZ.value = el.sclZNum.value = 1;
        updateBoneFromInspectorInputs();
    });

    el.btnResetBone.addEventListener('click', () => {
        if (state.selectedBone) {
            const initial = state.boneMap.get(state.selectedBone.uuid);
            if (initial) {
                state.selectedBone.position.copy(initial.position);
                state.selectedBone.quaternion.copy(initial.quaternion);
                state.selectedBone.scale.copy(initial.scale);
                state.selectedBone.updateMatrixWorld(true);
                updateInspectorInputsFromBone();
            }
        }
    });

    el.btnResetAll.addEventListener('click', () => {
        applyIdlePose();
        updateInspectorInputsFromBone();
    });

    window.addEventListener('keydown', (event) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') {
            return;
        }

        switch (event.key) {
            case 'Tab':
                event.preventDefault();
                toggleDevMode();
                break;
            case 'q':
            case 'Q':
                if (state.devMode) setGizmoMode('select');
                break;
            case 'w':
            case 'W':
                if (state.devMode) setGizmoMode('translate');
                break;
            case 'e':
            case 'E':
                if (state.devMode) setGizmoMode('rotate');
                break;
            case 'r':
            case 'R':
                if (state.devMode) setGizmoMode('scale');
                break;
            case 'Escape':
                if (state.devMode) selectBone(null);
                break;
        }
    });

    el.setShowMesh.addEventListener('change', () => {
        state.showMesh = el.setShowMesh.checked;
        updateMeshVisibility();
    });
    el.setWireframe.addEventListener('change', () => {
        state.wireframe = el.setWireframe.checked;
        updateMeshProperties();
    });
    el.setMeshOpacity.addEventListener('input', () => {
        state.meshOpacity = parseFloat(el.setMeshOpacity.value);
        el.valMeshOpacity.innerText = state.meshOpacity.toFixed(2);
        updateMeshProperties();
    });
    el.setShowJoints.addEventListener('change', () => {
        state.showJoints = el.setShowJoints.checked;
        if (state.devMode && state.jointHelpersGroup) state.jointHelpersGroup.visible = state.showJoints;
    });
    el.setShowSkeleton.addEventListener('change', () => {
        state.showSkeleton = el.setShowSkeleton.checked;
        if (state.devMode) updateSkeletonHelperVisuals();
    });
    el.setIdlePose.addEventListener('change', () => {
        state.useIdlePose = el.setIdlePose.checked;
        applyIdlePose();
        updateInspectorInputsFromBone();
    });
    el.setXrayJoints.addEventListener('change', () => {
        state.xrayJoints = el.setXrayJoints.checked;
        if (state.jointHelpersGroup) {
            state.jointHelpersGroup.children.forEach(sphere => {
                sphere.material.depthTest = !state.xrayJoints;
                sphere.material.depthWrite = !state.xrayJoints;
                sphere.renderOrder = state.xrayJoints ? 999 : 0;
            });
        }
        if (state.devMode) updateSkeletonHelperVisuals();
    });
    el.setJointSize.addEventListener('input', () => {
        state.jointSize = parseFloat(el.setJointSize.value);
        el.valJointSize.innerText = state.jointSize.toFixed(3);
        if (state.jointHelpersGroup) {
            state.jointHelpersGroup.children.forEach(sphere => {
                sphere.scale.setScalar(state.jointSize);
            });
        }
    });
    el.setJointColor.addEventListener('input', () => {
        state.jointColor = el.setJointColor.value;
    });
    el.setJointColorSel.addEventListener('input', () => {
        state.jointColorSelected = el.setJointColorSel.value;
    });
    if (el.setEnableFace) {
        el.setEnableFace.addEventListener('change', () => {
            state.faceTrackingEnabled = el.setEnableFace.checked;
        });
    }
    if (el.setEnableEyeLook) {
        el.setEnableEyeLook.addEventListener('change', () => {
            state.eyeLookTrackingEnabled = el.setEnableEyeLook.checked;
        });
    }
    el.setShowGrid.addEventListener('change', () => {
        state.showGrid = el.setShowGrid.checked;
        state.floorGrid.visible = state.showGrid;
    });
    el.setShadows.addEventListener('change', () => {
        state.shadows = el.setShadows.checked;
        state.renderer.shadowMap.enabled = state.shadows;
        if (state.model) {
            state.model.traverse(child => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.needsUpdate = true);
                    } else {
                        child.material.needsUpdate = true;
                    }
                }
            });
        }
    });
    el.setLightIntensity.addEventListener('input', () => {
        state.lightIntensity = parseFloat(el.setLightIntensity.value);
        el.valLightIntensity.innerText = state.lightIntensity.toFixed(1);
        state.mainLight.intensity = state.lightIntensity;
    });
    el.setBgTheme.addEventListener('change', () => {
        state.theme = el.setBgTheme.value;
        updateThemeBackground();
    });

    el.boneSearch.addEventListener('input', () => {
        const query = el.boneSearch.value.toLowerCase().trim();
        filterOutlinerNodes(query);
    });

    el.btnLoadLocal.addEventListener('click', () => {
        el.fileInput.click();
    });
    el.fileInput.addEventListener('change', () => {
        const file = el.fileInput.files[0];
        if (file) {
            readAndLoadFile(file);
        }
    });

    if (el.btnExportPose) {
        el.btnExportPose.addEventListener('click', () => {
            exportCurrentPose();
        });
    }

    if (el.btnExportPoseTop) {
        el.btnExportPoseTop.addEventListener('click', () => {
            exportCurrentPose();
        });
    }

    if (el.btnExportPoseInspector) {
        el.btnExportPoseInspector.addEventListener('click', () => {
            exportCurrentPose();
        });
    }

    if (el.btnExportTimer) {
        el.btnExportTimer.addEventListener('click', () => {
            startPoseCaptureCountdown();
        });
    }

    // --- Room Environment Switcher Buttons ---
    document.querySelectorAll('.room-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const roomName = btn.dataset.room;
            if (roomName) {
                setRoomEnvironment(roomName);
            }
        });
    });
}
