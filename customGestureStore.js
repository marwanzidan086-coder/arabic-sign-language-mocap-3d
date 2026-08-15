import { del, get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { CUSTOM_GESTURE_CONFIG, migrateLegacyGestures, mergeGestureLists, normalizeStoredGesture } from './customGestureRecognizer.js';
import { DEFAULT_PRETRAINED_GESTURES } from './default-signs-dataset.js';
import { 
  saveAllGesturesToFirestore, 
  loadGesturesFromFirestore, 
  clearAllGesturesFromFirestore, 
  deleteGestureFromFirestore,
  saveGestureToFirestore 
} from './firebase-db.js';

export async function loadCustomGestures() {
  const localStored = await loadFromIndexedDb();
  let localNormalized = localStored.map(normalizeStoredGesture).filter(Boolean);

  if (localNormalized.length === 0) {
    const legacy = loadLegacyGestures();
    if (legacy.length > 0) {
      localNormalized = legacy;
    } else {
      localNormalized = DEFAULT_PRETRAINED_GESTURES;
    }
    await set(CUSTOM_GESTURE_CONFIG.STORAGE_KEY, localNormalized);
  } else {
    // Merge pre-trained standard gestures if not already present
    localNormalized = mergeGestureLists(DEFAULT_PRETRAINED_GESTURES, localNormalized);
    await set(CUSTOM_GESTURE_CONFIG.STORAGE_KEY, localNormalized);
  }

  // Attempt to sync and fetch from Firebase Cloud
  try {
    const cloudGestures = await loadGesturesFromFirestore();
    if (cloudGestures && cloudGestures.length > 0) {
      const merged = mergeGestureLists(localNormalized, cloudGestures);
      await set(CUSTOM_GESTURE_CONFIG.STORAGE_KEY, merged);
      // Sync back any local gestures that cloud didn't have
      saveAllGesturesToFirestore(merged);
      return merged;
    }
  } catch (err) {
    console.warn("[Firebase] Could not fetch from cloud at startup:", err);
  }

  // If cloud is empty or new, sync existing local items to cloud
  if (localNormalized.length > 0) {
    saveAllGesturesToFirestore(localNormalized);
  }

  return localNormalized;
}

export async function saveCustomGestures(gestures) {
  const normalized = (gestures || []).map(normalizeStoredGesture).filter(Boolean);
  await set(CUSTOM_GESTURE_CONFIG.STORAGE_KEY, normalized);
  
  // Sync to Firebase Cloud Firestore asynchronously
  saveAllGesturesToFirestore(normalized);
  
  return normalized;
}

export async function saveSingleGesture(gesture) {
  const normalized = normalizeStoredGesture(gesture);
  if (!normalized) return;
  saveGestureToFirestore(normalized);
}

export async function deleteCustomGesture(gestureId) {
  deleteGestureFromFirestore(gestureId);
}

export async function clearCustomGestures() {
  await del(CUSTOM_GESTURE_CONFIG.STORAGE_KEY);
  try {
    localStorage.removeItem(CUSTOM_GESTURE_CONFIG.LEGACY_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures
  }
  clearAllGesturesFromFirestore();
}

export function parseImportedGestures(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const gestures = Array.isArray(parsed) ? parsed : parsed?.gestures;

  if (!Array.isArray(gestures)) {
    throw new Error('ملف التدريب غير صالح. يجب أن يحتوي على قائمة gestures.');
  }

  return gestures.map(normalizeStoredGesture).filter((gesture) => gesture && gesture.samples.length > 0);
}

export function buildExportPayload(gestures) {
  return {
    schemaVersion: 2,
    app: 'tarjuman',
    exportedAt: new Date().toISOString(),
    gestures: (gestures || []).map(normalizeStoredGesture).filter(Boolean),
    notes: 'Dataset محلي وسحابي تم تصديره من قاعدة بيانات Firebase.',
  };
}

export function mergeImportedWithCurrent(currentGestures, importedGestures) {
  return mergeGestureLists(currentGestures, importedGestures);
}

async function loadFromIndexedDb() {
  try {
    const stored = await get(CUSTOM_GESTURE_CONFIG.STORAGE_KEY);
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function loadLegacyGestures() {
  try {
    const raw = localStorage.getItem(CUSTOM_GESTURE_CONFIG.LEGACY_STORAGE_KEY);
    if (!raw) return [];
    return migrateLegacyGestures(JSON.parse(raw));
  } catch {
    return [];
  }
}
