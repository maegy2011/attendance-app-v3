// منطق التسديد FIFO + إعادة التسديد + التدرج
// القاعدة الذهبية: تاريخ البديل < تاريخ الإجازة

function parseDate(dk) { const [y,m,d]=dk.split('-').map(Number); return new Date(y,m-1,d) }
function sortByDate(a,b){ return parseDate(a.date) - parseDate(b.date) }

/**
 * إعادة حساب تسديد إجازات بدل الراحة
 * @param {Array} altDays - [{date, selfService, notes}]
 * @param {Array} leaves - [{id,date,type,paidBy,selfService,notes,originalType}]
 * @param {Object} settings - {annualLeaveBalance,sickLeaveBalance}
 * @returns {Array} leaves الجديدة بعد التسديد/التحويل
 */
export function recalcVacations(altDays, leaves, settings) {
  const annualTotal = settings.annualLeaveBalance ?? 21
  const sickTotal = settings.sickLeaveBalance ?? 12

  // نسخ للعمل
  const altsSorted = [...altDays].sort(sortByDate)
  let allLeaves = leaves.map(l=>({ ...l }))

  // عد الاستخدام الحالي للأنواع غير بدل الراحة (قبل إعادة التسديد)
  // لكن نحتاج نفصل: leaves اللي نوعها بدل راحة ستدخل في التسديد، الباقي يستهلك الأرصدة
  const nonRestLeaves = allLeaves.filter(l=> l.type !== 'rest_day')
  let annualUsed = nonRestLeaves.filter(l=> l.type === 'regular_vacation').length
  let sickUsed = nonRestLeaves.filter(l=> l.type === 'sick').length
  // unpaid مفتوحة

  const restLeaves = allLeaves.filter(l=> l.type === 'rest_day').sort(sortByDate)
  // لو كان فيه إجازات محولة من قبل (regular/sick/unpaid) كانت أصلها rest_day
  // هنعالجها كأنها rest_day لو كان فيها _convertedFromRest
  const convertedLeaves = allLeaves.filter(l=> l._convertedFromRest).sort(sortByDate)
  // دمج: كل المحولين نرجعهم لمحاولة تسديد تاني (إعادة التسديد الشامل)
  const candidates = [...restLeaves, ...convertedLeaves].sort(sortByDate)
  // نشيل المحولين من allLeaves مؤقتاً ونعيد إضافتهم حسب التسديد
  // نبني قائمة نهائية: nonRestLeaves بدون المحولين + المرشحين بعد التسديد
  const baseLeaves = allLeaves.filter(l=> l.type !== 'rest_day' && !l._convertedFromRest)

  // إعادة تعيين paidBy لكل candidates
  candidates.forEach(c=> { c.paidBy=null })

  const usedAltDates = new Set()

  // نحاول نسدد كل مرشح — التعديل 24: التسديد جوه نفس السنة فقط (التصفير السنوي) + البديل قبل الإجازة
  // القاعدة الذهبية المحدثة: alt.year === vac.year && alt.date < vac.date
  for (const vac of candidates) {
    const vacYear = vac.date.slice(0, 4)
    let assigned = null
    for (const alt of altsSorted) {
      if (usedAltDates.has(alt.date)) continue
      if (alt.date.slice(0, 4) !== vacYear) continue
      if (parseDate(alt.date) < parseDate(vac.date)) {
        assigned = alt.date
        usedAltDates.add(alt.date)
        break
      }
    }
    if (assigned) {
      vac.paidBy = assigned
      vac.type = 'rest_day'
      delete vac._convertedFromRest
      delete vac._convertedReason
      baseLeaves.push(vac)
    } else {
      // مفيش بديل قبل الإجازة → تدرج
      if (annualUsed < annualTotal) {
        vac.type = 'regular_vacation'
        vac.paidBy = null
        vac._convertedFromRest = true
        vac._convertedReason = 'no_alt->annual'
        annualUsed++
        baseLeaves.push(vac)
      } else if (sickUsed < sickTotal) {
        vac.type = 'sick'
        vac.paidBy = null
        vac._convertedFromRest = true
        vac._convertedReason = 'no_alt->sick'
        sickUsed++
        baseLeaves.push(vac)
      } else {
        vac.type = 'unpaid'
        vac.paidBy = null
        vac._convertedFromRest = true
        vac._convertedReason = 'no_alt->unpaid'
        baseLeaves.push(vac)
      }
    }
  }

  // إضافة باقي الإجازات غير المرشحة (regular/sick/unpaid الأصلية) — already in baseLeaves
  // ترتيب نهائي حسب التاريخ
  return baseLeaves.sort(sortByDate)
}

// التعديل 24: validateNewRestDay اتمسحت (دالة ميتة — ماحدش بيناديها — والحارس الموحد checkRestDayAvailability يغني عنها)
export function getDayNameAr(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number)
  const dt=new Date(y,m-1,d)
  return ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][dt.getDay()]
}

export function formatDateAr(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number)
  return `${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`
}
