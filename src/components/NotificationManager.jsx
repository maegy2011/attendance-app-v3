import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useAttendance } from '../contexts/AttendanceContext'
import { useSettings } from '../contexts/SettingsContext'
import { getAltDays, getLeavesV2, getPermitsV2 } from '../utils/storage'
import { calculateMonthly } from '../utils/calculations'
import { getB, countAnnualDelays, ensureChannels, CH_ATTENDANCE, CH_GENERAL } from '../utils/notify'
import { getDisplayAltDays } from '../utils/altDays'
import { computeDisplayLeaves } from '../utils/leaveCounts'
import { getPlan, planProgress, PLAN_EVENT, nextCycleStart } from '../utils/planWeek'
import { getDayNameAr } from '../utils/vacationLogic'

// v12.10.21 — الصياغات الجديدة (الفعل + اليوم + المعاد): أسماء الورديات والأيام والتقارير
const SHIFT_LABELS = { shift1: 'الأولى', shift2: 'الثانية', shift3: 'الثالثة' }
const LEAVE_LABELS_BG = { regular_vacation: 'إجازة اعتيادية', rest_day: 'إجازة بدل راحة', sick: 'إجازة مرضي', unpaid: 'بدون أجر', special: 'إجازة خاصة' }
const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// v12.4.11 — نظام الإشعارات 7 بنود (beta: يطبق على الجميع)
const DAY_OFF_TYPES = ['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special', 'weekend_rest']

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pad(n) { return String(n).padStart(2, '0') }

function shiftForDay(rec, settings) {
  const t = rec?.dayType || rec?.shift
  if (t === 'shift1') return settings.shift1 || { start: '08:00', end: '17:00' }
  if (t === 'shift2') return settings.shift2 || { start: '16:00', end: '00:00' }
  if (t === 'shift3') return settings.shift3 || { start: '00:00', end: '08:00' }
  return settings.shift1 || { start: '08:00', end: '17:00' }
}

function disclaimerOk() {
  try { return localStorage.getItem('disclaimerAccepted') === 'true' } catch { return false }
}

export default function NotificationManager() {
  const { records } = useAttendance()
  const { settings } = useSettings()
  const ready = useRef(false)
  const firstReschedule = useRef(true)

  async function scheduleAll() {
    if (!Capacitor.isNativePlatform()) return
    // v12.10.21 — مربع حماية الخلفية: لو مطفي نمسح حجوزاتنا ونقف (بند 5)
    if (settings.protectionEnabled === false) {
      try {
        const pending = await LocalNotifications.getPending()
        const own = (pending.notifications || []).filter(n => {
          const id = Number(n.id)
          if (id >= 150000000) return false
          if (id >= 100000 && id < 90000000) return false
          return true
        })
        if (own.length) await LocalNotifications.cancel({ notifications: own.map(n => ({ id: n.id })) })
      } catch {}
      return
    }
    try { await ensureChannels(false) } catch {}
    // v12.4.12 — إلغاء IDs الخاصة بنا فقط (بنود 1/3/4/6/7) — لا نمسح التصاريح (100k-90M) ولا اللحظي (150M+)
    // v12.10: منبهات الحضور/الانصراف بنطاق 100M+ (تتكنس وتتحجز من جديد كل مرة)
  const OWN_IDS = new Set()
  try {
    const pending = await LocalNotifications.getPending()
    const own = (pending.notifications||[]).filter(n=>{
      const id = Number(n.id)
      if(id>=150000000) return false // لحظي — نسيبه
      if(id>=100000 && id<90000000) return false // تصاريح (base*100) — نسيبها
      return true
    })
    if (own.length) {
      await LocalNotifications.cancel({ notifications: own.map(n => ({ id: n.id })) })
    }
  } catch (e) { console.warn('إلغاء القديمة فشل', e) }

    const now = new Date()
    const list = []
    const lead = settings.notificationLeadMinutes || 30
    const weekendDays = (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]

    // ===== بند 1أ — تذكير الحضور (v12.10: اليوم + 7 أيام — يقرأ من تخطيط بند 3) =====
    // الثوابت: الزرار notifB1 + المرجعية جدول السجلات + نوع الإجازة (حضور=كمل)
    // + الوردية (لا يوجد تكليف=موعد الأولى) + نطرح (قبل الموعد بـ)
    // + وقت الحضور متسجل=إلغاء + الحجز مع أي فتحة (النهاردة لو معاده مجاش + بكرة)
    // + الوردية التالتة معادها الليلة اللي قبلها + حالة اليوم بره الحسبة
    if (getB(settings, 1)) {
      for (let off = 0; off <= 7; off++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off)
        const dow = d.getDay()
        const dk = dateKeyOf(d)
        const rec = records[dk] || {}
        const isWeekend = weekendDays.includes(dow)
        // نوع الإجازة الفعال: الصريح، وإلا الافتراضي (أحد–خميس=حضور / جمعة–سبت=بدون تكليف/راحة)
        let dayCalc = rec.dayCalculation || rec.dayType || ''
        if (dayCalc === 'shift1' || dayCalc === 'shift2' || dayCalc === 'shift3' || dayCalc === 'no_task') dayCalc = ''
        if (!dayCalc && !rec.shift && !rec.dayStatus && !rec.checkIn && isWeekend) dayCalc = 'weekend_rest'
        // حضور (صريح أو حكمي) = كمّل — أي إجازة/راحة = اقف
        if (dayCalc !== '' && dayCalc !== 'present') continue
        // وقت الحضور متسجل = إلغاء إشعار اليوم ده
        if (rec.checkIn) continue
        // الوردية الفعالة: الصريحة من نظام العمل — لا يوجد تكليف ← المواعيد الرسمية (قاعدة عمرو: شغال على الرسمية فقط)
        let shiftRaw = rec.shift || ''
        if (!shiftRaw && (rec.dayType === 'shift1' || rec.dayType === 'shift2' || rec.dayType === 'shift3' || rec.dayType === 'no_task')) shiftRaw = rec.dayType
        // v12.11: وردية صريحة ← نظام العمل / لا يوجد تكليف ← الرسمية / الفاضي ← مفيش إشعار
        let startStr, shiftLabel
        if (['shift1', 'shift2', 'shift3'].includes(shiftRaw)) {
          startStr = (settings[shiftRaw] && settings[shiftRaw].start) || (settings.shift1 && settings.shift1.start) || '08:00'
          shiftLabel = SHIFT_LABELS[shiftRaw] || ''
        } else if (shiftRaw === 'no_task') {
          startStr = settings.officialStart || '08:00'
          shiftLabel = 'الرسمية'
        } else continue
        const [sh, sm] = startStr.split(':').map(Number)
        const dayNum = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
        // v12.10: معاد = بداية الوردية − (قبل الموعد بـ) — IDs بنطاق 100M (خارج نطاق التصاريح ليتكنسوا عند إعادة الجدولة)
        const at = new Date(d); at.setHours(0, 0, 0, 0); at.setMinutes(sh * 60 + sm - lead)
        if (at > now) list.push({
          id: 100000000 + dayNum * 10 + 1,
          title: '⏰ تذكير الحضور',
          extra: { route: '/' },
          body: `سجّل حضور ${getDayNameAr(dk)} ${dk} — الوردية ${shiftLabel} ${pad(sh)}:${pad(sm)}`,
          schedule: { at, allowWhileIdle: true },
          channelId: CH_ATTENDANCE,
        })
      }
    }

    // ===== بند 1ب — الانصراف (v12.10: اليوم + 7 أيام — يقرأ من تخطيط بند 3) =====
    // الثوابت: الزرار notifB1 + المرجعية جدول السجلات + نوع الإجازة (حضور=كمل)
    // + الانصراف الفعال (ورديات=نظام العمل / لا يوجد تكليف=الرسمية) + نطرح (قبل الموعد بـ)
    // + التصاريح (لا يعود=اقف / يعود+عودة قبل الموعد=كمل / يعود من غير عودة أو بعد الموعد=اقف / تأخير=كمل)
    // + مفيش حضور=مفيش تذكير + أي انصراف متسجل=اقف + حالة اليوم بره الحسبة
    if (getB(settings, 1)) {
      const permits = getPermitsV2() || []
      for (let off = 0; off <= 7; off++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off)
        const dow = d.getDay()
        const isWk = weekendDays.includes(dow)
        const dk = dateKeyOf(d)
        const rec = records[dk] || {}
        if (DAY_OFF_TYPES.includes(rec.dayType)) continue
        // نوع الإجازة الفعال: حضور (صريح أو حكمي) = كمّل — أي إجازة/راحة = اقف
        let dayCalc = rec.dayCalculation || rec.dayType || ''
        if (dayCalc === 'shift1' || dayCalc === 'shift2' || dayCalc === 'shift3' || dayCalc === 'no_task') dayCalc = ''
        if (dayCalc !== '' && dayCalc !== 'present') continue
        // الانصراف الفعال: الورديات ← نظام العمل — لا يوجد تكليف ← الرسمية (قاعدة عمرو) — الفاضي ← مفيش تذكير
        let shiftRaw = rec.shift || ''
        if (!shiftRaw && (rec.dayType === 'shift1' || rec.dayType === 'shift2' || rec.dayType === 'shift3' || rec.dayType === 'no_task')) shiftRaw = rec.dayType
        let endStr
        if (['shift1', 'shift2', 'shift3'].includes(shiftRaw)) {
          endStr = (settings[shiftRaw] && settings[shiftRaw].end) || (settings.shift1 && settings.shift1.end) || '17:00'
        } else if (shiftRaw === 'no_task') {
          endStr = settings.officialEnd || '15:00'
        } else continue
        // التصاريح: لا يعود (أي نوع)=اقف / يعود+عودة قبل الموعد=كمل / غير كده=اقف / تأخير=كمل
        const pm = permits.find(p => p.date === dk)
        if (pm) {
          if (pm.state === 'no_return') continue
          if (pm.state === 'returns') {
            if (!pm.returnTime || pm.returnTime >= endStr) continue
          }
        }
        // v12.10: اليوم الحالي لازم حضور مسجل — الأيام القادمة المخططة (وردية صريحة) تُجدول مسبقًا
        const isFuture = dk > dateKeyOf(now)
        const plannedShift = ['shift1', 'shift2', 'shift3'].includes(rec.shift || '')
        if (rec.checkOut) continue
        // 3) v12.11.4: نسيت الحضور — قبل سطر التخطي (النهاردة والأيام الفاتت بس + لا بصمة + بداية الوردية/الرسمية + ساعة)
        try {
          const dayNum3 = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
          if (dk <= dateKeyOf(now) && !rec.checkIn) {
            let startStr3 = null
            if (['shift1', 'shift2', 'shift3'].includes(shiftRaw)) startStr3 = (settings[shiftRaw] && settings[shiftRaw].start) || (settings.shift1 && settings.shift1.start) || '08:00'
            else if (shiftRaw === 'no_task') startStr3 = settings.officialStart || '08:00'
            if (startStr3) {
              const [sh3, sm3] = startStr3.split(':').map(Number)
              const atMissIn = new Date(d); atMissIn.setHours(0, 0, 0, 0); atMissIn.setMinutes(sh3 * 60 + sm3 + 60)
              if (atMissIn > now) list.push({
                id: 100000000 + dayNum3 * 10 + 4,
                title: '⚠️ نسيت تسجل الحضور؟',
                extra: { route: '/' },
                body: `فات معاد حضور ${getDayNameAr(dk)} ${dk} بساعة ولسه متسجلش — سجّل الحضور`,
                schedule: { at: atMissIn, allowWhileIdle: true },
                channelId: CH_ATTENDANCE,
              })
            }
          }
        } catch {}
        if (!rec.checkIn && !(isFuture && plannedShift)) continue
        const [eh, em] = endStr.split(':').map(Number)
        const dayNum = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
        let endMin = eh * 60 + em
        if (endMin === 0) endMin = 24 * 60
        // 1) تذكير الانصراف قبل الانصراف بمدة الإعدادات (الويكند بره زي قبل كده)
        const at = new Date(d); at.setHours(0, 0, 0, 0); at.setMinutes(endMin - lead)
        if (!isWk && at > now) {
          const hh = pad(Math.floor(endMin / 60) % 24), mm = pad(endMin % 60)
          list.push({
            id: 100000000 + dayNum * 10 + 2,
            title: '🚶 تذكير الانصراف',
          extra: { route: '/' },
            body: `سجّل انصراف ${getDayNameAr(dk)} ${dk} — الوردية تنتهي ${hh}:${mm}`,
            schedule: { at, allowWhileIdle: true },
            channelId: CH_ATTENDANCE,
          })
        }
        // 2) نسيت الانصراف — حضور + بصمة حضور + لا انصراف + نهاية الوردية/الرسمية + ساعة (المستقبل بلا حضور بره)
        const atMiss = new Date(d); atMiss.setHours(0, 0, 0, 0); atMiss.setMinutes(endMin + 60)
        if (atMiss > now && rec.checkIn) list.push({
          id: 100000000 + dayNum * 10 + 3,
          title: '⚠️ نسيت تسجل الانصراف؟',
          extra: { route: '/' },
          body: `فات معاد انصراف ${getDayNameAr(dk)} ${dk} بساعة ولسه مفتوح — سجّل الانصراف`,
          schedule: { at: atMiss, allowWhileIdle: true },
          channelId: CH_ATTENDANCE,
        })
      }
    }

    // ===== v12.11 بند 4 — ملخص الأرصدة الأسبوعي (الخميس 10ص — مفتاح B3) =====
    // المصدر: جدول الإجازات بعد التسوية — اعتيادي وبدل راحة دايمًا + مرضي/بدون أجر/خاصة بشرط الاستخدام
    if (getB(settings, 3)) {
      try {
        const storedAlt = getAltDays()
        const dLv = computeDisplayLeaves(records || {}, getLeavesV2(), storedAlt, settings, null)
        const cYear = String(now.getFullYear())
        const yl = dLv.filter(l => String(l.date || '').startsWith(cYear))
        const annualTotal = Number(settings.annualLeaveBalance || 0)
        const sickTotal = Number(settings.sickLeaveBalance || 0)
        const annualUsed = yl.filter(l => l.type === 'regular_vacation').length
        const sickUsed = yl.filter(l => l.type === 'sick').length
        const unpaidUsed = yl.filter(l => l.type === 'unpaid').length
        const specialUsed = yl.filter(l => l.type === 'special').length
        let altEligible = 0, restUsed = 0
        try {
          const table = getDisplayAltDays(records || {}, storedAlt, settings.altDayMinHours || 6)
          altEligible = table.filter(a => String(a.date || '').startsWith(cYear)).length
          restUsed = yl.filter(l => l.type === 'rest_day').length
        } catch {}
        const lines = []
        lines.push(`اعتيادي: المتبقي ${Math.max(0, annualTotal - annualUsed)} من ${annualTotal}`)
        lines.push(`بدل راحة: المتبقي ${Math.max(0, altEligible - restUsed)} من ${altEligible}`)
        if (sickUsed > 0) lines.push(`مرضي: المتبقي ${Math.max(0, sickTotal - sickUsed)} من ${sickTotal}`)
        if (unpaidUsed > 0) lines.push(`بدون أجر: اتاخد ${unpaidUsed} يوم`)
        if (specialUsed > 0) lines.push(`خاصة: اتاخد ${specialUsed} يوم`)
        const at = nextDow(10, 0, 4)
        const weekNum = Math.floor(Date.now() / (7*86400000))
        list.push({
          id: 930100 + (weekNum % 500),
          title: '📊 ملخص الأرصدة الأسبوعي',
          extra: { route: '/vacations' },
          body: lines.join('\n'),
          schedule: { at, allowWhileIdle: true },
          channelId: CH_GENERAL,
        })
      } catch (e) { console.warn('ملخص أسبوعي فشل', e?.message) }
    }

    // ===== v12.11 بند 5 — scan المعلقة (أحد + تلات 9ص — مفتاح B3) =====
    // الأحد: scan الجدولين — التلات: scan مستقل جديد (اللي ناقص لحظتها + المستجد) — كل مرة واحدة
    // كل إجازة مش متعلمة تتذكر بنوعها + كل يوم بديل مش متعلم يتذكر بتاريخه
    if (getB(settings, 3)) {
      try {
        const storedAlt = getAltDays()
        let dLeaves = []
        try { dLeaves = computeDisplayLeaves(records || {}, getLeavesV2(), storedAlt, settings, null) } catch { dLeaves = [] }
        const pendingLeaves = (dLeaves.length ? dLeaves : getLeavesV2()).filter(l => !l.selfService)
        for (const lv of pendingLeaves.slice(0, 10)) {
          const dk = String(lv.date || lv.id || '').slice(0, 10)
          const dayNum = Math.floor(Date.parse(dk + 'T00:00:00Z') / 86400000) || 0
          sunTue(9, 0).forEach((at, i)=>{
            list.push({ id: 940100 + (dayNum % 40000) * 10 + i, title: '📌 تذكير الخدمة الذاتية',
          extra: { route: '/vacations' }, body: `سجّل ${LEAVE_LABELS_BG[lv.type] || 'إجازة'} ${getDayNameAr(dk)} ${dk} خدمة ذاتية — من صفحة الإجازات`, schedule: { at, allowWhileIdle: true }, channelId: CH_GENERAL })
          })
        }
        const altMin = settings.altDayMinHours || 6
        const table = getDisplayAltDays(records || {}, storedAlt, altMin)
        const pending = table.filter(a => !a.selfService)
        for (const a of pending.slice(0, 20)) {
          const dayNum = Math.floor(Date.parse(a.date + 'T00:00:00Z') / 86400000) || 0
          sunTue(9, 0).forEach((at, i)=>{
            list.push({ id: 940200 + (dayNum % 40000) * 10 + i, title: '📌 بدل الراحة',
          extra: { route: '/alt-days' }, body: `سجّل ${getDayNameAr(a.date)} ${a.date} يوم بديل في الخدمة الذاتية`, schedule: { at, allowWhileIdle: true }, channelId: CH_GENERAL })
          })
        }
      } catch (e) { console.warn('بند5 فشل', e?.message) }
    }

    // ===== بند 6 — الإحصائيات (أحد 11ص — مفتاح B6) =====
    if (getB(settings, 6)) {
      try {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const m = calculateMonthly(records || {}, settings, start, end)
        let bonusDays = 0
        for (const d of (m.days || [])) { if ((d.bonusValue || 0) > 0) bonusDays++ }
        const c = countAnnualDelays(records, settings)
        const at = nextSunday(11, 0)
        // v12.10.21 — تقرير الأسبوع (6 سطور): إضافي شهري + مكافأة + تأخيرات + متجاهلة + بديلة معلقة + إجازات معلقة
        const todayK = dateKeyOf(now)
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        let ignoredCount = 0
        for (const [dk2, rec2] of Object.entries(records || {})) {
          if (!dk2.startsWith(monthPrefix) || dk2 >= todayK) continue
          const dc2 = rec2?.dayCalculation || rec2?.dayType || ''
          if (['regular_vacation', 'rest_day', 'weekend_rest', 'sick', 'unpaid', 'special', 'no_task'].includes(dc2)) continue
          if (!rec2?.checkIn || !rec2?.checkOut) ignoredCount++
        }
        let altPendingCount = 0, leavesPendingCount = 0
        try {
          const sAlt = getAltDays()
          altPendingCount = getDisplayAltDays(records || {}, sAlt, settings.altDayMinHours || 6).filter(a => !a.selfService).length
          const dLv = computeDisplayLeaves(records || {}, getLeavesV2(), sAlt, settings, null)
          leavesPendingCount = (dLv.length ? dLv : getLeavesV2()).filter(l => !l.selfService).length
        } catch {}
        const otH = Math.round((m.totalOvertimeHours || 0) * 100) / 100
        const otPay = Math.round(m.totalOvertime || 0)
        // v12.11: التصاريح الخاصة (الشهر الحالي — يعود + لا يعود) من جدول التصاريح: العدد + إجمالي المدة
        let spCount = 0, spMin = 0
        try {
          const { calcPermitDuration, minToHM } = await import('../utils/permits.js').catch(() => ({}))
          const allP = getPermitsV2() || []
          for (const p of allP) {
            if (p?.type !== 'special') continue
            if (!String(p.date || '').startsWith(monthPrefix)) continue
            spCount++
            try { const dd = calcPermitDuration ? calcPermitDuration(p, settings) : null; if (dd != null) spMin += dd } catch {}
          }
          var spDurTxt = (minToHM ? minToHM(spMin) : (spMin + ' د'))
        } catch { var spDurTxt = spMin + ' د' }
        const weekNum6 = Math.floor(Date.now() / (7*86400000))
        list.push({
          id: 960100 + (weekNum6 % 500),
          title: '📊 تقرير الأسبوع',
          extra: { route: '/stats' },
          body: `إجمالي الإضافي الشهري: ${otH} ساعة (${otPay} جنيه)\nأيام المكافأة: ${bonusDays}\nالتأخيرات: ${c}\nالأيام المتجاهلة: ${ignoredCount}\nأيام بديلة محتاجة خدمة ذاتية: ${altPendingCount}\nإجازات محتاجة خدمة ذاتية: ${leavesPendingCount}\nالتصاريح الخاصة: ${spCount} — إجمالي المدة: ${spDurTxt}`,
          schedule: { at, allowWhileIdle: true },
          channelId: CH_GENERAL,
        })
      } catch (e) { console.warn('بند6 فشل', e?.message) }
    }

    // ===== بند 7 — نبضة التخطيط الأسبوعي (بند 3: كل 3 ساعات حتى الاكتمال — مفتاح B1) =====
    if (getB(settings, 1)) {
      try {
        const plan = getPlan()
        if (plan) {
          const pr = planProgress(records || {}, plan)
          if (pr.pendingCount > 0) {
            // v12.11: النبضات 8 كل 3 ساعات — تبدأ من بعد الموعد المحدد في الإعدادات (وترجع لو الأسبوع نقص تاني عبر إعادة الجدولة)
            const [ph, pmn] = String(settings.planWeekTime || '18:00').split(':').map(Number)
            let base = new Date(); base.setHours(ph || 18, pmn || 0, 0, 0)
            if (base <= now) base = new Date(now.getTime())
            let pushed = 0
            for (let i = 0; i < 8 && pushed < 8; i++) {
              const at = new Date(base.getTime() + (i + 1) * 3 * 3600 * 1000)
              if (at <= now) continue
              pushed++
              list.push({
                id: 9800 + i,
                title: '📋 نظام عمل الأسبوع',
                body: `سجّل نظام عمل الأسبوع الجاي — باقي ${pr.pendingCount} أيام — من التخطيط`,
                schedule: { at, allowWhileIdle: true },
                channelId: CH_GENERAL,
                extra: { route: '/' },
              })
            }
          }
        }
      } catch (e) { console.warn('بند7 فشل', e?.message) }
    }

    // تعديل ١٠-ب: إشعار خلفية متجدول على موعد الدورة نفسه — يرن حتى والبرنامج مقفول (مفتاح B1)
    // (اللحظي يغطي والبرنامج مفتوح — ده يغطي وهو مقفول)
    if (getB(settings, 1)) {
      try {
        const at = nextCycleStart(new Date(), { dow: (settings.planWeekDay ?? 4), time: (settings.planWeekTime || '18:00') })
        if (at && at > new Date()) list.push({
          id: 9810,
          title: '📋 موعد تسجيل الوردية الأسبوعي',
          body: `معاد تسجيل الوردية الأسبوعي جه (${DOW_AR[settings.planWeekDay ?? 4]} ${(settings.planWeekTime || '18:00')}) — افتح التخطيط`,
          schedule: { at, allowWhileIdle: true },
          channelId: CH_GENERAL,
          extra: { route: '/' },
        })
      } catch (e) { console.warn('موعد الدورة فشل', e?.message) }
    }

    // v12.11.20 تعديل 4: إشعار الـ test اتمسح — + كنس أي حجوزات test قديمة (950xxx) مرة واحدة
    try {
      const pending = await LocalNotifications.getPending()
      const stale = (pending.notifications || []).filter(n => { const id = Number(n.id); return id >= 950000 && id < 952000 })
      if (stale.length) await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) })
    } catch {}

    // ===== التعديل ٣ (دورة جديدة-ج): عيد الميلاد — إشعار بنفس نص الكارت (يوم الميلاد فقط) =====
    try {
      const birth = settings.profile?.birth || ''
      const dk = dateKeyOf(now)
      if ((settings.notificationsEnabled !== false) && birth && birth.slice(5) === dk.slice(5)) {
        const at = new Date(now); at.setHours(9, 0, 0, 0)
        if (at <= now) at.setTime(now.getTime() + 60000)
        const dayNumB = Math.floor(Date.now() / 86400000)
        list.push({
          id: 970100 + (dayNumB % 500),
          title: '🎂 عيد ميلاد سعيد يا اموووور',
          extra: { route: '/' },
          body: 'عيد ميلاد سعيد يا اموووور 🎈🎉',
          schedule: { at, allowWhileIdle: true },
          channelId: CH_GENERAL,
        })
      }
    } catch (e) { console.warn('بند الميلاد فشل', e?.message) }

    if (list.length) {
      try { await LocalNotifications.schedule({ notifications: list }) } catch (e) { console.warn('جدولة فشلت', e) }
    }
    // v12.10.21 — snapshot للبوت والمقارنة: آخر وضع قبل أي ريستارت (بند 4) + سطر التشخيص في التذكيرات
    try { localStorage.setItem('hr_last_schedule', JSON.stringify({ t: Date.now(), n: list.length })) } catch {}
  }

  function nextSunday(h, m) {
    const d = new Date()
    const diff = (7 - d.getDay()) % 7
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff))
    d.setHours(h, m || 0, 0, 0)
    return d
  }
  // v12.5.1: الخدمة الذاتية أحد + تلات — نفس المواعيد
  function nextDow(h, m, dow) {
    const d = new Date()
    let diff = (dow - d.getDay() + 7) % 7
    const cand = new Date(d); cand.setHours(h, m || 0, 0, 0)
    if (diff === 0 && cand <= d) diff = 7
    d.setDate(d.getDate() + diff)
    d.setHours(h, m || 0, 0, 0)
    return d
  }
  function sunTue(h, m) { return [nextDow(h, m, 0), nextDow(h, m, 2)] }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    // v12.5.3: التسلسل الإجباري — لا إذن ولا جدولة قبل الموافقة على الإخلاء
    if (!disclaimerOk()) return
    if (ready.current) return
    ready.current = true
    ;(async () => {
      try {
        const perm = await LocalNotifications.checkPermissions()
        let granted = perm.display === 'granted'
        if (!granted) {
          const req = await LocalNotifications.requestPermissions()
          granted = req.display === 'granted'
        }
        if (granted) await scheduleAll()
      } catch (e) { console.warn('إذن الإشعارات', e) }
    })()
  }, [])

  useEffect(() => {
    if (!ready.current) return
    if (!disclaimerOk()) return
    if (firstReschedule.current) { firstReschedule.current = false; return }
    const t = setTimeout(() => scheduleAll(), 800)
    return () => clearTimeout(t)
  }, [records, settings])

  // v12.5.3: حدث انتهاء الـ onboarding (إخلاء ← أذونات) — ابدأ الجدولة بعده
  useEffect(() => {
    const h = () => {
      if (!disclaimerOk() || !Capacitor.isNativePlatform()) return
      ready.current = true
      scheduleAll()
    }
    window.addEventListener('onboarding-done', h)
    return () => window.removeEventListener('onboarding-done', h)
  }, [records, settings])

  // تعديل ١٠: بدء/انتهاء دورة التخطيط يعيد جدولة نبضات الخلفية فورًا (ميستناش تغيير السجلات)
  useEffect(() => {
    let t = null
    const h = () => { try { clearTimeout(t); t = setTimeout(() => scheduleAll(), 800) } catch {} }
    window.addEventListener(PLAN_EVENT, h)
    return () => { window.removeEventListener(PLAN_EVENT, h); try { clearTimeout(t) } catch {} }
  }, [])

  return null
}
