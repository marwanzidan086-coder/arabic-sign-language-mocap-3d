import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Configuration from User Project
export const firebaseConfig = {
  apiKey: "AIzaSyCxtBpajLnxHFwPbSm1aE97yTqb24MQ3LU",
  authDomain: "studio-7899538852-726c8.firebaseapp.com",
  projectId: "studio-7899538852-726c8",
  storageBucket: "studio-7899538852-726c8.firebasestorage.app",
  messagingSenderId: "324027755184",
  appId: "1:324027755184:web:bc71fe636909ec9f55a975"
};

// Initialize Firebase App & Firestore
let app = null;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("[Firebase] Firestore Initialized successfully for project:", firebaseConfig.projectId);
} catch (e) {
  console.error("[Firebase] Initialization error:", e);
}

export { app, db };
export const GESTURES_COLLECTION = "custom_gestures";

/**
 * Save / Update a single gesture document in Cloud Firestore
 */
export async function saveGestureToFirestore(gesture) {
  if (!db || !gesture || !gesture.id) return;
  try {
    const docRef = doc(db, GESTURES_COLLECTION, gesture.id);
    await setDoc(docRef, gesture, { merge: true });
    console.log(`[Firebase Cloud] Saved gesture: "${gesture.name}" (${gesture.id})`);
  } catch (err) {
    console.warn("[Firebase Cloud] Could not save single gesture:", err);
  }
}

/**
 * Batch Save / Update all gestures to Cloud Firestore
 */
export async function saveAllGesturesToFirestore(gestures) {
  if (!db || !Array.isArray(gestures) || gestures.length === 0) return;
  try {
    const batch = writeBatch(db);
    gestures.forEach((gesture) => {
      if (gesture && gesture.id) {
        const docRef = doc(db, GESTURES_COLLECTION, gesture.id);
        batch.set(docRef, gesture, { merge: true });
      }
    });
    await batch.commit();
    console.log(`[Firebase Cloud] Synced ${gestures.length} gestures to cloud`);
  } catch (err) {
    console.warn("[Firebase Cloud] Batch sync error:", err);
  }
}

/**
 * Load all gestures from Cloud Firestore
 */
export async function loadGesturesFromFirestore() {
  if (!db) return [];
  try {
    const colRef = collection(db, GESTURES_COLLECTION);
    const snapshot = await getDocs(colRef);
    const cloudGestures = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.name) {
        cloudGestures.push(data);
      }
    });
    console.log(`[Firebase Cloud] Loaded ${cloudGestures.length} gestures from cloud`);
    return cloudGestures;
  } catch (err) {
    console.warn("[Firebase Cloud] Could not load gestures from Firestore:", err);
    return [];
  }
}

/**
 * Delete a single gesture from Cloud Firestore
 */
export async function deleteGestureFromFirestore(gestureId) {
  if (!db || !gestureId) return;
  try {
    const docRef = doc(db, GESTURES_COLLECTION, gestureId);
    await deleteDoc(docRef);
    console.log(`[Firebase Cloud] Deleted gesture ${gestureId} from cloud`);
  } catch (err) {
    console.warn("[Firebase Cloud] Could not delete gesture:", err);
  }
}

/**
 * Clear all gestures in Cloud Firestore
 */
export async function clearAllGesturesFromFirestore() {
  if (!db) return;
  try {
    const colRef = collection(db, GESTURES_COLLECTION);
    const snapshot = await getDocs(colRef);
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    console.log("[Firebase Cloud] Cleared all cloud gestures");
  } catch (err) {
    console.warn("[Firebase Cloud] Could not clear all gestures:", err);
  }
}
