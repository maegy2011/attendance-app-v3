// utils/planWeek.js — بند 3: التخطيط الأسبوعي (الجمعة → الخميس)
// الدورة تبدأ خميس 6 مساءً — الكتابة مباشرة في السجلات (لا مخزن منفصل)

const PLAN_KEY = 'att_plan_week'
export const PLAN_EVENT = 'plan-changed'
export const PLAN_OPEN = 'open-plan'
export const SNOOZE_EVENT = 'plan-snooze'
export function emitPlanChanged() { try { window.dispatchEvent(new Event(PLAN_EVENT)) } catch {} }

// الغفوة: إخفاء الـ popup 5 دقايق (الجرس والخلفية شغالين ويفتحوه من جديد)
const SNOOZE_KEY = '***'
export function snoozePlan() { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 5 * 60 * 1000)); window.dispatchEvent(new Event(SNOOZE_EVENT)) } catch {} }
export function isSnoozed() {
  try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0) } catch { return false }
}
export function clearSnooze() { try { localStorage.removeItem(SNOOZE_KEY); window.dispatchEvent(new Event(SNOOZE_EVENT)) } catch {} }

const dkOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDk = (dk) => { const [y, m, d] = dk.split('-').map(Number); return new Date(y, m - 1, d) }

// أقرب جمعة (اليوم لو جمعة) — بداية أسبوع التخطيط
export function fridayOnOrAfter(ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const delta = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + delta)
  return d
}

export function planDatesFrom(friday) {
  const out = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + i)
    out.push(dkOf(d))
  }
  return out
}

// أسبوع التخطيط الحالي (الجمعة القادمة → الخميس)
export function currentPlanWeek(ref = new Date()) {
  const fri = fridayOnOrAfter(ref)
  const dates = planDatesFrom(fri)
  return { weekId: dates[0], dates }
}

export function getPlan() {
  try { const raw = localStorage.getItem(PLAN_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
export function savePlan(p) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)) } catch {} }
export function clearPlan() { try { localStorage.removeItem(PLAN_KEY) } catch {} }

// نافذة البدء: اليوم المختار من الإعدادات (الافتراضي الخميس) + الساعة (الافتراضي 18:00)
export function shouldStartPlan(now = new Date(), cfg) {
  const c = cfg || { dow: 4, time: '18:00' }
  if (now.getDay() !== c.dow) return false
  const [hh, mm] = String(c.time || '18:00').split(':').map(Number)
  return (now.getHours() * 60 + now.getMinutes()) >= (hh * 60 + (mm || 0))
}

// أول موعد دورة قادم (اليوم+الساعة من الإعدادات) — لإشعار خلفية متجدول يرن حتى والبرنامج مقفول
// النهاردة لو الموعد لسه مجاش — غير كده نفس اليوم الأسبوع الجاي
export function nextCycleStart(now = new Date(), cfg) {
  const c = cfg || { dow: 4, time: '18:00' }
  const [hh, mm] = String(c.time || '18:00').split(':').map(Number)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 0, mm || 0, 0, 0)
  let delta = (((c.dow ?? 4) - d.getDay()) + 7) % 7
  if (delta === 0 && d <= now) delta = 7
  d.setDate(d.getDate() + delta)
  return d
}
// آخر دورة مكتملة — عشان الدورة المخلصة مترجعش تاني في نفس يوم البدء
const DONE_KEY = '***'
export function getDoneWeek() { try { return localStorage.getItem(DONE_KEY) || '' } catch { return '' } }
function setDoneWeek(weekId) { try { localStorage.setItem(DONE_KEY, weekId) } catch {} }

// ينشئ دورة جديدة لو مستحقة (يُطلق الحدث فقط عند الإنشاء) — والمخلصة لا تُعاد
// cfg = { dow: 0-6, time: 'HH:MM' } — الافتراضي الخميس 18:00 (بند 3)
export function ensurePlan(now = new Date(), cfg) {
  if (!shouldStartPlan(now, cfg)) return getPlan()
  const w = currentPlanWeek(now)
  if (getDoneWeek() === w.weekId) return getPlan()
  const cur = getPlan()
  if (cur && cur.weekId === w.weekId) return cur
  const p = { weekId: w.weekId, dates: w.dates, startedAt: new Date().toISOString() }
  savePlan(p)
  emitPlanChanged()
  return p
}

const LEAVE_SETTLED = ['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special', 'weekend_rest']

// اليوم متسدد؟ إجازة (العمود الأول يقفل الباقي) أو وردية + حالة يوم معًا
export function isDaySettled(rec) {
  if (!rec) return false
  const dc = rec.dayCalculation || ''
  if (LEAVE_SETTLED.includes(dc)) return true
  return !!(rec.shift && rec.dayStatus)
}

export function planProgress(records, plan) {
  if (!plan) return { done: 0, pending: 0, pendingCount: 0 }
  const recs = records || {}
  let done = 0
  const pending = []
  for (const dk of plan.dates) {
    if (isDaySettled(recs[dk])) done++
    else pending.push(dk)
  }
  return { done, pending, pendingCount: pending.length }
}

// عند اكتمال الـ 7: توست مرة واحدة + مسح الدورة (السجلات تفضل — القديم محفوظ)
export function settleIfDone(records, showToast) {
  const plan = getPlan()
  if (!plan) return false
  const pr = planProgress(records, plan)
  if (pr.pendingCount > 0) return false
  clearPlan()
  setDoneWeek(plan.weekId)
  emitPlanChanged()
  try { showToast && showToast('تم التسجيل بنجاح ✅') } catch {}
  return true
}

// باتشات المسح وإعادة التصفير: الوردية/الحالة لأيام الدورة اللي مفيهاش حضور
// (أيام فيها حضور لا تُمس أبدًا)
export function planClearPatches(records, plan) {
  const out = {}
  if (!plan) return out
  const recs = records || {}
  for (const dk of plan.dates) {
    const r = recs[dk]
    if (r && r.checkIn) continue
    out[dk] = { shift: '', dayStatus: '', dayType: '' }
  }
  return out
}
