# HR Assist — Overtime & Attendance App (تطبيق الحضور والإضافي)

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-7-119eff?logo=capacitor&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android-blue)

> Arabic-first (RTL) attendance / overtime tracker. Works as a web app and as an Android app. All data stays on-device — no backend, no account, offline-first.

## ✨ Features

- 🕐 **Daily check-in / check-out** — 3 shifts + official hours, editable times
- 💰 **Overtime engine** — overtime, tardiness, lunch & bonus calculations with configurable rates and multipliers (Friday / Saturday / holiday)
- 🏖️ **Leaves** — vacations, permits, alternate & rest days with yearly balances
- 📊 **Stats dashboard** — monthly/yearly summaries
- 📄 **PDF export** — Arabic shaping via `arabic-persian-reshaper` + `jspdf-autotable` (vacations, alt-days, extra hours, tardies)
- 🔔 **Local notifications / reminders** — shift reminders via Capacitor Local Notifications
- 🔒 **PIN lock** — hashed PIN, encrypted backup/restore, auto-backup to file
- 🎨 **Theming** — color boards, home themes, photo header, splash + onboarding disclaimer gate
- 📴 **Offline-first** — HashRouter (works from `file://` / WebView), localStorage + Capacitor Preferences/Filesystem

## 🛠️ Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, React Router 7 (HashRouter), Tailwind CSS 3 |
| Build | Vite 6 |
| Mobile | Capacitor 7 (Android): Filesystem / Preferences / Share / Local-Notifications |
| PDF | jspdf + jspdf-autotable + arabic-persian-reshaper |

## 🚀 Getting started

Requirements: **Node 18+** (20 LTS recommended).

```bash
npm install
npm run dev      # web dev server
npm run build    # production build → dist/
npm run preview  # preview the build
```

## 📱 Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android   # open in Android Studio → Run / Build APK
```

Config: `capacitor.config.json` (`appId: com.overtime.clock`, `webDir: dist`).

## 📁 Project structure

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

## 📜 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve `dist/` locally |

## 🔐 Privacy / security notes

- Everything is stored locally on the device. Uninstall = data loss unless you exported a backup from Settings.
- PIN is hashed (see `src/utils/pinCrypto.js`); backups can be encrypted.
- Before publishing a fork, check `android/app/src/main/...` for any hardcoded package name / keys and rotate them.

## 🤝 Contributing

PRs welcome. Keep it simple: fork → branch → `npm run build` passes → PR with screenshots for UI changes.

## 📄 License

MIT — see [LICENSE](LICENSE).
