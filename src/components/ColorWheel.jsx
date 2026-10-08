import { useState, useRef } from 'react'

// التعديل ١١ (دورة جديدة): دايرة الطيف المشتركة — للمولد + محرر كل خانة
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return ('#' + to(f(0)) + to(f(8)) + to(f(4))).toUpperCase()
}

export function hexToHsl(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec((hex || '').trim())
  if (!m) return { h: 210, s: 85, l: 55 }
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = mx - mn
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (mx === r) h = ((g - b) / d) % 6
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: Math.round(((h * 60) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function ColorWheel({ size = 200, initial = '#2563eb', onPick }) {
  const start = hexToHsl(initial)
  const [hue, setHue] = useState(start.h)
  const [sat, setSat] = useState(start.s)
  const ref = useRef(null)

  const pick = (clientX, clientY) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const h = (Math.atan2(dx, -dy) * 180) / Math.PI
    const nh = (h + 360) % 360
    const ns = Math.max(0, Math.min(100, Math.round((dist / (r.width / 2)) * 100)))
    setHue(nh)
    setSat(ns)
    if (onPick) onPick(hslToHex(nh, ns, 55), nh, ns)
  }

  const dotR = 42
  const dotA = (hue * Math.PI) / 180
  const dotX = 50 + dotR * (sat / 100) * Math.sin(dotA)
  const dotY = 50 - dotR * (sat / 100) * Math.cos(dotA)

  return (
    <div ref={ref}
      onTouchStart={e => pick(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={e => { e.preventDefault(); pick(e.touches[0].clientX, e.touches[0].clientY) }}
      onMouseDown={e => pick(e.clientX, e.clientY)}
      onMouseMove={e => { if (e.buttons) pick(e.clientX, e.clientY) }}
      className="relative rounded-full shrink-0"
      style={{
        width: size + 'px', height: size + 'px', touchAction: 'none', cursor: 'pointer',
        background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 26%), conic-gradient(from 0deg, #ff0000, #ff8000, #ffff00, #80ff00, #00ff00, #00ff80, #00ffff, #0080ff, #0000ff, #8000ff, #ff00ff, #ff0080, #ff0000)',
      }}>
      <div className="absolute w-5 h-5 rounded-full border-2 border-white shadow"
        style={{ left: `calc(${dotX}% - 10px)`, top: `calc(${dotY}% - 10px)`, background: hslToHex(hue, sat, 55), pointerEvents: 'none' }} />
    </div>
  )
}
