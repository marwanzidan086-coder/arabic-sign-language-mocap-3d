# 🤟 Arabic Sign Language Recognition & 3D MoCap System
### نظام التعرف وتدريب لغة الإشارة العربية والتقاط الحركة 3D للأفاتار

مشروع ويب متكامل وتفاعلي يجمع بين الذكاء الاصطناعي (MediaPipe Tasks Vision) والرسوميات ثلاثية الأبعاد (Three.js + VRM) للتعرف على لغة الإشارة العربية، تدريب إشارات وحركات مخصصة، ترجمة الإشارة لنص، تشغيل الإشارات المكتوبة على أفاتار 3D، ومزامنة البيانات سحابياً عبر **Google Firebase Firestore**.

---

## ✨ المميزات الرئيسية (Key Features)

1. **مدرب الإشارات المخصصة (Custom Gesture Trainer):**
   - تسجيل عينات حركية من كاميرا الويب أو ملف فيديو لمدة 3 ثوانٍ.
   - خوارزمية ذكية لمقارنة المسافات والزوايا وحساب جودة الإشارة (Frame Quality & Proximity).
   - عرض العينات وتشغيلها في مشغل تفاعلي (Playback Modal).

2. **الأفاتار ثلاثي الأبعاد وتتبع الحركة المباشر (3D Avatar & Live MoCap):**
   - تحميل وتحريك أفاتار بشري بصيغة VRM (`avaturn_avatar.vrm`).
   - تتبع كامل للوجه واليدين وحركة الجسم في الوقت الفعلي عبر كاميرا الويب.
   - محرر العظام والمفاصل (Bone Rigger & Joint Inspector).

3. **مترجم الإشارات المباشر (Live Sign-to-Text Translator):**
   - التعرف اللحظي على الإشارات وتجميع الكلمات لتكوين جمل ونصوص في الوقت الحقيقي.
   - إمكانية نسخ النص المترجم أو مسحه بضغطة زر.

4. **تشغيل الإشارة على الأفاتار (Text-to-Sign Playback):**
   - كتابة الكلمة ليقوم الأفاتار بتمثيل الحركة تلقائياً.

5. **المزامنة السحابية (Firebase Firestore Cloud Sync):**
   - حفظ فوري لأي إشارة أو عينة مسجلة في قاعدة بيانات سحابية.
   - إمكانية استيراد وتصدير مجموعات البيانات بصيغة JSON.

---

## 🛠️ التقنيات المستخدمة (Tech Stack)

* **3D Graphics & Engine:** Three.js, `@pixiv/three-vrm`
* **Computer Vision & AI:** Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)
* **Cloud Database:** Firebase Cloud Firestore
* **Local Storage:** IndexedDB (`idb-keyval`)
* **UI/UX:** HTML5, Modern Vanilla CSS with Glassmorphism, FontAwesome, Cairo & Outfit Typography

---

## 🚀 طريقة التشغيل المحلي (Quick Start)

1. **استنساخ المستودع (Clone):**
   ```bash
   git clone https://github.com/marwanzidan/arabic-sign-language-mocap.git
   cd arabic-sign-language-mocap
   ```

2. **تشغيل خادم محلي (Local Server):**
   يمكنك استخدام أي سيرفر محلي (Static Server)، على سبيل المثال:
   ```bash
   # باستخدام npx
   npx serve .
   
   # أو باستخدام Python
   python -m http.server 8080
   ```

3. افتح المتصفح على الرابط:
   `http://localhost:8080` (أو الرابط الذي يظهره السيرفر).

---

## 📜 الترخيص (License)
هذا المشروع مفتوح المصدر ومتاح تحت ترخيص **MIT License**.
