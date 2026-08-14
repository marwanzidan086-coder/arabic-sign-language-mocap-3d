import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { state, el } from './state.js';
import { isPlayingCustomSign } from './trainer.js';

// Temporary vectors for calculations
const tempVector = new THREE.Vector3();

// --- Scene Setup ---
export function setupScene() {
    state.scene = new THREE.Scene();
    updateThemeBackground();

    state.camera = new THREE.PerspectiveCamera(45, el.canvasContainer.clientWidth / el.canvasContainer.clientHeight, 0.05, 100);
    state.camera.position.set(0, 1.2, 2.5);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    state.renderer.setClearColor(0x000000, 0.0);
    state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = state.shadows;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;
    el.canvasContainer.appendChild(state.renderer.domElement);

    state.modelGroup = new THREE.Group();
    state.scene.add(state.modelGroup);

    state.jointHelpersGroup = new THREE.Group();
    state.scene.add(state.jointHelpersGroup);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    state.scene.add(state.ambientLight);

    state.mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
    state.mainLight.position.set(2, 4, 3);
    state.mainLight.castShadow = true;
    state.mainLight.shadow.mapSize.width = 2048;
    state.mainLight.shadow.mapSize.height = 2048;
    state.mainLight.shadow.bias = -0.0002;
    state.mainLight.shadow.camera.near = 0.5;
    state.mainLight.shadow.camera.far = 15;
    const d = 1.5;
    state.mainLight.shadow.camera.left = -d;
    state.mainLight.shadow.camera.right = d;
    state.mainLight.shadow.camera.top = d;
    state.mainLight.shadow.camera.bottom = -d;
    state.scene.add(state.mainLight);

    state.fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.9);
    state.fillLight.position.set(-3, 2.5, 2);
    state.scene.add(state.fillLight);

    state.backLight = new THREE.DirectionalLight(0xffffff, 0.6);
    state.backLight.position.set(0, 3, -3);
    state.scene.add(state.backLight);

    // Reflective Glass Floor (Mirror Reflector + Ring Podium)
    try {
        const mirrorGeo = new THREE.CircleGeometry(4.5, 64);
        state.groundMirror = new Reflector(mirrorGeo, {
            clipBias: 0.003,
            textureWidth: Math.min(window.innerWidth * window.devicePixelRatio, 2048),
            textureHeight: Math.min(window.innerHeight * window.devicePixelRatio, 2048),
            color: 0x8ea2b0,
            multisample: 2
        });
        state.groundMirror.position.y = 0;
        state.groundMirror.rotation.x = -Math.PI / 2;
        state.scene.add(state.groundMirror);

        // Glowing Glass Rim
        const ringGeo = new THREE.RingGeometry(4.42, 4.5, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.002;
        state.scene.add(ringMesh);
    } catch (e) {
        console.warn("Reflector fallback to standard glass floor:", e);
        const glassGeo = new THREE.CircleGeometry(4.5, 64);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.7
        });
        state.glassFloor = new THREE.Mesh(glassGeo, glassMat);
        state.glassFloor.rotation.x = -Math.PI / 2;
        state.glassFloor.position.y = 0;
        state.scene.add(state.glassFloor);
    }

    // Grid (subtle light gray/cyan)
    state.floorGrid = new THREE.GridHelper(10, 20, 0x0284c7, 0x94a3b8);
    state.floorGrid.position.y = 0.003;
    state.floorGrid.visible = state.showGrid;
    state.scene.add(state.floorGrid);

    // Soft Shadow Plane
    const planeGeo = new THREE.PlaneGeometry(10, 10);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    state.floorPlane = new THREE.Mesh(planeGeo, planeMat);
    state.floorPlane.rotation.x = -Math.PI / 2;
    state.floorPlane.position.y = 0.004;
    state.floorPlane.receiveShadow = true;
    state.scene.add(state.floorPlane);
}

// --- Controls Setup ---
export function setupControls() {
    state.orbitControls = new OrbitControls(state.camera, state.renderer.domElement);
    state.orbitControls.enableDamping = true;
    state.orbitControls.dampingFactor = 0.05;
    state.orbitControls.screenSpacePanning = true;
    state.orbitControls.maxPolarAngle = Math.PI / 2 + 0.05;
    state.orbitControls.minDistance = 0.2;
    state.orbitControls.maxDistance = 15;
    state.orbitControls.target.set(0, 1.0, 0);

    state.transformControls = new TransformControls(state.camera, state.renderer.domElement);
    state.transformControls.size = 0.85;
    state.transformControls.setSpace(state.transformSpace);
    state.transformControls.setMode(state.activeGizmoMode);
    state.scene.add(state.transformControls);

    state.transformControls.addEventListener('dragging-changed', (event) => {
        state.orbitControls.enabled = !event.value;
    });

    state.transformControls.addEventListener('change', () => {
        if (state.selectedBone) {
            if (state.onTransformChange) state.onTransformChange();
            state.bones.forEach(b => b.updateMatrixWorld(true));
        }
    });

    updateGizmoModeUI();
}

export function updateGizmoModeUI() {
    el.hkSelect.classList.toggle('active', state.activeGizmoMode === 'select');
    el.hkTranslate.classList.toggle('active', state.activeGizmoMode === 'translate');
    el.hkRotate.classList.toggle('active', state.activeGizmoMode === 'rotate');
    el.hkScale.classList.toggle('active', state.activeGizmoMode === 'scale');
}

export function normalizeModelTransform() {
    state.modelGroup.position.set(0, 0, 0);
    state.modelGroup.scale.set(1, 1, 1);
    state.modelGroup.rotation.set(0, 0, 0);

    const box = new THREE.Box3().setFromObject(state.modelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const height = size.y;
    if (height > 0) {
        const scaleFactor = 1.7 / height;
        state.modelGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }

    box.setFromObject(state.modelGroup);
    box.getCenter(center);
    box.getSize(size);

    state.modelGroup.position.set(-center.x, -box.min.y, -center.z);
    
    if (state.vrm) {
        state.modelGroup.rotation.y = Math.PI;
    }

    state.mainLight.position.set(1.5, size.y * 1.5, 1.5);
    state.orbitControls.target.set(0, size.y * 0.65, 0);
    state.camera.position.set(0, size.y * 0.65, size.y * 1.6);
    state.orbitControls.update();
}

export function cleanupJointSpheres() {
    if (state.jointHelpersGroup) {
        while (state.jointHelpersGroup.children.length > 0) {
            const child = state.jointHelpersGroup.children[0];
            child.geometry.dispose();
            child.material.dispose();
            state.jointHelpersGroup.remove(child);
        }
    }
}

export function buildJointSpheres() {
    cleanupJointSpheres();
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
    
    state.bones.forEach(bone => {
        const sphereMat = new THREE.MeshBasicMaterial({
            color: state.jointColor,
            depthTest: !state.xrayJoints,
            depthWrite: !state.xrayJoints,
            transparent: true,
            opacity: 0.8
        });
        
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.scale.setScalar(state.jointSize);
        sphere.renderOrder = state.xrayJoints ? 999 : 0;
        
        sphere.userData.bone = bone;
        sphere.userData.isJointHelper = true;
        
        state.jointHelpersGroup.add(sphere);
    });

    state.jointHelpersGroup.visible = state.showJoints;
}

export function updateJointSpheresPositions() {
    if (!state.devMode || !state.showJoints || state.bones.length === 0 || !state.jointHelpersGroup) return;
    
    state.jointHelpersGroup.children.forEach(sphere => {
        const bone = sphere.userData.bone;
        if (bone) {
            bone.getWorldPosition(tempVector);
            sphere.position.copy(tempVector);
            
            const isSelected = (state.selectedBone === bone);
            sphere.material.color.set(isSelected ? state.jointColorSelected : state.jointColor);
            
            const dist = state.camera.position.distanceTo(tempVector);
            const scale = state.jointSize * (dist * 0.5 + 0.1);
            sphere.scale.setScalar(scale);
        }
    });
}

export function updateSkeletonHelperVisuals() {
    if (!state.skeletonHelper) return;
    state.skeletonHelper.visible = state.showSkeleton;
    
    if (state.skeletonHelper.visible) {
        state.skeletonHelper.traverse(child => {
            if (child.isLineSegments && child.material) {
                child.material.depthTest = !state.xrayJoints;
                child.material.depthWrite = !state.xrayJoints;
                child.material.transparent = true;
                child.material.opacity = 0.7;
                child.renderOrder = state.xrayJoints ? 998 : 0;
            }
        });
    }
}

export function syncVisualHelpersMode() {
    if (state.devMode) {
        if (state.jointHelpersGroup) state.jointHelpersGroup.visible = state.showJoints;
        if (state.skeletonHelper) {
            state.skeletonHelper.visible = state.showSkeleton;
            updateSkeletonHelperVisuals();
        }
    } else {
        if (state.jointHelpersGroup) state.jointHelpersGroup.visible = false;
        if (state.skeletonHelper) state.skeletonHelper.visible = false;
    }
}

export function updateThemeBackground() {
    let bgStyle = 'radial-gradient(circle at 50% 35%, #ffffff 0%, #f1f5f9 55%, #e2e8f0 100%)';
    switch (state.theme) {
        case 'blender':
            bgStyle = 'radial-gradient(circle at 50% 35%, #ffffff 0%, #f1f5f9 55%, #e2e8f0 100%)';
            break;
        case 'charcoal':
            bgStyle = 'radial-gradient(circle at 50% 35%, #24252a 0%, #1a1b1e 100%)';
            break;
        case 'midnight':
            bgStyle = 'radial-gradient(circle at 50% 35%, #0d1e33 0%, #070c14 70%, #03060a 100%)';
            break;
        case 'light':
            bgStyle = 'radial-gradient(circle at 50% 35%, #ffffff 0%, #f8fafc 55%, #e2e8f0 100%)';
            break;
    }
    document.body.style.background = bgStyle;
    state.scene.background = null;
    state.scene.fog = null;
}

export function triggerViewportResize() {
    if (state.camera && state.renderer && el.canvasContainer) {
        state.camera.aspect = el.canvasContainer.clientWidth / el.canvasContainer.clientHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
    }
}

const clock = new THREE.Clock();

export function animate() {
    requestAnimationFrame(animate);
    state.orbitControls.update();
    updateJointSpheresPositions();
    
    if (state.vrm) {
        const deltaTime = clock.getDelta();
        state.vrm.update(deltaTime);
    }
    
    state.renderer.render(state.scene, state.camera);
}
