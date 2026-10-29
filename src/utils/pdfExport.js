import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import reshaper from 'arabic-persian-reshaper'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { AMIRI_BASE64 } from './fonts/amiri'
import { getSettings, getRecords, getLeavesV2, getAltDays } from './storage'
import { getDisplayAltDays, getAltStats } from './altDays'
import { getLeaveCounts } from './leaveCounts'
import { calculateDay } from './calculations'
import { getTardinessCount } from './tardiness'
import { SHIFT_OPTIONS, DAY_STATUS_OPTIONS } from './dayColumns'
import { timestampToTime } from './calendar'
import { firstName } from './firstName'

// v12.9.51: علامة مائية + سطر عدم الاعتماد فوق التوقيع (كل المستندات)

// التعديل ٢٥ + ١-٦ (دورة جديدة): استخراج ملفات PDF بالعربي
// المصادر = نفس دوال الشاشات بالظبط (لا منطق جديد)
// التعديل ٢: هيكل HR Assist/{Backups,Vacations,Altdays,Extra,Tardies}
export const PDF_FOLDER = 'HR Assist'
const SUB = { vac: 'Vacations', alt: 'Altdays', extra: 'Extra', tard: 'Tardies' }
export const SIGN = 'AmrAdel@2026'

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const LEAVE_LABELS = { regular_vacation: 'اعتيادي', rest_day: 'بدل راحة', sick: 'مرضي', unpaid: 'بدون أجر', special: 'خاصة' }
const slotLabel = (opts, v, fb) => ((opts || []).find(o => o.value === v) || {}).label || v || fb

const ar = (v) => {
  const s = (v === null || v === undefined) ? '' : String(v)
  try { return reshaper.ArabicShaper.convertArabic(s) } catch { return s }
}

function newDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Amiri.ttf', AMIRI_BASE64)
  doc.addFont('Amiri.ttf', 'Amiri', 'normal')
  doc.setFont('Amiri', 'normal')
  return doc
}

function header(doc, title, sub) {
  doc.setFontSize(18)
  doc.text(ar(title), 195, 18, { align: 'right' })
  doc.setFontSize(11)
  doc.text(ar(sub), 195, 27, { align: 'right' })
}

function line(doc, text, y) {
  doc.setFontSize(12)
  doc.text(ar(text), 195, y, { align: 'right' })
}

// v12.9.51: التوقيع آخر سطر في النص + سطر عدم الاعتماد عريض أسود فوقه — معمم على كل الملفات
// ملاحظة: أميري بلا bold (الرجوع لـHelvetica كان يطلع رموز) — العرض بحجم أكبر ولون أسود صريح
const UNOFFICIAL = 'هذا المستند غير معتمد وغير رسمي ويقع تحت مسئوليه صاحبه'
function signDoc(doc, y) {
  let yy = y + 24
  if (yy > 272) { doc.addPage(); yy = 30 }
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(13)
  doc.text(ar(UNOFFICIAL), 105, yy - 10, { align: 'center' })
  doc.setFontSize(11)
  doc.text(SIGN, 105, yy, { align: 'center' })
}

// v12.9.51: علامة مائية مايلة 45° بخط خفيف على كل صفحات الملف
// v12.9.53: شبكة سطور — ملغاة (أمر angle في jsPDF 4.2.1 يرمي النص بره الورقة — مثبت بمصفوفات Tm)
// v12.9.56: 3 سطور مايلة بمصفوفة دوران حول النقطة (مجرّبة بالرندر — تعبر الصفحة كلها)
function watermarkAll(doc) {
  try {
    const one = ar(UNOFFICIAL)
    const row = [one, one, one, one, one].join('   ')
    const n = doc.getNumberOfPages()
    doc.setFont('Amiri', 'normal')
    doc.setFontSize(20)
    doc.setTextColor(195, 195, 195)
    const c = Math.SQRT1_2
    const R = new doc.Matrix(c, -c, c, c, 0, 0)
    for (let i = 1; i <= n; i++) {
      doc.setPage(i)
      for (const y of [70, 150, 230]) doc.text(row, 105, y, { align: 'center', angle: R })
    }
    doc.setTextColor(0, 0, 0)
  } catch {}
}

// التعديل ١ (دورة جديدة): fontStyle:normal صريح — أميري بلا bold والرجوع لـHelvetica كان يطلع رموز
const TBL = {
  styles: { font: 'Amiri', halign: 'right', fontSize: 10, fontStyle: 'normal' },
  headStyles: { font: 'Amiri', halign: 'right', fillColor: [51, 65, 85], fontSize: 12, fontStyle: 'normal' },
}
const TBL_HALF = {
  styles: { font: 'Amiri', halign: 'right', fontSize: 8, fontStyle: 'normal', cellPadding: 1.5 },
  headStyles: { font: 'Amiri', halign: 'right', fillColor: [51, 65, 85], fontSize: 9, fontStyle: 'normal', cellPadding: 1.5 },
}

// التعديل ٨ (دورة جديدة): جدول واحد بعمود فاصل (نص يمين/نص شمال) — الجدولان المنفصلان كانا يتراكبان
function duoTable(doc, head, rows, y0) {
  const n = head.length
  const half = Math.ceil(rows.length / 2)
  const r1 = rows.slice(0, half), r2 = rows.slice(half)
  const emp = Array(n).fill(ar('—'))
  const gap = ar('')
  const m = Math.max(r1.length, r2.length, 1)
  const body = []
  // التعديل ٢: الأقدم (النصف الأول) على اليمين — autotable يرسم الأعمدة شمال→يمين مهما كان RTL
  for (let i = 0; i < m; i++) body.push([...(r2[i] || emp), gap, ...(r1[i] || emp)])
  autoTable(doc, {
    ...TBL_HALF, startY: y0,
    head: [[...head, gap, ...head]],
    body,
    // التعديل ٣: مسافة فاضية واضحة بين النصين
    columnStyles: { [n]: { cellWidth: 15 } },
  })
  return doc.lastAutoTable.finalY
}

// التعديل ٨: تقريب رقمين عشريين (24.670000000000005 ← 24.67)
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100

// ملف الإجازات السنوي — نفس جدول الشاشة + الأرصدة + رصيد البديلة (التعديل ٤)
export async function exportVacationsPdf(year) {
  const settings = getSettings()
  const records = getRecords() || {}
  const allLeaves = getLeavesV2()
  // التعديل ١: الأقدم أول (تصاعدي)
  const leaves = allLeaves.filter(l => (l.date || '').startsWith(String(year))).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const used = (t) => leaves.filter(l => l.type === t).length
  const altRem = getLeaveCounts(records, allLeaves, getAltDays(), settings, year).alt.remainingCount
  const doc = newDoc()
  const userName = firstName(settings.profile && settings.profile.name) ? ` — ${firstName(settings.profile.name)}` : ''
  header(doc, `ملف الإجازات ${year}${userName}`, `تاريخ الاستخراج: ${new Date().toLocaleDateString('en-CA')}`)
  const aTotal = Number(settings.annualLeaveBalance || 0)
  const sTotal = Number(settings.sickLeaveBalance || 0)
  line(doc, `السنوي: المتبقي ${aTotal - used('regular_vacation')} / الإجمالي ${aTotal} — المرضي: المتبقي ${sTotal - used('sick')} / الإجمالي ${sTotal} — بدون أجر: ${used('unpaid')} — خاصة: ${used('special')}`, 36)
  line(doc, `رصيد الأيام البديلة (الباقي): ${altRem}`, 43)
  autoTable(doc, {
    ...TBL,
    startY: 49,
    head: [[ar('ملاحظات'), ar('ذاتية'), ar('مسددة بـ'), ar('النوع'), ar('التاريخ')]],
    body: leaves.map(l => [ar(l.notes || '—'), ar(l.selfService ? 'نعم' : 'لا'), ar(l.paidBy || '—'), ar(LEAVE_LABELS[l.type] || l.type || '—'), ar(l.date || '—')]),
  })
  signDoc(doc, doc.lastAutoTable.finalY)
  return savePdf(doc, SUB.vac, `vacations-${year}.pdf`)
}

// ملف الأيام البديلة السنوي — ملخص 4 أرقام + جدولان جنب بعض (التعديل ٣)
export async function exportAltdaysPdf(year) {
  const settings = getSettings()
  const records = getRecords() || {}
  const st = getLeaveCounts(records, getLeavesV2(), getAltDays(), settings, year).alt
  // التعديل ١: الأقدم أول (تصاعدي)
  const rows = (st.display || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).map(a => [ar(a.notes || '—'), ar(a.selfService ? 'نعم' : 'لا'), ar(a.hrs !== null && a.hrs !== undefined ? a.hrs : '—'), ar(a.date || '—')])
  const doc = newDoc()
  const userName = firstName(settings.profile && settings.profile.name) ? ` — ${firstName(settings.profile.name)}` : ''
  header(doc, `ملف الأيام البديلة ${year}${userName}`, `تاريخ الاستخراج: ${new Date().toLocaleDateString('en-CA')}`)
  line(doc, `إجمالي الأيام: ${st.totalCount} — خدمة ذاتية: ${st.eligibleCount} — مستخدم: ${st.usedCount} — باقي: ${st.remainingCount}`, 36)
  const yEnd = duoTable(doc, [ar('ملاحظات'), ar('خدمة ذاتية'), ar('الساعات'), ar('التاريخ')], rows, 42)
  signDoc(doc, yEnd)
  return savePdf(doc, SUB.alt, `altdays-${year}.pdf`)
}

// ملف الإضافي الشهري الجديد (التعديل ٥): ملخص سطرين + جدول 12 عمود + صف مجاميع
export async function exportExtraPdf(year, month) {
  const settings = getSettings()
  const records = getRecords() || {}
  const cur = settings.currency || 'ج'
  const dim = new Date(year, month, 0).getDate()
  const rows = []
  let tH = 0, tCash = 0, lunchDays = 0, tLunch = 0, bDays = 0, bCash = 0, tTaxi = 0
  for (let d = 1; d <= dim; d++) {
    const dk = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const rec = records[dk]
    if (!rec) continue
    let c = null
    try { c = calculateDay(rec, settings) } catch { c = null }
    if (!c) continue
    const h = Number(c.overtimeHours || 0), cash = Number(c.overtimeValue || 0)
    const lunch = Number(c.lunchValue || 0), bonus = Number(c.bonusValue || 0), taxi = Number(c.taxiValue || 0)
    if (h <= 0 && lunch <= 0 && bonus <= 0 && taxi <= 0) continue
    const tot = Number(c.totalExtras || (cash + lunch))
    tH += h; tCash += cash; tLunch += lunch; tTaxi += taxi
    if (lunch > 0) lunchDays++
    if (bonus > 0) { bDays++; bCash += bonus }
    let tm = '—'
    try { tm = timestampToTime(rec.checkIn) || '—' } catch { tm = '—' }
    let to = '—'
    try { to = timestampToTime(rec.checkOut) || '—' } catch { to = '—' }
    rows.push([ar(rec.notes || '—'), ar(taxi || '—'), ar(bonus || '—'), ar(tot), ar(lunch || '—'), ar(cash), ar(r2(h)),
      ar(to), ar(tm), ar(slotLabel(SHIFT_OPTIONS, rec.shift, '—')), ar(slotLabel(DAY_STATUS_OPTIONS, rec.dayStatus, '—')), ar(dk)])
  }
  const doc = newDoc()
  const userName = firstName(settings.profile && settings.profile.name) ? ` — ${firstName(settings.profile.name)}` : ''
  header(doc, `ملف الإضافي ${AR_MONTHS[month - 1]} ${year}${userName}`, `تاريخ الاستخراج: ${new Date().toLocaleDateString('en-CA')}`)
  line(doc, `عدد ساعات الإضافي: ${r2(tH)} — المقابل النقدي: ${tCash} ${cur}`, 36)
  line(doc, `عدد أيام بدل الغداء: ${lunchDays} — مجموع الإضافي الشهري: ${tCash + tLunch} ${cur}`, 43)
  line(doc, `عدد أيام المكافأة: ${bDays} — المقابل النقدي للمكافأة: ${bCash} ${cur}`, 50)
  const body = rows.length ? rows : [[ar('لا يوجد إضافي هذا الشهر'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—'), ar('—')]]
  if (rows.length) body.push([ar('—'), ar(tTaxi), ar(bCash), ar(tCash + tLunch), ar(tLunch), ar(tCash), ar(r2(tH)), ar('—'), ar('—'), ar('—'), ar('—'), ar('المجموع')])
  autoTable(doc, {
    ...TBL,
    styles: { ...TBL.styles, fontSize: 7, cellPadding: 1 },
    headStyles: { ...TBL.headStyles, fontSize: 8, cellPadding: 1 },
    startY: 56,
    head: [[ar('ملاحظات'), ar('بدل التاكسي'), ar('المكافأة'), ar('مجموع الإضافي'), ar('بدل الغداء'), ar('المقابل النقدي'), ar('ساعات الإضافي'), ar('وقت الانصراف'), ar('وقت الحضور'), ar('الوردية'), ar('حالة اليوم'), ar('اليوم')]],
    body,
  })
  signDoc(doc, doc.lastAutoTable.finalY)
  return savePdf(doc, SUB.extra, `extra-${year}-${String(month).padStart(2, '0')}.pdf`)
}

// ملف التأخيرات السنوي (التعديل ٦): ملخص + جدولان جنب بعض
export async function exportTardiesPdf(year) {
  const settings = getSettings()
  const records = getRecords() || {}
  const rows = []
  let wSum = 0
  for (const dk of Object.keys(records).filter(k => k.startsWith(String(year))).sort()) {
    const rec = records[dk]
    if (!rec || !rec.checkIn) continue
    let w = 0
    try { w = getTardinessCount(records, settings, dk) } catch { w = 0 }
    if (!w) continue
    wSum += w
    let tm = '—'
    try { tm = timestampToTime(rec.checkIn) || '—' } catch { tm = '—' }
    rows.push([ar(w), ar(tm), ar(dk)])
  }
  const doc = newDoc()
  const userName = firstName(settings.profile && settings.profile.name) ? ` — ${firstName(settings.profile.name)}` : ''
  header(doc, `ملف التأخيرات ${year}${userName}`, `تاريخ الاستخراج: ${new Date().toLocaleDateString('en-CA')}`)
  line(doc, `عدد أيام التأخير: ${rows.length} — عدد التأخيرات: ${wSum}`, 36)
  const yEnd = duoTable(doc, [ar('عدد التأخيرات'), ar('موعد الحضور'), ar('اليوم')], rows, 42)
  signDoc(doc, yEnd)
  return savePdf(doc, SUB.tard, `tardies-${year}.pdf`)
}

// v12.9.63: ترقيم مضمون — عدّاد محفوظ + فحص الفولدر (الحد الأبعد)
// السبب: الاعتماد على readdir بس كان بيرجع 1 دايماً لو القراءة فشلت → المسح
const p2 = (v) => String(v).padStart(2, '0')
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }

async function nextSerialName(sub, fileName) {
  const base = String(fileName).replace(/\.pdf$/i, '')
  const stamp = todayStamp()
  const key = `${sub}:${base}:${stamp}`
  // 1) العدّاد المحفوظ (LOCAL_STORAGE مش تغيير الإعدادات — سريع ومايعملش ريندر)
  let next = 0
  try {
    const raw = localStorage.getItem('pdfSerial') || '{}'
    const map = JSON.parse(raw) || {}
    next = Number(map[key] || 0) + 1
    map[key] = next
    try { localStorage.setItem('pdfSerial', JSON.stringify(map)) } catch {}
  } catch { next = 1 }
  let serial = next
  // 2) الفولدر هو المرجع: لو الملف موجود خالص، زود لحد ما الاسم يكون حر
  const dir = `${PDF_FOLDER}/${sub}`
  let names = []
  try {
    const r = await Filesystem.readdir({ directory: Directory.Documents, path: dir })
    const arr = r && r.files ? r.files : r
    names = (arr || []).map(f => (f && f.name) || f).map(String)
  } catch {}
  if (names.length) {
    const esc = (base + '-' + stamp).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('^' + esc + '-(\\d+)\\.pdf$', 'i')
    let mx = 0
    for (const n of names) { const m = n.match(re); if (m) mx = Math.max(mx, Number(m[1])) }
    if (mx >= serial) {
      serial = mx + 1
      try {
        const map = JSON.parse(localStorage.getItem('pdfSerial') || '{}') || {}
        map[key] = serial
        localStorage.setItem('pdfSerial', JSON.stringify(map))
      } catch {}
    }
  }
  return `${base}-${stamp}-${String(serial).padStart(2, '0')}.pdf`
}

// v12.9.53: حفظ مضمون على أي تليفون — mkdir مسبق + بديل المساحة الخاصة + مشاركة عند رفض Documents
async function savePdf(doc, sub, fileName) {
  watermarkAll(doc)
  if (!Capacitor.isNativePlatform()) {
    const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`
    doc.save(finalName)
    return { fileName: finalName, uri: null, web: true }
  }
  const uri = doc.output('datauristring')
  const b64 = uri.slice(uri.indexOf(',') + 1)
  const finalName = await nextSerialName(sub, fileName)
  const rel = `${PDF_FOLDER}/${sub}/${finalName}`
  try {
    try { await Filesystem.mkdir({ directory: Directory.Documents, path: `${PDF_FOLDER}/${sub}`, recursive: true }) } catch {}
    await Filesystem.writeFile({ directory: Directory.Documents, path: rel, data: b64, recursive: true })
    const { uri: fileUri } = await Filesystem.getUri({ directory: Directory.Documents, path: rel })
    return { fileName: finalName, uri: fileUri }
  } catch (e) {
    // v12.9.63: المسار البديل — مساحة التطبيق الخاصة (دائمة، مش بتتمسح زي Cache) + نفس اسم المتسلسل
    const st = new Date()
    const base2 = String(fileName).replace(/\.pdf$/i, '')
    const fbName = `${base2}-${todayStamp()}-${p2(st.getHours())}${p2(st.getMinutes())}${p2(st.getSeconds())}.pdf`
    const rel2 = `${PDF_FOLDER}/${sub}/${fbName}`
    try { await Filesystem.mkdir({ directory: Directory.External, path: `${PDF_FOLDER}/${sub}`, recursive: true }) } catch {}
    await Filesystem.writeFile({ directory: Directory.External, path: rel2, data: b64, recursive: true })
    const { uri: fileUri } = await Filesystem.getUri({ directory: Directory.External, path: rel2 })
    // رسالة الخطأ الحقيقية بتظهر للمستخدم (عشان نعرف لو في مشكلة تقنية بدل التخمين)
    return { fileName: fbName, uri: fileUri, fallback: true, error: String((e && e.message) || e) }
  }
}

// زرار الفتح — يوصلك للملف في الفولدر (عارض النظام عبر المشاركة)
export async function openPdf(uri, title) {
  if (!Capacitor.isNativePlatform()) return
  if (!uri) return
  await Share.share({ title: title || 'فتح الملف', url: uri, dialogTitle: 'فتح بواسطة' })
}
