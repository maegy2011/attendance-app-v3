import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAttendance } from '../contexts/AttendanceContext'
import { useSettings } from '../contexts/SettingsContext'
import { buildNotices, getReadIds, markRead, markAllRead } from '../utils/notices'
import { getPlan, isSnoozed } from '../utils/planWeek'

// v12.9.50: الجرس العائم اتشال نهائيًا — الجرس في الرئيسية الجديدة فقط (حدث open-notices)
// v12.9.49: اللوحة popup وسط صغير
export default function NoticesCenter() {
  const { records } = useAttendance()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)

  const openBox = () => {
    try {
      const list = buildNotices(records || {}, settings || {})
      markAllRead(list.map(n => n.id))
    } catch {}
    setOpen(true)
  }

  useEffect(() => {
    const h = () => { openBox(); setTick(t => t + 1) }
    // v12.10: بدء/انتهاء دورة التخطيط يصحي القايمة فورًا
    const p = () => setTick(t => t + 1)
    window.addEventListener('open-notices', h)
    window.addEventListener('plan-changed', p)
    return () => { window.removeEventListener('open-notices', h); window.removeEventListener('plan-changed', p) }
  }, [])

  const notices = useMemo(() => buildNotices(records || {}, settings || {}), [records, settings, tick])

  const goNotice = (n) => {
    try { markRead(n.id) } catch {}
    setOpen(false)
    setTick(t => t + 1)
    // تعديل ٢: بند التخطيط يفتح الـ popup من جديد (ويكسر الغفوة)
    if (n.id && String(n.id).startsWith('plan-')) { try { window.dispatchEvent(new Event('open-plan')) } catch {} }
    // تعديل ١٠: أثناء الحبسة الجرس للعرض فقط — لا تنقل (بند التخطيط استثناء: يفتح الـ popup)
    try { if (getPlan() && !isSnoozed()) return } catch {}
    if (n.route) { try { navigate(n.route) } catch {} }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-3xl w-full max-w-sm max-h-[60vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-extrabold text-slate-800">🔔 الإشعارات ({notices.length})</h3>
          <button onClick={() => setOpen(false)} className="text-slate-400 font-black text-xl px-2">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {notices.length === 0 && <p className="text-center text-slate-400 text-sm py-6">✅ كله تمام — مفيش تنبيهات</p>}
          {notices.map(n => (
            <button key={n.id} onClick={() => goNotice(n)}
              className="w-full text-right p-3 rounded-xl border-2 border-slate-100 hover:border-blue-300 bg-slate-50 flex items-center gap-3">
              <span className="text-2xl">{n.icon}</span>
              <span className="flex-1">
                <span className="block font-bold text-sm text-slate-800">{n.text}</span>
                {n.sub ? <span className="block text-xs text-slate-500">{n.sub}</span> : null}
              </span>
              <span className="text-blue-600 font-black">‹</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
