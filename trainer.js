import { 
  loadCustomGestures, 
  saveCustomGestures, 
  clearCustomGestures, 
  deleteCustomGesture,
  parseImportedGestures, 
  buildExportPayload, 
  mergeImportedWithCurrent 
} from './customGestureStore.js';

import { 
  getFrameQuality, 
  prepareRecordedFrame, 
  createGestureSample, 
  predictCustomGesture, 
  resetCustomGestureBuffer 
} from './customGestureRecognizer.js';

// Global Trainer State
export let customGestures = [];
let isRecording = false;
let countdown = null;
let recordingFrames = [];
let recordingStartTime = 0;
let lastSavedGesture = null;
let statusMessage = '';
let customPrediction = null;
let customGestureError = null;

// Playback Modal State
let playingSample = null;
let playbackFrameIdx = 0;
let isPlaybackPlaying = false;
let playbackInterval = null;

// Text-to-Sign Playback State
export let isPlayingCustomSign = false;
let customSignPlaybackInterval = null;

// Sign-to-Text Translator State
let lastPredictedGestureId = null;
let lastPredictionTime = 0;

// DOM Elements cache (initialized in initTrainer)
let el = {};

export async function initTrainer() {
  // Grab DOM Elements
  el = {
    btnViewTrainer: document.getElementById('btn-view-trainer'),
    btnViewEditor: document.getElementById('btn-view-editor'),
    btnViewTranslator: document.getElementById('btn-sign-to-text'),
    trainerView: document.getElementById('trainer-view'),
    translatorView: document.getElementById('translator-view'),
    webcamPanel: document.getElementById('webcam-panel'),
    canvasContainer: document.getElementById('canvas-container'),
    trainerWebcamPlaceholder: document.getElementById('trainer-webcam-placeholder'),
    translatorWebcamPlaceholder: document.getElementById('translator-webcam-placeholder'),
    mocapRecordingPanel: document.getElementById('mocap-recording-panel'),
    
    // Inputs & Status (Trainer)
    gestureName: document.getElementById('trainer-gesture-name'),
    liveQualityPercent: document.getElementById('live-quality-percent'),
    liveQualityBar: document.getElementById('live-quality-bar'),
    recordingFramesCount: document.getElementById('recording-frames-count'),
    recordingFramesBar: document.getElementById('recording-frames-bar'),
    
    // Actions (Trainer)
    btnRecord: document.getElementById('btn-trainer-record'),
    btnNew: document.getElementById('btn-trainer-new'),
    
    // Feedback (Trainer)
    feedbackContainer: document.getElementById('trainer-feedback'),
    statusMessage: document.getElementById('trainer-status-message'),
    lastSaved: document.getElementById('trainer-last-saved'),
    livePrediction: document.getElementById('trainer-live-prediction'),
    errorFeedback: document.getElementById('trainer-error'),
    
    // Metrics
    metricCameraBar: document.getElementById('metric-camera-bar'),
    metricCameraVal: document.getElementById('metric-camera-val'),
    metricBodyBar: document.getElementById('metric-body-bar'),
    metricBodyVal: document.getElementById('metric-body-val'),
    metricHandsBar: document.getElementById('metric-hands-bar'),
    metricHandsVal: document.getElementById('metric-hands-val'),
    
    // Gestures List
    savedGesturesCount: document.getElementById('saved-gestures-count'),
    customStatsLine: document.getElementById('custom-stats-line'),
    btnExport: document.getElementById('btn-trainer-export'),
    btnImport: document.getElementById('btn-trainer-import'),
    btnClearAll: document.getElementById('btn-trainer-clear-all'),
    importFile: document.getElementById('trainer-import-file'),
    search: document.getElementById('trainer-search'),
    listPlaceholder: document.getElementById('saved-gestures-placeholder'),
    gesturesList: document.getElementById('saved-gestures-list'),
    
    // Playback Modal
    playbackModal: document.getElementById('playback-modal'),
    playbackTitle: document.getElementById('playback-modal-title'),
    playbackClose: document.getElementById('btn-playback-close'),
    playbackCanvas: document.getElementById('playback-canvas'),
    playbackFrameHud: document.getElementById('playback-frame-hud'),
    playbackPlay: document.getElementById('btn-playback-play'),
    playbackSlider: document.getElementById('playback-slider'),
    playbackDuration: document.getElementById('playback-duration'),
    playbackQuality: document.getElementById('playback-quality'),
    playbackHands: document.getElementById('playback-hands'),
    
    // Text-to-Sign DOM
    btnTextToSign: document.getElementById('btn-text-to-sign'),
    textToSignModal: document.getElementById('text-to-sign-modal'),
    btnCloseTextToSign: document.getElementById('btn-close-text-to-sign'),
    btnPlayTextToSign: document.getElementById('btn-play-text-to-sign'),
    textToSignInput: document.getElementById('text-to-sign-input'),

    // Sign-to-Text DOM
    translatorTextOutput: document.getElementById('translator-text-output'),
    btnTranslatorClear: document.getElementById('btn-translator-clear'),
    btnTranslatorCopy: document.getElementById('btn-translator-copy'),
    translatorLivePrediction: document.getElementById('translator-live-prediction'),
    translatorLiveConfidence: document.getElementById('translator-live-confidence'),
  };

  // Wire up View Switching
  if (el.btnViewTrainer) {
    el.btnViewTrainer.addEventListener('click', () => switchView('trainer'));
  }
  if (el.btnViewEditor) {
    el.btnViewEditor.addEventListener('click', () => switchView('editor'));
  }
  if (el.btnViewTranslator) {
    el.btnViewTranslator.addEventListener('click', () => switchView('translator'));
  }

  // Wire up Actions (Trainer)
  if (el.btnRecord) el.btnRecord.addEventListener('click', handleRecordClick);
  if (el.btnNew) el.btnNew.addEventListener('click', resetNewGesture);
  if (el.btnExport) el.btnExport.addEventListener('click', handleExport);
  if (el.btnImport) el.btnImport.addEventListener('click', () => el.importFile.click());
  if (el.importFile) el.importFile.addEventListener('change', handleImport);
  if (el.btnClearAll) el.btnClearAll.addEventListener('click', handleClearAll);
  if (el.search) el.search.addEventListener('input', renderGesturesList);

  // Wire up Actions (Translator)
  if (el.btnTranslatorClear) el.btnTranslatorClear.addEventListener('click', handleTranslatorClear);
  if (el.btnTranslatorCopy) el.btnTranslatorCopy.addEventListener('click', handleTranslatorCopy);

  // Text-to-Sign Wireup
  if (el.btnTextToSign) el.btnTextToSign.addEventListener('click', openTextToSignModal);
  if (el.btnCloseTextToSign) el.btnCloseTextToSign.addEventListener('click', closeTextToSignModal);
  if (el.btnPlayTextToSign) el.btnPlayTextToSign.addEventListener('click', handlePlayTextToSign);
  if (el.textToSignInput) {
    el.textToSignInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handlePlayTextToSign();
      }
    });
  }

  // Playback Modal Wireup
  if (el.playbackClose) el.playbackClose.addEventListener('click', closePlaybackModal);
  if (el.playbackPlay) el.playbackPlay.addEventListener('click', togglePlaybackPlay);
  if (el.playbackSlider) {
    el.playbackSlider.addEventListener('input', (e) => {
      playbackFrameIdx = parseInt(e.target.value);
      isPlaybackPlaying = false;
      if (playbackInterval) clearInterval(playbackInterval);
      el.playbackPlay.innerText = '▶️ تشغيل';
      renderPlaybackFrame();
    });
  }

  // Load Saved Gestures
  try {
    customGestures = await loadCustomGestures();
  } catch (err) {
    console.error("Failed to load custom gestures:", err);
  }
  
  renderGesturesList();
  updateStatsHeader();
}

export function switchView(targetView) {
  // Reset active classes
  document.body.classList.remove('view-trainer', 'view-translator');
  if (el.trainerView) el.trainerView.classList.add('hidden');
  if (el.translatorView) el.translatorView.classList.add('hidden');
  
  if (el.btnViewTrainer) el.btnViewTrainer.classList.remove('active');
  if (el.btnViewEditor) el.btnViewEditor.classList.remove('active');
  if (el.btnViewTranslator) el.btnViewTranslator.classList.remove('active');

  // Deactivate webcam prediction helper HUD
  hideLivePrediction();

  if (targetView === 'trainer') {
    document.body.classList.add('view-trainer');
    if (el.trainerView) el.trainerView.classList.remove('hidden');
    if (el.btnViewTrainer) el.btnViewTrainer.classList.add('active');
    
    // Move webcam to trainer placeholder
    if (el.mocapRecordingPanel) el.mocapRecordingPanel.style.display = 'none';
    if (el.webcamPanel && el.trainerWebcamPlaceholder) {
      el.trainerWebcamPlaceholder.appendChild(el.webcamPanel);
    }
    
    const btnCalibrate = document.getElementById('btn-calibrate-mocap');
    if (btnCalibrate) btnCalibrate.style.display = 'none';
    
  } else if (targetView === 'translator') {
    document.body.classList.add('view-translator');
    if (el.translatorView) el.translatorView.classList.remove('hidden');
    if (el.btnViewTranslator) el.btnViewTranslator.classList.add('active');
    
    // Move webcam to translator placeholder
    if (el.mocapRecordingPanel) el.mocapRecordingPanel.style.display = 'none';
    if (el.webcamPanel && el.translatorWebcamPlaceholder) {
      el.translatorWebcamPlaceholder.appendChild(el.webcamPanel);
    }
    
    const btnCalibrate = document.getElementById('btn-calibrate-mocap');
    if (btnCalibrate) btnCalibrate.style.display = 'none';
    
  } else {
    // Editor view
    if (el.btnViewEditor) el.btnViewEditor.classList.add('active');
    
    // Move webcam back to canvas container
    if (el.mocapRecordingPanel) el.mocapRecordingPanel.style.display = '';
    if (el.webcamPanel && el.canvasContainer) {
      el.canvasContainer.appendChild(el.webcamPanel);
    }
  }

  // Reset translator states when switching view
  lastPredictedGestureId = null;
  lastPredictionTime = 0;

  // Trigger window resize for canvas sizing
  window.dispatchEvent(new Event('resize'));
}

// MediaPipe Loop Handler
export function onNewLandmarks(rawHands, poseLandmarks = null, rawHandsWorld = [], poseWorldLandmarks = null) {
  const isTrainer = document.body.classList.contains('view-trainer');
  const isTranslator = document.body.classList.contains('view-translator');
  
  if (!isTrainer && !isTranslator) return;

  if (isTrainer) {
    // 1. Calculate live hand quality
    const quality = getFrameQuality(rawHands);
    const qualityPercent = Math.round(quality * 100);
    
    if (el.liveQualityPercent) el.liveQualityPercent.innerText = `${qualityPercent}%`;
    if (el.liveQualityBar) el.liveQualityBar.style.width = `${qualityPercent}%`;

    // 2. Compute metrics
    updateMetricsHUD(rawHands, poseLandmarks);

    // 3. Handle Recording
    if (isRecording) {
      recordingFrames.push({
        hands: rawHands,
        handsWorld: rawHandsWorld,
        pose: poseLandmarks,
        poseWorld: poseWorldLandmarks,
        timestamp: Date.now()
      });
      
      const count = recordingFrames.length;
      if (el.recordingFramesCount) el.recordingFramesCount.innerText = count.toString();
      if (el.recordingFramesBar) el.recordingFramesBar.style.width = `${Math.min(100, (count / 90) * 100)}%`;
      return;
    }

    // 4. Handle Live Prediction (Testing Mode)
    if (countdown === null && customGestures.length > 0) {
      const prediction = predictCustomGesture(rawHands, customGestures);
      if (prediction) {
        customPrediction = prediction;
        showLivePrediction(prediction);
      } else {
        customPrediction = null;
        hideLivePrediction();
      }
    }
  } else if (isTranslator) {
    // Handle Live Sign-to-Text translation
    handleLiveTranslation(rawHands);
  }
}

function handleTranslatorClear() {
  if (el.translatorTextOutput) {
    el.translatorTextOutput.value = '';
  }
  lastPredictedGestureId = null;
  lastPredictionTime = 0;
}

function handleTranslatorCopy() {
  if (!el.translatorTextOutput || !el.translatorTextOutput.value) return;
  
  navigator.clipboard.writeText(el.translatorTextOutput.value)
    .then(() => {
      const originalText = el.btnTranslatorCopy.innerHTML;
      el.btnTranslatorCopy.innerHTML = '✅ تم نسخ النص!';
      setTimeout(() => {
        if (el.btnTranslatorCopy) el.btnTranslatorCopy.innerHTML = originalText;
      }, 1500);
    })
    .catch((err) => {
      console.error('Failed to copy text: ', err);
    });
}

function handleLiveTranslation(rawHands) {
  if (!customGestures || customGestures.length === 0) {
    if (el.translatorLivePrediction) {
      el.translatorLivePrediction.innerText = 'يرجى تسجيل وتدريب بعض الإشارات أولاً.';
    }
    if (el.translatorLiveConfidence) {
      el.translatorLiveConfidence.innerText = '--%';
    }
    return;
  }

  const prediction = predictCustomGesture(rawHands, customGestures);
  const now = Date.now();

  if (prediction) {
    if (el.translatorLivePrediction) {
      el.translatorLivePrediction.innerText = prediction.outputText;
    }
    if (el.translatorLiveConfidence) {
      el.translatorLiveConfidence.innerText = `${Math.round(prediction.confidence * 100)}%`;
    }

    const isNewGesture = (prediction.customGestureId !== lastPredictedGestureId);
    const cooldownPassed = (now - lastPredictionTime > 1800);

    if (isNewGesture || cooldownPassed) {
      if (el.translatorTextOutput) {
        const currentText = el.translatorTextOutput.value.trim();
        if (currentText === "") {
          el.translatorTextOutput.value = prediction.outputText;
        } else {
          el.translatorTextOutput.value = `${currentText} ${prediction.outputText}`;
        }
        el.translatorTextOutput.scrollTop = el.translatorTextOutput.scrollHeight;
      }
      lastPredictedGestureId = prediction.customGestureId;
      lastPredictionTime = now;
    }
  } else {
    if (el.translatorLivePrediction) {
      el.translatorLivePrediction.innerText = 'جاري انتظار إشارة... (Waiting for sign)';
    }
    if (el.translatorLiveConfidence) {
      el.translatorLiveConfidence.innerText = '--%';
    }

    if (now - lastPredictionTime > 800) {
      lastPredictedGestureId = null;
    }
  }
}

function updateMetricsHUD(rawHands, poseLandmarks) {
  // Distance to Camera
  let cameraDist = 0;
  let bodyDist = null;
  let handsDist = 0;

  if (rawHands && rawHands.length > 0) {
    const firstHand = rawHands[0];
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    firstHand.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    });
    const w = maxX - minX;
    const h = maxY - minY;
    const diag = Math.sqrt(w * w + h * h);
    cameraDist = Math.max(15, Math.round(15 / (diag || 0.1)));

    // Hands Proximity
    if (rawHands.length >= 2) {
      const dx = rawHands[0][0].x - rawHands[1][0].x;
      const dy = rawHands[0][0].y - rawHands[1][0].y;
      handsDist = Math.round(Math.sqrt(dx*dx + dy*dy) * 100);
    }

    // Body distance
    if (poseLandmarks && poseLandmarks.length > 12) {
      const wrist = firstHand[0];
      const lShoulder = poseLandmarks[11];
      const rShoulder = poseLandmarks[12];
      const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
      const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
      const dx = wrist.x - midShoulderX;
      const dy = wrist.y - midShoulderY;
      bodyDist = Math.round(Math.sqrt(dx*dx + dy*dy) * 100);
    }
  }

  // Update UI Elements
  if (el.metricCameraBar) {
    el.metricCameraBar.style.width = `${Math.min(100, (cameraDist / 120) * 100)}%`;
    el.metricCameraVal.innerText = cameraDist > 0 ? `${cameraDist} cm` : `-- cm`;
  }
  if (el.metricBodyBar) {
    el.metricBodyBar.style.width = bodyDist ? `${Math.min(100, (bodyDist / 80) * 100)}%` : `0%`;
    el.metricBodyVal.innerText = bodyDist !== null ? `${bodyDist} cm` : `غير نشط`;
  }
  if (el.metricHandsBar) {
    el.metricHandsBar.style.width = handsDist > 0 ? `${Math.min(100, (handsDist / 100) * 100)}%` : `0%`;
    el.metricHandsVal.innerText = handsDist > 0 ? `${handsDist} cm` : `يد واحدة`;
  }
}

// Recording Logic
function handleRecordClick() {
  if (isRecording) {
    finishRecording();
    return;
  }

  const name = el.gestureName.value.trim();
  if (!name) {
    showError("يرجى كتابة اسم الإشارة قبل البدء بالتسجيل!");
    return;
  }

  // Clear errors
  hideError();
  
  // Start countdown
  let count = 3;
  countdown = count;
  el.btnRecord.disabled = true;
  el.btnRecord.innerText = `⏱️ يبدأ خلال ${count}`;

  const cdInterval = setInterval(() => {
    count--;
    countdown = count;
    if (count > 0) {
      el.btnRecord.innerText = `⏱️ يبدأ خلال ${count}`;
    } else {
      clearInterval(cdInterval);
      countdown = null;
      startRecording();
    }
  }, 1000);
}

function startRecording() {
  isRecording = true;
  recordingFrames = [];
  recordingStartTime = Date.now();
  
  el.btnRecord.disabled = false;
  el.btnRecord.className = "btn btn-danger btn-action animate-pulse";
  el.btnRecord.innerText = `🛑 إيقاف وحفظ (0)`;

  // Automatically finish recording after 3 seconds
  setTimeout(() => {
    if (isRecording) {
      finishRecording();
    }
  }, 3000);
}

async function finishRecording() {
  if (!isRecording) return;
  isRecording = false;
  
  el.btnRecord.disabled = true;
  el.btnRecord.className = "btn btn-accent btn-action";
  el.btnRecord.innerText = "💾 جاري المعالجة والحفظ...";

  try {
    const gestureNameVal = el.gestureName.value.trim();
    if (recordingFrames.length < 8) {
      throw new Error("تنبيه: التسجيل قصير جداً أو لم يتم التقاط معالم اليد بشكل مستمر.");
    }

    const sample = createGestureSample(recordingFrames, {
      startedAt: recordingStartTime,
      endedAt: Date.now()
    });

    // Check if gesture already exists
    let existing = customGestures.find(g => g.name.toLowerCase() === gestureNameVal.toLowerCase());
    
    if (existing) {
      existing.samples.push(sample);
      existing.updatedAt = Date.now();
    } else {
      existing = {
        id: 'gesture_' + Date.now(),
        name: gestureNameVal,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        samples: [sample]
      };
      customGestures.push(existing);
    }

    // Save to IndexedDB
    customGestures = await saveCustomGestures(customGestures);
    
    // Success feedback
    lastSavedGesture = {
      name: gestureNameVal,
      frames: sample.framesCount,
      quality: sample.qualityScore
    };
    
    showSuccess(`تم حفظ عينة الإشارة "${gestureNameVal}" بنجاح!`);
    renderGesturesList();
    updateStatsHeader();

  } catch (err) {
    showError(err.message);
  } finally {
    el.btnRecord.disabled = false;
    el.btnRecord.innerText = "📹 تسجيل عينة 3 ثواني";
    if (el.recordingFramesBar) el.recordingFramesBar.style.width = `0%`;
    if (el.recordingFramesCount) el.recordingFramesCount.innerText = `0`;
  }
}

function resetNewGesture() {
  el.gestureName.value = '';
  lastSavedGesture = null;
  statusMessage = '';
  customGestureError = null;
  
  if (el.feedbackContainer) el.feedbackContainer.classList.add('hidden');
  if (el.lastSaved) el.lastSaved.classList.add('hidden');
  if (el.errorFeedback) el.errorFeedback.classList.add('hidden');
  resetCustomGestureBuffer();
}

// UI Feedback helpers
function showError(msg) {
  el.feedbackContainer.classList.remove('hidden');
  el.errorFeedback.classList.remove('hidden');
  el.errorFeedback.innerText = `⚠️ ${msg}`;
  el.statusMessage.innerText = '';
}

function hideError() {
  el.errorFeedback.classList.add('hidden');
}

function showSuccess(msg) {
  el.feedbackContainer.classList.remove('hidden');
  el.statusMessage.className = "feedback-message text-success";
  el.statusMessage.innerText = msg;
  
  if (lastSavedGesture) {
    el.lastSaved.classList.remove('hidden');
    el.lastSaved.innerText = `✅ آخر حفظ: ${lastSavedGesture.name} · ${lastSavedGesture.frames} إطار · جودة ${Math.round(lastSavedGesture.quality * 100)}%`;
  }
}

function showLivePrediction(pred) {
  el.feedbackContainer.classList.remove('hidden');
  el.livePrediction.classList.remove('hidden');
  el.livePrediction.innerText = `🎯 الاختبار الحي: ${pred.arabic} · ${Math.round(pred.confidence * 100)}%`;
}

function hideLivePrediction() {
  if (el.livePrediction) el.livePrediction.classList.add('hidden');
}

// Stats & Database rendering
function updateStatsHeader() {
  const gestureCount = customGestures.length;
  let totalSamples = 0;
  let sumQuality = 0;

  customGestures.forEach(g => {
    totalSamples += g.samples.length;
    g.samples.forEach(s => {
      sumQuality += s.qualityScore || 0;
    });
  });

  const avgQuality = totalSamples > 0 ? sumQuality / totalSamples : 0;

  if (el.savedGesturesCount) el.savedGesturesCount.innerText = gestureCount.toString();
  if (el.customStatsLine) {
    el.customStatsLine.innerText = `${totalSamples} عينة · متوسط جودة ${Math.round(avgQuality * 100)}%`;
  }
}

function renderGesturesList() {
  const query = el.search.value.trim().toLowerCase();
  const filtered = customGestures.filter(g => g.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    el.listPlaceholder.classList.remove('hidden');
    el.gesturesList.classList.add('hidden');
    el.gesturesList.innerHTML = '';
    return;
  }

  el.listPlaceholder.classList.add('hidden');
  el.gesturesList.classList.remove('hidden');

  let html = '';
  filtered.forEach(gesture => {
    const isLiveMatch = customPrediction && customPrediction.customGestureId === gesture.id;
    const bestQuality = gesture.samples.length > 0 
      ? Math.max(...gesture.samples.map(s => s.qualityScore || 0)) 
      : 0;

    let samplesHtml = '';
    gesture.samples.forEach((sample, idx) => {
      samplesHtml += `
        <span class="sample-chip">
          ${sample.handCount === 2 ? '👐' : '✋'} عينة ${idx + 1} (${sample.framesCount || sample.frames?.length || 0} إطار)
          <button class="sample-play-btn" data-gesture-id="${gesture.id}" data-sample-id="${sample.id}" title="مشاهدة العينة">👁️</button>
          <button class="sample-delete" data-gesture-id="${gesture.id}" data-sample-id="${sample.id}" title="حذف العينة">×</button>
        </span>
      `;
    });

    html += `
      <div class="saved-gesture-item ${isLiveMatch ? 'live-match' : ''}">
        <div class="item-main-info">
          <span class="item-tag">🧠 مخصص</span>
          <strong class="item-name font-arabic">${gesture.name}</strong>
          <span class="item-time font-latin">${new Date(gesture.updatedAt).toLocaleTimeString()}</span>
        </div>
        <div class="item-stats font-latin">
          <span>🎞️ ${gesture.samples.length} samples</span>
          <span>✨ ${Math.round(bestQuality * 100)}%</span>
        </div>
        <div class="gesture-samples">
          ${samplesHtml}
        </div>
        <button class="btn-delete" data-gesture-id="${gesture.id}" title="حذف الإشارة">❌</button>
      </div>
    `;
  });

  el.gesturesList.innerHTML = html;

  // Add click listeners to play, delete samples, delete gestures
  el.gesturesList.querySelectorAll('.sample-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const gId = btn.dataset.gestureId;
      const sId = btn.dataset.sampleId;
      openPlaybackModal(gId, sId);
    });
  });

  el.gesturesList.querySelectorAll('.sample-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const gId = btn.dataset.gestureId;
      const sId = btn.dataset.sampleId;
      if (confirm("هل أنت متأكد من حذف هذه العينة؟")) {
        await deleteSample(gId, sId);
      }
    });
  });

  el.gesturesList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const gId = btn.dataset.gestureId;
      if (confirm("هل أنت متأكد من حذف هذه الإشارة بالكامل مع جميع عيناتها؟")) {
        await deleteGesture(gId);
      }
    });
  });
}

// Database Mutators
async function deleteGesture(gestureId) {
  customGestures = customGestures.filter(g => g.id !== gestureId);
  customGestures = await saveCustomGestures(customGestures);
  await deleteCustomGesture(gestureId);
  renderGesturesList();
  updateStatsHeader();
}

async function deleteSample(gestureId, sampleId) {
  const gesture = customGestures.find(g => g.id === gestureId);
  if (gesture) {
    gesture.samples = gesture.samples.filter(s => s.id !== sampleId);
    if (gesture.samples.length === 0) {
      customGestures = customGestures.filter(g => g.id !== gestureId);
    } else {
      gesture.updatedAt = Date.now();
    }
    customGestures = await saveCustomGestures(customGestures);
    renderGesturesList();
    updateStatsHeader();
  }
}

// Export / Import
function handleExport() {
  if (customGestures.length === 0) return;
  const payload = buildExportPayload(customGestures);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `arabic_gestures_dataset_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const imported = parseImportedGestures(event.target.result);
      customGestures = mergeImportedWithCurrent(customGestures, imported);
      customGestures = await saveCustomGestures(customGestures);
      
      showSuccess(`تم استيراد الإشارات بنجاح!`);
      renderGesturesList();
      updateStatsHeader();
    } catch (err) {
      showError(`فشل استيراد الملف: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

async function handleClearAll() {
  if (confirm("تحذير: هل أنت متأكد من حذف جميع الإشارات المحفوظة بالكامل؟ لا يمكن تراجع عن هذا!")) {
    await clearCustomGestures();
    customGestures = [];
    renderGesturesList();
    updateStatsHeader();
    showSuccess("تم إفراغ قاعدة بيانات الإشارات المخصصة.");
  }
}

// Playback Modal logic
function openPlaybackModal(gestureId, sampleId) {
  const gesture = customGestures.find(g => g.id === gestureId);
  if (!gesture) return;
  const sample = gesture.samples.find(s => s.id === sampleId);
  if (!sample) return;

  playingSample = { name: gesture.name, sample };
  playbackFrameIdx = 0;
  isPlaybackPlaying = true;

  el.playbackTitle.innerText = `👁️ مشاهدة الإشارة المسجلة: ${gesture.name}`;
  el.playbackDuration.innerText = `${(sample.durationMs / 1000).toFixed(2)} ثانية`;
  el.playbackQuality.innerText = `${Math.round(sample.qualityScore * 100)}%`;
  el.playbackHands.innerText = sample.handCount === 2 ? 'يدين' : 'يد واحدة';

  el.playbackSlider.max = sample.frames.length - 1;
  el.playbackSlider.value = 0;
  el.playbackModal.classList.remove('hidden');

  el.playbackPlay.innerText = '⏸️ إيقاف مؤقت';
  
  // Start Playback Interval loop
  if (playbackInterval) clearInterval(playbackInterval);
  const frameDelay = Math.round(sample.durationMs / sample.frames.length) || 40;
  
  playbackInterval = setInterval(() => {
    if (isPlaybackPlaying) {
      playbackFrameIdx = (playbackFrameIdx + 1) % sample.frames.length;
      el.playbackSlider.value = playbackFrameIdx;
      renderPlaybackFrame();
    }
  }, frameDelay);

  renderPlaybackFrame();
}

function closePlaybackModal() {
  playingSample = null;
  isPlaybackPlaying = false;
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  el.playbackModal.classList.add('hidden');
}

function togglePlaybackPlay() {
  isPlaybackPlaying = !isPlaybackPlaying;
  el.playbackPlay.innerText = isPlaybackPlaying ? '⏸️ إيقاف مؤقت' : '▶️ تشغيل';
}

function renderPlaybackFrame() {
  if (!playingSample) return;
  const frame = playingSample.sample.frames[playbackFrameIdx];
  if (!frame) return;

  const canvas = el.playbackCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  el.playbackFrameHud.innerText = `Frame: ${playbackFrameIdx + 1} / ${playingSample.sample.frames.length}`;

  // Draw Skeletons
  drawHandPlayback(ctx, frame.hands, w, h, frame.pose);
}

function drawHandPlayback(ctx, rawHands, width, height, poseLandmarks = null) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  // Dark background for modal canvas
  ctx.fillStyle = '#0a0b1c';
  ctx.fillRect(0, 0, width, height);

  // Sci-fi grid background in modal viewport
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Draw Pose Skeleton first if available
  if (poseLandmarks && poseLandmarks.length > 0) {
    const POSE_CONNECTIONS = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]
    ];
    
    ctx.strokeStyle = 'rgba(0, 187, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const ptA = poseLandmarks[startIdx];
      const ptB = poseLandmarks[endIdx];
      if (ptA && ptB) {
        ctx.beginPath();
        ctx.moveTo(ptA.x * width, ptA.y * height);
        ctx.lineTo(ptB.x * width, ptB.y * height);
        ctx.stroke();
      }
    });

    // Draw Pose points
    ctx.fillStyle = '#00a0ff';
    poseLandmarks.forEach(pt => {
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  if (!rawHands || rawHands.length === 0) return;

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ];

  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  const hands = Array.isArray(rawHands[0]) ? rawHands : [rawHands];

  hands.forEach(hand => {
    if (!hand || hand.length < 21) return;

    // Draw connection lines
    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = hand[startIdx];
      const end = hand[endIdx];
      if (start && end) {
        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
    });

    // Draw joint spheres
    ctx.fillStyle = '#ffffff';
    hand.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  });
}

// Text-to-Sign Modal and Playback Helpers
function openTextToSignModal() {
  if (el.textToSignModal) {
    el.textToSignModal.classList.remove('hidden');
  }
  if (el.textToSignInput) {
    el.textToSignInput.value = '';
    el.textToSignInput.focus();
  }
}

function closeTextToSignModal() {
  if (el.textToSignModal) {
    el.textToSignModal.classList.add('hidden');
  }
}

function handlePlayTextToSign() {
  if (!el.textToSignInput) return;
  const word = el.textToSignInput.value.trim();
  if (!word) {
    alert("يرجى كتابة اسم الإشارة أولاً!");
    return;
  }
  closeTextToSignModal();
  playGestureSign(word);
}

export function playGestureSign(gestureName) {
  const gesture = customGestures.find(g => g.name.toLowerCase() === gestureName.toLowerCase().trim());
  if (!gesture || gesture.samples.length === 0) {
    alert(`لم يتم العثور على إشارة مسجلة باسم "${gestureName}"`);
    return;
  }

  stopCustomSignPlayback();

  const sample = gesture.samples[0];
  let idx = 0;
  isPlayingCustomSign = true;

  console.log(`Starting playback of custom sign: "${gestureName}" (${sample.frames.length} frames)`);

  const frameDelay = Math.round(sample.durationMs / sample.frames.length) || 40;

  customSignPlaybackInterval = setInterval(() => {
    if (!isPlayingCustomSign) {
      clearInterval(customSignPlaybackInterval);
      return;
    }

    const frame = sample.frames[idx];
    if (frame) {
      // Feed pose to avatar
      if (frame.pose) {
        import('./mocap-pose.js').then(m => {
          m.mapPoseToAvatar(frame.pose, frame.poseWorld || null, performance.now() / 1000);
        });
      }

      // Feed hands to avatar
      if (frame.hands && frame.hands.length > 0) {
        import('./mocap-pose.js').then(m => {
          const worldHands = frame.handsWorld || [];
          if (frame.hands.length === 1) {
            const hand = frame.hands[0];
            const wHand = worldHands[0] || null;
            const side = (hand[0] && hand[0].x > 0.5) ? 'Left' : 'Right';
            m.mapHandToAvatar(hand, wHand, side, performance.now() / 1000);
          } else {
            const hand1 = frame.hands[0];
            const hand2 = frame.hands[1];
            const wHand1 = worldHands[0] || null;
            const wHand2 = worldHands[1] || null;
            m.mapHandToAvatar(hand1, wHand1, 'Right', performance.now() / 1000);
            m.mapHandToAvatar(hand2, wHand2, 'Left', performance.now() / 1000);
          }
        });
      }

      idx++;
      if (idx >= sample.frames.length) {
        isPlayingCustomSign = false;
        clearInterval(customSignPlaybackInterval);
        console.log("Playback of custom sign finished.");

        // Apply idle pose after 1 second
        setTimeout(() => {
          if (!isPlayingCustomSign) {
            import('./mocap.js').then(m => {
              m.applyIdlePose();
            });
          }
        }, 1000);
      }
    } else {
      isPlayingCustomSign = false;
      clearInterval(customSignPlaybackInterval);
    }
  }, frameDelay);
}

export function stopCustomSignPlayback() {
  isPlayingCustomSign = false;
  if (customSignPlaybackInterval) {
    clearInterval(customSignPlaybackInterval);
    customSignPlaybackInterval = null;
  }
}
