// حسابات التصاريح الموحدة — التعديل 21 (v12.8.9): كل مدة حسب وردية التصريح نفسه
// late: الوصول − بداية الوردية | no_return: انصراف الوردية − الخروج | returns: العودة − الخروج (بلا لفة نص الليل)

export const SHIFT_OPTIONS = [
  { v: 'shift1', label: 'وردية أولى' },
  { v: 'shift2', label: 'وردية تانية' },
  { v: 'shift3', label: 'وردية تالتة' },
  { v: 'no_task', label: 'لا يوجد تكليف' },
]

export const SHIFT_LABEL = { shift1: 'وردية أولى', shift2: 'وردية تانية', shift3: 'وردية تالتة', no_task: 'لا يوجد تكليف' }

// الورديات المسموحة لكل نوع (التعديل 21: مأمورية/مهمة = لا يوجد تكليف + أولى فقط)
export function allowedShifts(type) {
  if (type === 'errand' || type === 'official_mission') return ['no_task', 'shift1']
  return ['shift1', 'shift2', 'shift3', 'no_task']
}

export function parseTimeToMin(t) {
  if (t == null || t === '') return null
  if (typeof t === 'number' && isFinite(t)) return Math.round(t)
  if (typeof t !== 'string') return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

export function minToHM(min) {
  if (min == null) return '—'
  const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseEnd(t, fallback) {
  const v = parseTimeToMin(t)
  if (v == null) return parseTimeToMin(fallback)
  return v
}

// بداية الوردية بالدقايق — لا يوجد تكليف = بداية العمل الرسمي
export function getShiftStartMin(settings, shift) {
  const s = settings || {}
  if (shift === 'shift1') return parseTimeToMin(s.shift1?.start) ?? 8 * 60
  if (shift === 'shift2') return parseTimeToMin(s.shift2?.start) ?? 16 * 60
  if (shift === 'shift3') return parseTimeToMin(s.shift3?.start) ?? 0
  return parseTimeToMin(s.officialStart) ?? 8 * 60
}

// نهاية الوردية بالدقايق — الأولى ولا يوجد تكليف = نهاية العمل الرسمي (الاستثناء)
// 00:00 = آخر اليوم (24*60)
export function getShiftEndMin(settings, shift) {
  const s = settings || {}
  const officialEnd = parseTimeToMin(s.officialEnd) ?? 15 * 60
  if (shift === 'shift1' || shift === 'no_task' || !shift) return officialEnd
  if (shift === 'shift2') {
    const v = parseTimeToMin(s.shift2?.end)
    if (v == null) return officialEnd
    return (v === 0) ? 24 * 60 : v
  }
  if (shift === 'shift3') {
    const v = parseTimeToMin(s.shift3?.end)
    if (v == null) return officialEnd
    return (v === 0) ? 24 * 60 : v
  }
  return officialEnd
}

// المدة بالدقايق — null = غير محسوبة (ناقص بيانات أو مرفوضة منطقياً)
export function calcPermitDuration(p, settings) {
  if (!p) return null
  const shift = p.shift || 'no_task'
  if (p.type === 'late') {
    const r = parseTimeToMin(p.returnTime)
    if (r == null) return null
    const d = r - getShiftStartMin(settings, shift)
    return d < 0 ? null : d
  }
  if (p.state === 'no_return') {
    const e = parseTimeToMin(p.exitTime)
    if (e == null) return null
    const d = getShiftEndMin(settings, shift) - e
    return d < 0 ? null : d
  }
  const e = parseTimeToMin(p.exitTime), r = parseTimeToMin(p.returnTime)
  if (e == null || r == null) return null
  const d = r - e
  return d < 0 ? null : d // مفيش عودة بعد نص الليل — الوردية خلصت
}

// تحقق قبل الحفظ — يرجع رسالة الخطأ أو null لو سليم
export function validatePermit(f, settings) {
  const shift = f.shift || 'no_task'
  if ((f.type === 'errand' || f.type === 'official_mission') && !['no_task', 'shift1'].includes(shift))
    return 'مرفوض: المأمورية والمهمة مسموحة مع لا يوجد تكليف ووردية أولى فقط'
  if (f.type === 'late') {
    if (!f.returnTime) return 'سجل ساعة الحضور (الوصول)'
    const d = calcPermitDuration({ type: 'late', returnTime: f.returnTime, shift }, settings)
    if (d == null) return 'مرفوض: الوصول قبل بداية الوردية'
    return null
  }
  if (!f.exitTime) return 'سجل ساعة الخروج'
  if (f.state === 'no_return') {
    const d = calcPermitDuration({ state: 'no_return', exitTime: f.exitTime, shift }, settings)
    if (d == null) return 'مرفوض: الخروج بعد موعد الانصراف'
    return null
  }
  if (f.state === 'returns' && f.returnTime) {
    const d = calcPermitDuration({ state: 'returns', exitTime: f.exitTime, returnTime: f.returnTime, shift }, settings)
    if (d == null) return 'مرفوض: العودة قبل الخروج (مفيش عودة بعد نص الليل)'
  }
  return null
}
