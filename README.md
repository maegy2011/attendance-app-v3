# HR Assist — Overtime & Attendance App (تطبيق الحضور والإضافي)

Arabic-first (RTL) attendance / overtime tracker built with **React + Vite + Tailwind + Capacitor**. Works as a web app and as an Android app. All data stays on-device (localStorage + Capacitor Preferences/Filesystem) — no backend, no account.

## Features

- Daily check-in / check-out with shift support (3 shifts + official hours)
- Overtime, tardiness, lunch/bonus calculations with configurable rates
- Vacations, permits, alternate/rest days tracking
- Stats dashboard + PDF export (Arabic shaping via `arabic-persian-reshaper` + `jspdf-autotable`)
- Local notifications / reminders (Capacitor Local Notifications)
- PIN lock with encrypted backup/restore + auto-backup to file
- Theming (color boards, home themes, photo header), splash + onboarding disclaimer gate
- Offline-first, HashRouter (works from `file://` / WebView)

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, React Router 7 (HashRouter), Tailwind CSS 3 |
| Build | Vite 6 |
| Mobile | Capacitor 7 (Android), Filesystem / Preferences / Share / Local-Notifications |
| PDF | jspdf + jspdf-autotable + arabic-persian-reshaper |

## Getting started

Requirements: Node 18+ (20 LTS recommended).

```bash
npm install
npm run dev      # web dev server
npm run build    # production build → dist/
npm run preview  # preview the build
```

## Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android   # open in Android Studio → Run / Build APK
```

Config: `capacitor.config.json` (`appId: com.overtime.clock`, `webDir: dist`).

## Project structure

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

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve `dist/` locally |

## Privacy / security notes

- Everything is stored locally on the device. Uninstall = data loss unless you exported a backup from Settings.
- PIN is hashed (see `src/utils/pinCrypto.js`); backups can be encrypted.
- Before publishing a fork, check `android/app/src/main/...` for any hardcoded package name / keys and rotate them.

## Contributing

PRs welcome. Keep it simple: fork → branch → `npm run build` passes → PR with screenshots for UI changes.

## License

MIT — see [LICENSE](LICENSE).
