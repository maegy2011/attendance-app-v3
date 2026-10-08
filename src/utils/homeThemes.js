// التعديل ٢ (دورة سادسة): ثيمات الصفحة الرئيسية
// classic = الحالي | light = موحد أزرق | mix = دواير ملونة + كروت زرقا
// التعديل ٦: records = مرآة خلايا السجلات
// التعديل ٧ (دورة سادسة): records مرآة كاملة — الهيدر + الترحيب + الملاحظات بلون هيدر السجلات (يتبع الثيم)
// التعديل ٨ (دورة سادسة): 4 ثيمات عصرية بهيدر ثابت — Ocean/Sunset/Forest/Royal
export const HOME_THEME_LIST = [
  { v: 'classic', label: 'Classic — الحالي' },
  { v: 'light', label: 'Light — موحد أزرق' },
  { v: 'mix', label: 'Mix — دواير ملونة' },
  { v: 'records', label: 'Records — مرآة السجلات' },
  { v: 'tint', label: 'Tint 👻' },
]

// لون هيدر الرئيسية (يتبع ثيم البرنامج تلقائياً)
export const HOME_HEADER_BASE = 'var(--c-hd_home,#2563eb)'
// لون هيدر السجلات (يتبع ثيم البرنامج تلقائياً) — مرآة records
export const RECORDS_HEADER_BASE = 'var(--c-hd_records,#1e40af)'
// الرمادي الثابت (الإضافي عند الصفر — كل الثيمات)
export const EXTRA_EMPTY = '#94a3b8'

export const HOME_THEMES = {
  classic: { shape: 'circle-pill', cardA: 75, cardB: 45, box: 'white', unifiedCard: false, unifiedCircle: false, header: null },
  light: { shape: 'circle-pill', cardA: 50, cardB: 50, box: 'white', unifiedCard: true, unifiedCircle: true, header: null },
  mix: { shape: 'circle-pill', cardA: 50, cardB: 50, box: 'white', unifiedCard: true, unifiedCircle: false, header: null },
  // التعديل ٦: مرآة خلايا السجلات — الحالة والوردية بالكحلي + تدرج الخلايا (كامل ← 60%)
  // التعديل ٧: + الهيدر والملاحظات بلون هيدر السجلات
  records: { shape: 'circle-pill', cardA: 100, cardB: 60, box: 'white', unifiedCard: false, unifiedCircle: false,
    header: { base: RECORDS_HEADER_BASE },
    cardMap: { alt: RECORDS_HEADER_BASE, perm: RECORDS_HEADER_BASE },
    circleMap: { alt: RECORDS_HEADER_BASE, perm: RECORDS_HEADER_BASE } },
  // التعديل ٨: الثيمات العصرية — خريطة كاملة لكل خانة + هيدر ثابت
  ocean: { shape: 'circle-pill', cardA: 75, cardB: 45, box: 'white', unifiedCard: false, unifiedCircle: false,
    header: { base: '#0c4a6e' }, extraOn: '#16a34a',
    cardMap: { vac: '#0284c7', alt: '#0d9488', perm: '#4f46e5', in: '#16a34a', out: '#dc2626' },
    circleMap: { vac: '#0284c7', alt: '#0d9488', perm: '#4f46e5', in: '#16a34a', out: '#dc2626' } },
  // التعديل ١١ (دورة سادسة): sunset اتمسح
  // التعديل ١١ (دورة سادسة): forest اتمسح
  royal: { shape: 'circle-pill', cardA: 75, cardB: 45, box: 'white', unifiedCard: false, unifiedCircle: false,
    header: { base: '#5b21b6' }, extraOn: '#10b981',
    cardMap: { vac: '#c026d3', alt: '#7c3aed', perm: '#2563eb', in: '#10b981', out: '#f43f5e' },
    circleMap: { vac: '#c026d3', alt: '#7c3aed', perm: '#2563eb', in: '#10b981', out: '#f43f5e' } },
  // التعديل ٩ (دورة سادسة): Tint أحادي هادي — دواير 55% + كروت 30% + هيدر مدمج + الإضافي accent وحيد
  tint: { shape: 'circle-pill', cardA: 30, cardB: 30, box: 'white', unifiedCard: false, unifiedCircle: false,
    tonalCards: true, circleTint: 55, header: { blend: true }, extraOn: '#16a34a' },
}

export function homeThemeOf(key) {
  return HOME_THEMES[key] || HOME_THEMES.classic
}

// لون الهيدر والترحيب: override الثيم أو null (الافتراضي من CSS)
export function homeHeaderBase(ht) {
  return (ht.header && ht.header.base) || null
}

// التعديل ٩: الهيدر المدمج — نفس تدرج خلفية الصفحة (أول الخلفية ← أبيض)
export function homeHeaderBlend(ht) {
  if (ht.header && ht.header.blend) return `linear-gradient(to bottom, color-mix(in srgb, ${HOME_HEADER_BASE} 40%, white) 0%, #ffffff 85%), #ffffff`
  return null
}

// اللون الفعلي للكارت: موحد أو خريطة الثيم أو لون الخانة نفسها
// notes تتبع الهيدر — extra الفاضي رمادي ثابت والحاضر بلون extraOn
export function homeCardBase(ht, ownBase, key) {
  if (ht.unifiedCard) return HOME_HEADER_BASE
  if (key === 'notes' && ht.notesBase) return ht.notesBase
  if (key === 'notes' && ht.header && ht.header.base) return ht.header.base
  if (ht.tonalCards && key !== 'extra') return HOME_HEADER_BASE
  if (key === 'extra') {
    if (ownBase === EXTRA_EMPTY) return EXTRA_EMPTY
    if (ht.extraOn) return ht.extraOn
    return ownBase
  }
  if (key && ht.cardMap && ht.cardMap[key]) return ht.cardMap[key]
  return ownBase
}

// اللون الفعلي للدايرة: موحد أو خريطة الثيم أو لون الخانة نفسها
export function homeCircleBase(ht, ownBase, key) {
  if (ht.unifiedCircle) return HOME_HEADER_BASE
  if (key === 'notes' && ht.notesBase) return ht.notesBase
  if (key === 'notes' && ht.header && ht.header.base) return ht.header.base
  if (ht.circleTint && key !== 'extra') return `color-mix(in srgb, ${HOME_HEADER_BASE} ${ht.circleTint}%, white)`
  if (key === 'extra') {
    if (ownBase === EXTRA_EMPTY) return EXTRA_EMPTY
    if (ht.extraOn) return ht.extraOn
    return ownBase
  }
  if (key && ht.circleMap && ht.circleMap[key]) return ht.circleMap[key]
  return ownBase
}

// خلفية الكارت من اللون الفعلي + الثيم
export function homeCardBg(ht, base, key) {
  const b = homeCardBase(ht, base, key)
  return `linear-gradient(to bottom right, color-mix(in srgb, ${b} ${ht.cardA}%, white), color-mix(in srgb, ${b} ${ht.cardB}%, white))`
}

// خلفية الخانة: بيضا (كل الثيمات حالياً)
export function homeBoxBg(ht, base, key) {
  if (ht.box === 'white') return '#ffffff'
  const b = homeCardBase(ht, base, key)
  return `color-mix(in srgb, ${b} ${ht.box}%, white)`
}

// التعديل ١٣ (دورة سادسة): خانات الشرائح بالترتيب (الهيدر فوق ثم الدواير بترتيب الشاشة)
export const HOME_STRIP_SLOTS = [
  { key: 'header', label: 'الهيدر' },
  { key: 'vac', label: 'نوع الإجازة' },
  { key: 'alt', label: 'حالة اليوم' },
  { key: 'perm', label: 'الوردية' },
  { key: 'in', label: 'الحضور' },
  { key: 'out', label: 'الانصراف' },
  { key: 'extra', label: 'الإضافي' },
  { key: 'notes', label: 'الملاحظات' },
]

// القواعد الأصلية للدواير (قبل خرايط الثيم) — للمقارنة والعرض
const HOME_OWN_BASES = {
  vac: 'var(--c-hd_vac,#d97706)', alt: 'var(--c-hd_alt,#0f766e)', perm: 'var(--c-hd_perm,#4338ca)',
  in: '#16a34a', out: '#dc2626',
}

function varHex(v, appColors) {
  if (typeof v === 'string' && v.startsWith('var(--c-')) {
    const k = v.slice(8).split(/[),]/)[0]
    const c = (appColors || {})[k]
    if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c
    return '#888888'
  }
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v
  return '#888888'
}

// التعديل ٢٤: مزج hex مع الأبيض بنسبة (لعرض الدرجة الفعلية للـtint)
export function hexMix(hex, pct) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return '#888888'
  const n = parseInt(m[1], 16)
  const t = Math.max(0, Math.min(100, pct)) / 100
  const mix = (c) => Math.round(c * t + 255 * (1 - t))
  const h = (c) => mix(c).toString(16).padStart(2, '0')
  return '#' + h((n >> 16) & 255) + h((n >> 8) & 255) + h(n & 255)
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// التعديل ١٣: لون شريحة concreto hex للعرض (مخصص أو محلول من الثيم + ألوان البرنامج)
// التعديل ٢٤: + overrides + اللون الفعلي (unified→الهيدر + tint→درجة محسوبة)
export function homeSlotHex(themeKey, slot, appColors, customs, overrides) {
  if (typeof themeKey === 'string' && themeKey.startsWith('custom:')) {
    const c = (customs || []).find(x => x && x.id === themeKey.slice(7))
    if (c && c.colors) {
      if (slot === 'header') return /^#[0-9a-fA-F]{6}$/.test(c.header || '') ? c.header : varHex(HOME_HEADER_BASE, appColors)
      const v = c.colors[slot]
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v
    }
  }
  const ht = HOME_THEMES[themeKey] || HOME_THEMES.classic
  const ov = ((overrides || {})[themeKey]) || {}
  const headerHex = (ht.header && ht.header.base) ? varHex(ht.header.base, appColors) : varHex(HOME_HEADER_BASE, appColors)
  if (isHex(ov[slot])) return ov[slot]
  if (slot === 'header') return headerHex
  if (ht.unifiedCircle) return headerHex
  if (slot === 'extra') {
    if (ht.extraOn) return varHex(ht.extraOn, appColors)
    return '#16a34a'
  }
  if (slot === 'notes') return headerHex
  if (ht.circleTint) return hexMix(headerHex, ht.circleTint)
  const mapped = (ht.circleMap && ht.circleMap[slot]) || HOME_OWN_BASES[slot]
  return varHex(mapped || HOME_HEADER_BASE, appColors)
}

// التعديل ١٣: الثيم الفعلي للرئيسية (مخصص يتبني من snapshot + الأصلي يرجع حياً بمتغيراته)
// التعديل ٢٤: + overrides على الثيم الأصلي (التحرير في نفس الثيم — نسخة مدمجة بدون مساس بالأصل)
export function resolveHomeTheme(key, customs, appColors, overrides) {
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const c = (customs || []).find(x => x && x.id === key.slice(7))
    if (c) {
      const base = HOME_THEMES[c.base] || HOME_THEMES.classic
      const cardMap = {}, circleMap = {}
      for (const s of ['vac', 'alt', 'perm', 'in', 'out']) {
        const v = (c.colors || {})[s]
        cardMap[s] = circleMap[s] = (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : homeSlotHex(c.base, s, appColors, customs)
      }
      return {
        shape: base.shape, cardA: base.cardA, cardB: base.cardB, box: 'white',
        unifiedCard: false, unifiedCircle: false,
        header: (c.header && /^#[0-9a-fA-F]{6}$/.test(c.header)) ? { base: c.header } : (base.header || null),
        blend: !!c.blend, cardMap, circleMap, extraOn: ((c.colors || {}).extra || '#16a34a'),
        _customName: c.name || 'مخصصة',
      }
    }
  }
  const base = HOME_THEMES[key] || HOME_THEMES.classic
  const ov = ((overrides || {})[key]) || {}
  const keys = Object.keys(ov).filter(k => isHex(ov[k]))
  if (!keys.length) return base
  const cardMap = { ...(base.cardMap || {}) }, circleMap = { ...(base.circleMap || {}) }
  for (const s of ['vac', 'alt', 'perm', 'in', 'out']) if (isHex(ov[s])) cardMap[s] = circleMap[s] = ov[s]
  return {
    ...base, cardMap, circleMap,
    unifiedCard: false, unifiedCircle: false,
    header: isHex(ov.header) ? { base: ov.header } : (base.header || null),
    notesBase: isHex(ov.notes) ? ov.notes : null,
    extraOn: isHex(ov.extra) ? ov.extra : base.extraOn,
  }
}
