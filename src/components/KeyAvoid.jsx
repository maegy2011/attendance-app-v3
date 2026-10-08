import { useEffect } from 'react'

// v12.11.11 — البوب أب يطلع فوق الكيبورد بمسافة ثابتة ويرجع بعد القفل
// يقيس ارتفاع الكيبورد من visualViewport ويحطه في --kb → الـ CSS يرفع النوافذ
export default function KeyAvoid() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      try {
        const kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
        document.documentElement.style.setProperty('--kb', kb > 150 ? Math.round(kb + 16) + 'px' : '0px')
      } catch {}
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      try { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) } catch {}
      try { document.documentElement.style.setProperty('--kb', '0px') } catch {}
    }
  }, [])
  return null
}
