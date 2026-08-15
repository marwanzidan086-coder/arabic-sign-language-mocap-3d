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

    // --- Room Environments Group & Initializer ---
    state.roomEnvironmentGroup = new THREE.Group();
    state.roomEnvironmentGroup.name = 'RoomEnvironmentGroup';
    state.scene.add(state.roomEnvironmentGroup);

    // Soft Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(16, 16);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    state.floorPlane = new THREE.Mesh(shadowGeo, shadowMat);
    state.floorPlane.rotation.x = -Math.PI / 2;
    state.floorPlane.position.y = 0.003;
    state.floorPlane.receiveShadow = true;
    state.scene.add(state.floorPlane);

    // Grid (Subtle Crisp Grid Overlay)
    state.floorGrid = new THREE.GridHelper(14, 14, 0x000000, 0x334155);
    state.floorGrid.position.set(0, 0.002, 0);
    state.floorGrid.visible = state.showGrid;
    state.scene.add(state.floorGrid);

    // Build default initial room
    setRoomEnvironment(state.currentRoom || 'studio');
}

// ==========================================================================
// 4 PROCEDURAL 3D ROOM ENVIRONMENTS (No Camera Occlusion / Smooth 360 Orbit)
// ==========================================================================

const ROOM_WIDTH = 14.0;
const ROOM_DEPTH = 14.0;
const ROOM_HEIGHT = 5.2;

// --- 1. Modern White Studio Environment ---
function createStudioRoom() {
    const group = new THREE.Group();
    group.name = 'StudioRoom';

    // Room Shell (Pure Milk White Walls & Ceiling)
    const wallGeo = new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, ROOM_DEPTH);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        emissive: 0xffffff,
        emissiveIntensity: 0.15,
        roughness: 0.65,
        metalness: 0.0,
        side: THREE.BackSide
    });
    const shell = new THREE.Mesh(wallGeo, wallMat);
    shell.position.set(0, ROOM_HEIGHT / 2, 0);
    shell.receiveShadow = true;
    group.add(shell);

    // Boiserie Moulding Material
    const boiserieMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        roughness: 0.35,
        metalness: 0.01
    });

    const trimMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        roughness: 0.35,
        metalness: 0.01
    });

    function makeBoiserie(w, h, thick = 0.035, frameW = 0.06) {
        const p = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, frameW, thick), boiserieMat);
        top.position.set(0, h / 2 - frameW / 2, thick / 2);
        p.add(top);

        const btm = new THREE.Mesh(new THREE.BoxGeometry(w, frameW, thick), boiserieMat);
        btm.position.set(0, -h / 2 + frameW / 2, thick / 2);
        p.add(btm);

        const sideH = Math.max(0.01, h - frameW * 2);
        const l = new THREE.Mesh(new THREE.BoxGeometry(frameW, sideH, thick), boiserieMat);
        l.position.set(-w / 2 + frameW / 2, 0, thick / 2);
        p.add(l);

        const r = new THREE.Mesh(new THREE.BoxGeometry(frameW, sideH, thick), boiserieMat);
        r.position.set(w / 2 - frameW / 2, 0, thick / 2);
        p.add(r);

        const margin = 0.14;
        const inW = w - margin * 2;
        const inH = h - margin * 2;
        if (inW > 0.4 && inH > 0.4) {
            const inFrameW = 0.035;
            const inTop = new THREE.Mesh(new THREE.BoxGeometry(inW, inFrameW, thick * 0.7), boiserieMat);
            inTop.position.set(0, inH / 2 - inFrameW / 2, thick * 0.35);
            p.add(inTop);

            const inBtm = new THREE.Mesh(new THREE.BoxGeometry(inW, inFrameW, thick * 0.7), boiserieMat);
            inBtm.position.set(0, -inH / 2 + inFrameW / 2, thick * 0.35);
            p.add(inBtm);

            const inSideH = Math.max(0.01, inH - inFrameW * 2);
            const inL = new THREE.Mesh(new THREE.BoxGeometry(inFrameW, inSideH, thick * 0.7), boiserieMat);
            inL.position.set(-inW / 2 + inFrameW / 2, 0, thick * 0.35);
            p.add(inL);

            const inR = new THREE.Mesh(new THREE.BoxGeometry(inFrameW, inSideH, thick * 0.7), boiserieMat);
            inR.position.set(inW / 2 - inFrameW / 2, 0, thick * 0.35);
            p.add(inR);
        }
        return p;
    }

    // Place Panels on Outer Walls (z = -6.95, far away so camera never collides)
    const backZ = -ROOM_DEPTH / 2 + 0.04;
    const chairRail = new THREE.Mesh(new THREE.BoxGeometry(ROOM_WIDTH, 0.08, 0.04), trimMat);
    chairRail.position.set(0, 1.15, backZ);
    group.add(chairRail);

    const crown = new THREE.Mesh(new THREE.BoxGeometry(ROOM_WIDTH, 0.12, 0.05), trimMat);
    crown.position.set(0, ROOM_HEIGHT - 0.06, backZ);
    group.add(crown);

    const panelPositions = [-4.5, -2.25, 0, 2.25, 4.5];
    panelPositions.forEach(x => {
        const upper = makeBoiserie(1.8, 2.6);
        upper.position.set(x, 2.8, backZ);
        group.add(upper);

        const lower = makeBoiserie(1.8, 0.7, 0.025, 0.045);
        lower.position.set(x, 0.55, backZ);
        group.add(lower);
    });

    // Studio Ceiling Softbox Panels
    const softboxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2.2,
        roughness: 0.1
    });
    for (const xOff of [-3.5, 3.5]) {
        for (const zOff of [-2.5, 2.5]) {
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), softboxMat);
            panel.rotation.x = Math.PI / 2;
            panel.position.set(xOff, ROOM_HEIGHT - 0.05, zOff);
            group.add(panel);
        }
    }

    // White Tiled Floor
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = 512;
    tileCanvas.height = 512;
    const tileCtx = tileCanvas.getContext('2d');
    tileCtx.fillStyle = '#ffffff';
    tileCtx.fillRect(0, 0, 512, 512);
    tileCtx.strokeStyle = '#e2e8f0';
    tileCtx.lineWidth = 10;
    tileCtx.strokeRect(0, 0, 512, 512);

    const tileTexture = new THREE.CanvasTexture(tileCanvas);
    tileTexture.wrapS = THREE.RepeatWrapping;
    tileTexture.wrapT = THREE.RepeatWrapping;
    tileTexture.repeat.set(16, 16);

    const floorMat = new THREE.MeshStandardMaterial({
        map: tileTexture,
        roughness: 0.22,
        metalness: 0.02,
        color: 0xffffff
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.001, 0);
    floor.receiveShadow = true;
    group.add(floor);

    return group;
}

// --- 2. Warm Classroom / Training Room Environment ---
function createClassroomRoom() {
    const group = new THREE.Group();
    group.name = 'ClassroomRoom';

    // Room Shell (Warm Greige Walls & Ceiling)
    const wallGeo = new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, ROOM_DEPTH);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xded8ce,
        emissive: 0xded8ce,
        emissiveIntensity: 0.08,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.BackSide
    });
    const shell = new THREE.Mesh(wallGeo, wallMat);
    shell.position.set(0, ROOM_HEIGHT / 2, 0);
    shell.receiveShadow = true;
    group.add(shell);

    const backZ = -ROOM_DEPTH / 2 + 0.04;

    // Back Wall Feature 1: Modern Classroom Whiteboard / Smart Display Frame
    const boardFrameMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.3, metalness: 0.7 });
    const boardSurfaceMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0xf8fafc,
        emissiveIntensity: 0.12,
        roughness: 0.2,
        metalness: 0.02
    });

    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.8, 0.08), boardFrameMat);
    boardFrame.position.set(0, 2.5, backZ + 0.04);
    group.add(boardFrame);

    const boardSurface = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.5), boardSurfaceMat);
    boardSurface.position.set(0, 2.5, backZ + 0.085);
    group.add(boardSurface);

    // Back Wall Feature 2: Architectural Wood Slats (Oak panels on sides)
    const woodSlatMat = new THREE.MeshStandardMaterial({
        color: 0xa06d42,
        roughness: 0.55,
        metalness: 0.05
    });

    for (let x = -6.2; x <= -3.4; x += 0.22) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.12, ROOM_HEIGHT - 0.2, 0.05), woodSlatMat);
        slat.position.set(x, ROOM_HEIGHT / 2, backZ + 0.03);
        group.add(slat);
    }
    for (let x = 3.4; x <= 6.2; x += 0.22) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.12, ROOM_HEIGHT - 0.2, 0.05), woodSlatMat);
        slat.position.set(x, ROOM_HEIGHT / 2, backZ + 0.03);
        group.add(slat);
    }

    // Warm Linear Ceiling Lights
    const warmLightMat = new THREE.MeshStandardMaterial({
        color: 0xfff4e6,
        emissive: 0xfff0dd,
        emissiveIntensity: 2.5,
        roughness: 0.1
    });
    for (const z of [-3, 0, 3]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.05, 0.25), warmLightMat);
        strip.position.set(0, ROOM_HEIGHT - 0.03, z);
        group.add(strip);
    }

    // Warm Parquet Oak Wood Floor Texture
    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 512;
    woodCanvas.height = 512;
    const wCtx = woodCanvas.getContext('2d');
    wCtx.fillStyle = '#b58253';
    wCtx.fillRect(0, 0, 512, 512);

    // Draw wood planks
    const plankH = 64;
    const plankW = 128;
    for (let y = 0; y < 512; y += plankH) {
        for (let x = 0; x < 512; x += plankW) {
            const shift = (y / plankH) % 2 === 0 ? 0 : plankW / 2;
            const px = (x + shift) % 512;
            wCtx.fillStyle = ((px + y) % 3 === 0) ? '#a77244' : (((px + y) % 2 === 0) ? '#be8c5c' : '#b17b4c');
            wCtx.fillRect(px, y, plankW - 2, plankH - 2);
            wCtx.strokeStyle = 'rgba(60, 35, 15, 0.35)';
            wCtx.lineWidth = 2;
            wCtx.strokeRect(px, y, plankW - 2, plankH - 2);
        }
    }

    const woodTexture = new THREE.CanvasTexture(woodCanvas);
    woodTexture.wrapS = THREE.RepeatWrapping;
    woodTexture.wrapT = THREE.RepeatWrapping;
    woodTexture.repeat.set(10, 10);

    const floorMat = new THREE.MeshStandardMaterial({
        map: woodTexture,
        roughness: 0.35,
        metalness: 0.05,
        color: 0xffffff
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.001, 0);
    floor.receiveShadow = true;
    group.add(floor);

    return group;
}

// --- 3. Dark Cyber Neon Lab Environment ---
function createCyberRoom() {
    const group = new THREE.Group();
    group.name = 'CyberRoom';

    // Room Shell (Matte Obsidian Carbon)
    const wallGeo = new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, ROOM_DEPTH);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x060911,
        roughness: 0.85,
        metalness: 0.2,
        side: THREE.BackSide
    });
    const shell = new THREE.Mesh(wallGeo, wallMat);
    shell.position.set(0, ROOM_HEIGHT / 2, 0);
    shell.receiveShadow = true;
    group.add(shell);

    const backZ = -ROOM_DEPTH / 2 + 0.04;

    // Glowing Neon Strips on Walls
    const neonCyanMat = new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x00f2fe,
        emissiveIntensity: 3.5,
        roughness: 0.1
    });
    const neonMagentaMat = new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 3.5,
        roughness: 0.1
    });

    // Horizontal cyber stripes
    const cStrip1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM_WIDTH, 0.06, 0.03), neonCyanMat);
    cStrip1.position.set(0, 1.2, backZ);
    group.add(cStrip1);

    const cStrip2 = new THREE.Mesh(new THREE.BoxGeometry(ROOM_WIDTH, 0.06, 0.03), neonMagentaMat);
    cStrip2.position.set(0, 3.8, backZ);
    group.add(cStrip2);

    // Cyber Hex Grid Center Emblem Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
    const centerDisplay = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.2, 0.06), frameMat);
    centerDisplay.position.set(0, 2.5, backZ + 0.03);
    group.add(centerDisplay);

    const holoScreenMat = new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x00f2fe,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85
    });
    const holoScreen = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.9), holoScreenMat);
    holoScreen.position.set(0, 2.5, backZ + 0.065);
    group.add(holoScreen);

    // Ceiling Neon Geometry
    const ceilNeon = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.15, 6), neonCyanMat);
    ceilNeon.rotation.x = Math.PI / 2;
    ceilNeon.position.set(0, ROOM_HEIGHT - 0.05, 0);
    group.add(ceilNeon);

    // Dark Reflective Cyber Grid Floor
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 512;
    gridCanvas.height = 512;
    const gCtx = gridCanvas.getContext('2d');
    gCtx.fillStyle = '#060a14';
    gCtx.fillRect(0, 0, 512, 512);

    // Glowing cyan grid border
    gCtx.strokeStyle = '#00f2fe';
    gCtx.lineWidth = 8;
    gCtx.strokeRect(0, 0, 512, 512);

    // Inner fine grid
    gCtx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
    gCtx.lineWidth = 2;
    gCtx.strokeRect(64, 64, 384, 384);

    const cyberTexture = new THREE.CanvasTexture(gridCanvas);
    cyberTexture.wrapS = THREE.RepeatWrapping;
    cyberTexture.wrapT = THREE.RepeatWrapping;
    cyberTexture.repeat.set(14, 14);

    const floorMat = new THREE.MeshStandardMaterial({
        map: cyberTexture,
        roughness: 0.15,
        metalness: 0.4,
        color: 0xffffff
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.001, 0);
    floor.receiveShadow = true;
    group.add(floor);

    return group;
}

// --- 4. Golden Sunset / Theatrical Stage Environment ---
function createSunsetRoom() {
    const group = new THREE.Group();
    group.name = 'SunsetRoom';

    // Room Shell (Deep Twilight Indigo Backdrop)
    const wallGeo = new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, ROOM_DEPTH);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x180d26,
        roughness: 0.75,
        metalness: 0.1,
        side: THREE.BackSide
    });
    const shell = new THREE.Mesh(wallGeo, wallMat);
    shell.position.set(0, ROOM_HEIGHT / 2, 0);
    shell.receiveShadow = true;
    group.add(shell);

    const backZ = -ROOM_DEPTH / 2 + 0.04;

    // Glowing Golden Sun / Horizon Halo Disc on Back Wall
    const sunMat = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xffaa22,
        emissiveIntensity: 2.8,
        roughness: 0.2
    });
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), sunMat);
    sunDisc.position.set(0, 2.6, backZ + 0.03);
    group.add(sunDisc);

    // Atmospheric Warm Stage Rings
    const amberRingMat = new THREE.MeshStandardMaterial({
        color: 0xffbb44,
        emissive: 0xff9900,
        emissiveIntensity: 2.0,
        roughness: 0.2
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.75, 32), amberRingMat);
    outerRing.position.set(0, 2.6, backZ + 0.04);
    group.add(outerRing);

    // Glossy Dark Reflective Stage Floor
    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = 512;
    stageCanvas.height = 512;
    const sCtx = stageCanvas.getContext('2d');
    sCtx.fillStyle = '#0e0817';
    sCtx.fillRect(0, 0, 512, 512);

    // Warm radial stage highlight
    const radGrad = sCtx.createRadialGradient(256, 256, 10, 256, 256, 250);
    radGrad.addColorStop(0, 'rgba(255, 160, 50, 0.2)');
    radGrad.addColorStop(1, 'rgba(14, 8, 23, 0)');
    sCtx.fillStyle = radGrad;
    sCtx.fillRect(0, 0, 512, 512);

    sCtx.strokeStyle = 'rgba(255, 170, 60, 0.2)';
    sCtx.lineWidth = 4;
    sCtx.strokeRect(0, 0, 512, 512);

    const stageTexture = new THREE.CanvasTexture(stageCanvas);
    stageTexture.wrapS = THREE.RepeatWrapping;
    stageTexture.wrapT = THREE.RepeatWrapping;
    stageTexture.repeat.set(12, 12);

    const floorMat = new THREE.MeshStandardMaterial({
        map: stageTexture,
        roughness: 0.12,
        metalness: 0.35,
        color: 0xffffff
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.001, 0);
    floor.receiveShadow = true;
    group.add(floor);

    return group;
}

// --- Dynamic Environment Switcher ---
export function setRoomEnvironment(roomName) {
    if (!state.scene || !state.roomEnvironmentGroup) return;

    // Dispose old environment objects
    while (state.roomEnvironmentGroup.children.length > 0) {
        const child = state.roomEnvironmentGroup.children[0];
        child.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        state.roomEnvironmentGroup.remove(child);
    }

    state.currentRoom = roomName;

    // Build new environment & configure matching lighting
    let newRoom;
    switch (roomName) {
        case 'classroom':
            newRoom = createClassroomRoom();
            if (state.ambientLight) {
                state.ambientLight.color.set(0xfff8ee);
                state.ambientLight.intensity = 1.9;
            }
            if (state.mainLight) {
                state.mainLight.color.set(0xfff5e8);
                state.mainLight.intensity = 2.0;
            }
            if (state.fillLight) {
                state.fillLight.color.set(0xffe8d6);
                state.fillLight.intensity = 1.3;
            }
            if (state.backLight) {
                state.backLight.color.set(0xfff3e0);
                state.backLight.intensity = 1.1;
            }
            if (state.renderer) state.renderer.setClearColor(0xece7df, 1.0);
            if (state.floorPlane) state.floorPlane.material.opacity = 0.22;
            document.body.style.background = '#ded8ce';
            break;

        case 'cyber':
            newRoom = createCyberRoom();
            if (state.ambientLight) {
                state.ambientLight.color.set(0x0e1b30);
                state.ambientLight.intensity = 0.85;
            }
            if (state.mainLight) {
                state.mainLight.color.set(0x00f2fe);
                state.mainLight.intensity = 2.4;
            }
            if (state.fillLight) {
                state.fillLight.color.set(0x38bdf8);
                state.fillLight.intensity = 1.6;
            }
            if (state.backLight) {
                state.backLight.color.set(0xf43f5e);
                state.backLight.intensity = 2.2;
            }
            if (state.renderer) state.renderer.setClearColor(0x050811, 1.0);
            if (state.floorPlane) state.floorPlane.material.opacity = 0.35;
            document.body.style.background = '#060911';
            break;

        case 'sunset':
            newRoom = createSunsetRoom();
            if (state.ambientLight) {
                state.ambientLight.color.set(0x2d1537);
                state.ambientLight.intensity = 1.2;
            }
            if (state.mainLight) {
                state.mainLight.color.set(0xffaa44);
                state.mainLight.intensity = 2.5;
            }
            if (state.fillLight) {
                state.fillLight.color.set(0x818cf8);
                state.fillLight.intensity = 1.3;
            }
            if (state.backLight) {
                state.backLight.color.set(0xff5500);
                state.backLight.intensity = 2.4;
            }
            if (state.renderer) state.renderer.setClearColor(0x12091c, 1.0);
            if (state.floorPlane) state.floorPlane.material.opacity = 0.28;
            document.body.style.background = '#180d26';
            break;

        case 'studio':
        default:
            newRoom = createStudioRoom();
            if (state.ambientLight) {
                state.ambientLight.color.set(0xffffff);
                state.ambientLight.intensity = 2.4;
            }
            if (state.mainLight) {
                state.mainLight.color.set(0xffffff);
                state.mainLight.intensity = 2.2;
            }
            if (state.fillLight) {
                state.fillLight.color.set(0xffffff);
                state.fillLight.intensity = 1.5;
            }
            if (state.backLight) {
                state.backLight.color.set(0xffffff);
                state.backLight.intensity = 1.2;
            }
            if (state.renderer) state.renderer.setClearColor(0xffffff, 1.0);
            if (state.floorPlane) state.floorPlane.material.opacity = 0.18;
            document.body.style.background = '#ffffff';
            break;
    }

    state.roomEnvironmentGroup.add(newRoom);

    // Update active button state in UI
    const roomBtns = document.querySelectorAll('.room-btn');
    roomBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.room === roomName);
    });
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
