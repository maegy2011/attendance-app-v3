# HR Assist — Overtime & Attendance App | تطبيق الحضور والإضافي

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-7-119eff?logo=capacitor&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android-blue)

> Arabic-first (RTL) attendance / overtime tracker. Works as a web app and as an Android app. All data stays on-device — no backend, no account, offline-first.
>
> تطبيق عربي (RTL) لتسجيل الحضور وحساب الإضافي. يعمل كتطبيق ويب وكتطبيق أندرويد. كل البيانات على جهازك — بدون سيرفر، بدون حساب، ويعمل بدون إنترنت.

---

## 🇬🇧 English

### ✨ Features

- 🕐 **Daily check-in / check-out** — 3 shifts + official hours, editable times
- 💰 **Overtime engine** — overtime, tardiness, lunch & bonus calculations with configurable rates and multipliers (Friday / Saturday / holiday)
- 🏖️ **Leaves** — vacations, permits, alternate & rest days with yearly balances
- 📊 **Stats dashboard** — monthly/yearly summaries
- 📄 **PDF export** — Arabic shaping via `arabic-persian-reshaper` + `jspdf-autotable` (vacations, alt-days, extra hours, tardies)
- 🔔 **Local notifications / reminders** — shift reminders via Capacitor Local Notifications
- 🔒 **PIN lock** — hashed PIN, encrypted backup/restore, auto-backup to file
- 🎨 **Theming** — color boards, home themes, photo header, splash + onboarding disclaimer gate
- 📴 **Offline-first** — HashRouter (works from `file://` / WebView), localStorage + Capacitor Preferences/Filesystem

### 🛠️ Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, React Router 7 (HashRouter), Tailwind CSS 3 |
| Build | Vite 6 |
| Mobile | Capacitor 7 (Android): Filesystem / Preferences / Share / Local-Notifications |
| PDF | jspdf + jspdf-autotable + arabic-persian-reshaper |

### 🚀 Getting started

Requirements: **Node 18+** (20 LTS recommended).

```bash
npm install
npm run dev      # web dev server
npm run build    # production build → dist/
npm run preview  # preview the build
```

### 📱 Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android   # open in Android Studio → Run / Build APK
```

Config: `capacitor.config.json` (`appId: com.overtime.clock`, `webDir: dist`).

### 📁 Project structure

```
index.html
src/
  main.jsx            # entry
  App.jsx             # router + providers + gates (PIN, disclaimer, splash)
  components/         # Layout, dialogs, Toast, PinLock, Splash, AutoBackup, …
  pages/              # HomeNew, Records, AltDays, Vacations, Permits, Stats, Settings
  contexts/           # AttendanceContext, SettingsContext
  hooks/              # usePinArea
  utils/              # storage, calculations, shifts, vacationLogic, pdfExport, notify, …
public/               # static assets (logos)
android/              # Capacitor native shell (open with Android Studio)
```

Data keys (localStorage): see `src/utils/storage.js` (`att_*`). No server calls.

### 📜 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve `dist/` locally |

### 🔐 Privacy / security notes

- Everything is stored locally on the device. Uninstall = data loss unless you exported a backup from Settings.
- PIN is hashed (see `src/utils/pinCrypto.js`); backups can be encrypted.
- Before publishing a fork, check `android/app/src/main/...` for any hardcoded package name / keys and rotate them.

---

## 🇪🇬 العربية

### ✨ المميزات

- 🕐 **تسجيل الحضور والانصراف يوميًا** — 3 ورديات + المواعيد الرسمية، مع إمكانية تعديل الأوقات
- 💰 **حساب الإضافي** — حساب الساعات الإضافية والتأخير والوجبة والمكافأة بنسب قابلة للتعديل (الجمعة / السبت / الأعياد)
- 🏖️ **الإجازات** — إجازات سنوية، أذونات، وأيام بديلة وراحات مع الأرصدة السنوية
- 📊 **لوحة الإحصائيات** — ملخصات شهرية وسنوية
- 📄 **تصدير PDF** — دعم تشكيل الحروف العربية عبر `arabic-persian-reshaper` + `jspdf-autotable` (إجازات، أيام بديلة، إضافي، تأخيرات)
- 🔔 **تنبيهات محلية** — تذكيرات بالورديات عبر إشعارات Capacitor
- 🔒 **قفل برقم سري** — الرقم مخزّن مشفّر (hash)، نسخ احتياطي مشفّر واستعادة، ونسخ تلقائي لملف
- 🎨 **تخصيص الشكل** — لوحات ألوان، ثيمات للرئيسية، صورة للهيدر، شاشة افتتاحية وبوابة إخلاء المسؤولية
- 📴 **يعمل بدون إنترنت** — كل البيانات على جهازك (localStorage + Capacitor)، بدون سيرفر وبدون حساب

### 🛠️ التقنيات المستخدمة

| الطبقة | الاختيار |
|---|---|
| الواجهة | React 19 + React Router 7 (HashRouter) + Tailwind CSS 3 |
| البناء | Vite 6 |
| الموبايل | Capacitor 7 (أندرويد): ملفات / تفضيلات / مشاركة / إشعارات |
| PDF | ‏jspdf + ‏jspdf-autotable + ‏arabic-persian-reshaper |

### 🚀 التشغيل

المتطلبات: **Node 18+** (يُفضّل 20 LTS).

```bash
npm install
npm run dev      # سيرفر التطوير
npm run build    # بناء النسخة النهائية ← dist/
npm run preview  # معاينة النسخة النهائية
```

### 📱 نسخة الأندرويد

```bash
npm run build
npx cap sync android
npx cap open android   # يفتح Android Studio ← تشغيل / بناء APK
```

الإعدادات: `capacitor.config.json` (‏`appId: com.overtime.clock`‏، ‏`webDir: dist`‏).

### 📁 هيكل المشروع

```
index.html
src/
  main.jsx            # نقطة الدخول
  App.jsx             # الراوتر + المزوّدات + البوابات (PIN، إخلاء، افتتاحية)
  components/         # التخطيط، الحوارات، التنبيهات، القفل، الافتتاحية، النسخ التلقائي، …
  pages/              # الرئيسية، السجلات، الأيام البديلة، الإجازات، الأذونات، الإحصائيات، الإعدادات
  contexts/           # سياق الحضور، سياق الإعدادات
  hooks/              # usePinArea
  utils/              # التخزين، الحسابات، الورديات، منطق الإجازات، تصدير PDF، التنبيهات، …
public/               # صور ثابتة (شعارات)
android/              # غلاف Capacitor الأصلي (يُفتح بـ Android Studio)
```

مفاتيح البيانات (localStorage): راجع `src/utils/storage.js` (‏`att_*`‏). لا توجد أي اتصالات بسيرفر.

### 📜 الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | سيرفر التطوير |
| `npm run build` | بناء النسخة النهائية |
| `npm run preview` | معاينة مجلد `dist/` محليًا |

### 🔐 الخصوصية والأمان

- كل البيانات مخزنة على جهازك فقط. حذف التطبيق = ضياع البيانات إلا لو صدّرت نسخة احتياطية من الإعدادات.
- الرقم السري مخزّن مشفّر (راجع `src/utils/pinCrypto.js`)، والنسخ الاحتياطي يمكن تشفيره.
- قبل نشر نسخة معدّلة (fork)، راجع `android/app/src/main/...` وتأكد من عدم وجود أسماء حزم أو مفاتيح خاصة بك.

---

## 🤝 Contributing | المساهمة

PRs welcome. Keep it simple: fork → branch → `npm run build` passes → PR with screenshots for UI changes.

المساهمات مرحّب بها. باختصار: fork ← فرع جديد ← تأكد أن `npm run build` ينجح ← PR مع صور للتغييرات المرئية.

## 📄 License | الرخصة

MIT — see [LICENSE](LICENSE).
