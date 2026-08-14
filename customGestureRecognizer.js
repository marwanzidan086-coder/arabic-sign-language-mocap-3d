export const CUSTOM_GESTURE_CONFIG = {
  STORAGE_KEY: 'tarjuman_custom_gestures_v2',
  LEGACY_STORAGE_KEY: 'tarjuman_custom_gestures',
  MIN_SAMPLE_FRAMES: 8,
  MIN_FRAME_QUALITY: 0.35,
  LIVE_FRAME_QUALITY: 0.3,
  MAX_LIVE_FRAMES: 42,
  SEQUENCE_LENGTH: 24,
  STATIC_MOVEMENT_THRESHOLD: 0.035,
  CUSTOM_CONFIDENCE_THRESHOLD: 0.82,
  CUSTOM_CONFIDENCE_MARGIN: 0.06,
};

const MAX_HANDS = 2;
const LANDMARKS_PER_HAND = 21;
const AXES_PER_LANDMARK = 3;
const EXTRA_FEATURES = 4;
const FEATURE_LENGTH = MAX_HANDS * LANDMARKS_PER_HAND * AXES_PER_LANDMARK + EXTRA_FEATURES;

let liveFrames = [];
let stableHistory = [];

export function resetCustomGestureBuffer() {
  liveFrames = [];
  stableHistory = [];
}

export function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeGestureName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar-EG');
}

function isValidHand(hand) {
  return Array.isArray(hand) && hand.length >= LANDMARKS_PER_HAND;
}

function sortHands(hands) {
  return (Array.isArray(hands) ? hands : [])
    .filter(isValidHand)
    .slice(0, MAX_HANDS)
    .sort((a, b) => (a[0]?.x || 0) - (b[0]?.x || 0));
}

function cloneHand(hand) {
  return hand.slice(0, LANDMARKS_PER_HAND).map((point) => ({
    x: roundCoord(point.x),
    y: roundCoord(point.y),
    z: roundCoord(point.z || 0),
  }));
}

function roundCoord(value) {
  return Math.round((Number(value) || 0) * 100000) / 100000;
}

function getHandBox(hand) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of hand) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.max(width, height, 0.0001),
  };
}

export function getFrameQuality(rawHands) {
  const hands = sortHands(rawHands);
  if (hands.length === 0) return 0;

  const handScores = hands.map((hand) => {
    const box = getHandBox(hand);
    const diagonal = Math.sqrt(box.width * box.width + box.height * box.height);
    const sizeScore = clamp(diagonal / 0.22, 0, 1);
    const visibilityScore = hand.filter((point) => {
      return point.x >= -0.05 && point.x <= 1.05 && point.y >= -0.05 && point.y <= 1.05;
    }).length / LANDMARKS_PER_HAND;
    return sizeScore * 0.7 + visibilityScore * 0.3;
  });

  const avgHandScore = average(handScores);
  const handCountScore = hands.length === 2 ? 1 : 0.85;
  return clamp(avgHandScore * handCountScore, 0, 1);
}

export function prepareRecordedFrame(input) {
  const rawHands = input && Array.isArray(input.hands) ? input.hands : input;
  const hands = sortHands(rawHands);
  if (hands.length === 0) return null;

  const clonedHands = hands.map(cloneHand);
  return {
    hands: clonedHands,
    handCount: clonedHands.length,
    timestamp: input?.timestamp || Date.now(),
    quality: getFrameQuality(clonedHands),
    features: buildFrameFeatures(clonedHands),
  };
}

export function createGestureSample(rawFrames, meta = {}) {
  let preparedFrames = (rawFrames || [])
    .map((rawFrame) => {
      const prepared = prepareRecordedFrame(rawFrame);
      if (prepared) {
        prepared.pose = rawFrame.pose || null;
        prepared.poseWorld = rawFrame.poseWorld || null;
        prepared.handsWorld = rawFrame.handsWorld || null;
      }
      return prepared;
    })
    .filter((frame) => frame && frame.quality >= CUSTOM_GESTURE_CONFIG.MIN_FRAME_QUALITY);

  if (preparedFrames.length < CUSTOM_GESTURE_CONFIG.MIN_SAMPLE_FRAMES) {
    if (meta.allowShortSample && preparedFrames.length > 0) {
      const expanded = [];
      while (expanded.length < CUSTOM_GESTURE_CONFIG.MIN_SAMPLE_FRAMES) {
        expanded.push(...preparedFrames);
      }
      preparedFrames = expanded.slice(0, CUSTOM_GESTURE_CONFIG.MIN_SAMPLE_FRAMES);
    } else {
      throw new Error(`التسجيل قصير أو غير واضح. مطلوب ${CUSTOM_GESTURE_CONFIG.MIN_SAMPLE_FRAMES} إطارات صالحة على الأقل.`);
    }
  }

  const featureFrames = resampleFeatureFrames(
    preparedFrames.map((frame) => frame.features),
    CUSTOM_GESTURE_CONFIG.SEQUENCE_LENGTH
  );
  const centroid = meanVector(featureFrames);
  const movementScore = getMovementScore(featureFrames);
  const handCount = mode(preparedFrames.map((frame) => frame.handCount));
  const durationMs = Math.max(
    0,
    (meta.endedAt || preparedFrames[preparedFrames.length - 1].timestamp) -
      (meta.startedAt || preparedFrames[0].timestamp)
  );

  return {
    id: createId('sample'),
    type: 'sequence',
    frames: preparedFrames.map(({ hands, handsWorld, pose, poseWorld, timestamp, quality }) => ({ 
      hands, 
      handsWorld: handsWorld || null,
      pose: pose || null, 
      poseWorld: poseWorld || null,
      timestamp, 
      quality 
    })),
    featureFrames,
    centroid,
    durationMs,
    handCount,
    framesCount: preparedFrames.length,
    qualityScore: roundScore(average(preparedFrames.map((frame) => frame.quality))),
    movementScore: roundScore(movementScore),
    createdAt: Date.now(),
  };
}

export function normalizeStoredGesture(gesture) {
  if (!gesture || !gesture.name) return null;

  const samples = (gesture.samples || [])
    .map((sample) => normalizeStoredSample(sample))
    .filter(Boolean);

  return {
    id: gesture.id || createId('gesture'),
    name: String(gesture.name).trim(),
    createdAt: gesture.createdAt || gesture.timestamp || Date.now(),
    updatedAt: gesture.updatedAt || gesture.timestamp || Date.now(),
    samples,
  };
}

function normalizeStoredSample(sample) {
  if (!sample) return null;

  try {
    if (Array.isArray(sample.featureFrames) && Array.isArray(sample.centroid)) {
      return {
        ...sample,
        featureFrames: resampleFeatureFrames(sample.featureFrames, CUSTOM_GESTURE_CONFIG.SEQUENCE_LENGTH),
        centroid: sample.centroid.length === FEATURE_LENGTH
          ? sample.centroid
          : meanVector(resampleFeatureFrames(sample.featureFrames, CUSTOM_GESTURE_CONFIG.SEQUENCE_LENGTH)),
      };
    }

    if (Array.isArray(sample.frames)) {
      return createGestureSample(sample.frames, {
        startedAt: sample.frames[0]?.timestamp,
        endedAt: sample.frames[sample.frames.length - 1]?.timestamp,
      });
    }
  } catch {
    return null;
  }

  return null;
}

export function migrateLegacyGestures(legacyGestures) {
  if (!Array.isArray(legacyGestures)) return [];

  return legacyGestures
    .map((legacy) => {
      const rawFrames = legacy.isSequence && Array.isArray(legacy.sequence)
        ? legacy.sequence.map((hand, index) => ({ hands: [hand], timestamp: (legacy.timestamp || Date.now()) + index * 33 }))
        : [{ hands: [legacy.landmarks], timestamp: legacy.timestamp || Date.now() }];

      try {
        const sample = createGestureSample(rawFrames, {
          startedAt: legacy.timestamp || Date.now(),
          endedAt: (legacy.timestamp || Date.now()) + rawFrames.length * 33,
          allowShortSample: true,
        });

        return normalizeStoredGesture({
          id: legacy.id || createId('gesture'),
          name: legacy.name,
          createdAt: legacy.timestamp || Date.now(),
          updatedAt: legacy.timestamp || Date.now(),
          samples: [sample],
        });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function mergeGestureLists(currentGestures, incomingGestures) {
  const byName = new Map();

  for (const gesture of [...currentGestures, ...incomingGestures]) {
    const normalized = normalizeStoredGesture(gesture);
    if (!normalized || normalized.samples.length === 0) continue;

    const key = normalizeGestureName(normalized.name);
    const existing = byName.get(key);

    if (!existing) {
      byName.set(key, normalized);
      continue;
    }

    const knownSamples = new Set(existing.samples.map((sample) => sample.id));
    const mergedSamples = [
      ...existing.samples,
      ...normalized.samples.filter((sample) => !knownSamples.has(sample.id)),
    ];

    byName.set(key, {
      ...existing,
      updatedAt: Math.max(existing.updatedAt || 0, normalized.updatedAt || 0, Date.now()),
      samples: mergedSamples,
    });
  }

  return Array.from(byName.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function predictCustomGesture(rawHands, gestures, options = {}) {
  const frame = prepareRecordedFrame(rawHands);

  if (!frame || frame.quality < CUSTOM_GESTURE_CONFIG.LIVE_FRAME_QUALITY) {
    liveFrames = [];
    stableHistory = pushStableHistory(null);
    return null;
  }

  liveFrames.push(frame);
  if (liveFrames.length > CUSTOM_GESTURE_CONFIG.MAX_LIVE_FRAMES) {
    liveFrames.shift();
  }

  const ranked = rankCustomGestures(frame, liveFrames, gestures);
  if (!ranked) {
    stableHistory = pushStableHistory(null);
    return null;
  }

  const threshold = options.threshold ?? CUSTOM_GESTURE_CONFIG.CUSTOM_CONFIDENCE_THRESHOLD;
  const margin = options.margin ?? CUSTOM_GESTURE_CONFIG.CUSTOM_CONFIDENCE_MARGIN;

  if (ranked.confidence < threshold || ranked.margin < margin) {
    stableHistory = pushStableHistory(null);
    return null;
  }

  stableHistory = pushStableHistory(ranked.gesture.id);
  const stableCount = stableHistory.filter((id) => id === ranked.gesture.id).length;
  if (ranked.confidence < 0.92 && stableCount < 2) {
    return null;
  }

  return formatCustomPrediction(ranked);
}

function rankCustomGestures(currentFrame, frameWindow, gestures) {
  const candidates = [];
  const normalizedGestures = (gestures || []).map(normalizeStoredGesture).filter(Boolean);

  for (const gesture of normalizedGestures) {
    for (const sample of gesture.samples) {
      const candidate = scoreSample(currentFrame, frameWindow, gesture, sample);
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.confidence - a.confidence);
  const [best, second] = candidates;
  return {
    ...best,
    margin: best.confidence - (second?.confidence || 0),
  };
}

function scoreSample(currentFrame, frameWindow, gesture, sample) {
  if (!sample.centroid || !sample.featureFrames?.length) return null;

  const handPenalty = getHandPenalty(currentFrame.handCount, sample.handCount);
  if (handPenalty < 0.65) return null;

  const isDynamic = sample.movementScore >= CUSTOM_GESTURE_CONFIG.STATIC_MOVEMENT_THRESHOLD;
  let distance;

  if (isDynamic && frameWindow.length >= CUSTOM_GESTURE_CONFIG.MIN_SAMPLE_FRAMES) {
    const liveFeatureFrames = resampleFeatureFrames(
      frameWindow.map((frame) => frame.features),
      sample.featureFrames.length
    );
    distance = dtwDistance(liveFeatureFrames, sample.featureFrames);
  } else {
    distance = frameDistance(currentFrame.features, sample.centroid);
  }

  const rejectDistance = isDynamic ? 0.42 : 0.5;
  const confidence = clamp(1 - distance / rejectDistance, 0, 1);
  const qualityBoost = 0.88 + currentFrame.quality * 0.06 + (sample.qualityScore || 0.7) * 0.06;
  const finalConfidence = clamp(confidence * handPenalty * qualityBoost, 0, 1);

  return {
    gesture,
    sample,
    confidence: finalConfidence,
    distance,
    isDynamic,
  };
}

function formatCustomPrediction(result) {
  const frameCount = result.sample.framesCount || result.sample.frames?.length || 0;

  return {
    gesture: `custom:${result.gesture.id}`,
    arabic: result.gesture.name,
    emoji: '🧠',
    outputText: result.gesture.name,
    description: `إشارة مخصصة محفوظة من ${frameCount} إطار`,
    category: 'custom',
    confidence: roundScore(result.confidence),
    customGestureId: result.gesture.id,
    sampleId: result.sample.id,
    source: 'custom',
    timestamp: Date.now(),
  };
}

function buildFrameFeatures(rawHands) {
  const features = new Array(FEATURE_LENGTH).fill(0);
  const hands = sortHands(rawHands);
  let offset = 0;

  for (let handIndex = 0; handIndex < MAX_HANDS; handIndex++) {
    const hand = hands[handIndex];
    if (!hand) {
      offset += LANDMARKS_PER_HAND * AXES_PER_LANDMARK;
      continue;
    }

    const box = getHandBox(hand);
    for (const point of hand.slice(0, LANDMARKS_PER_HAND)) {
      features[offset++] = clamp((point.x - box.centerX) / box.scale, -2, 2);
      features[offset++] = clamp((point.y - box.centerY) / box.scale, -2, 2);
      features[offset++] = clamp((point.z || 0) / box.scale, -2, 2);
    }
  }

  const firstWrist = hands[0]?.[0];
  const secondWrist = hands[1]?.[0];
  features[offset++] = hands.length / MAX_HANDS;
  features[offset++] = secondWrist ? clamp(secondWrist.x - firstWrist.x, -1, 1) : 0;
  features[offset++] = secondWrist ? clamp(secondWrist.y - firstWrist.y, -1, 1) : 0;
  features[offset++] = secondWrist ? clamp((secondWrist.z || 0) - (firstWrist.z || 0), -1, 1) : 0;

  return features;
}

function resampleFeatureFrames(frames, targetLength) {
  const validFrames = (frames || []).filter((frame) => Array.isArray(frame) && frame.length === FEATURE_LENGTH);
  if (validFrames.length === 0) return [];
  if (validFrames.length === targetLength) return validFrames.map((frame) => [...frame]);

  const output = [];
  for (let i = 0; i < targetLength; i++) {
    const sourceIndex = targetLength === 1
      ? 0
      : Math.round((i * (validFrames.length - 1)) / (targetLength - 1));
    output.push([...validFrames[sourceIndex]]);
  }
  return output;
}

function meanVector(frames) {
  const validFrames = (frames || []).filter((frame) => Array.isArray(frame) && frame.length === FEATURE_LENGTH);
  const result = new Array(FEATURE_LENGTH).fill(0);
  if (validFrames.length === 0) return result;

  for (const frame of validFrames) {
    for (let i = 0; i < FEATURE_LENGTH; i++) {
      result[i] += frame[i];
    }
  }

  return result.map((value) => value / validFrames.length);
}

function getMovementScore(frames) {
  if (!frames || frames.length < 2) return 0;
  const distances = [];
  for (let i = 1; i < frames.length; i++) {
    distances.push(frameDistance(frames[i - 1], frames[i]));
  }
  return average(distances);
}

function frameDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum / a.length);
}

function dtwDistance(aFrames, bFrames) {
  const a = aFrames || [];
  const b = bFrames || [];
  if (a.length === 0 || b.length === 0) return 1;

  const previous = new Array(b.length + 1).fill(Infinity);
  const current = new Array(b.length + 1).fill(Infinity);
  previous[0] = 0;

  for (let i = 1; i <= a.length; i++) {
    current[0] = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = frameDistance(a[i - 1], b[j - 1]);
      current[j] = cost + Math.min(previous[j], current[j - 1], previous[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
      current[j] = Infinity;
    }
  }

  return previous[b.length] / (a.length + b.length);
}

function getHandPenalty(currentHandCount, sampleHandCount) {
  if (currentHandCount === sampleHandCount) return 1;
  if (sampleHandCount === 2 && currentHandCount < 2) return 0.6;
  return 0.84;
}

function pushStableHistory(value) {
  const next = [...stableHistory, value].slice(-3);
  return next;
}

function mode(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 1;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function roundScore(value) {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
