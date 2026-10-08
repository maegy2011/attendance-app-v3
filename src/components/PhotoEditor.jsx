// v12.11.7 — محرر الصورة الشخصية الاحترافي: pinch + عجلة ماوس + تدوير + عكس + شبكة + معاينة دائرية (بلا مكتبات)
import { useState, useRef, useEffect, useCallback } from 'react'

const BOX = 280
const OUT = 512

export default function PhotoEditor({ src, onSave, onCancel }) {
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0) // 0/90/180/270
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const canvasRef = useRef(null)
  const prevRef = useRef(null)
  const imgRef = useRef(null)
  const st = useRef({ zoom: 1, rot: 0, flipH: false, flipV: false, pos: { x: 0, y: 0 } })
  st.current = { zoom, rot, flipH, flipV, pos }

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setNat({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.src = src
  }, [src])

  // الأبعاد الفعالة بعد التدوير (90/270 يبدّل العرض والطول)
  const effW = (rot % 180 === 0) ? nat.w : nat.h
  const effH = (rot % 180 === 0) ? nat.h : nat.w
  const base = effW && effH ? Math.max(BOX / effW, BOX / effH) : 1
  const dw = effW * base * zoom
  const dh = effH * base * zoom
  const limX = Math.max(0, (dw - BOX) / 2)
  const limY = Math.max(0, (dh - BOX) / 2)
  const cx = Math.min(limX, Math.max(-limX, pos.x))
  const cy = Math.min(limY, Math.max(-limY, pos.y))

  const draw = useCallback(() => {
    const cv = canvasRef.current, img = imgRef.current
    if (!cv || !img || !nat.w) return
    const { zoom: z, rot: r, flipH: fh, flipV: fv, pos: p } = st.current
    const eW = (r % 180 === 0) ? img.naturalWidth : img.naturalHeight
    const eH = (r % 180 === 0) ? img.naturalHeight : img.naturalWidth
    const b = Math.max(BOX / eW, BOX / eH)
    const lx = Math.max(0, (eW * b * z - BOX) / 2)
    const ly = Math.max(0, (eH * b * z - BOX) / 2)
    const px = Math.min(lx, Math.max(-lx, p.x))
    const py = Math.min(ly, Math.max(-ly, p.y))
    const ctx = cv.getContext('2d')
    const dpr = 2
    if (cv.width !== BOX * dpr) { cv.width = BOX * dpr; cv.height = BOX * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, BOX, BOX)
    ctx.save()
    ctx.translate(BOX / 2 + px, BOX / 2 + py)
    ctx.rotate((r * Math.PI) / 180)
    ctx.scale(fh ? -1 : 1, fv ? -1 : 1)
    ctx.drawImage(img, (-img.naturalWidth * b * z) / 2, (-img.naturalHeight * b * z) / 2, img.naturalWidth * b * z, img.naturalHeight * b * z)
    ctx.restore()
    // المعاينة الدائرية (شكلها النهائي)
    const pv = prevRef.current
    if (pv) {
      const ps = 72
      if (pv.width !== ps * dpr) { pv.width = ps * dpr; pv.height = ps * dpr }
      const pctx = pv.getContext('2d')
      pctx.setTransform(1, 0, 0, 1, 0, 0)
      pctx.clearRect(0, 0, pv.width, pv.height)
      pctx.save()
      pctx.beginPath()
      pctx.arc((ps * dpr) / 2, (ps * dpr) / 2, (ps * dpr) / 2, 0, Math.PI * 2)
      pctx.clip()
      pctx.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, ps * dpr, ps * dpr)
      pctx.restore()
    }
  }, [nat])

  useEffect(() => { draw() }, [draw, zoom, rot, flipH, flipV, pos])

  const clampSet = (nx, ny) => setPos({ x: Math.min(limX, Math.max(-limX, nx)), y: Math.min(limY, Math.max(-limY, ny)) })

  // سحب بإصبع/ماوس + pinch بإصبعين
  const ptrs = useRef(new Map())
  const pinch = useRef(null)
  const onDown = (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return
    const prev = ptrs.current.get(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 1) {
      clampSet(pos.x + (e.clientX - prev.x), pos.y + (e.clientY - prev.y))
    } else if (ptrs.current.size === 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0) {
        const nz = Math.min(5, Math.max(1, pinch.current.zoom * (d / pinch.current.dist)))
        setZoom(Math.round(nz * 100) / 100)
      }
      // تحريك مع الـ pinch بمتوسط الحركة
      clampSet(pos.x + (e.clientX - prev.x) / 2, pos.y + (e.clientY - prev.y) / 2)
    }
  }
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) pinch.current = null
  }
  const onWheel = (e) => {
    e.preventDefault()
    const nz = Math.min(5, Math.max(1, Math.round((zoom * (e.deltaY < 0 ? 1.1 : 0.9)) * 100) / 100))
    setZoom(nz)
  }
  const reset = () => { setZoom(1); setRot(0); setFlipH(false); setFlipV(false); setPos({ x: 0, y: 0 }) }

  const save = () => {
    const cv = canvasRef.current
    if (!cv || !nat.w) return
    try {
      const c = document.createElement('canvas')
      c.width = OUT; c.height = OUT
      // القص = مربع المعاينة كاملًا (الرسم معمول عليه أصلًا)
      c.getContext('2d').drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, OUT, OUT)
      onSave(c.toDataURL('image/jpeg', 0.9))
    } catch {}
  }

  const tbtn = 'px-2 py-1.5 rounded-lg bg-slate-100 font-extrabold text-sm active:bg-slate-200'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-4 w-fit max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-extrabold text-slate-700 text-sm">📷 ضبط الصورة — اسحب أو قرّب بإصبعين</div>
          <canvas ref={prevRef} className="rounded-full border-2 border-slate-200" style={{ width: 44, height: 44 }} />
        </div>
        <div className="relative mx-auto touch-none select-none" style={{ width: BOX, height: BOX }}>
          <canvas
            ref={canvasRef}
            className="rounded-xl block"
            style={{ width: BOX, height: BOX, cursor: 'grab' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={onWheel} onDoubleClick={reset}
          />
          {/* شبكة الأثلاث */}
          <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
            <div className="absolute bg-white/40" style={{ left: '33.3%', top: 0, bottom: 0, width: 1 }} />
            <div className="absolute bg-white/40" style={{ left: '66.6%', top: 0, bottom: 0, width: 1 }} />
            <div className="absolute bg-white/40" style={{ top: '33.3%', left: 0, right: 0, height: 1 }} />
            <div className="absolute bg-white/40" style={{ top: '66.6%', left: 0, right: 0, height: 1 }} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className={tbtn} onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}>−</button>
          <input type="range" min="1" max="5" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
          <button className={tbtn} onClick={() => setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100))}>+</button>
          <span className="text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button className={tbtn + ' flex-1'} onClick={() => setRot((r) => (r + 90) % 360)} title="تدوير">🔄 90°</button>
          <button className={tbtn + ' flex-1'} onClick={() => setFlipH((v) => !v)} title="عكس أفقي">↔️</button>
          <button className={tbtn + ' flex-1'} onClick={() => setFlipV((v) => !v)} title="عكس رأسي">↕️</button>
          <button className={tbtn + ' flex-1'} onClick={() => clampSet(0, 0)} title="توسيط">🎯</button>
          <button className={tbtn + ' flex-1'} onClick={reset} title="إعادة">♻️</button>
        </div>
        
        <div className="flex gap-2 mt-2">
          <button onClick={save} className="btn btn-primary flex-1">✅ حفظ</button>
          <button onClick={onCancel} className="btn flex-1">❌ إلغاء</button>
        </div>
      </div>
    </div>
  )
}
