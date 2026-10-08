const KEYS = {
  SETTINGS: 'att_settings',
  RECORDS: 'att_records',
  DAY_TYPES: 'att_day_types',
  VACATIONS: 'att_vacations',
  PIN: 'att_pin',
  ANNUAL_LEAVE_USED: 'att_annual_leave_used',
  REST_DAYS_USED: 'att_rest_days_used',
  LEAVE_YEAR: 'att_leave_year',
  ALT_DAYS: 'att_alt_days',
  LEAVES_V2: 'att_leaves_v2',
  DELETED_ALT: 'att_deleted_alt',
  PERMITS_V2: 'att_permits_v2',
}

const defaultSettings = {
  workHours: { start: '08:00', end: '16:00' },
  workHoursCount: 7,
  shift1: { start: '08:00', end: '17:00' },
  shift2: { start: '16:00', end: '00:00' },
  shift3: { start: '00:00', end: '08:00' },
  officialStart: '08:00', officialEnd: '15:00',
  taxiValue: 0,
  hourlyRate: 0, lunchValue: 0, bonusValue: 0,
  fridayMultiplier: 2, saturdayMultiplier: 1.5, holidayMultiplier: 2,
  restDayMinHours: 6,
  lunchMinHours: 8, lunchAfterTime: '16:31',
  bonusMinHours: 7,
  notificationsEnabled: true, notificationLeadMinutes: 30,
  notifB1: true, notifB2: true, notifB3: true, notifB4: true, notifB5: true, notifB6: true,
  bonusEnabled: false,
  lastAutoBackup: '',
  altDayMinHours: 6,
  theme: 'calm',
  appTheme: 'default', // v12.11.20: الثيم الموحد «الافتراضي»
  // الشاشة الجديدة: homeScreen (قديمة/جديدة — الافتراضي الجديدة v12.9.48)
  homeScreen: 'new',
  backupPath: '',
  // التعديل ٢٥ (دورة سادسة): آخر مسارات ملفات PDF
  lastPdfVac: '',
  lastPdfAlt: '',
  lastPdfExtra: '',
  lastPdfTard: '',
  currency: 'ج',
  hourRounding: 'floor',
  weekendDays: [5, 6],
  recordsOrientation: 'vertical',
  pinEnabled: false,
  // تعديل ٥: تحكم منفصل لكل جزء محمي (الكل مقفول افتراضيًا = السلوك الحالي)
  pinAreas: { records: true, home: true, permits: true, vac: true, alt: true, finance: true, special: true, pdf: true, backup: true, app: true },
  // التعديل ٢ (دورة سادسة): ثيم الصفحة الرئيسية (الخانات الخمس)
  homeTheme: 'classic',
  // التعديل ١٣ (دورة سادسة): الثيمات المخصصة (رئيسية + برنامج)
  homeCustomThemes: [],
  appCustomThemes: [],
  // التعديل ٢٤ (دورة سادسة): overrides على الثيمات الأصلية (التحرير في نفس الثيم)
  homeThemeOverrides: {},
  appThemeOverrides: {},
  pageColors: {}, // v12.11.20 تعديل 3: تجاوز ألوان الصفحات من تبويب الثيم
  // التعديل ٣ (دورة جديدة): المعلومات الشخصية (الصورة dataURL مصغرة)
  profile: { name: '', birth: '', grade: '', empNo: '', caption: '', photo: '' },
  navPosition: 'bottom',
  annualLeaveBalance: 0,
  // التعديل 24: substituteDaysBalance اتمسح (إعداد ميت — مافيش مدخل واجهة — بدل الراحة من جدول البديلة)
  sickLeaveBalance: 0,
  // v12.11.17: لون أعلى تدرج الرئيسية (من لوحة الألوان في التذكيرات)
  homeGradTop: '#4EBBCA', // v12.11.20: ثابت افتراضي (العجلة اتشالت)
  colors: { hd_home:'#2563eb', hd_records:'#1e40af', hd_vac:'#d97706', hd_perm:'#4338ca', hd_alt:'#0f766e', hd_stats:'#047857', hd_set:'#334155', hd_dhikr:'#047857', hdtext:'#ffffff', cardbg:'#ffffff', btnprim:'#2563eb', btnsucc:'#16a34a', btndang:'#dc2626', btnwarn:'#f59e0b', navbg:'#ffffff', homecardbg:'#7c3aed', homecardtx:'#ffffff', val_money:'#16a34a', val_in:'#16a34a', val_out:'#dc2626', sortfilterbg:'#f1f5f9', thbg:'#334155', thtext:'#ffffff', roweven:'#ffffff', rowodd:'#f1f5f9', cellbg:'#ffffff', cellbd:'#e2e8f0', todayfr:'#334155', pillbg:'#f1f5f9', pillblue:'#dbeafe', recordhd1:'#1e40af', recordhd2:'#2563eb', homehd:'#2563eb' },
}

export function getDefaultSettings() {
  return JSON.parse(JSON.stringify(defaultSettings))
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS)
    if (!raw) return defaultSettings
    const s = { ...defaultSettings, ...JSON.parse(raw) }
    // دمج الألوان بعمق (v12.7.1): مفاتيح جديدة تتضاف للقديم بدون مسح اختيارات المستخدم
    s.colors = { ...defaultSettings.colors, ...((JSON.parse(raw).colors) || {}) }
    // v12.7.2 ترحيل: القديم → الجديد (لو المستخدم كان مخصص القديم)
    const oc = (JSON.parse(raw).colors) || {}
    if (!oc.hd_home && oc.homehd) s.colors.hd_home = oc.homehd
    if (!oc.hd_records && oc.recordhd1) s.colors.hd_records = oc.recordhd1
    if (s.hourRounding === 'round' || s.hourRounding === 'half') s.hourRounding = 'floor'
    // v12.9.52: تثبيت claw — الثيمات اتشالت خالص (اللوحة + المخصصة + التعديلات)
    s.appTheme = 'default'
    s.homeTheme = 'classic'
    s.homeCustomThemes = []
    s.appCustomThemes = []
    s.homeThemeOverrides = {}
    s.appThemeOverrides = {}
    return s
  }
  catch { return defaultSettings }
}
export function saveSettings(s) { localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s)) }

function dateKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function getRecords() {
  try { const raw = localStorage.getItem(KEYS.RECORDS); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
export function deleteRecord(date) {
  const r = getRecords(); delete r[dateKey(date)]; localStorage.setItem(KEYS.RECORDS, JSON.stringify(r))
}
export function updateRecord(date, updates) {
  const r = getRecords(); r[dateKey(date)] = { ...(r[dateKey(date)] || {}), ...updates, date: dateKey(date) }
  localStorage.setItem(KEYS.RECORDS, JSON.stringify(r)); return r
}
export function getDayType(date) {
  try { const raw = localStorage.getItem(KEYS.DAY_TYPES); const t = raw ? JSON.parse(raw) : {}; return t[dateKey(date)] || null } catch { return null }
}
export function setDayType(date, type) {
  try { const raw = localStorage.getItem(KEYS.DAY_TYPES); const t = raw ? JSON.parse(raw) : {}; t[dateKey(date)] = type; localStorage.setItem(KEYS.DAY_TYPES, JSON.stringify(t)) } catch {}
}
export function getVacationType(date) {
  try { const raw = localStorage.getItem(KEYS.VACATIONS); const v = raw ? JSON.parse(raw) : {}; return v[dateKey(date)] || null } catch { return null }
}
export function setVacationType(date, type) {
  try { const raw = localStorage.getItem(KEYS.VACATIONS); const v = raw ? JSON.parse(raw) : {}; v[dateKey(date)] = type; localStorage.setItem(KEYS.VACATIONS, JSON.stringify(v)) } catch {}
}
export function getPin() { return localStorage.getItem(KEYS.PIN) || null }
export function setPin(pin) { if (pin) localStorage.setItem(KEYS.PIN, pin); else localStorage.removeItem(KEYS.PIN) }

export function setRestDaysUsed(count) { localStorage.setItem(KEYS.REST_DAYS_USED, String(count)) }

// ============ الأيام البديلة المستحقة (جدول 1) ============
export function getAltDays() {
  try { const raw = localStorage.getItem(KEYS.ALT_DAYS); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
export function saveAltDays(list) { localStorage.setItem(KEYS.ALT_DAYS, JSON.stringify(list)) }
export function getDeletedAlt() {
  try { const raw = localStorage.getItem(KEYS.DELETED_ALT); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
export function saveDeletedAlt(list) { localStorage.setItem(KEYS.DELETED_ALT, JSON.stringify(list)) }

// ============ الإجازات السنوية V2 (جدول 2) ============
export function getLeavesV2() {
  try { const raw = localStorage.getItem(KEYS.LEAVES_V2); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
export function saveLeavesV2(list) { localStorage.setItem(KEYS.LEAVES_V2, JSON.stringify(list)) }

// ============ التصاريح V2 (لوحة التصاريح — 5 أنواع) ============
export function getPermitsV2() {
  try { const raw = localStorage.getItem(KEYS.PERMITS_V2); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
export function savePermitsV2(list) {
  const seen=new Set(); const deduped=[]
  for(const p of [...list].reverse()){ if(!p||typeof p!=='object') continue; if(!p.date && typeof p.id==='string' && /^\d{4}-\d{2}-\d{2}/.test(p.id)) p.date=p.id.slice(0,10); const key=p.id||p.date; if(!key||seen.has(key)) continue; seen.add(key); deduped.push(p) }
  deduped.reverse()
  localStorage.setItem(KEYS.PERMITS_V2, JSON.stringify(deduped))
}

export function backupAll() {
  return {
    records: getRecords(),
    settings: getSettings(),
    dayTypes: JSON.parse(localStorage.getItem(KEYS.DAY_TYPES) || '{}'),
    vacations: JSON.parse(localStorage.getItem(KEYS.VACATIONS) || '{}'),
    altDays: getAltDays(),
    leavesV2: getLeavesV2(),
    permitsV2: getPermitsV2(),
    deletedAlt: getDeletedAlt(),
    annualLeaveUsed: localStorage.getItem(KEYS.ANNUAL_LEAVE_USED),
    restDaysUsed: localStorage.getItem(KEYS.REST_DAYS_USED),
    leaveYear: localStorage.getItem(KEYS.LEAVE_YEAR),
    // التعديل ٧+٩: الرمز خارج النسخة (hash لا يصلح للاستيراد — والرمز يُدخل لحظة التشفير)
    date: new Date().toISOString()
  }
}
export function restoreAll(data) {
  if (data.records) localStorage.setItem(KEYS.RECORDS, JSON.stringify(data.records))
  if (data.settings) localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data.settings))
  if (data.dayTypes) localStorage.setItem(KEYS.DAY_TYPES, JSON.stringify(data.dayTypes))
  if (data.vacations) localStorage.setItem(KEYS.VACATIONS, JSON.stringify(data.vacations))
  if (data.altDays) saveAltDays(data.altDays)
  if (data.leavesV2) saveLeavesV2(data.leavesV2)
  if (data.permitsV2) savePermitsV2(data.permitsV2)
  if (data.deletedAlt) saveDeletedAlt(data.deletedAlt)
  if (data.annualLeaveUsed) localStorage.setItem(KEYS.ANNUAL_LEAVE_USED, data.annualLeaveUsed)
  if (data.restDaysUsed) localStorage.setItem(KEYS.REST_DAYS_USED, data.restDaysUsed)
  if (data.leaveYear) localStorage.setItem(KEYS.LEAVE_YEAR, data.leaveYear)
  // التعديل ٩: رمز النسخ القديمة يُحوَّل hash من صفحة الإعدادات (hashAndStorePin) — لا استيراد مباشر
}
export { dateKey, KEYS }
