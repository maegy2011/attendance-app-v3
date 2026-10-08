// منطق التأخيرات الموحد — التعديل 19 (v12.8.8): الرئيسية والإحصائيات نفس الحسبة
// المرجع الصح = لوحة التأخيرات (شرايح): 0-15→0 | 16-30→1 | 31-45→2 | فوق 45→0

export function getWeekendDays(settings) {
  return (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]
}

export function getShiftStartMin(settings, shift) {
  const s = settings[shift] || settings.shift1 || { start: '08:00' }
  const [h, m] = (s.start || '08:00').split(':').map(Number)
  return h * 60 + m
}

// الفرق الخام (دقايق الحضور - بداية الوردية) — سالب/صفر يعني مش متأخر
// يرجع 0 للحالات المستثناة (ويك إند/إجازة/مفيش حضور/حالة مش يوم عادي)
export function getRawLateMin(records, settings, dk) {
  const weekendDays = getWeekendDays(settings)
  const dow = new Date(dk).getDay()
  if (weekendDays.includes(dow)) return 0
  const rec = (records || {})[dk]
  if (!rec?.checkIn) return 0
  const dc = rec.dayCalculation || rec.dayType || ''
  if (['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special', 'weekend_rest'].includes(dc)) return 0
  const ds = rec.dayStatus || ''
  if (ds !== 'normal_day' && ds !== '') return 0
  const shift = rec.shift || rec.dayType
  // التعديل ٢٥: مفيش وردية متسجلة = مفيش تأخير (اتقفل القياس على الأولى)
  if (!['shift1', 'shift2', 'shift3'].includes(shift)) return 0
  const workStartMin = getShiftStartMin(settings, shift)
  const ci = new Date(rec.checkIn)
  return ci.getHours() * 60 + ci.getMinutes() - workStartMin
}

// عدد التأخيرات بنفس شرايح الجدول
export function getTardinessCount(records, settings, dk) {
  const late = getRawLateMin(records, settings, dk)
  if (late <= 15) return 0
  if (late <= 30) return 1
  if (late <= 45) return 2
  return 0
}

// هل فيه إذن تأخير مسجل بتاريخ معين؟ (الكشف في جدول التصاريح)
export function hasLatePermit(permitsList, dk) {
  try { return (permitsList || []).some(p => p && p.date === dk && p.type === 'late') }
  catch { return false }
}
