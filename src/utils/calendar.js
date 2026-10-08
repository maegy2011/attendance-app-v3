// v12.11.25 التعديل التالت: العطلات الثابتة اتمسحت نهائيًا — المستخدم هو اللي يحدد
// (عادي / عطلة رسمية) من تركيبة اليوم في السجلات. التاريخ مش بيفرض حاجة.
export function getHolidaysForYear(year) {
  return {}
}

export function isHoliday(date) {
  return null
}

export function getDayNameAr(date) {
  const d = new Date(date)
  return ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()]
}

export function getMonthNameAr(m) {
  return ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][m]
}

export function formatDateAr(date) {
  const d = new Date(date)
  return `${d.getDate()} ${getMonthNameAr(d.getMonth())} ${d.getFullYear()}`
}

export function timestampToTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// تاريخ محلي (YYYY-MM-DD) من ISO timestamp — مش UTC
// مهم للوردية التانية: الانصراف بعد منتصف الليل بيسجل في اليوم التاني
export function timestampToDateKey(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function dateKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
