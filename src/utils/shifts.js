// مركز بيانات الورديات وحالات اليوم المشتركة بين كل شاشات التطبيق

export const SHIFT_LABELS = {
  shift1: 'وردية أولى',
  shift2: 'وردية تانية',
  shift3: 'وردية تالتة',
}

// تحديد الوردية تلقائيًا حسب وقت تسجيل الحضور
// shift1: 6:00ص - 10:00ص | shift2: 1:00م - 6:00م | shift3: 10:00م - 1:30ص
// يرجع مفتاح الوردية أو null لو الوقت في فراغ
export function determineShiftFromTime(h, m) {
  const mins = h * 60 + m
  if (mins >= 360 && mins <= 600) return 'shift1'   // 6:00 - 10:00
  if (mins >= 780 && mins <= 1080) return 'shift2'  // 13:00 - 18:00
  if (mins >= 1320 || mins <= 90) return 'shift3'   // 22:00 - 23:59 أو 0:00 - 1:30
  return null
}

function pad(n) { return String(n).padStart(2, '0') }

// نص تنبيه الحضور حسب نوع اليوم
export function checkInNotification(dayType, checkInDate, settings) {
  switch (dayType) {
    case 'no_task':
      return 'يرجي الانصراف الساعه ٣ لا يوجد تكليف لسيادتكم'
    case '':
      return 'يرجي الانصراف الساعه ٣ لا يوجد تكليف لسيادتكم'
    case 'shift1':
      return 'عدم الانصراف قبل الساعه الخامسه'
    case 'shift2':
      return 'موعد الانصراف ١٢ منتصف الليل — لا تنسَ التسجيل'
    case 'shift3':
      return 'موعد الانصراف ٨ صباحًا'
    case 'alt_day': {
      const h = settings?.altDayMinHours || 6
      const d = new Date(checkInDate)
      d.setHours(d.getHours() + h, d.getMinutes(), 0, 0)
      return `الانصراف بعد ${h} ساعات عمل الساعه ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    default:
      return null
  }
}

// نص تنبيه الانصراف حسب نوع اليوم
export function checkOutNotification(dayType, checkOutDate, settings) {
  if (dayType === 'shift1') {
    const [eh, em] = (settings?.shift1?.end || '17:00').split(':').map(Number)
    const endMin = eh * 60 + em
    const co = checkOutDate.getHours() * 60 + checkOutDate.getMinutes()
    if (co < endMin) return 'انصرفت قبل الساعه الخامسه'
  }
  if (dayType === 'shift2') {
    const co = checkOutDate.getHours() * 60 + checkOutDate.getMinutes()
    if (co >= 12 * 60) return 'انصرفت قبل موعد الوردية — لن يُحتسب بدل التاكسي'
  }
  return null
}
