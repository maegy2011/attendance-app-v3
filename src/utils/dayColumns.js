// utils/dayColumns.js — التعديل 26 (v12.8.12)
// أعمدة السجلات الثلاثة (نوع الإجازة/حالة اليوم/الوردية) من مصدر واحد: السجلات + الرئيسية
// منقولة من Records.jsx بالنص — القوايم + الألوان + القيم + الحفظ + البوابة

import { checkRestDayAvailability } from './leaveCounts'
import { isPinOn } from '../hooks/usePinArea'

export const SHIFT_OPTIONS = [
  { value: 'no_task', label: 'لا يوجد تكليف' },
  { value: 'shift1', label: 'وردية أولى' },
  { value: 'shift2', label: 'وردية تانية' },
  { value: 'shift3', label: 'وردية تالتة' },
]

// بند 2: الاختيار الفاضي (-) — يظهر فقط للأيام اللي لسه متسددتش، ويختفي بعد التسديد
// القيمة المخزنة '' (فاضي فعلاً) — الشرطة مجرد شكل

export const EMPTY_OPT = { value: '', label: '—' }

// خيارات الوردية حسب القيمة الحالية (الفاضي يظهر فقط لو اليوم لسه فاضي)
export const getShiftOptions = (currentValue) => {
  if (!currentValue) return [EMPTY_OPT, ...SHIFT_OPTIONS]
  return SHIFT_OPTIONS
}

// خيارات عمود "حاله اليوم" حسب اليوم — بند 2: الفاضي (-) افتراضي ويختفي بعد التسديد
// ملاحظة: normal_day مخفي للجمعة/السبت، وweekend_overtime افتراضي للجمعة/السبت (قبل بند 2)
export const DAY_STATUS_OPTIONS = [
  { value: 'normal_day', label: 'إضافي أسبوعي عادي' },
  { value: 'weekend_overtime', label: 'إضافي (جمعة/سبت)' },
  { value: 'alt_day', label: 'يضاف للأيام البديلة' },
  { value: 'overtime_holiday', label: 'إضافي عطلة رسمية' },
]

// خيارات عمود "حاله اليوم" حسب اليوم
export const getDayStatusOptionsForDay = (isWeekend, currentValue) => {
  let opts
  if (isWeekend) {
    opts = DAY_STATUS_OPTIONS.filter(o => o.value !== 'normal_day')
  } else {
    opts = DAY_STATUS_OPTIONS.filter(o => o.value !== 'weekend_overtime' || o.value === currentValue)
  }
  // بند 2: الفاضي (-) أول القايمة فقط لو اليوم لسه متسددش
  if (!currentValue) return [EMPTY_OPT, ...opts]
  return opts
}

// خيارات "نوع الاجازه" ديناميكياً حسب اليوم وحالة اليوم
export const getDayCalcOptions = (isWeekend, dayStatus) => {
  if (isWeekend) {
    return [
      { value: 'present', label: 'حضور' },
      { value: 'weekend_rest', label: 'بدون تكليف/راحة' },
    ]
  }
  if (dayStatus === 'alt_day' || dayStatus === 'overtime_holiday') {
    return [
      { value: 'present', label: 'حضور' },
    ]
  }
  return [
    { value: 'present', label: 'حضور' },
    { value: 'regular_vacation', label: 'إجازة اعتيادية' },
    { value: 'rest_day', label: 'إجازة بدل راحة' },
    { value: 'sick', label: 'إجازة مرضي' },
    { value: 'unpaid', label: 'بدون أجر' },
    { value: 'special', label: 'إجازة خاصة' },
  ]
}

// لون زرار الخانة حسب القيمة — التعديل ٣/٤/٥: السجلات فقط (الرئيسية بألوان ثابتة)
// التعديل ٣: نوع الإجازة = لون هيدر لكل قيمة | التعديل ٤: الحالة = الهيدر مخفف 25% للكل | التعديل ٥: الوردية = الهيدر مخفف 50% للكل
// الألوان الفعلية في index.css (تتبع الثيم — عدا الأحمر والرمادي الثابتين) — النص أبيض
// ملاحظة: لا تستخدم المنطق القديم — هذه الدالة تُرجع اسم كلاس دلالي فقط
export const cardSelectClass = (type, value, big) => {
  const base = big ? 'text-sm p-2 rounded-lg border-2 font-bold w-full min-w-[130px] ' : 'text-xs p-1 rounded-lg border-2 font-bold w-full min-w-[110px] '
  // بند 2: الفاضي (-) بلون خلفية الخانة + بوردر رمادي خفيف
  if (!value) return base + 'd-empty'
  if (type === 'dayStatus') return base + 'dst-all'
  if (type === 'shift') return base + 'dsh-all'
  if (value === 'regular_vacation') return base + 'dcc-regular_vacation'
  if (value === 'rest_day') return base + 'dcc-rest_day'
  if (value === 'sick') return base + 'dcc-sick'
  if (value === 'unpaid') return base + 'dcc-unpaid'
  if (value === 'special') return base + 'dcc-special'
  if (value === 'weekend_rest') return base + 'dcc-weekend_rest'
  return base + 'dcc-present'
}

// القيم الظاهرة للأعمدة — الفراغ في dayCalculation يُعرض كـ «حضور»
export const getDayCalcValue = (row) => {
  const dc = row?.dayCalc ?? row?.dayCalculation ?? ''
  if (['regular_vacation', 'rest_day', 'weekend_rest', 'sick', 'unpaid', 'special'].includes(dc)) return dc
  return 'present'
}
export const getShiftValue = (row) => row?.shift || ''
export const getDayStatusValue = (row) => row?.dayStatus || ''

// هل نوع الإجازة يعطل عمودي الحالة والوردية؟
export const isLeaveCalc = (dayCalcValue) =>
  ['regular_vacation', 'rest_day', 'weekend_rest', 'sick', 'unpaid', 'special'].includes(dayCalcValue)

// بوابة الرمز للأعمدة — الفاضي حر دائمًا (أي يوم)
// الماضي + بيانات: البوابة على كل الخلايا (قديم)
// تعديل ١١: النهاردة والمستقبل + بيانات: البوابة على التلات خانات والحضور والانصراف فقط
// (الملاحظات حرة للنهاردة/المستقبل — والماضي زي ما هو)
export const createDayGuard = ({ getRecords, todayKey, request, area }) => (dk, fn, cell) => {
  if (!isPinOn()) { fn(); return }
  const r = getRecords()[dk]
  const has = !!(r && (r.checkIn || r.checkOut || r.dayType || r.dayCalculation || r.dayStatus || r.shift || r.notes || r.specialLabel))
  if (!has) { fn(); return }
  if (dk >= todayKey && cell === 'notes') { fn(); return }
  request(area || 'records', dk >= todayKey ? '📋 تعديل سجل مسدد' : '📋 تعديل سجل سابق', fn)
}

// دوال حفظ الأعمدة الثلاثة — نفس منطق السجلات بالنص (الحراس + الرسايل)
// deps: { getRecords, getSettings, getLeaveBalances, updateRecordFields, showToast, openSpecialDialog, onLeave }
// التعديل ١٣: onLeave(dk, type) بعد تسجيل إجازة ناجح (سؤال الواتساب)
export const createDayColumnSavers = (deps) => {
  const { getRecords, getSettings, getLeaveBalances, updateRecordFields, showToast, openSpecialDialog, onLeave } = deps

  const handleDayCalcChange = (dk, value) => {
    const records = getRecords() || {}
    const settings = getSettings() || {}
    const record = records[dk] || {}
    const balances = getLeaveBalances()

    if (value === 'present' || value === '') {
      // اقتراح (أ): حضور تثبت كقيمة «present» بدل الفاضية — تظهر في الكارت ولا تُحسب
      // (الحسابات تتجاهلها: لا إجازة ولا راحة ولا إضافي — والوظيفة والاسم زي ما هما)
      const patch = { dayCalculation: 'present', dayType: '' }
      updateRecordFields(dk, patch)
      showToast('✅ تم تحديد «حضور» — اختر الوردية وحالة اليوم')
      return
    }

    if (value === 'weekend_rest') {
      const updates = { dayCalculation: value, dayType: value, shift: '', dayStatus: '', checkIn: null, checkOut: null }
      updateRecordFields(dk, updates)
      showToast('✅ تم تعيين «بدون تكليف/راحة» — تم تصفير الحسابات')
      return
    }

    if (value === 'regular_vacation' && balances.annualRemaining <= 0) {
      showToast('⚠️ انتهى رصيد الإجازات الاعتيادية')
      return
    }
    if (value === 'sick' && (balances.sickRemaining ?? 0) <= 0) {
      showToast('⚠️ انتهى رصيد الإجازات المرضية')
      return
    }
    if (value === 'rest_day') {
      try {
        let altMeta = []
        try { altMeta = JSON.parse(localStorage.getItem('att_alt_days') || '[]') } catch {}
        const chk = checkRestDayAvailability(records, altMeta, dk, settings?.altDayMinHours || 6)
        if (!chk.ok) {
          if (chk.pendingIgnored > 0) showToast(`⚠️ تم تجاهل ${chk.pendingIgnored} يوم معلق — مفيش بديل مستحق قديم قبل ${dk}`)
          else showToast('⚠️ مفيش رصيد أيام بديلة مستحقة قبل التاريخ ده')
          return
        }
      } catch (e) { showToast('⚠️ خطأ في حساب الرصيد'); return }
    }

    if (value === 'special') {
      openSpecialDialog(dk, record?.specialLabel || '')
      return
    }
    const updates = { dayCalculation: value, dayType: value, shift: '', dayStatus: '', checkIn: null, checkOut: null }
    updateRecordFields(dk, updates)
    const label = getDayCalcOptions(false, '').find(o => o.value === value)?.label || value
    showToast(`✅ تم تعيين «${label}» — تم تصفير الحسابات وخصم يوم من الرصيد`)
    // التعديل ١٣: سؤال الواتساب بعد تسجيل الإجازة (الأنواع الخمسة فقط)
    if (['regular_vacation', 'rest_day', 'sick', 'unpaid', 'special'].includes(value)) { try { onLeave && onLeave(dk, value) } catch {} }
  }

  const handleShiftChange = (dk, value) => {
    if (value === '') {
      updateRecordFields(dk, { shift: '' })
      showToast('🗑️ تم مسح الورديه')
      return
    }
    updateRecordFields(dk, { shift: value, dayType: value })
    showToast(`✅ تم تعيين الورديه: ${SHIFT_OPTIONS.find(o => o.value === value)?.label || value}`)
  }

  const handleDayStatusChange = (dk, value) => {
    if (value === '') {
      updateRecordFields(dk, { dayStatus: '' })
      showToast('🗑️ تم مسح حالة اليوم')
      return
    }
    if (value === 'alt_day' || value === 'overtime_holiday') {
      updateRecordFields(dk, { dayStatus: value, dayType: value, dayCalculation: '' })
      showToast(`✅ تم تعيين حالة اليوم — تم اختيار «حضور» تلقائياً`)
      return
    }
    updateRecordFields(dk, { dayStatus: value, dayType: value })
    showToast(`✅ تم تعيين حالة اليوم: ${DAY_STATUS_OPTIONS.find(o => o.value === value)?.label || value}`)
  }

  // حفظ الإجازة الخاصة بالاسم (الحوار نفسه عند كل صفحة — المنطق واحد)
  const saveSpecial = (dk, name) => {
    const n = (name || '').trim()
    if (!n) { showToast('⚠️ أدخل اسم الإجازة'); return false }
    updateRecordFields(dk, { dayCalculation: 'special', dayType: 'special', specialLabel: n, shift: '', dayStatus: '', checkIn: null, checkOut: null })
    showToast(`✅ تم تعيين «إجازة خاصة - ${n}»`)
    // التعديل ١٣: الخاصة عبر الحوار تسأل واتساب أيضًا
    try { onLeave && onLeave(dk, 'special') } catch {}
    return true
  }

  return { handleDayCalcChange, handleShiftChange, handleDayStatusChange, saveSpecial }
}
