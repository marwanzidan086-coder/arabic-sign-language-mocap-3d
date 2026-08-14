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
    state.renderer.setClearColor(0xffffff, 1.0);
    state.renderer.setSize(el.canvasContainer.clientWidth, el.canvasContainer.clientHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = state.shadows;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.LinearToneMapping;
    state.renderer.toneMappingExposure = 1.1;
    el.canvasContainer.appendChild(state.renderer.domElement);

    state.modelGroup = new THREE.Group();
    state.scene.add(state.modelGroup);

    state.jointHelpersGroup = new THREE.Group();
    state.scene.add(state.jointHelpersGroup);

    // Radiant Pure Milk White Studio Lighting
    state.ambientLight = new THREE.AmbientLight(0xffffff, 2.4);
    state.scene.add(state.ambientLight);

    state.mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
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

    state.fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
    state.fillLight.position.set(-3, 2.5, 2);
    state.scene.add(state.fillLight);

    state.backLight = new THREE.DirectionalLight(0xffffff, 1.2);
    state.backLight.position.set(0, 3, -3);
    state.scene.add(state.backLight);

    // --- 3D Studio Room Enclosure (غرفة الاستوديو البيضاء مع بانوهات معمارية) ---
    const roomGroup = new THREE.Group();
    roomGroup.name = 'StudioRoom';

    const roomWidth = 14;
    const roomHeight = 5.2;
    const roomDepth = 14;

    // Room Shell (Pure Milk White Walls & Ceiling - جدران وسقف بيضاء نقية زي اللبن)
    const wallGeo = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        roughness: 0.65,
        metalness: 0.0,
        side: THREE.BackSide
    });
    const roomShell = new THREE.Mesh(wallGeo, wallMat);
    roomShell.position.y = roomHeight / 2;
    roomShell.receiveShadow = true;
    roomGroup.add(roomShell);

    // Boiserie Material (Pure Milk White Satin Mouldings - بانوهات بيضاء ناصعة تشع بياضاً)
    const boiserieMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.22,
        roughness: 0.35,
        metalness: 0.01
    });

    // Architectural Trim Material (Pure Satin White - نعلات وكرانيش بيضاء نقية)
    const trimMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.22,
        roughness: 0.35,
        metalness: 0.01
    });

    // Helper: Create a Classic Boiserie (بانوه جداري بإطارين متداخلين باللون الأبيض النقي)
    function createBoiserie(width, height, thickness = 0.035, frameWidth = 0.055) {
        const pGroup = new THREE.Group();

        // Outer White Frame
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(width, frameWidth, thickness), boiserieMat);
        topBar.position.set(0, height / 2 - frameWidth / 2, thickness / 2);
        topBar.receiveShadow = true;
        topBar.castShadow = true;
        pGroup.add(topBar);

        const btmBar = new THREE.Mesh(new THREE.BoxGeometry(width, frameWidth, thickness), boiserieMat);
        btmBar.position.set(0, -height / 2 + frameWidth / 2, thickness / 2);
        btmBar.receiveShadow = true;
        btmBar.castShadow = true;
        pGroup.add(btmBar);

        const sideH = Math.max(0.01, height - frameWidth * 2);
        const lBar = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, sideH, thickness), boiserieMat);
        lBar.position.set(-width / 2 + frameWidth / 2, 0, thickness / 2);
        lBar.receiveShadow = true;
        lBar.castShadow = true;
        pGroup.add(lBar);

        const rBar = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, sideH, thickness), boiserieMat);
        rBar.position.set(width / 2 - frameWidth / 2, 0, thickness / 2);
        rBar.receiveShadow = true;
        rBar.castShadow = true;
        pGroup.add(rBar);

        // Inner Nested Frame for true luxury depth
        const margin = 0.12;
        const innerW = width - margin * 2;
        const innerH = height - margin * 2;
        const innerThick = thickness * 0.75;
        const innerFrameW = 0.035;

        if (innerW > 0.3 && innerH > 0.3) {
            const inTop = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerFrameW, innerThick), boiserieMat);
            inTop.position.set(0, innerH / 2 - innerFrameW / 2, innerThick / 2);
            inTop.receiveShadow = true;
            inTop.castShadow = true;
            pGroup.add(inTop);

            const inBtm = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerFrameW, innerThick), boiserieMat);
            inBtm.position.set(0, -innerH / 2 + innerFrameW / 2, innerThick / 2);
            inBtm.receiveShadow = true;
            inBtm.castShadow = true;
            pGroup.add(inBtm);

            const inSideH = Math.max(0.01, innerH - innerFrameW * 2);
            const inLeft = new THREE.Mesh(new THREE.BoxGeometry(innerFrameW, inSideH, innerThick), boiserieMat);
            inLeft.position.set(-innerW / 2 + innerFrameW / 2, 0, innerThick / 2);
            inLeft.receiveShadow = true;
            inLeft.castShadow = true;
            pGroup.add(inLeft);

            const inRight = new THREE.Mesh(new THREE.BoxGeometry(innerFrameW, inSideH, innerThick), boiserieMat);
            inRight.position.set(innerW / 2 - innerFrameW / 2, 0, innerThick / 2);
            inRight.receiveShadow = true;
            inRight.castShadow = true;
            pGroup.add(inRight);
        }

        return pGroup;
    }

    // --- Back Wall Boiseries & Mouldings (بانوهات الجدار الخلفي) ---
    const backZ = -roomDepth / 2;

    // Chair Rail (حزام منتصف الجدار الخلفي باللون الأبيض النقي)
    const chairRailGeo = new THREE.BoxGeometry(roomWidth, 0.08, 0.045);
    const chairRail = new THREE.Mesh(chairRailGeo, trimMat);
    chairRail.position.set(0, 1.05, backZ + 0.0225);
    chairRail.receiveShadow = true;
    chairRail.castShadow = true;
    roomGroup.add(chairRail);

    // Crown Moulding (كورنيشة سقفية علوية)
    const crownGeo = new THREE.BoxGeometry(roomWidth, 0.10, 0.05);
    const crown = new THREE.Mesh(crownGeo, trimMat);
    crown.position.set(0, roomHeight - 0.05, backZ + 0.025);
    roomGroup.add(crown);

    // Back Wall Panels Layout (Upper & Lower)
    const backPanelsConfig = [
        { x: 0, w: 2.6, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { x: -2.9, w: 2.1, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { x: 2.9, w: 2.1, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { x: -5.4, w: 1.8, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { x: 5.4, w: 1.8, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 }
    ];

    backPanelsConfig.forEach(cfg => {
        // Upper Boiserie
        const upperBoiserie = createBoiserie(cfg.w, cfg.hTop);
        upperBoiserie.position.set(cfg.x, cfg.yTop, backZ);
        roomGroup.add(upperBoiserie);

        // Lower Boiserie
        const lowerBoiserie = createBoiserie(cfg.w, cfg.hBtm, 0.025, 0.045);
        lowerBoiserie.position.set(cfg.x, cfg.yBtm, backZ);
        roomGroup.add(lowerBoiserie);
    });

    // --- Side Walls Boiseries (بانوهات الجدران الجانبية) ---
    const sidePanelsConfig = [
        { z: -3.5, w: 2.4, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { z: 0, w: 2.4, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 },
        { z: 3.5, w: 2.4, hTop: 3.2, yTop: 2.95, hBtm: 0.65, yBtm: 0.55 }
    ];

    sidePanelsConfig.forEach(cfg => {
        // Left Wall
        const leftUpper = createBoiserie(cfg.w, cfg.hTop);
        leftUpper.rotation.y = Math.PI / 2;
        leftUpper.position.set(-roomWidth / 2, cfg.yTop, cfg.z);
        roomGroup.add(leftUpper);

        const leftLower = createBoiserie(cfg.w, cfg.hBtm, 0.025, 0.045);
        leftLower.rotation.y = Math.PI / 2;
        leftLower.position.set(-roomWidth / 2, cfg.yBtm, cfg.z);
        roomGroup.add(leftLower);

        // Right Wall
        const rightUpper = createBoiserie(cfg.w, cfg.hTop);
        rightUpper.rotation.y = -Math.PI / 2;
        rightUpper.position.set(roomWidth / 2, cfg.yTop, cfg.z);
        roomGroup.add(rightUpper);

        const rightLower = createBoiserie(cfg.w, cfg.hBtm, 0.025, 0.045);
        rightLower.rotation.y = -Math.PI / 2;
        rightLower.position.set(roomWidth / 2, cfg.yBtm, cfg.z);
        roomGroup.add(rightLower);
    });

    // Architectural Baseboards (نعلات جدارية سفلية بيضاء نقية)
    const bbHeight = 0.14;
    const bbThick = 0.035;

    // Back & Front Baseboards
    const bbBackGeo = new THREE.BoxGeometry(roomWidth, bbHeight, bbThick);
    const bbBack = new THREE.Mesh(bbBackGeo, trimMat);
    bbBack.position.set(0, bbHeight / 2, -roomDepth / 2 + bbThick / 2);
    roomGroup.add(bbBack);

    const bbFront = new THREE.Mesh(bbBackGeo, trimMat);
    bbFront.position.set(0, bbHeight / 2, roomDepth / 2 - bbThick / 2);
    roomGroup.add(bbFront);

    // Left & Right Baseboards
    const bbSideGeo = new THREE.BoxGeometry(bbThick, bbHeight, roomDepth);
    const bbLeft = new THREE.Mesh(bbSideGeo, trimMat);
    bbLeft.position.set(-roomWidth / 2 + bbThick / 2, bbHeight / 2, 0);
    roomGroup.add(bbLeft);

    const bbRight = new THREE.Mesh(bbSideGeo, trimMat);
    bbRight.position.set(roomWidth / 2 - bbThick / 2, bbHeight / 2, 0);
    roomGroup.add(bbRight);

    // Studio Ceiling Softbox Light Fixtures (وحدات إضاءة سقفية استوديو بيضاء ناصعة)
    const softboxLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2.5,
        roughness: 0.1
    });
    const softboxFrameMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.2,
        roughness: 0.3
    });

    for (const offset of [-3.2, 3.2]) {
        const frameGeo = new THREE.BoxGeometry(3.5, 0.06, 2.2);
        const frame = new THREE.Mesh(frameGeo, softboxFrameMat);
        frame.position.set(offset, roomHeight - 0.03, 0);
        roomGroup.add(frame);

        const lightPanelGeo = new THREE.PlaneGeometry(3.3, 2.0);
        const lightPanel = new THREE.Mesh(lightPanelGeo, softboxLightMat);
        lightPanel.rotation.x = Math.PI / 2;
        lightPanel.position.set(offset, roomHeight - 0.061, 0);
        roomGroup.add(lightPanel);
    }

    state.scene.add(roomGroup);
    state.studioRoom = roomGroup;

    // --- Radiant Pure Milk White Tiled Floor (أرضية سيراميك بيضاء ناصعة زي الحليب بمربعات واضحة) ---
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = 512;
    tileCanvas.height = 512;
    const tileCtx = tileCanvas.getContext('2d');
    
    // Pure White Milk Tile Surface
    tileCtx.fillStyle = '#ffffff';
    tileCtx.fillRect(0, 0, 512, 512);
    
    // Delicate, clean, clear tile grout lines (نقية وواضحة بدون أي درجات رمادية داكنة)
    tileCtx.strokeStyle = '#e2e8f0';
    tileCtx.lineWidth = 4;
    tileCtx.strokeRect(0, 0, 512, 512);
    
    // Pure white specular rim
    tileCtx.strokeStyle = '#ffffff';
    tileCtx.lineWidth = 2;
    tileCtx.strokeRect(3, 3, 506, 506);

    const tileTexture = new THREE.CanvasTexture(tileCanvas);
    tileTexture.wrapS = THREE.RepeatWrapping;
    tileTexture.wrapT = THREE.RepeatWrapping;
    tileTexture.repeat.set(24, 24);

    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMat = new THREE.MeshStandardMaterial({
        map: tileTexture,
        roughness: 0.1,
        metalness: 0.0,
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.15
    });
    state.whiteTilesFloor = new THREE.Mesh(floorGeo, floorMat);
    state.whiteTilesFloor.rotation.x = -Math.PI / 2;
    state.whiteTilesFloor.position.y = 0.001;
    state.whiteTilesFloor.receiveShadow = true;
    state.scene.add(state.whiteTilesFloor);

    // Grid (Subtle Crisp Grid Overlay)
    state.floorGrid = new THREE.GridHelper(roomWidth, 14, 0x38bdf8, 0xcbd5e1);
    state.floorGrid.position.y = 0.002;
    state.floorGrid.visible = state.showGrid;
    state.scene.add(state.floorGrid);

    // Soft Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(12, 12);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    state.floorPlane = new THREE.Mesh(shadowGeo, shadowMat);
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
    state.orbitControls.maxPolarAngle = Math.PI / 2 - 0.02;
    state.orbitControls.minDistance = 0.4;
    state.orbitControls.maxDistance = 5.8;
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
    let bgStyle = '#ffffff';
    switch (state.theme) {
        case 'blender':
            bgStyle = '#ffffff';
            break;
        case 'charcoal':
            bgStyle = 'radial-gradient(circle at 50% 35%, #24252a 0%, #1a1b1e 100%)';
            break;
        case 'midnight':
            bgStyle = 'radial-gradient(circle at 50% 35%, #0d1e33 0%, #070c14 70%, #03060a 100%)';
            break;
        case 'light':
            bgStyle = '#ffffff';
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
