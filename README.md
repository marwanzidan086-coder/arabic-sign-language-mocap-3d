# 🤟 Arabic Sign Language Recognition & 3D MoCap System

[![Live Demo](https://img.shields.io/badge/Demo-Live%20on%20Vercel-black?style=for-the-badge&logo=vercel)](https://arabic-sign-mocap-3d.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/Google-MediaPipe-00897B?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFA611?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

An interactive, web-based system combining Artificial Intelligence (**Google MediaPipe Tasks Vision**), Real-time 3D Computer Graphics (**Three.js + VRM Avatars**), and Cloud Storage (**Google Firebase Firestore**) for real-time Arabic Sign Language recognition, custom gesture training, sign-to-text translation, and text-to-sign 3D avatar animation.

---

## 🌐 Live Demo

Experience the full application in your browser:  
👉 **[https://arabic-sign-mocap-3d.vercel.app](https://arabic-sign-mocap-3d.vercel.app)**

---

## ✨ Key Features

### 1. 🎓 Custom Gesture Trainer & Dataset Builder
- **3-Second Motion Recording:** Record sign samples directly from your webcam or an uploaded video file.
- **Intelligent Kinematic Matching:** Dynamic frame-by-frame distance and angular metrics for high-accuracy gesture classification (KNN / Heuristics).
- **Interactive Motion Playback:** Inspect and review recorded motion trajectories in an interactive 3D playback viewer.

### 2. 🤖 3D Avatar & Live Motion Capture (MoCap)
- **VRM 3D Avatar Integration:** Seamless loading and rigging of human avatars in VRM format (`avaturn_avatar.vrm`).
- **Full-Body Real-time Tracking:** Simultaneous tracking of facial expressions, blendshapes, hand landmarks, and body pose using your webcam.
- **Bone Rigger & Joint Inspector:** Visualize and calibrate bone hierarchies, angles, and constraints on the fly.

### 3. 💬 Real-Time Sign-to-Text Translator
- **Continuous Translation:** Instant recognition of signs and seamless concatenation into sentences and phrases in real time.
- **Quick Controls:** One-click copy translated text to clipboard or clear the stream.

### 4. 🎭 Text-to-Sign Playback
- Type Arabic words to have the 3D avatar automatically perform the corresponding sign language animations.

### 5. ☁️ Firebase Firestore Cloud Sync
- **Instant Cloud Persistence:** Every custom gesture, keyframe, and landmark dataset is automatically stored in Cloud Firestore (`custom_gestures` collection).
- **Cross-Device Synchronization:** Access trained gestures across multiple browsers and devices seamlessly.
- **JSON Export & Import:** Backup and restore gesture databases in portable JSON format.

---

## 🛠️ Tech Stack & Architecture

- **3D Engine:** [Three.js](https://threejs.org/) & [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- **Computer Vision & AI:** [Google MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker)
- **Cloud Database:** Google Firebase Cloud Firestore v10
- **Local Persistence:** Browser IndexedDB via `idb-keyval`
- **UI/UX Framework:** HTML5, Modern CSS Glassmorphism, FontAwesome Icons, Google Fonts (Cairo & Outfit)

---

## 🚀 Quick Start (Local Setup)

### 1. Clone the Repository
```bash
git clone https://github.com/marwanzidan086-coder/arabic-sign-language-mocap-3d.git
cd arabic-sign-language-mocap-3d
```

### 2. Run a Local Web Server
Since the project uses browser ES Modules and Web Workers, serve it over a local HTTP server:

```bash
# Using npx (Node.js)
npx serve .

# Or using Python 3
python -m http.server 8080
```

### 3. Open in Browser
Visit **`http://localhost:8080`** (or the URL shown in your terminal). Allow camera permissions when prompted.

---

## 📁 Project Structure

```text
├── index.html                 # Main application UI and 3D Viewport layout
├── style.css                  # Modern glassmorphic theme and layout styles
├── trainer.css                # Gesture trainer panel and modal styles
├── app.js                     # Core application bootstrap
├── viewport.js                # Three.js scene, lighting, camera, and VRM avatar loader
├── mocap-core.js              # MediaPipe pipeline initialization and frame dispatch
├── mocap-pose.js              # Pose and body landmark retargeting
├── mocap-constraints.js       # Joint angle limits and anatomical constraints
├── mocap-filters.js           # Low-pass and Euro filters for jitter reduction
├── mocap-recorder.js          # BVH / keyframe animation recorder
├── customGestureRecognizer.js # Geometric feature extraction and KNN classification
├── customGestureStore.js      # Hybrid IndexedDB + Firestore synchronization
├── firebase-db.js             # Firebase v10 SDK initialization and CRUD helpers
├── avaturn_avatar.vrm         # Default rigged 3D avatar model
└── vercel.json                # Vercel deployment and CORS/COOP configuration
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
