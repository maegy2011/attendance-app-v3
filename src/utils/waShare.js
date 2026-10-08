import { Share } from '@capacitor/share'
import { getSettings, getRecords, getLeavesV2, getAltDays } from './storage'
import { getLeaveCounts } from './leaveCounts'
import { getDisplayAltDays } from './altDays'
import { formatDateAr } from './vacationLogic'
import { firstName } from './firstName'

// التعديل ١٣+١٤: بناء رسائل الواتساب + المشاركة — مصدر واحد للصفحات كلها
export const LEAVE_LABELS = {
  regular_vacation: 'إجازة اعتيادية',
  rest_day: 'إجازة بدل راحة',
  sick: 'إجازة مرضي',
  unpaid: 'بدون أجر',
  special: 'إجازة خاصة',
}

const userName = () => {
  try { return firstName(getSettings().profile?.name || '') } catch { return '' }
}

export function buildLeaveText(dk, type) {
  const settings = getSettings()
  const year = String(dk).slice(0, 4)
  const c = getLeaveCounts(getRecords(), getLeavesV2(), getAltDays(), settings, year)
  const stored = getLeavesV2().find(l => l.id === dk)
  let bal = ''
  if (type === 'regular_vacation') bal = `الرصيد المتبقي: ${c.annualRemaining} من ${c.annualTotal}`
  else if (type === 'rest_day') {
    bal = `المستحق: ${c.alt.eligibleCount} — الباقي: ${c.alt.remainingCount} — مسدد بـ: ${c.alt.usedCount}`
    const lv = (c.displayLeaves || []).find(l => l.date === dk || l.id === dk)
    const paidBy = (lv && lv.paidBy) || (stored && stored.paidBy) || null
    if (paidBy) bal += `\nمسددة بتاريخ: ${formatDateAr(paidBy)}`
  }
  else if (type === 'sick') bal = `الرصيد المتبقي: ${c.sickRemaining} من ${c.sickTotal}`
  else if (type === 'unpaid') bal = `المستخدم: ${c.unpaidUsed}`
  else if (type === 'special') bal = `العدد: ${c.specialCount}`
  const notes = (stored && stored.notes) || ''
  return `مطلوب تسجيل إجازة — ${userName()}\nالنوع: ${LEAVE_LABELS[type] || type} — التاريخ: ${formatDateAr(dk)}\n${bal}\nملاحظات: ${notes || '—'}`
}

export function buildAltText(dk) {
  const settings = getSettings()
  const minH = settings?.altDayMinHours || 6
  const a = getDisplayAltDays(getRecords(), getAltDays(), minH).find(x => x.date === dk)
  const stored = getAltDays().find(x => x.date === dk)
  const notes = (stored && stored.notes) || (a && a.notes) || ''
  const hrs = (a && a.hrs != null) ? a.hrs : '—'
  return `مطلوب تسجيل يوم بديل — ${userName()}\nالتاريخ: ${formatDateAr(dk)} — الساعات: ${hrs}\nملاحظات: ${notes || '—'}`
}

// التعديل ١٤: هل اليوم مستحق في جدول المستحقة؟ (بعد اكتمال الحضور+الانصراف)
// recs: سجلات طازجة من السياق (التخزين يتحدث بعد render — لا يصلح للفحص الفوري)
export function checkAltEligible(dk, recs) {
  try {
    const settings = getSettings()
    const minH = settings?.altDayMinHours || 6
    const all = recs || getRecords()
    const rec = all[dk] || {}
    if (rec.dayStatus !== 'alt_day' || !rec.checkIn || !rec.checkOut) return null
    const a = getDisplayAltDays(all, getAltDays(), minH).find(x => x.date === dk)
    return a || null
  } catch { return null }
}

export async function shareWa(title, text) {
  try { await Share.share({ title, text, dialogTitle: 'مشاركة على واتساب' }) } catch {}
}
