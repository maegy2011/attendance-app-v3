import { useState, useRef } from 'react'
import { ColorWheel, hslToHex } from './ColorWheel'

// التعديل ٩ (دورة جديدة): مولد الهارموني على الكبسولة الفاضية
// دايرة طيف باللمس + شريط أفقي N لون + سحب/أسهم لإعادة الترتيب + تطبيق = كارت مخصص
export function HarmonyGen({ board, slots, onApply, onClose, showToast }) {
  const N = slots.length
  const [hue, setHue] = useState(210)
  const [sat, setSat] = useState(85)
  const [invert, setInvert] = useState(false)
  const [custom, setCustom] = useState(null) // ترتيب يدوي بعد السحب
  const [dragFrom, setDragFrom] = useState(null)
  const [name, setName] = useState('')
  const stripRef = useRef(null)
  const LIGHT = 55

  const gen = Array.from({ length: N }, (_, i) => hslToHex(hue + (i * 360) / N, sat, LIGHT))
  const seq = invert ? [...gen].reverse() : gen
  const shown = custom || seq

  const moveColor = (from, to) => {
    if (from === to || from == null || to == null) return
    const arr = [...shown]
    const [c] = arr.splice(from, 1)
    arr.splice(to, 0, c)
    setCustom(arr)
  }

  const stripIdxFromX = (clientX) => {
    const el = stripRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const i = Math.floor(((clientX - r.left) / r.width) * N)
    return Math.max(0, Math.min(N - 1, i))
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={e => e.stopPropagation()} style={{ background: '#24282e', color: '#fff', maxWidth: '340px' }}>
        <h3 className="font-bold text-white mb-2 text-center">🎡 مولد الألوان — {board === 'home' ? 'الرئيسية' : 'البرنامج'} ({N})</h3>
        <div className="flex justify-center mb-2">
          <ColorWheel size={200} initial={shown[0]} onPick={(hex, h, s) => { setHue(h); setSat(s); setCustom(null) }} />
        </div>
        <div ref={stripRef}
          onTouchMove={e => { if (dragFrom != null) moveColor(dragFrom, stripIdxFromX(e.touches[0].clientX)) }}
          onTouchEnd={() => setDragFrom(null)}
          className="flex rounded-xl overflow-hidden mb-1 border border-white/20" style={{ touchAction: 'none' }}>
          {shown.map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-stretch"
              onTouchStart={() => setDragFrom(i)}
              style={{ background: c, minHeight: '52px' }}>
              <span className="text-center font-mono font-bold" dir="ltr" style={{ fontSize: '8px', color: '#fff', textShadow: '0 1px 2px #000' }}>{c}</span>
              <div className="flex justify-between px-0.5 mt-auto">
                <button onClick={(e) => { e.stopPropagation(); moveColor(i, i - 1) }} className="font-black" style={{ fontSize: '12px', color: '#fff', textShadow: '0 1px 2px #000' }}>‹</button>
                <button onClick={(e) => { e.stopPropagation(); moveColor(i, i + 1) }} className="font-black" style={{ fontSize: '12px', color: '#fff', textShadow: '0 1px 2px #000' }}>›</button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-slate-300 mb-2" style={{ fontSize: '11px' }}>اسحب اللون يمين/شمال لتغيير مكانه</p>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => { setInvert(v => !v); setCustom(null) }}
            className="flex-1 p-2 rounded-xl border border-white/20 font-bold text-sm text-white">🔄 عكس الترتيب</button>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم الكارت"
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm font-bold text-white" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!shown.length) return; onApply(shown, (name || '').trim()); }} className="flex-1 p-2 rounded-xl bg-blue-600 text-white font-bold text-sm">✅ إنشاء الكارت</button>
          <button onClick={onClose} className="p-2 rounded-xl border border-white/20 font-bold text-sm text-slate-300">إلغاء</button>
        </div>
      </div>
    </div>
  )
}
