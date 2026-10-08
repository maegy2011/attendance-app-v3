// v12.8.3 (التعديل ١٨): ثيمات البرنامج الخمسة — قيم فقط، بلا محرر بلا بريستات بلا ثيمات مخصصة
// المصدر: backup/hr-assist-v12.8.1 — src/components/ColorEditor.jsx (APP_THEME_COLORS)

export const THEME_LIST = [
  { v: 'default', label: 'الافتراضي' },
  { v: 'classic', label: '1. Classic' },
  { v: 'emerald', label: '2. Emerald 🌿' },
  { v: 'matblue', label: '3. Google Material Blue' },
  { v: 'telegram', label: '4. Telegram Sky' },
  { v: 'bluefam', label: '5. Blue Family 🌊' },
  // التعديل ٨: ثيم الخلفية المتدرجة — نفس ألوان Classic + تدرج صفحات
  { v: 'classic-gradient', label: '6. Classic Gradient' },
  // v12.9.48: ثيم claw 🦅 — الشريحة الأولى تدرج الكارت الأزرق (#1880C8...) + باقي الشرايح من Classic
  { v: 'claw', label: '7. Claw 🦅' },
]

const CLASSIC = { hd_home:'#2563eb', hd_records:'#1e40af', hd_vac:'#d97706', hd_perm:'#4338ca', hd_alt:'#0f766e', hd_stats:'#047857', hd_set:'#334155', hd_dhikr:'#047857', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#2563eb', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#7c3aed', homecardtx:'#ffffff', val_money:'#16a34a', val_in:'#16a34a', val_out:'#dc2626', sortfilterbg:'#f1f5f9', thbg:'#dbeafe', thtext:'#000000', todaycard:'#eff6ff', propcol:'#f1f5f9' }

// v12.11.20 — ثيم «الافتراضي» الموحد (دمج claw + classic — مفيش ألوان بره الثيم ده)
const DEFAULT_THEME = { hd_home:'#4EBBCA', hd_records:'#1668A8', hd_vac:'#2596BE', hd_perm:'#1F6FB5', hd_alt:'#178A84', hd_stats:'#147A70', hd_set:'#2C5F8A', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#1D80CC', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#4EBBCA', homecardtx:'#ffffff', val_money:'#16a34a', val_in:'#16a34a', val_out:'#dc2626', sortfilterbg:'#dbeafe', thbg:'#dbeafe', thtext:'#000000', todaycard:'#E0F0F0', propcol:'#f1f5f9' }
export const APP_THEME_COLORS = {
  default: { ...DEFAULT_THEME },
  classic: { ...CLASSIC },
  // التعديل ٨: نفس ألوان Classic بالظبط — الفرق الوحيد خلفيات الصفحات المتدرجة (CSS)
  'classic-gradient': { ...CLASSIC },
  emerald: { hd_home:'#059669', hd_records:'#047857', hd_vac:'#059669', hd_perm:'#059669', hd_alt:'#047857', hd_stats:'#047857', hd_set:'#059669', hd_dhikr:'#047857', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#059669', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#059669', homecardtx:'#ffffff', val_money:'#047857', val_in:'#059669', val_out:'#dc2626', sortfilterbg:'#d1fae5', thbg:'#a7f3d0', thtext:'#000000', todaycard:'#d1fae5', propcol:'#f1f5f9' },
  matblue: { hd_home:'#1A73E8', hd_records:'#1765cc', hd_vac:'#1A73E8', hd_perm:'#1A73E8', hd_alt:'#1765cc', hd_stats:'#1765cc', hd_set:'#1A73E8', hd_dhikr:'#1765cc', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#1A73E8', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#1A73E8', homecardtx:'#ffffff', val_money:'#1765cc', val_in:'#1A73E8', val_out:'#dc2626', sortfilterbg:'#e8f0fe', thbg:'#bfdbfe', thtext:'#000000', todaycard:'#dbeafe', propcol:'#f1f5f9' },
  telegram: { hd_home:'#229ED9', hd_records:'#1c8abf', hd_vac:'#229ED9', hd_perm:'#229ED9', hd_alt:'#1c8abf', hd_stats:'#1c8abf', hd_set:'#229ED9', hd_dhikr:'#1c8abf', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#229ED9', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#229ED9', homecardtx:'#ffffff', val_money:'#1c8abf', val_in:'#229ED9', val_out:'#dc2626', sortfilterbg:'#e1f3fb', thbg:'#bae6fd', thtext:'#000000', todaycard:'#e1f3fb', propcol:'#f1f5f9' },
  bluefam: { hd_home:'#2563eb', hd_records:'#1e40af', hd_vac:'#0284c7', hd_perm:'#3f9fd6', hd_alt:'#475569', hd_stats:'#64748b', hd_set:'#334155', hd_dhikr:'#1d4ed8', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#2563eb', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#2563eb', homecardtx:'#ffffff', val_money:'#16a34a', val_in:'#2563eb', val_out:'#dc2626', sortfilterbg:'#dbeafe', thbg:'#dbeafe', thtext:'#000000', todaycard:'#dbeafe', propcol:'#f1f5f9' },
  // v12.9.48: claw — نفس Classic + hd_home من التدرج الأزرق (التدرج الكامل في CSS كلاس claw-card)
  // v12.9.49: القاعدة الزرقاء من الصورة #1D80CC
  // v12.9.50: توحيد claw — كل الهيدرات من عيلة الأزرق (درجات للتمييز بين الصفحات)
  claw: { hd_home:'#1D80CC', hd_records:'#1668A8', hd_vac:'#2596BE', hd_perm:'#1F6FB5', hd_alt:'#178A84', hd_stats:'#147A70', hd_set:'#2C5F8A', hd_dhikr:'#147A70', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#1D80CC', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#1D80CC', homecardtx:'#ffffff', val_money:'#16a34a', val_in:'#16a34a', val_out:'#dc2626', sortfilterbg:'#dbeafe', thbg:'#dbeafe', thtext:'#000000', todaycard:'#E0F0F0', propcol:'#f1f5f9' },
}

// التعديل ١٣ (دورة سادسة): شرائح بلتة ثيم البرنامج — 7 هيدرات + الأساسي (الأذكار اتشال: مافيش صفحة)
export const APP_STRIP_SLOTS = [
  { k: 'hd_home', label: 'الرئيسية' },
  { k: 'hd_records', label: 'السجلات' },
  { k: 'hd_vac', label: 'الإجازات' },
  { k: 'hd_perm', label: 'التصاريح' },
  { k: 'hd_alt', label: 'البديلة' },
  { k: 'hd_stats', label: 'الإحصائيات' },
  { k: 'hd_set', label: 'الإعدادات' },
  { k: 'btnprim', label: 'الأساسي' },
]

// التعديل ١٣: حل ثيم البرنامج (أصلي أو مخصص) → { colors, base, label, customId }
// التعديل ٢٤: + overrides على ثيم البرنامج الأصلي (التحرير في نفس الثيم)
export function resolveAppTheme(appKey, customs, overrides) {
  if (appKey && typeof appKey === 'string' && appKey.startsWith('custom:')) {
    const c = (customs || []).find(x => x && x.id === appKey.slice(7))
    if (c) {
      const baseKey = APP_THEME_COLORS[c.base] ? c.base : 'classic'
      return {
        colors: { ...APP_THEME_COLORS[baseKey], ...((c.overrides) || {}) },
        base: baseKey, label: c.name || 'مخصصة', customId: c.id,
      }
    }
  }
  const base = APP_THEME_COLORS[appKey] ? appKey : 'classic'
  const lbl = (THEME_LIST.find(t => t.v === base) || {}).label || base
  const colors = { ...APP_THEME_COLORS[base] }
  const ov = ((overrides || {})[base]) || {}
  let ovCount = 0
  for (const k of Object.keys(ov)) {
    if (typeof ov[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(ov[k]) && (k in colors)) { colors[k] = ov[k]; ovCount++ }
  }
  return { colors, base, label: lbl, customId: null, ovCount }
}
