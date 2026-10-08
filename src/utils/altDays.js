// utils/altDays.js — التعديل 23 نقطة 2 (v12.8.10) + التعديل 24 (التصفير السنوي)
// المصدر الوحيد لحسبة الأيام البديلة: صفحة البديلة (الخانات + الجدول)
// + صفحة الإجازات (التسديد) + كارت الرئيسية — بدل 3 نسخ منفصلة
// التعديل 24: (أ) سقف السنة — الخانات سنة حالية فقط والجدول سجل تاريخي (ب) المستخدم و«يسدد بـ» من التسوية المحسوبة مش التخزين الخام

// القايمة المشتقة من السجلات (نفس شروط AltDays.jsx الأصلية بالحرف)
export function getDerivedAltDays(records, storedAlt, minHours) {
  try {
    const recs = records || {}
    const list = []
    const minH = minHours || 6
    for (const [dk, rec] of Object.entries(recs)) {
      if (!rec?.checkIn || !rec?.checkOut) continue
      if (rec.dayStatus !== 'alt_day') continue
      if (rec.shift === 'no_task') continue
      const hrs = Math.floor((new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000)
      if (hrs < minH) continue
      const meta = (storedAlt || []).find(a => a.date === dk)
      list.push({ date: dk, selfService: !!meta?.selfService, notes: meta?.notes || '', hrs })
    }
    return list.sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

// القايمة المعروضة: المشتقة لو موجودة — وإلا المحفوظة يدوياً (نفس fallback الأصلي)
export function getDisplayAltDays(records, storedAlt, minHours) {
  const derived = getDerivedAltDays(records, storedAlt, minHours)
  if (derived.length) return derived
  return (storedAlt || []).map(a => ({ date: a.date, selfService: !!a.selfService, notes: a.notes || '', hrs: null }))
}

// الإحصائيات الكاملة: مستحق/مستخدم/الباقي (سنة حالية فقط — التعديل 24) + تواريخ التسديد
// settledLeaves = القايمة بعد التسوية (displayLeaves) — مش التخزين الخام (التعديل 24: سبب «الكارت مش بيقرا»)
export function getAltStats(records, storedAlt, settledLeaves, minHours, year) {
  try {
    const y = year || new Date().getFullYear()
    const display = getDisplayAltDays(records, storedAlt, minHours).filter(a => a.date.startsWith(String(y)))
    const eligibleCount = display.filter(a => a.selfService).length
    const paid = (settledLeaves || []).filter(l => l?.type === 'rest_day' && l?.paidBy && String(l.date).startsWith(String(y)))
    const usedCount = paid.length
    const paidByDates = paid
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(l => ({ leaveDate: l.date, altDate: l.paidBy }))
    return {
      display,
      eligibleCount,
      usedCount,
      remainingCount: Math.max(0, eligibleCount - usedCount),
      totalCount: display.length,
      paidByDates,
    }
  } catch {
    return { display: [], eligibleCount: 0, usedCount: 0, remainingCount: 0, totalCount: 0, paidByDates: [] }
  }
}
