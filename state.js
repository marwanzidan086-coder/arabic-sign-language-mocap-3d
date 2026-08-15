// --- State Management & Globals ---

export const state = {
    // Three.js Globals
    scene: null,
    camera: null,
    renderer: null,
    orbitControls: null,
    transformControls: null,
    mainLight: null,
    ambientLight: null,
    fillLight: null,
    floorGrid: null,
    floorPlane: null,
    whiteTilesFloor: null,
    studioRoom: null,
    currentRoom: 'studio',
    roomEnvironmentGroup: null,
    skeletonHelper: null,
    jointHelpersGroup: null, // Contains interactive joint spheres
    mappedAvatarBones: {},
    mocapRestData: new Map(),
    elbowConstraintsData: new Map(),

    // Model state
    model: null,
    modelGroup: null, // Holds model, centered
    bones: [],
    boneMap: new Map(), // Bone UUID -> Bone Info (original transforms)
    selectedBone: null,
    transformSpace: 'local', // 'local' or 'world'
    activeGizmoMode: 'rotate', // 'translate', 'rotate', 'scale', 'select'
    devMode: false, // Presentation mode by default, false means clean presentation view
    
    // settings
    showMesh: true,
    wireframe: false,
    meshOpacity: 1.0,
    showJoints: true,
    showSkeleton: true,
    useIdlePose: true,
    xrayJoints: true,
    jointSize: 0.015,
    jointColor: '#00ffcc',
    jointColorSelected: '#ffea00',
    showGrid: false, // hidden by default for presentation view
    shadows: true,
    lightIntensity: 1.5, // slightly brighter for rich materials
    theme: 'blender', // default theme uses the Mada teal background

    // MoCap state
    mocapActive: false,
    mocapFrameDeltaSeconds: 1 / 60,
    poseLandmarker: null,
    handLandmarker: null,
    faceLandmarker: null, // MediaPipe face mesh landmarker
    webcamStream: null,
    
    // Face Tracking Options
    faceTrackingEnabled: true,
    eyeLookTrackingEnabled: true,
    
    // MoCap Source selection ('camera' or 'video')
    mocapSource: 'camera',
    videoFileStream: null,
    
    // Motion recording state
    mocapRecording: {
        active: false,
        paused: false,
        startTime: 0,
        recordedTime: 0,
        boneFrames: [], // Array of keyframe arrays: { time, name, pos, rot }
        morphFrames: []  // Array of morph keyframes: { time, name, weight }
    },
    
    // VRM state
    vrm: null,
    mocapRestHipsWebcam: null,

    // MoCap Calibration & Physical tracking state
    mocapCalibration: {
        isCalibrated: false,
        calibrating: false,
        countdown: 0,
        countdownStartTime: 0,
        calibratedShoulderWidth: 0.22,
        calibratedHeadToHips: 0.45,
        calibratedHipsY: 0.65,
        calibratedFrames: [],
        directionMultiplier: 1.0
    }
};

// --- DOM Cache ---
export const el = {
    canvasContainer: document.getElementById('canvas-container'),
    modelName: document.getElementById('info-name'),
    modelJoints: document.getElementById('info-joints'),
    modelVertices: document.getElementById('info-vertices'),
    fileInput: document.getElementById('file-input'),
    btnLoadLocal: document.getElementById('btn-load-local'),
    btnResetAll: document.getElementById('btn-reset-all'),
    boneSearch: document.getElementById('bone-search'),
    boneTree: document.getElementById('bone-tree'),
    noSelectionMsg: document.getElementById('no-selection-msg'),
    inspectorPanel: document.getElementById('inspector-panel'),
    selectedBoneName: document.getElementById('selected-bone-name'),
    selectedBoneIndex: document.getElementById('selected-bone-index'),
    selectedBoneParent: document.getElementById('selected-bone-parent'),
    btnResetBone: document.getElementById('btn-reset-bone'),
    spaceLocal: document.getElementById('space-local'),
    spaceWorld: document.getElementById('space-world'),
    gizmoSpaceText: document.getElementById('gizmo-space-text'),
    
    // Transform Sliders & Numeric Inputs
    rotX: document.getElementById('rot-x'),
    rotY: document.getElementById('rot-y'),
    rotZ: document.getElementById('rot-z'),
    rotXNum: document.getElementById('rot-x-num'),
    rotYNum: document.getElementById('rot-y-num'),
    rotZNum: document.getElementById('rot-z-num'),
    
    posX: document.getElementById('pos-x'),
    posY: document.getElementById('pos-y'),
    posZ: document.getElementById('pos-z'),
    posXNum: document.getElementById('pos-x-num'),
    posYNum: document.getElementById('pos-y-num'),
    posZNum: document.getElementById('pos-z-num'),
    
    sclX: document.getElementById('scl-x'),
    sclY: document.getElementById('scl-y'),
    sclZ: document.getElementById('scl-z'),
    sclXNum: document.getElementById('scl-x-num'),
    sclYNum: document.getElementById('scl-y-num'),
    sclZNum: document.getElementById('scl-z-num'),
    
    // Tab controls
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // Settings DOMs
    setShowMesh: document.getElementById('set-show-mesh'),
    setWireframe: document.getElementById('set-wireframe'),
    setMeshOpacity: document.getElementById('set-mesh-opacity'),
    valMeshOpacity: document.getElementById('val-mesh-opacity'),
    
    setShowJoints: document.getElementById('set-show-joints'),
    setShowSkeleton: document.getElementById('set-show-skeleton'),
    setIdlePose: document.getElementById('set-idle-pose'),
    setXrayJoints: document.getElementById('set-xray-joints'),
    setJointSize: document.getElementById('set-joint-size'),
    valJointSize: document.getElementById('val-joint-size'),
    setJointColor: document.getElementById('set-joint-color'),
    setJointColorSel: document.getElementById('set-joint-color-sel'),
    
    setShowGrid: document.getElementById('set-show-grid'),
    setShadows: document.getElementById('set-shadows'),
    setLightIntensity: document.getElementById('set-light-intensity'),
    valLightIntensity: document.getElementById('val-light-intensity'),
    setBgTheme: document.getElementById('set-bg-theme'),
    
    // Drag & Drop
    dropOverlay: document.getElementById('drop-overlay'),
    
    // Hotkey elements
    hkSelect: document.getElementById('hk-select'),
    hkTranslate: document.getElementById('hk-translate'),
    hkRotate: document.getElementById('hk-rotate'),
    hkScale: document.getElementById('hk-scale'),
    
    // Reset axis icons
    resetRot: document.getElementById('reset-rot'),
    resetPos: document.getElementById('reset-pos'),
    resetScl: document.getElementById('reset-scl'),
 
    // Presentation Layout DOMs
    btnToggleDev: document.getElementById('btn-toggle-dev'),

    // Webcam MoCap DOMs
    webcamPanel: document.getElementById('webcam-panel'),
    webcamHeader: document.getElementById('webcam-header'),
    webcamVideo: document.getElementById('webcam-video'),
    webcamOverlay: document.getElementById('webcam-overlay'),
    webcamLoader: document.getElementById('webcam-loader'),
    webcamLoaderText: document.getElementById('webcam-loader-text'),
    btnToggleMocap: document.getElementById('btn-toggle-mocap'),
    btnCalibrateMocap: document.getElementById('btn-calibrate-mocap'),
    webcamStatusDot: document.getElementById('webcam-status-dot'),
    btnExportPose: document.getElementById('btn-export-pose'),
    btnExportPoseTop: document.getElementById('btn-export-pose-top'),
    btnExportPoseInspector: document.getElementById('btn-export-pose-inspector'),
    btnExportTimer: document.getElementById('btn-export-timer'),
    
    // New MoCap elements
    btnSrcCamera: document.getElementById('btn-src-camera'),
    btnSrcVideo: document.getElementById('btn-src-video'),
    videoFileInput: document.getElementById('video-file-input'),
    mocapRecordingPanel: document.getElementById('mocap-recording-panel'),
    recTimer: document.getElementById('rec-timer'),
    btnRecordStart: document.getElementById('btn-record-start'),
    currentRoom: 'studio',
    roomEnvironmentGroup: null,

    btnRecordPause: document.getElementById('btn-record-pause'),
    btnRecordStop: document.getElementById('btn-record-stop'),
    setEnableFace: document.getElementById('set-enable-face'),
    setEnableEyeLook: document.getElementById('set-enable-eye-look'),

    // Model Loading Screen & Room Switcher
    modelLoadingScreen: document.getElementById('model-loading-screen'),
    modelLoadProgressBar: document.getElementById('model-load-progress-bar'),
    modelLoadStepText: document.getElementById('model-load-step-text'),
    modelLoadPercent: document.getElementById('model-load-percent'),
    roomSwitcherBar: document.getElementById('room-switcher-bar'),
    roomBtns: document.querySelectorAll('.room-btn')
};

// --- Dragging Helper for floating panels ---
export function makeElementDraggable(elmnt, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
        
        e.preventDefault();
        elmnt.style.transition = 'none';
        bakeTransformToPosition(elmnt);
        
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
        
        elmnt.style.transition = 'none';
        bakeTransformToPosition(elmnt);
        
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        updatePosition(pos1, pos2);
    }

    function elementTouchDrag(e) {
        pos1 = pos3 - e.touches[0].clientX;
        pos2 = pos4 - e.touches[0].clientY;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        
        updatePosition(pos1, pos2);
    }

    function updatePosition(dx, dy) {
        let newTop = elmnt.offsetTop - dy;
        let newLeft = elmnt.offsetLeft - dx;
        
        const maxTop = window.innerHeight - elmnt.offsetHeight - 10;
        const maxLeft = window.innerWidth - elmnt.offsetWidth - 10;
        
        newTop = Math.max(10, Math.min(newTop, maxTop));
        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        
        elmnt.style.top = newTop + "px";
        elmnt.style.left = newLeft + "px";
        elmnt.dataset.dragged = "true";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
        elmnt.style.transition = '';
    }
}

export function bakeTransformToPosition(elmnt) {
    if (elmnt.dataset.dragged === "true") return;
    
    const prevTransition = elmnt.style.transition;
    elmnt.style.transition = 'none';
    
    const rect = elmnt.getBoundingClientRect();
    elmnt.style.left = rect.left + 'px';
    elmnt.style.top = rect.top + 'px';
    elmnt.style.transform = 'none';
    
    void elmnt.offsetHeight; // Force repaint
    elmnt.style.transition = prevTransition;
}
