import { useState, useRef, useCallback } from 'react'
import { getSettings } from '../utils/storage'
// إصلاح حرج v12.9.42: الفحص بـpinExists (متزامن) — getPin يقرأ النصي الذي أُزيل بعد التعديل ٩ فيُبطل الحماية صامتًا
import { pinExists } from '../utils/pinCrypto'

// v12.8.3 (بند ٣): فتح المنطقة مرة واحدة لكل جلسة تشغيل — يتصفر مع إعادة فتح البرنامج
const unlockedAreas = new Set()

export function isPinOn() {
  try { return getSettings().pinEnabled === true && pinExists() } catch { return false }
}

// تعديل ٥: قفل منفصل لكل منطقة — المربع المفتوح = حر حتى لو الحماية مفعلة
// (المالية تشمل الخاصة — وPDF يشمل النسخ — التجميع في شاشة الإعدادات)
export function isAreaLocked(area) {
  try {
    if (!isPinOn()) return false
    const pa = getSettings().pinAreas || {}
    return pa[area || 'records'] !== false
  } catch { return false }
}

// request(area, fn): لو الرمز مطفي أو المنطقة مفتوحة → ينفذ فوراً — غير كده يفتح البوابة وينفذ بعد النجاح
export function usePinArea() {
  const [gate, setGate] = useState({ open: false, title: '' })
  const pending = useRef(null)

  const request = useCallback((area, title, fn) => {
    if (typeof title === 'function') { fn = title; title = '' }
    // تعديل ٥: المنطقة المفتوحة من القايمة = تنفيذ فوري بلا بوابة
    if (!isAreaLocked(area) || unlockedAreas.has(area)) { fn(); return }
    pending.current = { area, fn }
    setGate({ open: true, title })
  }, [])

  const handleSuccess = useCallback(() => {
    const p = pending.current
    pending.current = null
    setGate({ open: false, title: '' })
    if (p) { unlockedAreas.add(p.area); p.fn() }
  }, [])

  const handleClose = useCallback(() => {
    pending.current = null
    setGate({ open: false, title: '' })
  }, [])

  return { gate, request, handleSuccess, handleClose }
}
