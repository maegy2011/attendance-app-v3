// utils/leaveCounts.js — التعديل 23 نقطة 4 (v12.8.10) + التعديل 24 (التصفير السنوي)
// المصدر الوحيد لعدادات الإجازات: صفحتا الإجازات والبديلة (الخانات + الجداول)
// + بند 4 في «مخزن السجلات المركزي» (getLeaveBalances) + المنع والرسايل
// التعديل 24: التسوية per-year (كل سنة قافلة على نفسها) — الجداول سجل تاريخي (كل السنين متسددة ومدمجة)
// والعدادات/الخانات سنة حالية فقط — المستخدم و«يسدد بـ» من التسوية المحسوبة مش الخام

import { recalcVacations } from './vacationLogic'
import { getDerivedAltDays, getAltStats } from './altDays'

const LEAVE_TYPES = ['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special']

// خام الإجازات من السجلات (مشترك بين النطاق السنوي والتاريخي)
function buildRawLeaves(records, leavesStored, year) {
  const raw = []
  for (const [dk, rec] of Object.entries(records || {})) {
    if (year && !dk.startsWith(String(year))) continue
    const dc = rec.dayCalculation || rec.dayType || ''
    if (LEAVE_TYPES.includes(dc)) {
      const meta = (leavesStored || []).find(l => l.date === dk)
      raw.push({
        id: dk, date: dk, type: dc, paidBy: meta?.paidBy || null,
        selfService: !!meta?.selfService, notes: meta?.notes || rec?.notes || '',
        specialLabel: rec?.specialLabel || '', _convertedFromRest: meta?._convertedFromRest || false,
      })
    }
  }
  return raw
}

// البدائل المستحقة لسنة معينة (مشتق أو محفوظ — نفس قاعدة الصفحة)
function eligibleForYear(records, altDaysStored, minH, year) {
  const derived = getDerivedAltDays(records || {}, altDaysStored, minH).filter(a => a.date.startsWith(String(year)))
  if (derived.length) return derived.filter(a => a.selfService)
  return (altDaysStored || []).filter(a => a.selfService && String(a.date).startsWith(String(year)))
}

// قايمة الإجازات المعروضة: year معينة → تسوية السنة فقط | null → كل سنة متسددة لوحدها ومدمجة (سجل تاريخي)
// التعديل 24: التسوية جوه نفس السنة فقط (recalcVacations بسقف السنة) — كل سنة قافلة على نفسها
function settleYear(records, leavesStored, altDaysStored, settings, year) {
  const raw = buildRawLeaves(records, leavesStored, year)
  if (raw.length === 0) {
    return (leavesStored || []).filter(l => String(l.date).startsWith(String(year)))
  }
  const minH = settings?.altDayMinHours || 6
  return recalcVacations(eligibleForYear(records, altDaysStored, minH, year), raw, settings || {})
}

export function computeDisplayLeaves(records, leavesStored, altDaysStored, settings, year) {
  try {
    if (year) return settleYear(records, leavesStored, altDaysStored, settings, year)
    // تاريخي: كل السنوات الموجودة في السجلات والتخزين — كل سنة تسوية مستقلة ثم دمج مرتب
    const years = new Set()
    for (const dk of Object.keys(records || {})) years.add(dk.slice(0, 4))
    for (const l of (leavesStored || [])) if (l?.date) years.add(String(l.date).slice(0, 4))
    if (years.size === 0) return leavesStored || []
    const all = []
    for (const y of [...years].sort()) all.push(...settleYear(records, leavesStored, altDaysStored, settings, y))
    return all.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  } catch { return leavesStored || [] }
}

// عدادات الأنواع من القايمة المعروضة (نفس حسبة خانات Vacations.jsx)
export function countLeaveTypes(displayLeaves, settings, altTotal) {
  const list = displayLeaves || []
  const annualTotal = Number(settings?.annualLeaveBalance || 0) || 0
  const sickTotal = Number(settings?.sickLeaveBalance || 0) || 0
  const annualUsed = list.filter(l => l.type === 'regular_vacation').length
  const sickUsed = list.filter(l => l.type === 'sick').length
  const restUsed = list.filter(l => l.type === 'rest_day').length
  const unpaidUsed = list.filter(l => l.type === 'unpaid').length
  const specialCount = list.filter(l => l.type === 'special').length
  return {
    annualTotal, sickTotal, altTotal: altTotal || 0,
    annualUsed, sickUsed, restUsed, unpaidUsed, specialCount,
    annualRemaining: Math.max(0, annualTotal - annualUsed),
    sickRemaining: Math.max(0, sickTotal - sickUsed),
    altRemaining: Math.max(0, (altTotal || 0) - restUsed),
  }
}

// حارس بدل الراحة (منقول من setDayTypeForDate): بديل مستحق قبل التاريخ فقط + تجاهل المعلق
// التعديل 24: بسقف السنة — بديل السنة اللي فاتت ميسمحش (التصفير السنوي)
export function checkRestDayAvailability(records, altDaysStored, dk, minHours) {
  const altMin = minHours || 6
  const y = dk.slice(0, 4)
  let altBefore = 0, usedBefore = 0
  for (const [k, rec] of Object.entries(records || {})) {
    if (!k.startsWith(y)) continue
    // المستخدم: كل بدل راحة قبل التاريخ في نفس السنة (مستقل عن شروط الأهلية — كما الأصل)
    if (rec?.dayCalculation === 'rest_day' && k < dk) usedBefore++
    if (rec?.dayStatus !== 'alt_day' || rec?.shift === 'no_task' || !rec?.checkIn || !rec?.checkOut) continue
    const hrs = Math.floor((new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000)
    if (hrs < altMin || k >= dk) continue
    const meta = (altDaysStored || []).find(a => a.date === k)
    if (meta?.selfService) altBefore++
  }
  const realRemaining = altBefore - usedBefore
  if (realRemaining > 0) return { ok: true, pendingIgnored: 0 }
  const pending = (altDaysStored || []).filter(a => !a.selfService && String(a.date).startsWith(y)).length
  return { ok: false, pendingIgnored: pending }
}

// الحزمة الكاملة: الجداول (displayLeaves) سجل تاريخي متسدد per-year — والعدادات/البديلة سنة حالية (أو سنة محددة)
// يقرا منها السياق والصفحات — التعديل 24: العدادات سنة حالية فقط (التصفير السنوي)
export function getLeaveCounts(records, leavesStored, altDaysStored, settings, year) {
  const displayLeaves = computeDisplayLeaves(records, leavesStored, altDaysStored, settings, year)
  const cy = year || new Date().getFullYear()
  const minH = settings?.altDayMinHours || 6
  const stats = getAltStats(records, altDaysStored, displayLeaves, minH, cy)
  const yearLeaves = displayLeaves.filter(l => String(l.date).startsWith(String(cy)))
  const counts = countLeaveTypes(yearLeaves, settings, stats.eligibleCount)
  return { displayLeaves, alt: stats, ...counts }
}
