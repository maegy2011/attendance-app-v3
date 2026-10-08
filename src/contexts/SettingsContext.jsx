import { createContext, useContext, useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../utils/storage'
// التعديل ١٠: إصلاح ذاتي — مفعلة بلا رمز مخزن = حالة مستحيلة تُطفأ فورًا
import { pinExists } from '../utils/pinCrypto'
import { APP_THEME_COLORS, resolveAppTheme } from '../utils/themes'

const SettingsContext = createContext()

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const s = getSettings()
    try {
      if (s.pinEnabled && !pinExists()) {
        s.pinEnabled = false
        saveSettings(s)
        try { localStorage.setItem('pin_healed', '1') } catch {}
      }
    } catch {}
    return s
  })
  // v12.8.3 (التعديل ١٨): تطبيق الثيم المختار — settings.colors يُتجاهل نهائياً
  useEffect(() => {
    try {
      // التعديل ١٣ (دورة سادسة): حل الثيم المخصص (base للبوابة + دمج الـoverrides)
      const resolved = resolveAppTheme(settings.appTheme, settings.appCustomThemes, settings.appThemeOverrides)
      const t = resolved.colors || APP_THEME_COLORS.classic
      document.documentElement.dataset.apptheme = resolved.base || 'classic'
      const r = document.documentElement.style
      Object.entries(t).forEach(([k, v]) => { if (v) r.setProperty('--c-' + k, v) })
      try { const pc = settings.pageColors || {}; Object.entries(pc).forEach(([k, v]) => { if (v && /^#[0-9A-Fa-f]{6}$/.test(v)) r.setProperty('--c-hd_' + k, v) }) } catch {}
    } catch {}
  }, [settings.appTheme, settings.appCustomThemes, settings.appThemeOverrides, settings.pageColors])

  const updateSettings = (newSettings) => {
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
