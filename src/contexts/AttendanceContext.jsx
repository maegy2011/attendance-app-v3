// «مخزن السجلات المركزي» — التعديل 23 نقطة 4: مخزن البيانات الوحيد (السجلات + الكتابة + المراقبات)
// عدادات الإجازات (بند 4) تقرا من utils/leaveCounts — نفس مصدر صفحتي الإجازات والبديلة
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getLeaveCounts, checkRestDayAvailability } from '../utils/leaveCounts'
import { getRecords, getDayType, setDayType, setVacationType, getVacationType, updateRecord, deleteRecord, getLeavesV2 } from '../utils/storage'
import { calculateDay, migrateDayType, getEffectiveDayType, getDayCalcFromRecord, getShiftFromRecord, getDayStatusFromRecord } from '../utils/calculations'
import { useSettings } from './SettingsContext'
import { determineShiftFromTime, checkInNotification, checkOutNotification, SHIFT_LABELS } from '../utils/shifts'
import { fireInstant, getB, countAnnualDelays, todayDelayMin, delayWeight } from '../utils/notify'

const AttendanceContext = createContext()

export function AttendanceProvider({ children }) {
  const { settings } = useSettings()
  const [records, setRecords] = useState(getRecords)
  const [dayTypeDialog, setDayTypeDialog] = useState({ open: false, date: null })
  const [toast, setToast] = useState(null)

  useEffect(() => { localStorage.setItem('att_records', JSON.stringify(records)) }, [records])

  // بند 1 — v12.3.4: مسح تلقائي للـ 13 سجل القديم أول ما تفتح النسخة الجديدة
  useEffect(() => {
    const flag = 'autoWiped_12_3_4'
    if (localStorage.getItem(flag)) return
    const hasOld = Object.keys(records).length >= 10 // الـ 13
    if (hasOld) {
      setRecords({})
      ;['att_records','att_leaves_v2','att_permits_v2','att_alt_days','att_deleted_alt'].forEach(k=>localStorage.removeItem(k))
      localStorage.setItem(flag, 'true')
    } else {
      localStorage.setItem(flag, 'true')
    }
  }, [])

  const clearAllRecords = useCallback(() => {
    setRecords({})
    localStorage.removeItem('att_records')
    localStorage.removeItem('att_leaves_v2')
    localStorage.removeItem('att_permits_v2')
    localStorage.removeItem('att_alt_days')
    localStorage.removeItem('att_deleted_alt')
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 2500)
  }, [])

  // عرض سلسلة من الرسائل بالتتابع (كل رسالة تظهر بعد اللي قبلها)
  const showToastSeq = useCallback((msgs) => {
    const arr = Array.isArray(msgs) ? msgs : [msgs]
    arr.forEach((m, i) => {
      setTimeout(() => {
        setToast(m)
        setTimeout(() => setToast(null), 2500)
      }, i * 2600)
    })
  }, [])

  const todayKeyFn = useCallback(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }, [])

  const todayRecord = records[todayKeyFn()] || null

  const getDayCalc = useCallback((dk) => {
    const record = records[dk]; if (!record) return null
    return calculateDay(record, settings)
  }, [records, settings])

  // حساب أرصدة الإجازات — التعديل 23 نقطة 4: من utils/leaveCounts (نفس مصدر الصفحات) — نفس الاسم والحقول
  // التعديل 24: مسح رصيد الإعدادات الميت (substitute*) + حقول البديلة من الخانات (سنة حالية — التصفير السنوي)
  const getLeaveBalances = useCallback(() => {
    const year = new Date().getFullYear()
    let leavesStored = [], altStored = []
    try { leavesStored = getLeavesV2() } catch {}
    try { altStored = JSON.parse(localStorage.getItem('att_alt_days') || '[]') } catch {}
    const c = getLeaveCounts(records, leavesStored, altStored, settings, year)
    return {
      annualRemaining: c.annualRemaining,
      sickRemaining: c.sickRemaining,
      altEligible: c.alt.eligibleCount,
      altRemaining: c.alt.remainingCount,
      altPaidByDates: c.alt.paidByDates,
      annualBalance: c.annualTotal, sickBalance: c.sickTotal,
      annualUsed: c.annualUsed, restUsed: c.restUsed, sickUsed: c.sickUsed,
    }
  }, [records, settings])

  // إشعار السنة الجديدة
  useEffect(() => {
    const now = new Date()
    if (now.getMonth() === 0 && now.getDate() === 1) {
      const lastNotif = localStorage.getItem('att_new_year_notif')
      const today = now.toISOString().slice(0, 10)
      if (lastNotif !== today) {
        localStorage.setItem('att_new_year_notif', today)
        const b = settings.annualLeaveBalance || 0
        if (b > 0) setTimeout(() => showToast(`🎉 تم تغذية حسابك برصيد ${b} إجازة اعتيادية للسنة الجديدة`), 2000)
      }
    }
  }, [])

  // v12.4.15 — بند 5: شرائح التأخير (0-15→0 | 16-30→1 | 31-45→2 | فوق 45→تنبيه إذن)
  useEffect(() => {
    try {
      const d = new Date()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const rec = records[key]
      if (!rec?.checkIn) return
      if (!getB(settings, 5)) return
      const delay = todayDelayMin(rec, settings)
      if (delay == null) return
      const w = delayWeight(delay)
      if (w > 0) {
        const flag = `att_delay_notified_${key}`
        if (localStorage.getItem(flag)) return
        localStorage.setItem(flag, 'true')
        const y = countAnnualDelays(records, settings)
        showToast(`😤 تم تسجيل تاخير اليوم — عدد التاخيرات ${y}`)
        fireInstant('😤 تم تسجيل تاخير اليوم', `عدد التاخيرات ${y}`, { route:'/permits' })
      } else if (delay > 45) {
        const flag2 = `att_permit_nudge_${key}`
        if (localStorage.getItem(flag2)) return
        localStorage.setItem(flag2, 'true')
        showToast('📝 برجاء تسجيل إذن تأخير')
        fireInstant('📝 برجاء تسجيل إذن تأخير', `تأخير ${delay} دقيقة — سجل إذن تأخير (${key})`, { route:'/permits' })
      }
    } catch {}
  }, [records, settings])

  // v12.4.15 — بند إجازات (5): تذكير يومي بعد الحضور للمعلقة حتى التأشير
  useEffect(() => {
    try {
      if (!getB(settings, 3)) return
      const d = new Date()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!records[key]?.checkIn) return
      const labels = { regular_vacation: 'اعتيادية', rest_day: 'بدل راحة', sick: 'مرضي', unpaid: 'بدون أجر', special: 'خاصة' }
      const pend = getLeavesV2().filter(l => l && !l.selfService && labels[l.type])
      for (const l of pend) {
        const lid = l.id || l.date
        const flag = `att_leave_nudge_${key}_${lid}`
        if (localStorage.getItem(flag)) continue
        localStorage.setItem(flag, 'true')
        const body = `لاتنس تسجيل يوم ${l.date || lid} اجازه ${labels[l.type]} علي الخدمه الذاتيه`
        showToast(`📌 ${body}`)
        fireInstant('📌 تذكير الخدمة الذاتية', body, { route:'/vacations' })
      }
    } catch {}
  }, [records, settings])

  // v12.4.14 — بند 3: مراقب الإجازات الشامل — يغطي كل السكك
  // (الرئيسية + صفحة الإجازات + أي تعديل) — تهنئة مرة واحدة لكل تغيير + toast احتياطي
  useEffect(() => {
    try {
      const LEAVE_TYPES = ['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special', 'weekend_rest']
      const msgFor = (t, dk) => {
        if (t === 'regular_vacation' || t === 'rest_day') return ['🏖 اجازه سعيده', `اجازه سعيده 🏖 — ${dk}`]
        if (t === 'sick') return ['🥵 الف سلامه عليك', 'الف سلامه عليك شفاك الله وعفاك 🥵']
        if (t === 'unpaid') return ['🤔 الاجازه بالخصم', 'الاجازه بالخصم متخدش علي كده 🤔']
        if (t === 'special') return ['⭐ نتمني لك التوفيق', 'نتمني لك التوفيق']
        if (t === 'weekend_rest') return ['🏖 اجازه سعيده', `اجازه سعيده🏖 — ${dk}`]
        return null
      }
      let snap = {}
      try { snap = JSON.parse(localStorage.getItem('att_leave_snapshot') || '{}') } catch { snap = {} }
      const firstRun = !localStorage.getItem('att_leave_snapshot')
      const cur = {}
      for (const [dk, rec] of Object.entries(records || {})) {
        const t = rec?.dayCalculation || rec?.dayType
        if (LEAVE_TYPES.includes(t)) cur[dk] = t
      }
      if (!firstRun && getB(settings, 3)) {
        for (const [dk, t] of Object.entries(cur)) {
          if (snap[dk] !== t) {
            const m = msgFor(t, dk)
            if (m) { showToast(`${m[0]} — ${m[1]}`); fireInstant(m[0], m[1]) }
          }
        }
      }
      localStorage.setItem('att_leave_snapshot', JSON.stringify(cur))
    } catch {}
  }, [records, settings])

  const checkIn = useCallback((timeStr) => {
    const key = todayKeyFn()
    if (records[key]?.checkIn) { showToast('⚠️ تم تسجيل الحضور بالفعل اليوم'); return false }
    const [h, m] = timeStr.split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0)
    const existing = records[key] || {}
    // تحديد الورديه التلقائي حسب ساعة الحضور — يستبدل أي اختيار يدوي سابق
    let shift = existing.shift
    const seq = []
    const s = determineShiftFromTime(h, m)
    if (s) {
      shift = s
      seq.push(`🔄 تم تحديد الورديه: ${SHIFT_LABELS[s]} (تلقائي)`)
    } else if (!shift && !existing.dayCalculation && !existing.dayStatus) {
      seq.push('رجاء بتحديد نوع الورديه')
    }
    const updates = { checkIn: d.toISOString(), date: key }
    if (shift) updates.shift = shift
    if (shift) updates.dayType = shift // للتوافق
    setRecords(prev => ({ ...prev, [key]: { ...existing, ...updates } }))
    seq.push('✅ تم تسجيل الحضور')
    const effType = getEffectiveDayType({ ...existing, ...updates })
    if (effType) {
      const msg = checkInNotification(effType, d, settings)
      if (msg) seq.push(msg)
    }
    showToastSeq(seq)
    return true
  }, [todayKeyFn, records, showToastSeq, settings])

  // البحث عن سجل محتاج انصراف (حضور من غير انصراف) — اليوم أو وردية تانية خلال آخر 7 أيام
  const findPendingCheckOut = useCallback(() => {
    let key = todayKeyFn()
    let existing = records[key] || {}
    if (!existing.checkIn || existing.checkOut) {
      const keys = Object.keys(records).sort().reverse().slice(0, 7)
      for (const k of keys) {
        const r = records[k]
        if (r && r.checkIn && !r.checkOut) {
          const shift = r.shift || getShiftFromRecord(r)
          if (shift === 'shift2') { key = k; existing = r; break }
        }
      }
    }
    if (!existing.checkIn || existing.checkOut) return null
    return { key, record: existing }
  }, [todayKeyFn, records])

  const checkOut = useCallback((timeStr, overrideDateKey) => {
    // البحث عن سجل مع حضور بدون انصراف (اليوم أو الأيام القريبة لـ shift2)
    let key = todayKeyFn()
    let existing = records[key] || {}
    // لو مفيش سجل النهارده، دور على آخر سجل فيه حضور بدون انصراف (آخر 7 أيام)
    if (!existing.checkIn || existing.checkOut) {
      const keys = Object.keys(records).sort().reverse().slice(0, 7)
      for (const k of keys) {
        const r = records[k]
        if (r && r.checkIn && !r.checkOut) {
          const shift = r.shift || getShiftFromRecord(r)
          if (shift === 'shift2') { key = k; existing = r; break }
        }
      }
    }
    if (!existing.checkIn) { showToast('⚠️ لازم تسجل الحضور الأول'); return false }
    if (existing.checkOut) { showToast('⚠️ تم تسجيل الانصراف بالفعل'); return false }
    const [h, m] = timeStr.split(':').map(Number)
    // نبني التاريخ المحلي بشكل صحيح: نستخرج السنة والشهر واليوم من checkInDate
    const checkInDate = new Date(existing.checkIn)
    const ciYear = checkInDate.getFullYear(), ciMonth = checkInDate.getMonth(), ciDay = checkInDate.getDate()
    const ciHour = checkInDate.getHours(), ciMin = checkInDate.getMinutes()
    const checkInLocal = new Date(ciYear, ciMonth, ciDay, ciHour, ciMin, 0, 0)
    const shift = existing.shift || getShiftFromRecord(existing)
    let d
    if (overrideDateKey) {
      // تاريخ يدوي من شاشة الانصراف (للوردية التانية بعد منتصف الليل)
      const [y, mo, da] = overrideDateKey.split('-').map(Number)
      d = new Date(y, mo - 1, da, h, m, 0, 0)
    } else {
      // نبني التاريخ المحلي: نفس يوم الحضور + الوقت المدخل
      d = new Date(ciYear, ciMonth, ciDay, h, m, 0, 0)
      // وردية تانية: لو الوقت أبكر من الحضور (يعني بعد منتصف الليل)، التاريخ يوم تاني
      if (shift === 'shift2' && d <= checkInLocal) {
        d.setDate(d.getDate() + 1)
      }
    }
    // ممنوع فترات عمل بالسالب في كل الأحوال
    if (d <= checkInLocal) { showToast('⚠️ وقت الانصراف لازم يكون بعد وقت الحضور'); return false }
    setRecords(prev => ({ ...prev, [key]: { ...existing, checkOut: d.toISOString(), date: key } }))
    const seq = ['🚶 تم تسجيل الانصراف']
    if (d.getFullYear() !== ciYear || d.getMonth() !== ciMonth || d.getDate() !== ciDay) {
      seq.push(`📅 الانصراف يوم ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} (اليوم التاني)`)
    }
    const dt = existing.dayType
    if (dt) { const msg = checkOutNotification(dt, d, settings); if (msg) seq.push(msg) }
    showToastSeq(seq)
    return true
  }, [todayKeyFn, records, showToastSeq, settings])

  const editCheckIn = useCallback((dk, timeStr) => {
    const [h, m] = timeStr.split(':').map(Number)
    // بناء التاريخ المحلي من مفتاح اليوم (بدل new Date(dk).setHours على UTC)
    const [y, mo, da] = dk.split('-').map(Number)
    const d = new Date(y, mo - 1, da, h, m, 0, 0)
    const existing = records[dk] || {}
    // تحديد الورديه التلقائي حسب ساعة الحضور — يستبدل أي اختيار يدوي سابق
    let shift = existing.shift
    const seq = []
    const s = determineShiftFromTime(h, m)
    if (s) {
      shift = s
      seq.push(`🔄 تم تحديد الورديه: ${SHIFT_LABELS[s]} (تلقائي)`)
    } else if (!shift && !existing.dayCalculation && !existing.dayStatus) {
      seq.push('رجاء بتحديد نوع الورديه')
    }
    const updates = { checkIn: d.toISOString(), date: dk }
    if (shift) updates.shift = shift
    if (shift) updates.dayType = shift // للتوافق
    setRecords(prev => ({ ...prev, [dk]: { ...existing, ...updates } }))
    seq.push('✏️ تم تعديل الحضور')
    const effType = getEffectiveDayType({ ...existing, ...updates })
    if (effType) { const msg = checkInNotification(effType, d, settings); if (msg) seq.push(msg) }
    showToastSeq(seq)
    return true
  }, [records, showToastSeq, settings])

  const editCheckOut = useCallback((dk, timeStr, overrideDateKey) => {
    const [h, m] = timeStr.split(':').map(Number)
    const existing = records[dk] || {}
    const shift = existing.shift || getShiftFromRecord(existing)
    // نبني التاريخ المحلي: تاريخ الحضور + الوقت المدخل
    const checkInDate = new Date(records[dk]?.checkIn || dk)
    // استخراج التاريخ المحلي بشكل صحيح (مش UTC)
    const ciYear = checkInDate.getFullYear(), ciMonth = checkInDate.getMonth(), ciDay = checkInDate.getDate()
    const ciHour = checkInDate.getHours(), ciMin = checkInDate.getMinutes()
    const checkInLocal = new Date(ciYear, ciMonth, ciDay, ciHour, ciMin, 0, 0)
    let d
    if (overrideDateKey) {
      // تاريخ يدوي من الشاشة (وردية تانية بعد منتصف الليل)
      const [y, mo, da] = overrideDateKey.split('-').map(Number)
      d = new Date(y, mo - 1, da, h, m, 0, 0)
    } else {
      d = new Date(ciYear, ciMonth, ciDay, h, m, 0, 0)
      if (records[dk]?.checkIn) {
        // وردية تانية: لو الوقت أبكر من الحضور (يعني بعد منتصف الليل)، التاريخ يوم تاني
        if (shift === 'shift2' && d <= checkInLocal) {
          d.setDate(d.getDate() + 1)
        }
      }
    }
    if (records[dk]?.checkIn) {
      // ممنوع فترات عمل بالسالب في كل الأحوال
      if (d <= checkInLocal) { showToast('⚠️ وقت الانصراف لازم يكون بعد وقت الحضور'); return false }
    }
    setRecords(prev => ({ ...prev, [dk]: { ...existing, checkOut: d.toISOString(), date: dk } }))
    const seq = ['✏️ تم تعديل الانصراف']
    const dt = existing.dayType
    if (dt) { const msg = checkOutNotification(dt, d, settings); if (msg) seq.push(msg) }
    showToastSeq(seq)
    return true
  }, [records, showToastSeq, settings])

  const deleteCheckInFn = useCallback(() => {
    const key = todayKeyFn()
    const existing = records[key]; if (!existing) return
    const rec = { ...existing }; delete rec.checkIn; delete rec.checkInLat; delete rec.checkInLng
    if (!rec.checkOut && !rec.dayType && !rec.notes) {
      setRecords(prev => { const u = { ...prev }; delete u[key]; return u })
    } else {
      setRecords(prev => ({ ...prev, [key]: rec }))
    }
    showToast('🗑️ تم حذف الحضور')
  }, [todayKeyFn, records, showToast])

  const deleteCheckOutFn = useCallback(() => {
    const key = todayKeyFn()
    const existing = records[key]; if (!existing) return
    const rec = { ...existing }; delete rec.checkOut; delete rec.checkOutLat; delete rec.checkOutLng
    if (!rec.checkIn && !rec.dayType && !rec.notes) {
      setRecords(prev => { const u = { ...prev }; delete u[key]; return u })
    } else {
      setRecords(prev => ({ ...prev, [key]: rec }))
    }
    showToast('🗑️ تم حذف الانصراف')
  }, [todayKeyFn, records, showToast])

  const setDayTypeForDate = useCallback((dk, type, vacationType = null) => {
    const balances = getLeaveBalances()
    if (type === 'regular_vacation' && balances.annualRemaining <= 0) { showToast('⚠️ انتهى رصيد الإجازات الاعتيادية'); return false }
    if (type === 'sick' && (balances.sickRemaining ?? 0) <= 0) { showToast('⚠️ انتهى رصيد الإجازات المرضية'); return false }
    if (type === 'rest_day') {
      // v11.9 + التعديل 23 نقطة 4: الحارس من utils/leaveCounts (نفس المنطق بالنص)
      let altMeta = []
      try { altMeta = JSON.parse(localStorage.getItem('att_alt_days')||'[]') } catch {}
      const chk = checkRestDayAvailability(records, altMeta, dk, settings.altDayMinHours || 6)
      if (!chk.ok) {
        if (chk.pendingIgnored>0) showToast(`⚠️ تم تجاهل ${chk.pendingIgnored} يوم معلق — مفيش بديل مستحق قديم قبل ${dk}`)
        else showToast('⚠️ مفيش رصيد أيام بديلة مستحقة قبل التاريخ ده')
        return false
      }
    }
    
    setDayType(dk, type)
    if (type === 'vacation' && vacationType) setVacationType(dk, vacationType)
    const existing = records[dk] || {}
    const rec = { ...existing }
    
    // تحديد الحقل المناسب بناءً على النوع
    let updates = { dayType: type, vacationType, date: dk }
    if (type === 'regular_vacation' || type === 'rest_day' || type === 'sick' || type === 'unpaid' || type === 'special' || type === 'weekend_rest') {
      updates.dayCalculation = type
      updates.shift = ''; updates.dayStatus = ''
      delete rec.checkIn; delete rec.checkInLat; delete rec.checkInLng
      delete rec.checkOut; delete rec.checkOutLat; delete rec.checkOutLng
    } else if (type === 'present') {
      updates.dayCalculation = ''; updates.dayType = 'present'
      const curShift = existing.shift || ''
      if (!curShift || curShift === 'no_task') { updates.shift = 'shift1'; updates.dayType = 'shift1' }
    } else if (type === 'shift1' || type === 'shift2' || type === 'shift3' || type === 'no_task') {
      updates.shift = type
    } else if (type === 'alt_day' || type === 'overtime_holiday') {
      updates.dayStatus = type
      updates.dayCalculation = ''
    } else if (type === 'normal_day' || type === 'weekend_overtime') {
      updates.dayStatus = type
    }
    
    setRecords(prev => ({ ...prev, [dk]: { ...rec, ...updates } }))
    
    const messages = {
      'overtime': '➕ تم احتساب يوم إضافة',
      // التعديل 23 نقطة 4: رسالة بدل الراحة من البديلة المستحقة (كانت رصيد الإعدادات — غلطة)
      'rest_day': `😴 تم احتساب بدل راحة — المتبقي: ${Math.max(0, (balances.altRemaining ?? 0) - 1)} يوم`,
      'regular_vacation': `🏖️ تم احتساب إجازة اعتيادية — المتبقي: ${balances.annualRemaining - 1} يوم`,
      'sick': `🤒 تم احتساب إجازة مرضية — المتبقي: ${(balances.sickRemaining ?? 0) - 1} يوم`,
      'unpaid': '📝 تم احتساب إجازة بدون أجر',
      'special': '⭐ تم احتساب إجازة خاصة',
      'weekend_rest': '🛌 تم تعيين بدون تكليف/راحة — تم تصفير الحسابات',
      'present': '✅ تم تحديد حضور — يمكنك اختيار الوردية وحالة اليوم',
      'alt_day': '📅 تمت الإضافة إلى الأيام البديلة',
      'overtime_holiday': '🎌 تم احتساب إضافي عطلة رسمية',
      'normal_day': '📅 تم تحديد يوم عادي',
      'shift1': '🌅 تم تحديد وردية أولى',
      'shift2': '🌆 تم تحديد وردية تانية',
      'shift3': '🌃 تم تحديد وردية تالتة',
      'no_task': '🚫 تم تحديد لا يوجد تكليف',
    }
    showToast(messages[type] || '✅ تم احتساب اليوم')
    return true
  }, [records, showToast, getLeaveBalances, settings])

  // لا يوجد تكليف — بيمسح النوع + أوقات الحضور/الانصراف
  const clearDay = useCallback((dk) => {
    setDayType(dk, null)
    setVacationType(dk, null)
    const existing = records[dk] || {}
    const rec = { ...existing }
    delete rec.dayType; delete rec.vacationType
    delete rec.dayCalculation; delete rec.shift; delete rec.dayStatus
    delete rec.checkIn; delete rec.checkInLat; delete rec.checkInLng
    delete rec.checkOut; delete rec.checkOutLat; delete rec.checkOutLng
    if (!rec.notes) {
      setRecords(prev => { const u = { ...prev }; delete u[dk]; return u })
    } else {
      setRecords(prev => ({ ...prev, [dk]: rec }))
    }
    showToast('🚫 تم إلغاء التكليف')
  }, [records, showToast])

  const revertDayType = useCallback((dk) => {
    setDayType(dk, null)
    setVacationType(dk, null)
    const existing = records[dk] || {}
    const rec = { ...existing }; delete rec.dayType; delete rec.vacationType
    if (!rec.checkIn && !rec.checkOut && !rec.notes) {
      setRecords(prev => { const u = { ...prev }; delete u[dk]; return u })
    } else {
      setRecords(prev => ({ ...prev, [dk]: rec }))
    }
    showToast('↩️ تم التراجع')
  }, [records, showToast])

  const deleteTime = useCallback((dk, type) => {
    const existing = records[dk]; if (!existing) return
    const rec = { ...existing }
    if (type === 'checkIn') { delete rec.checkIn; delete rec.checkInLat; delete rec.checkInLng }
    else { delete rec.checkOut; delete rec.checkOutLat; delete rec.checkOutLng }
    if (!rec.checkIn && !rec.checkOut && !rec.dayType && !rec.notes) {
      setRecords(prev => { const u = { ...prev }; delete u[dk]; return u })
    } else {
      setRecords(prev => ({ ...prev, [dk]: rec }))
    }
    showToast('🗑️ تم حذف الوقت')
  }, [records, showToast])

  const saveNotes = useCallback((dk, note) => {
    const existing = records[dk] || {}
    setRecords(prev => ({ ...prev, [dk]: { ...existing, notes: note, date: dk } }))
    showToast('📝 تم حفظ الملاحظة')
  }, [records, showToast])

  // quiet=true: حفظ صامت بدون توست (للمسح الجماعي — عشان التوستات متعملش فلاش)
  const updateRecordFields = useCallback((dk, updates, quiet) => {
    setRecords(prev => ({ ...prev, [dk]: { ...(prev[dk] || {}), ...updates, date: dk } }))
    if (!quiet) showToast('✅ تم تحديث السجل')
  }, [records, showToast])

  const openDayTypeDialog = useCallback((date) => setDayTypeDialog({ open: true, date }), [])
  const closeDayTypeDialog = useCallback(() => setDayTypeDialog({ open: false, date: null }), [])

  const needsDayTypeSelection = useCallback((dk) => {
    const weekendDays = (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]
    const d = new Date(dk); const day = d.getDay()
    return weekendDays.includes(day) && !getDayType(dk)
  }, [settings])

  return (
    <AttendanceContext.Provider value={{
      records, todayRecord, todayKey: todayKeyFn(), getDayCalc, getLeaveBalances,
      checkIn, checkOut, editCheckIn, editCheckOut, findPendingCheckOut,
      deleteCheckIn: deleteCheckInFn, deleteCheckOut: deleteCheckOutFn, deleteTime,
      setDayTypeForDate, revertDayType, clearDay, saveNotes, updateRecordFields,
      clearAllRecords,
      dayTypeDialog, openDayTypeDialog, closeDayTypeDialog,
      needsDayTypeSelection, getDayType, getVacationType, showToast, showToastSeq, toast,
    }}>
      {children}
    </AttendanceContext.Provider>
  )
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext)
  if (!ctx) throw new Error('useAttendance must be used within AttendanceProvider')
  return ctx
}
