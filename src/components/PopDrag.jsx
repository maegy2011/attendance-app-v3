import { useEffect } from 'react'

// v12.11.8 — تحريك النوافذ بضغطة طويلة (فوق/تحت): يعمل على كل dialog-box وكروت النوافذ
// ضغطة مطولة 450ms بدون تحرك = تفعيل السحب (مع اهتزاز) — الإفلات ينهي — الأزرار والحقول مستثناة
const CARD_SEL = '.dialog-box, div.fixed.inset-0.flex.items-center.justify-center > div'
const NO_DRAG = 'button,input,select,textarea,canvas,a,[contenteditable="true"]'

export default function PopDrag() {
  useEffect(() => {
    let timer = null, armed = null, lastY = 0, dy = 0, sx = 0, sy = 0
    const findCard = (t) => {
      try {
        const el = t?.closest ? t.closest(CARD_SEL) : null
        if (!el) return null
        if (el.closest('.fixed.inset-0')?.className?.includes('z-[999')) return null
        if (el.closest('.fixed.inset-0')?.className?.includes('z-[100')) return null
        return el
      } catch { return null }
    }
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const card = findCard(e.target)
      if (!card) return
      if (e.target?.closest?.(NO_DRAG)) return
      sx = e.clientX; sy = e.clientY
      clearTimeout(timer)
      timer = setTimeout(() => {
        armed = card
        dy = 0
        lastY = sy
        try { navigator.vibrate && navigator.vibrate(15) } catch {}
        card.style.transition = 'none'
        card.style.cursor = 'grabbing'
        card.style.touchAction = 'none'
        card.style.userSelect = 'none'
        card.style.webkitUserSelect = 'none'
      }, 450)
      const cancel = (ev) => {
        if (!armed && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) clearTimeout(timer)
      }
      const up = () => {
        clearTimeout(timer)
        if (armed) { armed.style.cursor = ''; armed.style.touchAction = ''; armed.style.userSelect = ''; armed.style.webkitUserSelect = ''; armed = null }
        window.removeEventListener('pointermove', cancel)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', cancel)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }
    const move = (e) => {
      if (!armed) return
      dy += e.clientY - lastY
      lastY = e.clientY
      const max = window.innerHeight * 0.35
      dy = Math.min(max, Math.max(-max, dy))
      armed.style.transform = `translateY(${dy}px)`
    }
    const upAll = () => { clearTimeout(timer); if (armed) { armed.style.cursor = ''; armed.style.touchAction = ''; armed.style.userSelect = ''; armed.style.webkitUserSelect = ''; armed = null } }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', upAll)
    document.addEventListener('pointercancel', upAll)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', upAll)
      document.removeEventListener('pointercancel', upAll)
    }
  }, [])
  return null
}
