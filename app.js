import { state, el, makeElementDraggable } from './state.js';
import { setupScene, setupControls, animate } from './viewport.js';
import { preloadMoCapModels } from './mocap.js';
import { loadModel, setupEventListeners, setupDragAndDrop, toggleDevMode } from './ui.js';
import { initTrainer } from './trainer.js';

function init() {
    setupScene();
    setupControls();
    setupEventListeners();
    setupDragAndDrop();
    animate();
    
    // Set to default clean presentation mode visual state
    toggleDevMode(false);

    // Make Webcam panel draggable
    if (el.webcamPanel && el.webcamHeader) {
        makeElementDraggable(el.webcamPanel, el.webcamHeader);
    }

    // Load default model
    loadModel('avaturn_avatar.vrm');

    // Preload MoCap models in background immediately
    preloadMoCapModels();

    // Initialize Gesture Trainer
    initTrainer();
}

// Start the app
init();
