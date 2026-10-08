import { useState } from 'react'

// التعديل 26: قايمة منسدلة مخصوصة بدل قايمة النظام — منقولة من Records.jsx بالنص (مصدر واحد للسجلات والرئيسية)
export default function CardSelect({ btnClass, options, value, onPick, disabled, dropKey, openKey, setOpenKey }) {
  const [pos, setPos] = useState(null)
  const open = openKey === dropKey
  const cur = (options || []).find(o => o.value === value)
  const toggle = (e) => {
    if (disabled) return
    if (open) { setOpenKey(null); return }
    try {
      const r = e.currentTarget.getBoundingClientRect()
      const isCell = (btnClass || '').includes('claw-pick')
      const rowH = isCell ? 34 : 37
      const estH = Math.min((options || []).length * rowH + 8, 248)
      let top = r.bottom + 4
      if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 4)
      // v12.11.35 (بند 1): القايمة 150 وتتحرك يمين — متطلعش بره حرف الشاشة أبدًا
      if (isCell) { const w = 150; setPos({ top, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), width: w }) }
      else { const w = Math.max(r.width, 170); setPos({ top, left: Math.max(8, r.right - w), width: w }) }
    } catch { setPos(null) }
    setOpenKey(dropKey)
  }
  return (<>
    <button disabled={disabled} onClick={toggle} className={btnClass + ' w-full flex items-center justify-center gap-1 px-2 py-1.5' + (disabled ? ' opacity-50' : '')}>
      <span className="truncate">{cur ? cur.label : '—'}</span><span className="text-[10px] shrink-0">▼</span>
    </button>
    {open && pos && (<>
      <div className="fixed inset-0 z-[60]" onClick={() => setOpenKey(null)} />
      <div className="fixed z-[61] bg-white rounded-xl border-2 border-slate-300 shadow-xl overflow-hidden" style={pos.left != null ? { top: pos.top, left: pos.left, width: pos.width } : { top: pos.top, right: pos.right, width: pos.width, maxWidth: 280 }}>
        <div className="max-h-[240px] overflow-y-auto py-1">
          {(options || []).map(o => (
            <button key={o.value} onClick={() => { setOpenKey(null); onPick(o.value) }} className={`w-full text-right px-3 py-2 text-xs font-bold ${o.value === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}>
              {o.value === value ? '✓ ' : ''}{o.label}
            </button>
          ))}
        </div>
      </div>
    </>)}
  </>)
}
