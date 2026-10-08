import { useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { ColorWheel } from './ColorWheel'

// v12.11.20 تعديل 3 — تبويب الثيم: اليمين أسماء الصفحات + تعديل/حفظ/حذف/افتراضي — الشمال دايرة كبيرة في popup
const PAGES = [
  { k: 'home', label: 'الرئيسية', def: '#4EBBCA' }, // v12.11.21 تعديل 6: الرئيسية قابلة للتعديل زي الباقي
  { k: 'records', label: 'السجلات', def: '#1668A8' },
  { k: 'vac', label: 'الإجازات', def: '#2596BE' },
  { k: 'perm', label: 'التصاريح', def: '#1F6FB5' },
  { k: 'alt', label: 'البديلة', def: '#178A84' },
  { k: 'stats', label: 'الإحصائيات', def: '#147A70' },
  { k: 'set', label: 'الإعدادات', def: '#2C5F8A' },
]

export default function ThemeTab() {
  const { settings, updateSettings } = useSettings()
  const pc = settings.pageColors || {}
  const [popup, setPopup] = useState(null) // {k, draft}
  const cur = (p) => (pc[p.k] || p.def).toUpperCase()
  const saveRow = (k, hex) => {
    const t = (hex || '').trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(t)) return
    updateSettings({ ...settings, pageColors: { ...pc, [k]: t } })
  }
  const clearRow = (k) => {
    const next = { ...pc }
    delete next[k]
    updateSettings({ ...settings, pageColors: next })
  }
  return (
    <div className="space-y-2">
      {/* v12.11.22 تعديل 7: الاسم فقط + الألوان صف واحد وتحتها الأسماء — الضغط على اللون يفتح التعديل */}
      <div className="card" style={{ padding: '10px' }}>
        {/* v12.11.23 تعديل 10: الاسم والرمز يمين */}
        <h3 className="font-bold text-slate-700 mb-2 text-right">🎨 ألوان</h3>
        <div className="flex gap-2 overflow-x-auto justify-between">
          {PAGES.map(p => (
            <button key={p.k} onClick={() => setPopup({ k: p.k, draft: cur(p) })} className="flex flex-col items-center gap-1 min-w-[44px]">
              <span className="inline-block w-10 h-10 rounded-full border-2 border-slate-300 shadow" style={{ background: cur(p) }} />
              <span className="text-[10px] font-bold text-slate-700 leading-tight text-center">{p.label}</span>
            </button>
          ))}
        </div>
        {Object.keys(pc).length > 0 && (
          <button onClick={() => updateSettings({ ...settings, pageColors: {} })}
            className="w-full mt-2 py-1.5 text-xs font-extrabold rounded-xl bg-slate-200 text-slate-700">↩️ رجوع الكل للافتراضي</button>
        )}
      </div>
      {popup && (() => {
        const p = PAGES.find(x => x.k === popup.k)
        const valid = /^#[0-9A-Fa-f]{6}$/.test(popup.draft.trim())
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPopup(null)}>
            <div className="card w-full max-w-sm" style={{ padding: '14px' }} onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-slate-700 mb-2 text-sm text-center">🎨 لون صفحة {p.label}</h3>
              <div className="flex justify-center">
                <ColorWheel size={250} initial={cur(p)} onPick={(h) => setPopup({ ...popup, draft: h })} />
              </div>
              <input value={popup.draft} onChange={e => setPopup({ ...popup, draft: e.target.value.toUpperCase() })} dir="ltr" maxLength={7}
                className="w-full mt-3 p-2 border-2 border-slate-200 rounded-lg font-bold text-sm bg-white text-center" placeholder="#000000" />
              <div className="mt-2 h-12 rounded-xl border border-slate-200"
                style={{ background: valid ? popup.draft.trim() : cur(p) }} />
              <div className="flex gap-2 mt-3">
                <button disabled={!valid}
                  onClick={() => { saveRow(popup.k, popup.draft); setPopup(null) }}
                  className="btn btn-primary flex-1 py-2.5 text-sm font-extrabold disabled:opacity-40">💾 حفظ</button>
                <button onClick={() => setPopup(null)}
                  className="flex-1 py-2.5 text-sm font-extrabold rounded-xl bg-slate-200 text-slate-700">إلغاء</button>
              </div>
              {(settings.pageColors || {})[popup.k] && (
                <button onClick={() => { clearRow(popup.k); setPopup(null) }}
                  className="w-full mt-2 py-2 text-xs font-extrabold rounded-xl bg-red-100 text-red-700">🗑️ حذف — رجوع للافتراضي</button>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
