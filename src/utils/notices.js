import { getLeavesV2, getAltDays, getPermitsV2 } from './storage'
import { getPlan, planProgress } from './planWeek'
import { getTardinessCount, hasLatePermit } from './tardiness'
import { calculateMonthly, getShiftFromRecord } from './calculations'
import { parseTimeToMin } from './permits'

// التعديل ٤+٥: الجرس الشامل — 12 بندًا (1+4+5+6 صادقة + 7-15 مضافة) — 2 الرصيد + 3 البديلة محذوفتان
const READ_KEY = 'att_read_notices'
const BACKUP_FLAG = 'lastAutoBackup'

export function getReadIds() {
  try { const a = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
export function markRead(id) {
  try {
    const a = getReadIds()
    if (!a.includes(id)) { a.push(id); localStorage.setItem(READ_KEY, JSON.stringify(a.slice(-100))) }
  } catch {}
}
export function markAllRead(ids) {
  try {
    const a = new Set(getReadIds())
    ids.forEach(id => a.add(id))
    localStorage.setItem(READ_KEY, JSON.stringify([...a].slice(-100)))
  } catch {}
}

// التعديل ٤ (ب): ختم تاريخ النسخة (يدوي + تلقائي — نفس المفتاح)
export function stampBackupNow() {
  try { localStorage.setItem(BACKUP_FLAG, new Date().toISOString()) } catch {}
}
function lastBackupRaw(settings) {
  try { return localStorage.getItem(BACKUP_FLAG) || settings.lastAutoBackup || '' } catch { return settings.lastAutoBackup || '' }
}

const todayKey = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}
const pad2 = (n) => String(n).padStart(2, '0')
const toMin = (t) => { try { return parseTimeToMin(t) } catch { return null } }

import { getDisplayAltDays } from './altDays'
import { computeDisplayLeaves } from './leaveCounts'
export function buildNotices(records, settings) {
// v12.11 — الجرس مراية المواصفة الجديدة (18 نقطة): نفس النصوص + نفس المفاتيح — القديم اتلغى كله
  const out = []
  const recs = records || {}
  const S = settings || {}
  const B = (n) => { try { const k = 'notifB' + n; if (S[k] === undefined) return true; return !!S[k] } catch { return true } }
  const tk = todayKey()
  const ym = tk.slice(0, 7)
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const permits = (() => { try { return getPermitsV2() } catch { return [] } })()
  const todayRec = recs[tk] || {}
  const hasIn = !!todayRec.checkIn, hasOut = !!todayRec.checkOut
  let dc = todayRec.dayCalculation || todayRec.dayType || ''
  if (dc === 'shift1' || dc === 'shift2' || dc === 'shift3' || dc === 'no_task') dc = ''
  const isPresentDay = (dc === '' || dc === 'present')
  let shiftRaw = todayRec.shift || ''
  if (!shiftRaw && ['shift1', 'shift2', 'shift3', 'no_task'].includes(todayRec.dayType)) shiftRaw = todayRec.dayType
  const offStart = S.officialStart || '08:00', offEnd = S.officialEnd || '15:00'
  const startStr = ['shift1', 'shift2', 'shift3'].includes(shiftRaw) ? ((S[shiftRaw] && S[shiftRaw].start) || '08:00') : (shiftRaw === 'no_task' ? offStart : null)
  const endStr = ['shift1', 'shift2', 'shift3'].includes(shiftRaw) ? ((S[shiftRaw] && S[shiftRaw].end) || '17:00') : (shiftRaw === 'no_task' ? offEnd : null)
  const sLabel = ['shift1', 'shift2', 'shift3'].includes(shiftRaw) ? ({ shift1: 'الأولى', shift2: 'الثانية', shift3: 'الثالثة' }[shiftRaw]) : (shiftRaw === 'no_task' ? 'الرسمية' : '')

  // B1 — حضور / انصراف / نسيت الحضور / نسيت الانصراف (النهاردة)
  try {
    if (B(1) && isPresentDay && startStr && !hasIn) out.push({ id: 'att-today', icon: '⏰', text: `سجّل حضور ${tk} — الوردية ${sLabel} ${startStr}`, sub: '', route: '/' })
    if (B(1) && isPresentDay && endStr && hasIn && !hasOut) out.push({ id: 'lv-today', icon: '🚶', text: `سجّل انصراف ${tk} — الوردية تنتهي ${endStr}`, sub: '', route: '/' })
    if (B(1) && isPresentDay && startStr && !hasIn) {
      const sm = toMin(startStr)
      if (sm != null && nowMin >= sm + 60) out.push({ id: `missin-${tk}`, icon: '⚠️', text: `فات معاد حضور ${tk} بساعة ولسه متسجلش — سجّل الحضور`, sub: '', route: '/' })
    }
    if (B(1) && isPresentDay && endStr && hasIn && !hasOut) {
      let em = toMin(endStr); if (em === 0) em = 24 * 60
      if (em != null && nowMin >= em + 60) out.push({ id: `missout-${tk}`, icon: '⚠️', text: `فات معاد انصراف ${tk} بساعة ولسه مفتوح — سجّل الانصراف`, sub: '', route: '/' })
    }
  } catch {}
  // B1 — التخطيط ناقص
  try {
    if (B(1)) {
      const plan = getPlan()
      if (plan) {
        const pr = planProgress(recs, plan)
        if (pr.pendingCount > 0) out.push({ id: `plan-${plan.weekId}`, icon: '📋', text: `سجّل نظام عمل الأسبوع الجاي — باقي ${pr.pendingCount} أيام — من التخطيط`, sub: '', route: '/' })
      }
    }
  } catch {}
  // B2 — تصاريح مفتوحة (بانتظار العودة + تجاوز الساعتين)
  try {
    if (B(2)) {
      const open = permits.filter(x => x && x.exitTime && !x.returnTime)
      const lbl = { special: 'تصريح خاص', personal: 'تصريح شخصي', late: 'إذن تأخير', early: 'انصراف مبكر' }
      for (const p of open.slice(0, 5)) out.push({ id: `pend-${p.id}`, icon: '⏳', text: `سجّل عودة تصريح ${lbl[p.type] || 'تصريح'} — خروج ${p.exitTime || ''} — ${p.date || ''}`, sub: '', route: '/permits' })
      for (const p of open.filter(x => x.type === 'special' && String(x.date || '') === tk)) {
        const em = toMin(p.exitTime)
        if (em != null && nowMin - em >= 120) { out.push({ id: `over2h-${tk}`, icon: '⏰', text: `تصريحك تجاوز ساعتين — خروج ${p.exitTime} — سجّل العودة (${p.date})`, sub: '', route: '/permits' }); break }
      }
    }
  } catch {}
  // B3 — الأرصدة (نفس قواعد الملخص) + المعلقة (عدد)
  try {
    if (B(3)) {
      const cYear = String(now.getFullYear())
      const storedAlt = (() => { try { return getAltDays() } catch { return [] } })()
      let dLv = []
      try { dLv = computeDisplayLeaves(recs, (() => { try { return getLeavesV2() } catch { return [] } })(), storedAlt, S, null) } catch { dLv = [] }
      const yl = dLv.filter(l => String(l.date || '').startsWith(cYear))
      const annualTotal = Number(S.annualLeaveBalance || 0), sickTotal = Number(S.sickLeaveBalance || 0)
      const annualUsed = yl.filter(l => l.type === 'regular_vacation').length
      const sickUsed = yl.filter(l => l.type === 'sick').length
      const unpaidUsed = yl.filter(l => l.type === 'unpaid').length
      const specialUsed = yl.filter(l => l.type === 'special').length
      let altEligible = 0
      try { altEligible = getDisplayAltDays(recs, storedAlt, S.altDayMinHours || 6).filter(a => String(a.date || '').startsWith(cYear)).length } catch {}
      const restUsed = yl.filter(l => l.type === 'rest_day').length
      const bits = [`اعتيادي: المتبقي ${Math.max(0, annualTotal - annualUsed)} من ${annualTotal}`, `بدل راحة: المتبقي ${Math.max(0, altEligible - restUsed)} من ${altEligible}`]
      if (sickUsed > 0) bits.push(`مرضي: المتبقي ${Math.max(0, sickTotal - sickUsed)} من ${sickTotal}`)
      if (unpaidUsed > 0) bits.push(`بدون أجر: اتاخد ${unpaidUsed} يوم`)
      if (specialUsed > 0) bits.push(`خاصة: اتاخد ${specialUsed} يوم`)
      out.push({ id: `bal-${cYear}`, icon: '📊', text: bits.join(' | '), sub: 'ملخص الأرصدة الأسبوعي — الخميس 10ص', route: '/vacations' })
      const pendL = dLv.filter(l => !l.selfService).length
      let pendA = 0
      try { pendA = getDisplayAltDays(recs, storedAlt, S.altDayMinHours || 6).filter(a => !a.selfService).length } catch {}
      if (pendL > 0) out.push({ id: `pendlv-${ym}`, icon: '📌', text: `إجازات محتاجة خدمة ذاتية: ${pendL}`, sub: 'scan الأحد والتلات 9ص', route: '/vacations' })
      if (pendA > 0) out.push({ id: `pendalt-${ym}`, icon: '📌', text: `أيام بديلة محتاجة خدمة ذاتية: ${pendA}`, sub: 'scan الأحد والتلات 9ص', route: '/alt' })
    }
  } catch {}
  // B6 — أرقام تقرير الأسبوع (الشهر الحالي)
  try {
    if (B(6)) {
      const m = calculateMonthly(recs, S, `${ym}-01`, tk)
      const otH = Math.round((m.totalOvertimeHours || 0) * 100) / 100
      const otPay = Math.round(m.totalOvertime || 0)
      let bonusDays = 0
      for (const d of (m.days || [])) { if ((d.bonusValue || 0) > 0) bonusDays++ }
      let tc = 0, ign = 0
      for (const dk of Object.keys(recs)) {
        if (!dk.startsWith(ym)) continue
        try { if ((getTardinessCount(recs, S, dk) || 0) > 0 && !hasLatePermit(permits, dk)) tc++ } catch {}
        try {
          const r2 = recs[dk]
          const dc2 = r2?.dayCalculation || r2?.dayType || ''
          if (dk < tk && !['regular_vacation', 'rest_day', 'weekend_rest', 'sick', 'unpaid', 'special', 'no_task'].includes(dc2) && (!r2?.checkIn || !r2?.checkOut)) ign++
        } catch {}
      }
      let sp = 0
      for (const p of permits) { if (p?.type === 'special' && String(p.date || '').startsWith(ym)) sp++ }
      out.push({ id: `wk-${ym}`, icon: '📊', text: `إضافي: ${otH} ساعة (${otPay} جنيه) | مكافأة: ${bonusDays} | تأخيرات: ${tc} | متجاهلة: ${ign} | تصاريح خاصة: ${sp}`, sub: 'تقرير الأحد 11ص', route: '/stats' })
    }
  } catch {}
  // عيد الميلاد — دايمًا شغال
  try {
    const birth = S.profile?.birth || ''
    if (birth && birth.slice(5) === tk.slice(5)) {
      out.push({ id: `bday-${ym.slice(0, 4)}`, icon: '🎂', text: 'عيد ميلاد سعيد يا اموووور 🎈🎉', sub: '', route: null })
    }
  } catch {}

  return out
}
