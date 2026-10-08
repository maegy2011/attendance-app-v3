import { isHoliday } from './calendar'

// تحويل dayType القديم للحقول الثلاثة الجديدة (مهاجرة تلقائية)
function migrateDayType(oldDayType) {
  if (!oldDayType) return { dayCalculation: '', shift: '', dayStatus: '' }
  switch (oldDayType) {
    case 'regular_vacation': return { dayCalculation: 'regular_vacation', shift: '', dayStatus: '' }
    case 'rest_day': return { dayCalculation: 'rest_day', shift: '', dayStatus: '' }
    case 'shift1': return { dayCalculation: '', shift: 'shift1', dayStatus: '' }
    case 'shift2': return { dayCalculation: '', shift: 'shift2', dayStatus: '' }
    case 'shift3': return { dayCalculation: '', shift: 'shift3', dayStatus: '' }
    case 'no_task': return { dayCalculation: '', shift: 'no_task', dayStatus: '' }
    case 'alt_day': return { dayCalculation: '', shift: '', dayStatus: 'alt_day' }
    case 'overtime_holiday': return { dayCalculation: '', shift: '', dayStatus: 'overtime_holiday' }
    case 'overtime': return { dayCalculation: '', shift: '', dayStatus: 'overtime_holiday' }
    default: return { dayCalculation: '', shift: '', dayStatus: '' }
  }
}

// دالة مساعدة لاستخراج النوع الفعال من الحقول الثلاثة
function getEffectiveDayType(record) {
  if (record?.dayCalculation) return record.dayCalculation
  if (record?.shift) return record.shift
  return record?.dayStatus || record?.dayType || ''
}

// دالة لاستخراج dayCalculation من السجل (للبحث والترتيب)
function getDayCalcFromRecord(record) {
  return record?.dayCalculation || record?.dayType || ''
}

// دالة لاستخراج shift من السجل
function getShiftFromRecord(record) {
  return record?.shift || record?.dayType || ''
}

// دالة لاستخراج dayStatus من السجل
function getDayStatusFromRecord(record) {
  return record?.dayStatus || ''
}

// --- دوال صغيرة مفككة (حل مشكلة 14 — تقسيم 238 سطر) ---
function calcOvertime(totalHours, dayType, isWeekendOrHoliday, dayOfWeek, firstWeekend, secondWeekend, checkIn, checkOut, roundingMode, settings) {
  let overtimeHours=0, overtimeMultiplier=0
  if (dayType === 'shift1') {
    if (isWeekendOrHoliday) {
      if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
      else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
      else overtimeMultiplier = settings.holidayMultiplier || 2
      overtimeHours = totalHours * overtimeMultiplier
    } else {
      const [endH, endM] = '16:00'.split(':').map(Number)
      if (checkOut) { const coMin = checkOut.getHours()*60+checkOut.getMinutes(); overtimeHours = Math.max(0, roundHours((coMin - (endH*60+endM))/60, roundingMode)) }
    }
  } else if (dayType === 'shift2' || dayType === 'shift3') {
    if (isWeekendOrHoliday) {
      if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
      else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
      else overtimeMultiplier = settings.holidayMultiplier || 2
      overtimeHours = totalHours * overtimeMultiplier
    } else { overtimeHours = Math.max(0, roundHours(totalHours - 7, roundingMode)) }
  } else if (isWeekendOrHoliday) {
    if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
    else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
    else overtimeMultiplier = settings.holidayMultiplier || 2
    overtimeHours = totalHours * overtimeMultiplier
  } else {
    const [endH, endM] = '16:00'.split(':').map(Number)
    if (checkOut) { const coMin = checkOut.getHours()*60+checkOut.getMinutes(); overtimeHours = Math.max(0, roundHours((coMin - (endH*60+endM))/60, roundingMode)) }
  }
  return { overtimeHours, overtimeMultiplier }
}
function calcLunch(shiftVal, checkOut, totalHours, settings) {
  if (shiftVal !== 'shift1' || !checkOut) return 0
  const [lH, lM] = (settings.lunchAfterTime || '16:31').split(':').map(Number)
  const coMin = checkOut.getHours()*60+checkOut.getMinutes()
  if (totalHours >= (settings.lunchMinHours || 8) && coMin >= (lH*60+lM)) return settings.lunchValue || 0
  return 0
}
function calcBonus(totalHours, isWeekendOrHoliday, isHolidayStatus, isWeekendOvertimeStatus, settings) {
  if (settings?.bonusEnabled !== true) return 0
  if (isWeekendOrHoliday || isHolidayStatus || isWeekendOvertimeStatus) {
    if (totalHours >= (settings.bonusMinHours || 7)) return settings.bonusValue || 0
  }
  return 0
}
function calcTaxi(record, checkIn, checkOut, settings) {
  if (getShiftFromRecord(record) !== 'shift2') return 0
  const ciMins = checkIn.getHours()*60+checkIn.getMinutes()
  const inWindow = ciMins >= 14*60 && ciMins <= 17*60
  let afterMidnight=false
  if (checkOut) { const coMins=checkOut.getHours()*60+checkOut.getMinutes(); afterMidnight=coMins>=0&&coMins<=5*60 }
  if (inWindow && afterMidnight) return settings.taxiValue || 0
  return 0
}

export function calculateDay(record, settings) {
  if (!record || !record.checkIn) return null
  const dayType = getEffectiveDayType(record)
  if (!dayType) return null
  const checkIn = new Date(record.checkIn)
  const checkOut = record.checkOut ? new Date(record.checkOut) : null
  const roundingMode = settings.hourRounding || 'floor'
  const rawTotalHours = checkOut ? ((checkOut - checkIn) / 3600000) : 0
  const totalHours = roundHours(rawTotalHours, roundingMode)

  const dayOfWeek = checkIn.getDay()
  const weekendDays = (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]
  const firstWeekend = weekendDays[0]
  const secondWeekend = weekendDays[1]
  const isWeekendOrHoliday = weekendDays.includes(dayOfWeek) || isHoliday(checkIn)
  // قراءة الوردية وحالة اليوم كمستقلين — الوردية تحدد البدلات، حالة اليوم تحدد نوع اليوم
  const shiftVal = getShiftFromRecord(record) || ''
  const dayStatusVal = record?.dayStatus || ''
  const isAltDayStatus = dayStatusVal === 'alt_day' || dayType === 'alt_day'
  const isHolidayStatus = dayStatusVal === 'overtime_holiday' || dayType === 'overtime_holiday'
  const isWeekendOvertimeStatus = dayStatusVal === 'weekend_overtime' || dayType === 'weekend_overtime'
  let overtimeHours = 0, overtimeMultiplier = 0

  // القاعدة العامة: أي تركيبة في آخرها "لا يوجد تكليف" = صفر كامل (ساعات + مكافأة + غدا + تاكسي)
  if (shiftVal === 'no_task' || dayType === 'no_task') {
    return {
      totalHours: 0, overtimeHours: 0,
      overtimeMultiplier: 0, overtimeValue: 0, lunchValue: 0, bonusValue: 0, taxiValue: 0,
      total: 0, dayType, isRestDay: false, isSpecialDay: false,
      meetsRestMinimum: false,
    }
  }

  // إجازة اعتيادية - يوم إجازة من غير حضور
  if (dayType === 'regular_vacation') {
    return {
      totalHours: 0, overtimeHours: 0,
      overtimeMultiplier: 0, overtimeValue: 0, lunchValue: 0, bonusValue: 0, taxiValue: 0,
      total: 0, dayType, isRestDay: false, isSpecialDay: true,
      meetsRestMinimum: false, isRegularVacation: true,
    }
  }

  // بدل راحة (من مربع كإجازة) - يوم إجازة من غير حضور
  if (dayType === 'rest_day') {
    return {
      totalHours: 0, overtimeHours: 0,
      overtimeMultiplier: 0, overtimeValue: 0, lunchValue: 0, bonusValue: 0, taxiValue: 0,
      total: 0, dayType, isRestDay: true, isSpecialDay: true,
      meetsRestMinimum: false,
    }
  }

  // مرضي / بدون أجر — تصفير شامل ولا يستحق بدلات (v11.6)
  if (dayType === 'sick' || dayType === 'unpaid') {
    return {
      totalHours: 0, overtimeHours: 0,
      overtimeMultiplier: 0, overtimeValue: 0, lunchValue: 0, bonusValue: 0, taxiValue: 0,
      total: 0, dayType, isRestDay: false, isSpecialDay: true,
      meetsRestMinimum: false, isSick: dayType==='sick', isUnpaid: dayType==='unpaid',
    }
  }

  // يوم بديل (من عمود "حاله اليوم") — في أي يوم من الأسبوع:
  // التركيبات 1-4: حضور+بديلة+وردية → الكلية صفر + مكافأة 7س + تاكسي لوردية ثانية/ثالثة
  // v11.4: عرض الساعات فقط في الجدول + البرنامج يراجع تلقائي الاستحقاق (≥6س)
  if (isAltDayStatus) {
    const minHours = settings.altDayMinHours || 6
    const actualHours = totalHours
    const bonusValue = (settings.bonusEnabled===true && actualHours >= (settings.bonusMinHours || 7)) ? (settings.bonusValue || 0) : 0
    // بدل التاكسي: وردية تانية فقط + شروط الحضور/الانصراف
    let taxiValue = 0
    if (shiftVal === 'shift2') {
      const ciMins = checkIn.getHours() * 60 + checkIn.getMinutes()
      const inWindow = ciMins >= 14 * 60 && ciMins <= 17 * 60 // 2:00م - 5:00م
      let afterMidnight = false
      if (checkOut) {
        const coMins = checkOut.getHours() * 60 + checkOut.getMinutes()
        afterMidnight = coMins >= 0 && coMins <= 5 * 60 // منتصف الليل حتى 5:00ص
      }
      if (inWindow && afterMidnight) taxiValue = settings.taxiValue || 0
    }
    const displayHours = actualHours // العرض في جدول السجلات (البرنامج يراجع isAltDay + meetsAltMinimum تلقائي)
    return {
      totalHours: 0, displayHours, actualHours,
      overtimeHours: 0,
      overtimeMultiplier: 0, overtimeValue: 0, lunchValue: 0, bonusValue, taxiValue,
      total: bonusValue + taxiValue, totalExtras: 0, grandTotal: bonusValue + taxiValue,
      dayType: 'alt_day', isRestDay: false, isSpecialDay: true,
      meetsRestMinimum: false, isAltDay: true,
      meetsAltMinimum: actualHours >= minHours,
    }
  }

  // إضافي عطلة رسمية (من عمود "حاله اليوم") — في أي يوم من الأسبوع:
  // التركيبات 5-8: ساعات ×2 + مكافأة 7س + غدا (أولى) + تاكسي (ثانية) حسب الوردية
  if (isHolidayStatus) {
    overtimeMultiplier = settings.fridayMultiplier || 2
    overtimeHours = totalHours * overtimeMultiplier
    const overtimeValue = Math.round(overtimeHours * (settings.hourlyRate || 0))

    // بدل الغدا: الوردية الأولى فقط + الشروط (8 ساعات + انصراف بعد 16:31)
    let lunchValue = 0
    if (shiftVal === 'shift1' && checkOut) {
      const [lH, lM] = (settings.lunchAfterTime || '16:31').split(':').map(Number)
      const coMin = checkOut.getHours() * 60 + checkOut.getMinutes()
      if (totalHours >= (settings.lunchMinHours || 8) && coMin >= (lH * 60 + lM)) lunchValue = settings.lunchValue || 0
    }

    // المكافأة: بشرط 7 ساعات حضور
    const bonusValue = (settings.bonusEnabled===true && totalHours >= (settings.bonusMinHours || 7)) ? (settings.bonusValue || 0) : 0

    // بدل التاكسي: الوردية الثانية فقط + شروط الحضور/الانصراف
    let taxiValue = 0
    if (shiftVal === 'shift2') {
      const ciMins = checkIn.getHours() * 60 + checkIn.getMinutes()
      const inWindow = ciMins >= 14 * 60 && ciMins <= 17 * 60 // 2:00م - 5:00م
      let afterMidnight = false
      if (checkOut) {
        const coMins = checkOut.getHours() * 60 + checkOut.getMinutes()
        afterMidnight = coMins >= 0 && coMins <= 5 * 60 // منتصف الليل حتى 5:00ص
      }
      if (inWindow && afterMidnight) taxiValue = settings.taxiValue || 0
    }

    const totalExtras = overtimeValue + lunchValue
    const grandTotal = overtimeValue + lunchValue + bonusValue + taxiValue
    return {
      totalHours, overtimeHours: Math.round(overtimeHours * 100) / 100,
      overtimeMultiplier, overtimeValue, lunchValue, bonusValue, taxiValue,
      total: grandTotal, totalExtras, grandTotal,
      dayType: 'overtime_holiday', isRestDay: false, isSpecialDay: true,
      meetsRestMinimum: false, isOvertimeHoliday: true, isShift2: shiftVal === 'shift2',
    }
  }
  // إضافي (جمعة/سبت) - يطبق مضاعف الجمعة/السبت على كل الساعات (التركيبات 13-15)
  else if (isWeekendOvertimeStatus) {
    if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
    else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
    else overtimeMultiplier = settings.holidayMultiplier || 2
    overtimeHours = totalHours * overtimeMultiplier
  }
  // الوردية الأولى: الأحد-الخميس = إضافي بعد موعد الانصراف، الجمعة/السبت/العطلة = مضاعف
  else if (dayType === 'shift1') {
    if (isWeekendOrHoliday) {
      if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
      else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
      else overtimeMultiplier = settings.holidayMultiplier || 2
      overtimeHours = totalHours * overtimeMultiplier
    } else {
      // الوردية الأولى: الإضافي على الساعات بعد الساعة 4 عصراً (16:00) — منفصل عن shift1.end المستخدم للإشعار
      const [endH, endM] = '16:00'.split(':').map(Number)
      if (checkOut) {
        const coMin = checkOut.getHours() * 60 + checkOut.getMinutes()
        overtimeHours = Math.max(0, roundHours((coMin - (endH * 60 + endM)) / 60, roundingMode))
      }
    }
  }
  // الورديات (2/3): الأحد-الخميس = إضافي بعد ساعات العمل، الجمعة/السبت/العطلة = مضاعف
  else if (dayType === 'shift2' || dayType === 'shift3') {
    if (isWeekendOrHoliday) {
      if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
      else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
      else overtimeMultiplier = settings.holidayMultiplier || 2
      overtimeHours = totalHours * overtimeMultiplier
    } else {
      // الأحد-الخميس: الإضافي بعد ساعات العمل — ثابت 7 ساعات
      const workCount = 7
      overtimeHours = Math.max(0, roundHours(totalHours - workCount, roundingMode))
    }
  }
  // أيام العمل الإضافية القديمة (overtime) + أيام الإجازة الأسبوعية العادية
  else if (dayOfWeek === firstWeekend || dayOfWeek === secondWeekend || getDayCalcFromRecord(record) === 'overtime') {
    if (dayOfWeek === firstWeekend || isHoliday(checkIn)) overtimeMultiplier = settings.fridayMultiplier || 2
    else if (dayOfWeek === secondWeekend) overtimeMultiplier = settings.saturdayMultiplier || 1.5
    else overtimeMultiplier = settings.holidayMultiplier || 2
    overtimeHours = totalHours * overtimeMultiplier
  }
  // أيام العمل العادية (بدون نوع محدد صراحةً) — تُعامل كوردية أولى: إضافي بعد 16:00
  else {
    const [endH, endM] = '16:00'.split(':').map(Number)
    if (checkOut) {
      const coMin = checkOut.getHours() * 60 + checkOut.getMinutes()
      overtimeHours = Math.max(0, roundHours((coMin - (endH * 60 + endM)) / 60, roundingMode))
    }
  }

  const overtimeValue = Math.round(overtimeHours * (settings.hourlyRate || 0))
  const lunchValue = calcLunch(shiftVal, checkOut, totalHours, settings)
  const bonusValue = calcBonus(totalHours, isWeekendOrHoliday, isHolidayStatus, isWeekendOvertimeStatus, settings)
  const taxiValue = calcTaxi(record, checkIn, checkOut, settings)

  // مجموع الإضافي = أجر الساعات الإضافية + بدل الغداء (بدون أجر أساسي)
  const totalExtras = overtimeValue + lunchValue
  // المجموع الكلي = أجر إضافي + غداء + مكافأة + تاكسي (موحّد مع total — مفيش أجر أساسي)
  const grandTotal = overtimeValue + lunchValue + bonusValue + taxiValue

  return {
    totalHours, overtimeHours: Math.round(overtimeHours * 100) / 100,
    overtimeMultiplier, overtimeValue, lunchValue, bonusValue, taxiValue,
    total: overtimeValue + lunchValue + bonusValue + taxiValue,
    totalExtras, grandTotal,
    dayType, isRestDay: dayType === 'rest_day', isSpecialDay: dayType !== 'regular' && dayType !== 'vacation',
    meetsRestMinimum: dayType !== 'rest_day' || totalHours >= (settings.restDayMinHours || 6),
    isOvertimeHoliday: dayType === 'overtime_holiday',
    isShift2: getShiftFromRecord(record) === 'shift2',
  }
}

// تقريب الساعات حسب الإعداد
function roundHours(h, mode) {
  if (mode === 'floor') return Math.floor(h)
  if (mode === 'round') return Math.round(h)
  if (mode === 'half') return Math.round(h * 2) / 2
  return Math.round(h * 100) / 100
}

export function calculateMonthly(records, settings, startDate, endDate) {
  let totalOvertime = 0, totalOvertimeHours = 0, totalLunch = 0, totalBonus = 0, totalAmount = 0, totalDays = 0, totalHours = 0, totalExtras = 0, grandTotal = 0, totalTaxi = 0
  const days = []
  for (const [dk, record] of Object.entries(records)) {
    const d = new Date(dk); if (d < startDate || d > endDate) continue
    const calc = calculateDay(record, settings); if (!calc) continue
    days.push({ date: dk, ...calc })
    totalOvertimeHours += calc.overtimeHours; totalOvertime += calc.overtimeValue
    totalLunch += calc.lunchValue; totalBonus += calc.bonusValue; totalTaxi += calc.taxiValue
    totalAmount += calc.total; totalHours += calc.totalHours; totalDays++
    totalExtras += calc.totalExtras || 0; grandTotal += calc.grandTotal || 0
  }
  days.sort((a, b) => a.date.localeCompare(b.date))
  return { days, totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100, totalOvertime, totalLunch, totalBonus, totalTaxi, totalAmount, totalDays, totalHours: Math.round(totalHours * 100) / 100, totalExtras: Math.round(totalExtras), grandTotal: Math.round(grandTotal) }
}

export function calculateYearlyVacations(records, year) {
  let restDayCount = 0, regularVacationCount = 0, sickCount=0, unpaidCount=0
  const vacations = []
  for (const [dk, record] of Object.entries(records)) {
    if (!dk.startsWith(String(year))) continue
    const dayCalc = getDayCalcFromRecord(record)
    const shift = getShiftFromRecord(record)
    if (['rest_day','regular_vacation','sick','unpaid'].includes(dayCalc) || shift === 'rest_day') {
      if (dayCalc === 'rest_day') { restDayCount++; vacations.push({ date: dk, type: dayCalc }) }
      else if (dayCalc === 'regular_vacation') { regularVacationCount++; vacations.push({ date: dk, type: dayCalc }) }
      else if (dayCalc === 'sick') { sickCount++; vacations.push({ date: dk, type: dayCalc }) }
      else if (dayCalc === 'unpaid') { unpaidCount++; vacations.push({ date: dk, type: dayCalc }) }
    }
  }
  return {
    vacations: vacations.sort((a, b) => a.date.localeCompare(b.date)),
    restDayCount,
    regularVacationCount,
    totalPaidLeave: restDayCount + regularVacationCount,
  }
}

export function formatHours(hours) {
  if (!hours || hours === 0) return '0'
  const h = Math.floor(hours); const m = Math.round((hours - h) * 60)
  return m === 0 ? `${h} ساعة` : `${h} س ${m} د`
}

export function formatCurrency(amount) {
  if (!amount || amount === 0) return '0'
  return amount.toLocaleString('ar-EG-u-nu-latn') // v12.8.4 (بند ٤): أرقام غربية
}

// تصدير الدوال المشتركة للاستخدام في المكونات الأخرى
export { getEffectiveDayType, migrateDayType, getDayCalcFromRecord, getShiftFromRecord, getDayStatusFromRecord }
