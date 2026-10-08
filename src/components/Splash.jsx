import { useEffect, useRef, useState } from 'react'
import { version } from '../../package.json'

// v12.5.11: شاشة الافتتاح — الحاوية بيضا معتمة من أول فريم (مفيش فلاش للرئيسية)
// اللوجو يظهر تدريجيًا (عادية 3 ثواني / أول تثبيت 2.5) + اختفاء ناعم — والدوس يعديها
export default function Splash({ onDone, fadeMs = 3000, totalMs = 3500 }) {
  const [logoVis, setLogoVis] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const finishRef = useRef(null)

  finishRef.current = () => {
    if (doneRef.current) return
    doneRef.current = true
    setLeaving(true)
    setTimeout(onDone, 350)
  }

  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setLogoVis(true)))
    const t = setTimeout(() => finishRef.current && finishRef.current(), totalMs)
    return () => { clearTimeout(t); cancelAnimationFrame(r) }
  }, [totalMs])

  return (
    <div
      onClick={() => finishRef.current && finishRef.current()}
      className={`fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center cursor-pointer transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <img
        src="splash-logo.jpg"
        alt="HR assist"
        className={`w-[200px] transition-opacity ${logoVis && !leaving ? 'opacity-100' : 'opacity-0'}`}
        style={{ transitionDuration: `${fadeMs}ms` }}
      />
      <div
        className="absolute bottom-12 inset-x-0 text-center text-xs text-slate-400"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        Amr Adel@2026 • v{version}
      </div>
    </div>
  )
}
