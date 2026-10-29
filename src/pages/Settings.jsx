import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'
import { useAttendance } from '../contexts/AttendanceContext'
import { getPin, setPin, backupAll, restoreAll, getRecords, getDefaultSettings } from '../utils/storage'
// التعديل ٧: النسخ المشفرة + التعديل ٩: hash الرمز
import { decryptJSON, hashAndStorePin, verifyPin, pinExists, isMaster, normDigits, pinStoreState, subtleOK } from '../utils/pinCrypto'
// التعديل ٤ (ب): التصدير اليدوي يختم تاريخ النسخة (نفس مفتاح التلقائي)
import { stampBackupNow } from '../utils/notices'
// التعديل ١٠: الماستر = رقم الإصدار المبخوز
import { version as APP_VERSION } from '../../package.json'
// التعديل ٨ (ج): مشاركة التقرير بعد التصدير
import { Share } from '@capacitor/share'
import { isPinOn } from '../hooks/usePinArea'
import { exportVacationsPdf, exportAltdaysPdf, exportExtraPdf, exportTardiesPdf, openPdf } from '../utils/pdfExport'
import PinGate from '../components/PinGate'
import ThemeTab from '../components/ThemeTab'
import PhotoEditor from '../components/PhotoEditor'
import { usePinArea } from '../hooks/usePinArea'
import pkg from '../../package.json'

import capConfig from '../../capacitor.config.json'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
// v12.9.63: صلاحية إدارة كل الملفات — بدونها الكتابة في Documents ممنوعة على أندرويد 11+
import { hasStoragePermission, askStoragePermission } from '../utils/storagePerm'

const TABS = [
  { key: 'theme', icon: '🎨', label: 'صور وألوان' },
  { key: 'work', icon: '🏭', label: 'نظام العمل' },
  { key: 'notif', icon: '🔔', label: 'التذكيرات' },
  { key: 'finance', icon: '💰', label: 'المالية' },
  { key: 'security', icon: '🔒', label: 'الأمان والبيانات' },
]

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// v12.11.5 — كارت حماية الخلفية (بند 5): حالة + مربع تفعيل + تشخيص (الكتم/الإظهار اتشال)
function ProtectionCard({ settings, setSimple, showToast }) {
  // v12.11.22 تعديل 7: صف واحد (الحالة + تحديث + التفعيل) بدون تعليق + سطر المحجوز والتاريخ
  const [last, setLast] = useState(null)
  const refresh = () => {
    try {
      const raw = localStorage.getItem('hr_last_schedule')
      setLast(raw ? JSON.parse(raw) : null)
    } catch { setLast(null) }
  }
  useEffect(() => { refresh() }, [])
  const enabled = settings.protectionEnabled !== false
  const toggleEnable = async (on) => {
    setSimple('protectionEnabled', on)
    showToast(on ? '✅ اتفعلت حماية الخلفية — هتتحجز مع أول مراجعة' : '⛔ اتطفت حماية الخلفية — اتمسحت الحجوزات')
    setTimeout(refresh, 1500)
  }
  const lastTxt = last ? `${last.n} إشعار محجوز — ${new Date(last.t).toLocaleString('ar-EG')}` : 'لسه مفيش حجز'
  return (
    <div className="card" style={{ padding: '10px' }}>
      {/* v12.11.23 تعديل 10: الاسم جنب الرمز + التحديث سطر تحت */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-700">🛡️ حماية الخلفية {enabled ? '✅' : '❌'}</span>
        <label className="cursor-pointer"><input type="checkbox" checked={enabled} onChange={e => toggleEnable(e.target.checked)} className="w-5 h-5" /></label>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500">آخر تجديد: {lastTxt}</span>
        <button onClick={refresh} className="text-xs bg-slate-100 rounded-lg px-2 py-1 font-bold shrink-0">🔄 تحديث</button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { settings, updateSettings } = useSettings()
  const { showToast, clearAllRecords } = useAttendance()
  const navigate = useNavigate()
  const [tab, setTab] = useState('theme') // v12.11.21 تعديل 6: الفتح على أول تبويب يمين (الثيم)
  // v12.11.22 تعديل 7: حالات طي الكروت (مقفولة افتراضيًا — الظاهر بس المتعلم عليه)
  const [showWork, setShowWork] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const [showFinance, setShowFinance] = useState(false)
  const [showRates, setShowRates] = useState(false)
  const [pinInput, setPinInput] = useState('')
  // تعديل ٥: قايمة الأجزاء المحمية (مربعات الصح) — تظهر فقط والحماية مفعلة
  const [pinAreasOpen, setPinAreasOpen] = useState(false)
  // التعديل ٩: نموذج إدارة الرمز (تعيين/تحقق/تغيير/إلغاء)
  const [pinForm, setPinForm] = useState(null)
  // التعديل ٢٨: محرر الصورة الشخصية (مصدر مؤقت قبل القص)
  const [photoEditSrc, setPhotoEditSrc] = useState(null)
  const photoFileRef = useRef(null)
  const onPhotoFile = (e) => {
    try {
      const f = e.target.files && e.target.files[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => setPhotoEditSrc(r.result)
      r.readAsDataURL(f)
      e.target.value = ''
    } catch {}
  }
  const handlePinFormSave = async () => {
    const f = pinForm
    if (!f) return
    const fail = (err) => setPinForm({ ...f, err })
    // التعديل ١٠: نسيت الرمز؟ — الماستر (رقم الإصدار) يفتح التعيين فورًا
    if (f.mode === 'forgot') {
      if (isMaster(f.old, APP_VERSION)) setPinForm({ mode: 'set', old: '', nw: '', cf: '', err: '' })
      else fail('الماستر غير صحيح')
      return
    }
    // التعديل ١٠: بلا رمز مخزن = الإلغاء مباشر (لا قديم يُطلب)
    if (f.mode === 'disable' && !pinExists()) {
      setSimple('pinEnabled', false); setPinForm(null); showToast('✅ تم إطفاء الحماية'); return
    }
    if (f.mode === 'verify' || f.mode === 'disable' || f.mode === 'change') {
      if (!(await verifyPin(f.old))) { fail('الرمز الحالي غير صحيح'); return }
    }
    if (f.mode === 'disable') {
      setSimple('pinEnabled', false); setPinForm(null); showToast('✅ تم إطفاء الحماية — الرمز محفوظ لإعادة التفعيل'); return
    }
    if (f.mode === 'verify') { setPinForm(null); showToast('✅ تم التحقق — الحماية مفعلة'); return }
    if (f.nw.length < 4) { fail('الرمز 4-6 أرقام'); return }
    if (f.nw !== f.cf) { fail('الرمز والتأكيد غير متطابقين'); return }
    // التعديل ١٠: خطأ التشفير يظهر بدل الصمت
    try { await hashAndStorePin(f.nw) } catch { fail('⚠️ تعذر الحفظ — التشفير غير مدعوم على هذا الجهاز'); return }
    if (!settings.pinEnabled) setSimple('pinEnabled', true)
    setPinForm(null); showToast('✅ تم حفظ الرقم السري')
  }
  // v12.9.50: محرر الصورة اتشال (المعلومات: الاسم + تاريخ الميلاد فقط)
  const [showPin, setShowPin] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  // التعديل ٥: رسالة الحفظ toast مخنوقة (بدل span الهيدر) — الحفظ مع كل حرف
  // v12.1.1 — backup native
  // التعديل ٢ (دورة جديدة): هيكل HR Assist/Backups — للنسخ القادم
  const BACKUP_FOLDER = 'HR Assist/Backups'
  const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const nowD = new Date()
  const [vacYear, setVacYear] = useState(nowD.getFullYear())
  const [altYear, setAltYear] = useState(nowD.getFullYear())
  const [exYear, setExYear] = useState(nowD.getFullYear())
  const [exMonth, setExMonth] = useState(nowD.getMonth() + 1)
  const [tardYear, setTardYear] = useState(nowD.getFullYear())
  const [pdfBusy, setPdfBusy] = useState(false)
  const BACKUP_DIR = Directory.Documents
  const [backupPathDisplay, setBackupPathDisplay] = useState('...جاري التحميل')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [backupFiles, setBackupFiles] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  // v12.9.63: عرض اسم الملف فقط في السطر الثاني — ودوسه يطلع العنوان الكامل + ينسخه
  const [pathInfo, setPathInfo] = useState(null)
  const showPathInfo = (full) => {
    try { navigator.clipboard.writeText(full) } catch {}
    setPathInfo(full)
  }
  // اسم الملف الأخير من رابط الملف (آخر جزء بعد /) — fallback: آخر كلمة في النص
  const baseName = (uri) => {
    try {
      const s = String(uri || '')
      const i = s.lastIndexOf('/')
      return i >= 0 ? decodeURIComponent(s.slice(i + 1)) : ''
    } catch { return '' }
  }
  const [lastBackupName, setLastBackupName] = useState('')
  // v12.8.3 (بند ٣): بوابة الرمز — النسخ اليدوي + تبويب الخاصة
  const { gate, request, handleSuccess, handleClose } = usePinArea()
  const goTab = (key) => {
    // v12.9.56: تبويب المالية مقفول بالباس لما الحماية متفعلة (مرة في الجلسة)
    if (key === 'finance') { request('finance', '💰 المالية', () => setTab('finance')); return }
    setTab(key)
  }
  // v12.4.12 — حالة Exact Alarm (Android 12+)
  const [exactAlarm, setExactAlarm] = useState('unknown')
  // التعديل ٣ (أ): تشخيص مرئي — القيم الخام + آخر خطأ (بدل … الصامت)
  const [exactRaw, setExactRaw] = useState('')
  const [notifRaw, setNotifRaw] = useState('')
  const checkPermsDiag = async () => {
    try {
      if (!Capacitor.isNativePlatform()) { showToast('🌐 المتصفح — مش محتاج'); return }
      let nRaw = '', eRaw = ''
      try { const p = await LocalNotifications.checkPermissions(); nRaw = JSON.stringify(p); setNotifRaw(nRaw) } catch (e) { nRaw = 'ERR: ' + String(e?.message || e); setNotifRaw(nRaw) }
      try { const r = await LocalNotifications.checkExactNotificationSetting?.(); eRaw = JSON.stringify(r); setExactRaw(eRaw) } catch (e) { eRaw = 'ERR: ' + String(e?.message || e); setExactRaw(eRaw) }
      try {
        const r = eRaw.startsWith('ERR') ? null : JSON.parse(eRaw)
        const v = String(r?.exact_alarm || r?.exactAlarm || 'unknown')
        setExactAlarm(v)
        if (v !== 'granted') showToast('افتح Alarms & reminders وفعّلها')
      } catch {}
    } catch (e) { showToast('⚠️ ' + String(e?.message || e)) }
  }

  const weekendDays = (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]

  const records = getRecords()
  const recordCount = Object.keys(records).length
  const dataSizeKB = ((new Blob([JSON.stringify(records)]).size) / 1024).toFixed(1)

  useEffect(() => {
    (async () => {
      if (Capacitor.isNativePlatform()) {
        try { const { uri } = await Filesystem.getUri({ directory: BACKUP_DIR, path: BACKUP_FOLDER }); setBackupPathDisplay(uri) } catch(e) { console.warn('backup path:', e?.message); setBackupPathDisplay('/Documents/HR Assist/Backups/') }
        // تعديل ١٢: الخانة تعرض أحدث ملف فعليًا (مش جلسة التصدير بس) + تنضيف أول ما تفتح الإعدادات
        try { const latest = await getLatestBackup(); if (latest) setLastBackupName(latest) } catch {}
        try { cleanupOldBackups() } catch {}
      } else { setBackupPathDisplay('التنزيلات / Downloads (المتصفح)') }
    })()
  }, [])

  // الحفظ التلقائي مع التحقق من القيم
  const save = (next) => {
    const ws = next.workHours || {}
    if (ws.start && ws.end) {
      const [sh, sm] = ws.start.split(':').map(Number)
      const [eh, em] = ws.end.split(':').map(Number)
      if (eh * 60 + em <= sh * 60 + sm) {
        showToast('⚠️ موعد الانصراف لازم يكون بعد موعد الحضور')
        return
      }
    }
    for (const k of ['hourlyRate', 'lunchValue', 'bonusValue', 'fridayMultiplier', 'saturdayMultiplier', 'holidayMultiplier', 'restDayMinHours', 'restDayBonusHours', 'lunchMinHours', 'bonusMinHours', 'altDayMinHours', 'notificationLeadMinutes']) {
      if (typeof next[k] === 'number' && next[k] < 0) {
        showToast('⚠️ القيم لازم تكون موجبة')
        return
      }
    }
    if (next.weekendDays && next.weekendDays.length === 2 && next.weekendDays[0] === next.weekendDays[1]) {
      showToast('⚠️ يومي الإجازة الأسبوعية لازم يكونوا مختلفين')
      return
    }
    updateSettings(next)
    // التعديل ٥: toast مخنوق (أقصى مرة كل ثانيتين) — الكتابة حرف بحرف متعملش سبام
    try {
      const now = Date.now()
      if (now - (window.__lastSaveToast || 0) > 2000) { window.__lastSaveToast = now; showToast('✅ تم الحفظ') }
    } catch {}
  }

  const setNested = (section, key, val) => save({ ...settings, [section]: { ...settings[section], [key]: val } })
  const setSimple = (key, val) => save({ ...settings, [key]: val })
  // تعديل ٥: بنود القايمة الثمانية + تبديل المربع (المالية تشمل الخاصة / PDF يشمل النسخ)
  const PIN_AREAS = [
    ['records', '📋', 'السجلات'],
    ['home', '🏠', 'الرئيسية'],
    ['permits', '📝', 'التصاريح'],
    ['vac', '🏖️', 'الإجازات'],
    ['alt', '🔄', 'الأيام البديلة'],
    ['finance', '💰', 'المالية والخاصة'],
    ['pdf', '📄', 'PDF والنسخ الاحتياطية'],
    ['app', '🔓', 'فتح البرنامج'],
  ]
  const togglePinArea = (k, v) => {
    const cur = { records: true, home: true, permits: true, vac: true, alt: true, finance: true, special: true, pdf: true, backup: true, app: true, ...(settings.pinAreas || {}) }
    const next = { ...cur, [k]: v }
    if (k === 'finance') next.special = v
    if (k === 'pdf') next.backup = v
    setSimple('pinAreas', next)
  }

  const getTimestamp = () => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}_${String(n.getHours()).padStart(2,'0')}-${String(n.getMinutes()).padStart(2,'0')}-${String(n.getSeconds()).padStart(2,'0')}`
  }
  const ensureBackupFolder = async () => {
    if (!Capacitor.isNativePlatform()) return
    try { await Filesystem.mkdir({ directory: BACKUP_DIR, path: BACKUP_FOLDER, recursive: true }) } catch(e) { console.warn('backup folder:', e?.message) }
  }
  // التعديل ٧: حوار رمز التشفير (تصدير/استيراد) + ملخص أعداد
  const [encAsk, setEncAsk] = useState(null) // { mode:'export'|'import', parsed?, fileName? }
  // التعديل ٨ (ج): حوار ما بعد تصدير التقرير
  const [pdfAsk, setPdfAsk] = useState(null) // { uri, fileName, title }
  const [encPinInput, setEncPinInput] = useState('')
  const backupSummary = (data) => {
    const n = (a) => Array.isArray(a) ? a.length : Object.keys(a || {}).length
    return `تم تصدير ${n(data.records)} سجل + ${n(data.leavesV2)} إجازة + ${n(data.altDays)} يوم بديل + ${n(data.permitsV2)} تصريح`
  }
  const handleBackup = async () => {
    // v12.9.63: صلاحية إدارة الملفات قبل التصدير
    if (Capacitor.isNativePlatform() && !await hasStoragePermission()) {
      showToast('🔓 فعّل "السماح بالوصول لجميع الملفات" عشان نحفظ في المستندات')
      await askStoragePermission()
    }
    // v12.9.53: التشفير اتلغى — التصدير عادي دائمًا (القديمة المشفرة تتفتح برقمها للقراءة)
    const data = backupAll()
    const fileName = `HRassist-v${APP_VERSION}-${getTimestamp()}.json`
    const jsonStr = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
    if (Capacitor.isNativePlatform()) {
      try {
        await ensureBackupFolder()
        await Filesystem.writeFile({ directory: BACKUP_DIR, path: `${BACKUP_FOLDER}/${fileName}`, data: jsonStr, encoding: Encoding.UTF8, recursive: true })
        const { uri } = await Filesystem.getUri({ directory: BACKUP_DIR, path: `${BACKUP_FOLDER}/${fileName}` })
        showToast(`✅ ${backupSummary(data)}`)
        setBackupPathDisplay(uri.replace(`/${fileName}`, '/'))
        setLastBackupName(fileName)
        stampBackupNow()
        cleanupOldBackups()
      } catch (err) { console.error(err); showToast('⚠️ فشل الحفظ: ' + (err.message||'')) }
    } else {
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fileName; a.click(); URL.revokeObjectURL(url); stampBackupNow()
      showToast(`✅ ${backupSummary(backupAll())}`)
    }
  }
  // v12.9.53: حوار التشفير للاستيراد فقط (القديمة المشفرة — قراءة)
  // التعديل ٧: استيراد نسخة مشفرة — يطلب الرمز (القديمة تُقبل مباشرة)
  const doRestoreData = async (parsed, fileName) => {
    if (parsed && parsed.enc === true) {
      setEncPinInput(''); setEncAsk({ mode: 'import', parsed, fileName })
      return
    }
    restoreAll(parsed)
    // التعديل ٩: رمز نصي في نسخة قديمة → تحويله hash فور الاستيراد
    try { if (parsed && parsed.pin && /^\d{4,6}$/.test(parsed.pin)) await hashAndStorePin(parsed.pin) } catch {}
    showToast(`✅ تم استيراد${fileName ? `: ${fileName}` : ' البيانات'} (نسخة قديمة غير مشفرة)`)
    setBrowseOpen(false); setTimeout(() => window.location.reload(), 800)
  }
  const confirmEncImport = async () => {
    const pin = (encPinInput || '').trim()
    const { parsed, fileName } = encAsk || {}
    if (!parsed) { setEncAsk(null); return }
    try {
      const data = await decryptJSON(pin, parsed)
      restoreAll(data)
      setEncAsk(null); setEncPinInput('')
      showToast(`🔓 تم استيراد: ${fileName || 'النسخة المشفرة'}`)
      setBrowseOpen(false); setTimeout(() => window.location.reload(), 800)
    } catch { showToast('⚠️ الرمز غير صحيح أو ملف تالف') }
  }
  // التعديل ٣ (دورة جديدة): استخراج الـPDF تحت حماية الرمز — نفس الرمز + مرة/جلسة + فقط عند التفعيل
  const guardedPdfExport = (kind) => request('pdf', '📄 استخراج ملفات PDF', () => doPdfExport(kind))
  // التعديل ٢٥ (دورة سادسة): استخراج ملفات PDF + فتحها
  const doPdfExport = async (type) => {
    if (pdfBusy) return
    // v12.9.63: نطلب صلاحية إدارة الملفات مرة واحدة قبل أول استخراج
    if (!Capacitor.isNativePlatform()) { /* المتصفح — يكمّل */ }
    else if (!await hasStoragePermission()) {
      showToast('🔓 فعّل "السماح بالوصول لجميع الملفات" عشان نحفظ في المستندات')
      await askStoragePermission()
      if (!await hasStoragePermission()) { showToast('⚠️ من غير الصلاحية مش هنقدر نحفظ في المستندات'); }
    }
    setPdfBusy(true)
    try {
      let res = null
      if (type === 'vac') res = await exportVacationsPdf(vacYear)
      else if (type === 'alt') res = await exportAltdaysPdf(altYear)
      else if (type === 'tard') res = await exportTardiesPdf(tardYear)
      else res = await exportExtraPdf(exYear, exMonth)
      const key = type === 'vac' ? 'lastPdfVac' : type === 'alt' ? 'lastPdfAlt' : type === 'tard' ? 'lastPdfTard' : 'lastPdfExtra'
      save({ ...settings, [key]: res.uri })
      // v12.9.63: لو اتحفظ في المسار البديل — نقول الحقيقة ونعرض سبب الخطأ الحقيقي
      if (res && res.fallback) showToast('⚠️ حُفظ في مساحة التطبيق مش المستندات — ' + (res.error || ''))
      if (res && res.web) showToast('✅ تم تنزيل ملف PDF')
      // التعديل ٨ (ج): حوار بعد التصدير — فتح / مشاركة / إغلاق
      setPdfAsk({ uri: res.uri, fileName: res.fileName, title: type === 'vac' ? 'ملف الإجازات' : type === 'alt' ? 'ملف الأيام البديلة' : type === 'tard' ? 'ملف التأخيرات' : 'ملف الإضافي' })
    } catch (err) { console.error(err); showToast('⚠️ فشل استخراج الـPDF: ' + (err.message || '')) }
    setPdfBusy(false)
  }
  const doPdfOpen = async (uri, title) => {
    try { await openPdf(uri, title) }
    catch (err) { console.error(err); showToast('⚠️ تعذر فتح الملف') }
  }
  // v12.7.6: استخراج ثيم واحد لملف JSON في Documents (تبعته لعمرو يحطه في ثيمات البرنامج)
  const handleBrowse = async () => {
    if (!Capacitor.isNativePlatform()) { handleRestoreFallback(); return }
    setBrowseOpen(true); setBrowseLoading(true)
    try { await ensureBackupFolder(); const res=await Filesystem.readdir({ directory: BACKUP_DIR, path: BACKUP_FOLDER }); const files=(res.files||[]).filter(f=>f.name.endsWith('.json')).sort((a,b)=>b.name.localeCompare(a.name)); setBackupFiles(files); if(files.length===0) showToast('📂 المجلد فارغ — اعمل تصدير أولاً') } catch(err){ console.warn('browse:', err?.message); setBackupFiles([]); showToast('⚠️ لا يمكن فتح المجلد') } finally{ setBrowseLoading(false) }
  }
  const handleRestoreFromFile = async (fileName) => {
    try { const { data }=await Filesystem.readFile({ directory: BACKUP_DIR, path: `${BACKUP_FOLDER}/${fileName}`, encoding: Encoding.UTF8 }); const parsed=JSON.parse(data); await doRestoreData(parsed, fileName) } catch(err){ console.warn('restore:', err?.message); showToast('⚠️ ملف غير صالح') }
  }
  // تعديل ١٢: تنضيف المجلد — الاحتفاظ بآخر شهرين فقط (يدوي + تلقائي — بالاسم المرتب أو التاريخ)
  const cleanupOldBackups = async () => {
    try {
      if (!Capacitor.isNativePlatform()) return 0
      const res = await Filesystem.readdir({ directory: BACKUP_DIR, path: BACKUP_FOLDER })
      const cutoff = Date.now() - 60 * 24 * 3600 * 1000
      let n = 0
      for (const f of (res.files || [])) {
        try {
          if (!String(f.name || '').endsWith('.json')) continue
          const st = await Filesystem.stat({ directory: BACKUP_DIR, path: `${BACKUP_FOLDER}/${f.name}` })
          const mt = new Date(st.mtime || st.ctime || 0).getTime()
          if (mt && mt < cutoff) { await Filesystem.deleteFile({ directory: BACKUP_DIR, path: `${BACKUP_FOLDER}/${f.name}` }); n++ }
        } catch {}
      }
      return n
    } catch { return 0 }
  }
  // تعديل ١٢: أحدث ملف في المجلد = «نفس الملف» اللي الكل بيقرا منه
  const getLatestBackup = async () => {
    try {
      if (!Capacitor.isNativePlatform()) return null
      await ensureBackupFolder()
      const res = await Filesystem.readdir({ directory: BACKUP_DIR, path: BACKUP_FOLDER })
      const files = (res.files || []).filter(f => String(f.name || '').endsWith('.json')).sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')))
      return files.length ? files[0].name : null
    } catch { return null }
  }
  // تعديل ١٢: الاستيراد يقرا من نفس (أحدث) ملف مباشرة — بلا منتقي ولا قايمة (الخارجي من «فتح»)
  const handleImportLatest = async () => {
    const latest = await getLatestBackup()
    if (!latest) { showToast('📂 مفيش نسخة — اعمل تصدير أولاً'); return }
    await handleRestoreFromFile(latest)
  }
  const handleRestoreFallback = () => {
    const input=document.createElement('input'); input.type='file'; input.accept='.json'
    input.onchange=(e)=>{ const file=e.target.files[0]; if(!file) return; const r=new FileReader(); r.onload=async (ev)=>{ try{const d=JSON.parse(ev.target.result); await doRestoreData(d, file.name)}catch{showToast('⚠️ ملف غير صالح')}}; r.readAsText(file)}
    input.click()
  }
  const handleRestore = handleBrowse

  // v12.9.50: فقرة عدم الاعتماد — عريضة بعد بند 1 (البوابة + الإعدادات)
  const DISCLAIMER_ADD = `(البرنامج غير معتمد من اي جهه حكوميه ولا قطاع عام او خاص ولا يهدف الي تداول البيانات ولا يقوم بجمعها ولا يهدف مطور البرنامج الي الاعتماد من اي جهه حكوميه او غيره انما هو وسيله مساعده للمستخدم تعتمد علي البيانات المسجله عن طريقه وتحت مسئوليته الشخصيه والقانونيه ويقر المستخدم مسئوليته الكامله عن الاحتفاظ ببياناته الشخصيه وحذر تداول معلوماته وبياناته مع الغير لان ذلك يضعه تحت طائله القانون)
ولا تعتمد بيانات ومستندات هذا البرنامج في المقارنه او المطالبه او الاحتكام اليه في اي امور رسميه تخص مستخدم البرنامج)`
  const disclaimerText = `نموذج إخلاء المسؤولية القانونية هو وثيقة قانونية تحمي الجهة المعالِجة للبيانات من المسؤولية القانونية الناتجة عن أي مخاطر أو أخطاء غير مقصودة في تسجيل وتداول البيانات.

1. مقدمة وتمهيد
يُشكل هذا الإقرار اتفاقاً قانونياً ملزماً بين مطور البرنامج وبين المستخدم. يغطي هذا النموذج كافة العمليات المتعلقة بجمع، تسجيل، تخزين، معالجة، وتداول البيانات.

{{DISCLAIMER_ADD}}

2. دقة وصحة البيانات
يتحمل المستخدم المسؤولية الكاملة عن صحة ودقة البيانات المقدمة منه للجهة. لا تتحمل الجهة أي مسؤولية عن الأضرار الناتجة عن تقديم بيانات خاطئة، ناقصة، أو مضللة. يلتزم المستخدم بتحديث بياناته فور حدوث أي تغيير عليها.

3. أمن البيانات والاختراقات السيبرانية
تبذل الجهة أقصى جهودها التقنية والتنظيمية لتأمين تداول البيانات وحمايتها وفقاً لأفضل الممارسات والمعايير المعتمدة. يقر المستخدم بأن نقل البيانات عبر الإنترنت لا يمكن أن يكون آمناً بنسبة 100%. تُعفى الجهة من المسؤولية عن أي تسريب أو اختراق سيبراني خارج عن إرادتها المباشرة أو ناتج عن القوة القاهرة.

4. الاستخدام غير المصرح به
يتحمل المستخدم مسؤولية الحفاظ على سرية معلومات الدخول أو الحساب الخاص به. لا تتحمل الجهة أي أضرار ناتجة عن استخدام حساب المستخدم أو بياناته من قبل أطراف ثالثة غير مصرح لها نتيجة إهمال المستخدم.

5. حدود المسؤولية المالية والقانونية
لا تكون الجهة مسؤولة تحت أي ظرف من الظروف عن أي أضرار غير مباشرة، أو عرضية، أو تبعية (بما في ذلك خسارة الأرباح أو توقف الأعمال) الناتجة عن استخدام أو عدم القدرة على استخدام البيانات المتداولة.

6. الامتثال للتشريعات والقوانين
يلتزم الطرفان بكافة القوانين والأنظمة المحلية والدولية المنظمة لحماية البيانات وتداولها. يحق للجهة الإفصاح عن البيانات للجهات الحكومية أو القضائية المختصة عند وجود أمر قانوني ملزم، دون أي مسؤولية تجاه المستخدم.

7. التعديلات على النموذج
تحتفظ الجهة بالحق في تعديل أو تحديث بنود هذا النموذج في أي وقت. يُعد استمرار المستخدم في استخدام الخدمات وتداول البيانات بعد التعديل موافقة ضمنية على البنود الجديدة.

إقرار وموافقة المستخدم:
بموجب النقر على زر "أوافق" أو التوقيع أدناه، يقر المستخدم بأنه قرأ وفهم كافة بنود إخلاء المسؤولية هذه، ويوافق على الالتزام بها دون قيد أو شرط.`

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return }
    try { clearAllRecords() } catch(e) { console.warn('clear records:', e?.message) }
    const keepDisclaimer = localStorage.getItem('disclaimerAccepted')
    const keepDate = localStorage.getItem('disclaimerDate')
    // v12.9.64: الضبط المصنع مايمسحش نسخ الباك أب — دي الأمان اللي بيرجّعلك البيانات لو الذاكرة اتمسحت
    // (السلوك القديم كان يمسح HR Assist/Backups بالكامل = خسارة النسخ بالغلط)
    let keptBackups = 0
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await Filesystem.readdir({ directory: BACKUP_DIR, path: BACKUP_FOLDER })
        keptBackups = (res.files || []).filter(f => String(f.name || '').endsWith('.json')).length
      }
    } catch(fsErr) { console.warn('reset count backups:', fsErr?.message) }
    localStorage.clear()
    if (keepDate && keepDate.includes('2026-09-02')) { /* لا ترجعها — تطلب موافقة جديدة */ } else {
      if (keepDisclaimer) localStorage.setItem('disclaimerAccepted', keepDisclaimer)
      if (keepDate) localStorage.setItem('disclaimerDate', keepDate)
    }
    updateSettings(getDefaultSettings())
    setConfirmReset(false)
    showToast(keptBackups > 0
      ? `✅ تم المسح — ${keptBackups} نسخة احتياطية محفوظة في Backups`
      : '✅ تم مسح كل البيانات تلقائي — 0 سجل')
    setTimeout(() => window.location.reload(), 800)
  }

  {/* التعديل ٨: page-set لخلفية الثيم المتدرج */}
  return (
    <div className="px-4 py-2 space-y-2 page-set">
      <PinGate open={gate.open} title={gate.title} onSuccess={handleSuccess} onClose={handleClose} />
      {/* التعديل ٥: حاوية sticky واحدة (العنوان + التبويبات) */}
      {/* v12.9.54: شريط مصمت بنفس تدرج الصفحة — يندمج فوق ويغطي المحتوى تحت (نهاية الشفافية) */}
      {/* v12.11.22 تعديل 8: تدرج واحد — غامق فوق لأبيض تحت زي باقي الصفحات */}
      {/* v12.11.23 تعديل 9: الشريط شفاف — يندمج في تدرج الصفحة الواحد */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-2">
      <div className="rounded-2xl p-3 text-white">
        <h1 className="text-xl font-extrabold">⚙️ الإعدادات</h1>
      </div>

      {/* التبويبات — أيقونة فوق والمسمى تحتها */}
      {/* v12.11.26 (10): توسيط + مقاس أكبر يناسب الصفحة */}
      <div className="flex gap-1.5 mt-2 justify-center">
        {TABS.map(t => (
          <button key={t.key} onClick={() => goTab(t.key)}
            className={`flex-1 py-2 rounded-xl transition-all bg-white flex flex-col items-center justify-center gap-1 min-h-[64px] ${tab === t.key ? 'shadow-md text-blue-700 border-2 border-blue-500' : 'shadow-sm text-slate-500 border-2 border-transparent'}`}>
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="text-xs leading-tight font-bold text-center" style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{t.label}</span>
          </button>
        ))}
      </div>
      </div>

      {/* 🎨 تبويب المظهر */}
      {/* 🏭 تبويب نظام العمل — v12.9.52: منقول من الخاصة بنفس القيم */}
      {tab === 'theme' && (<div className="space-y-2">
          {/* التعديل ٢ (دورة جديدة): لوحة المعلومات الشخصية — أول الخاصة (منقولة من تبويب مستقل محذوف) */}
          <div className="card" style={{padding:'13px'}}>
            <h3 className="font-bold text-slate-700 mb-3">👤 معلومات شخصية</h3>
            {(() => {
              const pf = settings.profile || {}
              const setPf = (patch) => setSimple('profile', { ...pf, ...patch })
              const fld = 'w-full p-2 border-2 border-slate-200 rounded-xl text-sm font-bold'
              const lbl = 'text-xs font-bold text-slate-600 mb-1'
              // v12.9.50: المعلومات — الاسم + تاريخ الميلاد فقط
              // التعديل ٢٨: الصورة الشخصية (اختيار + زوم/تحريك/قص) + مربع عرض الرئيسية
              return (
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {pf.photo ? (
                        <img src={pf.photo} alt="" className="rounded-full object-cover border-2 border-slate-200" style={{ width: 64, height: 64 }} />
                      ) : (
                        <div className="rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-2xl" style={{ width: 64, height: 64 }}>👤</div>
                      )}
                      <div className="flex-1 space-y-1">
                        <input ref={photoFileRef} type="file" accept="image/*" onChange={onPhotoFile} className="hidden" />
                        <button onClick={() => photoFileRef.current && photoFileRef.current.click()} className="btn btn-primary text-xs px-3 py-1.5 w-full">📷 {pf.photo ? 'تغيير الصورة' : 'إضافة صورة'}</button>
                        {pf.photo && (<button onClick={() => setPf({ photo: '' })} className="btn text-xs px-3 py-1.5 w-full">🗑 مسح الصورة</button>)}
                      </div>
                    </div>
                    {pf.photo && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={pf.showPhotoHome !== false} onChange={(e) => setPf({ showPhotoHome: e.target.checked })} className="w-5 h-5" />
                        <span className="text-xs font-bold text-slate-600">عرض الصورة في الشاشة الرئيسية</span>
                      </label>
                    )}
                    <div><div className={lbl}>الاسم</div><input value={pf.name||''} onChange={e=>setPf({name:e.target.value})} placeholder="مثال: عمرو عادل" className={fld} /></div>
                    <div><div className={lbl}>تاريخ الميلاد</div><input type="date" value={pf.birth||''} onChange={e=>setPf({birth:e.target.value})} className={fld} /></div>
                </div>
              )
            })()}
          </div>
          <ThemeTab />
        </div>)}
      {tab === 'work' && (
        <div className="space-y-2">
          <div className="card" style={{padding:'8px'}}>
            <h3 className="font-bold text-slate-700 mb-1.5">🕗 مواعيد العمل الرسمية</h3>
            <div className="grid grid-cols-2 gap-1">
              <div className="input-group"><label className="text-xs">حضور</label><input type="time" value={settings.officialStart||'08:00'} onChange={e=>setSimple('officialStart', e.target.value)} className="p-1.5 text-xs" /></div>
              <div className="input-group"><label className="text-xs">انصراف</label><input type="time" value={settings.officialEnd||'15:00'} onChange={e=>setSimple('officialEnd', e.target.value)} className="p-1.5 text-xs" /></div>
            </div>
          </div>
          {/* v12.11.25 التعديل الأول: بره المتعلم عليه كامل زي الأصل — جوه السهم الـ3 كاملين */}
          <div className="card" style={{padding:'8px'}}>
            <button onClick={() => setShowWork(!showWork)} className="w-full flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700">🏢 نظام العمل</span>
              <span className="text-slate-500 text-xs font-bold shrink-0">{showWork ? '▲' : '▼'}</span>
            </button>
            {[
              { v: 'single', label: 'نظام وردية واحدة', shifts: ['shift1'] },
              { v: 'double', label: 'نظام ورديتين', shifts: ['shift1','shift2'] },
              { v: 'triple', label: 'نظام 3 ورديات', shifts: ['shift1','shift2','shift3'] },
            ].filter(opt => (settings.workSystemMode||'single')===opt.v).map(opt=>(
              <div key={opt.v} className="p-1.5 rounded-lg border-2 border-blue-500 bg-blue-50 mt-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-600 inline-flex items-center justify-center"><span className="w-1.5 h-1.5 bg-white rounded-full" /></span>
                  {opt.label} ✅
                </div>
                <div className="mt-1.5 space-y-2">
                  {opt.shifts.map(sh=>(
                    <div key={sh} className="grid grid-cols-2 gap-1">
                      <div className="input-group"><label className="text-xs">{sh==='shift1'?'وردية أولى':sh==='shift2'?'وردية تانية':'وردية تالتة'} - حضور</label><input type="time" value={settings[sh]?.start||''} onChange={e=>setNested(sh,'start',e.target.value)} className="p-1.5 text-xs" /></div>
                      <div className="input-group"><label className="text-xs">انصراف</label><input type="time" value={settings[sh]?.end||''} onChange={e=>setNested(sh,'end',e.target.value)} className="p-1.5 text-xs" /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {showWork && (<div className="space-y-2 mt-1.5">
              {[
                { v: 'single', label: 'نظام وردية واحدة', shifts: ['shift1'] },
                { v: 'double', label: 'نظام ورديتين', shifts: ['shift1','shift2'] },
                { v: 'triple', label: 'نظام 3 ورديات', shifts: ['shift1','shift2','shift3'] },
              ].map(opt=>(
                <div key={opt.v} className={`p-1.5 rounded-lg border-2 ${ (settings.workSystemMode||'single')===opt.v ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-1.5 font-bold text-xs cursor-pointer">
                    <input type="radio" name="workSystem" checked={(settings.workSystemMode||'single')===opt.v} onChange={()=>setSimple('workSystemMode', opt.v)} className="w-3.5 h-3.5" />
                    {opt.label}
                  </label>
                  <div className="mt-1.5 space-y-2">
                    {opt.shifts.map(sh=>(
                      <div key={sh} className="grid grid-cols-2 gap-1">
                        <div className="input-group"><label className="text-xs">{sh==='shift1'?'وردية أولى':sh==='shift2'?'وردية تانية':'وردية تالتة'} - حضور</label><input type="time" value={settings[sh]?.start||''} onChange={e=>setNested(sh,'start',e.target.value)} className="p-1.5 text-xs" /></div>
                        <div className="input-group"><label className="text-xs">انصراف</label><input type="time" value={settings[sh]?.end||''} onChange={e=>setNested(sh,'end',e.target.value)} className="p-1.5 text-xs" /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>)}
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🗓️ أيام الإجازة الأسبوعية</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="input-group">
                <label>اليوم الأول</label>
                <select value={weekendDays[0]} onChange={e => setSimple('weekendDays', [parseInt(e.target.value), weekendDays[1]])}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-white">
                  {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>اليوم الثاني</label>
                <select value={weekendDays[1]} onChange={e => setSimple('weekendDays', [weekendDays[0], parseInt(e.target.value)])}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-white">
                  {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </div>
            </div>

          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">📊 رصيد الإجازات</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="input-group"><label>الرصيد السنوي (أيام)</label><input type="number" value={settings.annualLeaveBalance || ''} onChange={e => setSimple('annualLeaveBalance', parseInt(e.target.value) || 0)} placeholder="0" /></div>
              <div className="input-group"><label>إجازة مرضي (أيام)</label><input type="number" value={settings.sickLeaveBalance || ''} onChange={e => setSimple('sickLeaveBalance', parseInt(e.target.value) || 0)} placeholder="0" /></div>
            </div>
          </div>
        </div>
      )}

      {/* 💰 تبويب المالية — v12.9.52: منقول من الخاصة بنفس القيم */}
      {tab === 'finance' && (
        <div className="space-y-2">
          <div className="card">
            <button onClick={() => setShowFinance(!showFinance)} className="w-full flex items-center justify-between">
              <span className="font-bold text-slate-700">💰 القيم المالية</span>
              <span className="text-slate-500 text-xs font-bold">{showFinance ? '▲' : '▼'}</span>
            </button>
            {showFinance && (<div className="space-y-2 mt-2">
              <div className="input-group"><label>سعر الساعة ({settings.currency})</label><input type="number" value={settings.hourlyRate || ''} onChange={e => setSimple('hourlyRate', parseFloat(e.target.value) || 0)} placeholder="100" /></div>
              <div className="input-group"><label>بدل الغداء ({settings.currency})</label><input type="number" value={settings.lunchValue || ''} onChange={e => setSimple('lunchValue', parseFloat(e.target.value) || 0)} placeholder="50" /></div>
              {settings.bonusEnabled===true && (<div className="input-group"><label>المكافأة اليومية ({settings.currency})</label><input type="number" value={settings.bonusValue || ''} onChange={e => setSimple('bonusValue', parseFloat(e.target.value) || 0)} placeholder="100" /></div>)}
              <div className="input-group"><label>بدل التاكسي ({settings.currency})</label><input type="number" value={settings.taxiValue || ''} onChange={e => setSimple('taxiValue', parseFloat(e.target.value) || 0)} placeholder="0" /></div>
            </div>)}
          </div>
          <div className="card">
            {/* v12.11.23 تعديل 10: مربع صح بدل الـ toggle */}
            {/* v12.11.24 تعديل 12: نفس حشوة كارت القيم المالية */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-bold">🎁 تفعيل المكافأة</span>
              <input type="checkbox" checked={settings.bonusEnabled === true} onChange={e => setSimple('bonusEnabled', e.target.checked)} className="w-5 h-5" />
            </label>

          </div>
          {settings.bonusEnabled===true && (<div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🎁 شروط المكافأة</h3>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 text-sm whitespace-nowrap">الحد الأدنى للساعات</span>
              <input type="number" value={settings.bonusMinHours || 7} onChange={e => setSimple('bonusMinHours', parseInt(e.target.value) || 7)} className="flex-1 min-w-0 p-2 border-2 border-slate-200 rounded-xl font-bold bg-white text-center" style={{ maxWidth: 140 }} />
            </div>
          </div>)}
          <div className="card">
            <button onClick={() => setShowRates(!showRates)} className="w-full flex items-center justify-between">
              <span className="font-bold text-slate-700">✖️ نسب الإضافي</span>
              <span className="text-slate-500 text-xs font-bold">{showRates ? '▲' : '▼'}</span>
            </button>
            {showRates && (<div className="grid grid-cols-3 gap-3 mt-2">
              <div className="input-group"><label>{DAY_NAMES[weekendDays[0]]}</label><input type="number" step="0.5" value={settings.fridayMultiplier || 2} onChange={e => setSimple('fridayMultiplier', parseFloat(e.target.value) || 2)} /></div>
              <div className="input-group"><label>{DAY_NAMES[weekendDays[1]]}</label><input type="number" step="0.5" value={settings.saturdayMultiplier || 1.5} onChange={e => setSimple('saturdayMultiplier', parseFloat(e.target.value) || 1.5)} /></div>
              <div className="input-group"><label>العطل</label><input type="number" step="0.5" value={settings.holidayMultiplier || 2} onChange={e => setSimple('holidayMultiplier', parseFloat(e.target.value) || 2)} /></div>
            </div>)}
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🍽️ شروط بدل الغداء</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="input-group"><label>الحد الأدنى (ساعات)</label><input type="number" value={settings.lunchMinHours || 8} onChange={e => setSimple('lunchMinHours', parseInt(e.target.value) || 8)} /></div>
              <div className="input-group"><label>بعد الساعة</label><input type="time" value={settings.lunchAfterTime || '16:31'} onChange={e => setSimple('lunchAfterTime', e.target.value)} /></div>
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🏖️ بدل الراحة</h3>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 text-sm whitespace-nowrap">الحد الأدنى للساعات</span>
              <input type="number" value={settings.restDayMinHours || 6} onChange={e => setSimple('restDayMinHours', parseInt(e.target.value) || 6)} className="flex-1 min-w-0 p-2 border-2 border-slate-200 rounded-xl font-bold bg-white text-center" style={{ maxWidth: 140 }} />
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🕐 تقريب الساعات</h3>
            <div className="space-y-2">
              {[
                { v: 'floor', label: 'تجاهل الكسور (10:55 → 10 ساعات)' },
                { v: 'none', label: 'بدون تقريب (10:55 تُحسب كما هي)' },
              ].map(o => (
                <button key={o.v} onClick={() => setSimple('hourRounding', o.v)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all ${(settings.hourRounding || 'floor') === o.v ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${(settings.hourRounding || 'floor') === o.v ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                    {(settings.hourRounding || 'floor') === o.v && <span className="w-2 h-2 bg-white rounded-full" />}
                  </span>
                  <span className="font-bold text-slate-700 text-sm">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 💰 تبويب المالية اتشال (v12.7.1) — اتنقل كلوحة في الخاصة */}

      {/* 🔔 تبويب التذكيرات — v12.4.11: 6 مفاتيح مستقلة */}
      {tab === 'notif' && (
        <div className="space-y-2">
          <div className="card" style={{padding:'10px'}}>
            <button onClick={() => setShowNotif(!showNotif)} className="w-full flex items-center justify-between">
              <span className="font-bold text-slate-700">🔔 التذكيرات</span>
              <span className="text-slate-500 text-xs font-bold">{showNotif ? '▲' : '▼'}</span>
            </button>
            {/* v12.11.23 تعديل 10: قبل الموعد بـ — دايمًا ظاهرة بره السهم */}
            <div className="input-group mt-1">
              <label>قبل الموعد بـ (دقيقة)</label>
              <select value={settings.notificationLeadMinutes || 30} onChange={e => setSimple('notificationLeadMinutes', parseInt(e.target.value) || 30)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-white">
                <option value={15}>15 دقيقة</option>
                <option value={30}>30 دقيقة</option>
                <option value={45}>45 دقيقة</option>
                <option value={60}>60 دقيقة</option>
              </select>
            </div>
            {showNotif && (<div>
            {/* تعديل ٦: مربعات صح بدل مفاتيح التبديل (الصح = الإشعار شغال) */}
            {[['notifB1','🕐','اشعارات الحضور والانصراف'],['notifB2','📝','اشعارات التصاريح'],['notifB3','🏖️','اشعارات الاجازات والايام البديله'],['notifB5','⏰','اشعارات التأخيرات'],['notifB6','📊','اشعارات الاحصائيات'],['notifInstant','⚡','الاشعارات اللحظيه']].map(([k,icon,label])=>{
              const on = settings[k] !== false
              return (
                <label key={k} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 cursor-pointer">
                  <span className="font-bold text-slate-700 text-sm">{icon} {label}</span>
                  <input type="checkbox" checked={on} onChange={e => setSimple(k, e.target.checked)} className="w-5 h-5" />
                </label>
              )
            })}

            </div>)}
          </div>
          <ProtectionCard settings={settings} setSimple={setSimple} showToast={showToast} />
          {/* v12.11.25 التعديل التاني: نفس سيمترية كارت الحماية — كل كارت لوحده */}
          <div className="card" style={{ padding: '10px' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700">⏰ دقة المنبهات {exactAlarm==='granted'?'✅':exactAlarm==='denied'?'❌':''}</span>
              <button onClick={checkPermsDiag} className="text-xs bg-slate-100 rounded-lg px-2 py-1 font-bold shrink-0">🔍 فحص</button>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500">الحالة: {exactAlarm==='granted'?'مسموح (دقيق)':exactAlarm==='denied'?'غير مسموح (متأخر في الخلفية)':'…'}</span>
              <button onClick={async()=>{ try{ if(!Capacitor.isNativePlatform()) return; await LocalNotifications.changeExactNotificationSetting?.(); showToast('ارجع بعد التفعيل واضغط فحص') }catch(e){ showToast('⚠️ '+String(e?.message||e)) } }} className="text-xs bg-slate-100 rounded-lg px-2 py-1 font-bold shrink-0">⚙️ فتح الإعدادات</button>
            </div>
          </div>

          {/* تعديل ٩: لوحة موعد تسجيل الوردية الأسبوعي — اليوم + الساعة (الافتراضي الخميس ٦ مساءً) */}
          <div className="card" style={{padding:'10px'}}>
            <h3 className="font-bold text-slate-700 mb-2">📋 موعد تسجيل الوردية الأسبوعي</h3>
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="block text-xs font-bold text-slate-500 mb-1">اليوم</span>
                <select value={settings.planWeekDay ?? 4} onChange={e => setSimple('planWeekDay', Number(e.target.value))}
                  className="w-full p-2 border-2 border-slate-200 rounded-lg font-bold text-sm bg-white">
                  <option value={0}>الأحد</option>
                  <option value={1}>الاثنين</option>
                  <option value={2}>الثلاثاء</option>
                  <option value={3}>الأربعاء</option>
                  <option value={4}>الخميس</option>
                  <option value={5}>الجمعة</option>
                  <option value={6}>السبت</option>
                </select>
              </label>
              <label className="flex-1">
                <span className="block text-xs font-bold text-slate-500 mb-1">الساعة</span>
                <input type="time" value={settings.planWeekTime || '18:00'} onChange={e => setSimple('planWeekTime', e.target.value)}
                  className="w-full p-2 border-2 border-slate-200 rounded-lg font-bold text-sm bg-white" dir="ltr" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 🔒 تبويب الأمان والبيانات */}
      {tab === 'security' && (
        <div className="space-y-2">
          <div className="card" style={{padding:'10px'}}>
            <div className="flex items-center justify-between mb-2" onClick={() => { if (settings.pinEnabled && !pinForm) setPinAreasOpen(o => !o) }} style={settings.pinEnabled && !pinForm ? { cursor: 'pointer' } : undefined}>
              <h3 className="font-bold text-slate-700">🔒 حماية بالرمز{settings.pinEnabled && !pinForm ? (pinAreasOpen ? ' ▲' : ' ▼') : ''}</h3>
              <button onClick={(e) => {
                e.stopPropagation()
                // التعديل ٩: التفعيل يطلب تعيين/تحقق — الإلغاء يطلب القديم
                if (!settings.pinEnabled) { setSimple('pinEnabled', true); setPinForm({ mode: pinExists() ? 'verify' : 'set', old: '', nw: '', cf: '', err: '' }) }
                else setPinForm({ mode: 'disable', old: '', nw: '', cf: '', err: '' })
              }}
                className={`relative w-11 h-6 rounded-full transition-all ${settings.pinEnabled ? 'bg-green-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.pinEnabled ? 'right-0.5' : 'right-[22px]'}`} />
              </button>
            </div>
            {/* التعديل ٩: تعيين/تغيير/إلغاء الرمز — قديم + جديد + تأكيد + hash */}
            {pinForm && (
              <div className="space-y-1.5 mt-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                {(pinForm.mode === 'verify' || pinForm.mode === 'disable' || pinForm.mode === 'change') && (
                  <input type="password" inputMode="numeric" maxLength={6} placeholder="الرمز الحالي" value={pinForm.old}
                    onChange={e => setPinForm({ ...pinForm, old: normDigits(e.target.value) })}
                    className="w-full p-1.5 border-2 border-slate-200 rounded-lg text-center font-bold text-sm" dir="ltr" />
                )}
                {pinForm.mode === 'forgot' && (
                  <input type="password" inputMode="numeric" placeholder="الماستر" value={pinForm.old} /* التعديل ٧: بلا تلميح — والقناع يخفي أثناء الكتابة */
                    onChange={e => setPinForm({ ...pinForm, old: e.target.value })}
                    className="w-full p-1.5 border-2 border-amber-300 rounded-lg text-center font-bold text-sm" dir="ltr" />
                )}
                {(pinForm.mode === 'set' || pinForm.mode === 'change') && (
                  <>
                    <input type="password" inputMode="numeric" maxLength={6} placeholder="رمز جديد (4-6 أرقام)" value={pinForm.nw}
                      onChange={e => setPinForm({ ...pinForm, nw: normDigits(e.target.value) })}
                      className="w-full p-1.5 border-2 border-slate-200 rounded-lg text-center font-bold text-sm" dir="ltr" />
                    <input type="password" inputMode="numeric" maxLength={6} placeholder="تأكيد الرمز" value={pinForm.cf}
                      onChange={e => setPinForm({ ...pinForm, cf: normDigits(e.target.value) })}
                      className="w-full p-1.5 border-2 border-slate-200 rounded-lg text-center font-bold text-sm" dir="ltr" />
                  </>
                )}
                {pinForm.err ? <p className="text-red-500 text-xs font-bold text-center">{pinForm.err}</p> : null}
                <div className="flex gap-1.5">
                  <button onClick={() => {
                    // إلغاء: لو فعّلنا بلا رمز صالح نرجع القفل (حماية من الحبس)
                    if ((pinForm.mode === 'set') && !pinExists()) setSimple('pinEnabled', false)
                    if ((pinForm.mode === 'verify') && !pinExists()) setSimple('pinEnabled', false)
                    setPinForm(null)
                  }} className="flex-1 py-1.5 rounded-lg bg-slate-200 font-bold text-xs">إلغاء</button>
                  <button onClick={handlePinFormSave} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs">حفظ</button>
                </div>
              </div>
            )}
            {settings.pinEnabled && !pinForm && (
              <div className="flex gap-3 mt-1.5">
                <button onClick={() => setPinForm({ mode: 'change', old: '', nw: '', cf: '', err: '' })}
                  className="text-xs text-blue-600 font-bold">✏️ تغيير الرمز</button>
                <button onClick={() => setPinForm({ mode: 'forgot', old: '', nw: '', cf: '', err: '' })}
                  className="text-xs text-amber-600 font-bold">نسيت الرمز؟ (بالماستر)</button>
              </div>
            )}
            {/* تعديل ٥: القايمة المنسدلة — ال ٨ بنود بمربعات الصح (الصح = مقفول بالرمز) */}
            {settings.pinEnabled && !pinForm && pinAreasOpen && (
              <div className="space-y-1 mt-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                {PIN_AREAS.map(([k, icon, label]) => {
                  const on = ((settings.pinAreas || {})[k] !== false)
                  return (
                    <label key={k} className="flex items-center justify-between bg-white rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer">
                      <span>{icon} {label}</span>
                      <input type="checkbox" checked={on} onChange={e => togglePinArea(k, e.target.checked)} className="w-4 h-4" />
                    </label>
                  )
                })}
              </div>
            )}
            {pinForm && (pinForm.mode === 'verify' || pinForm.mode === 'disable' || pinForm.mode === 'change') && (
              <button onClick={() => setPinForm({ mode: 'forgot', old: '', nw: '', cf: '', err: '' })}
                className="text-xs text-amber-600 font-bold mt-1.5">نسيت الرمز؟ (بالماستر)</button>
            )}

          </div>

          {/* v12.9.63: لوحة الباك أب — سطرين: تصدير+استيراد / المسار+فتح(=قائمة النسخ) */}
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">💾 النسخ الاحتياطي</h3>
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => request('backup', '📥 تصدير البيانات', handleBackup)} className="btn btn-primary text-xs h-[2.5rem] flex items-center justify-center">📥 تصدير البيانات</button>
                <button onClick={() => request('backup', '📤 استيراد البيانات', handleImportLatest)} className="btn btn-outline text-xs h-[2.5rem] flex items-center justify-center">📤 استيراد البيانات</button>
              </div>
              <div className="flex gap-2 items-stretch">
                <button onClick={() => showPathInfo(backupPathDisplay || `${BACKUP_FOLDER}/`)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 h-[2.5rem] overflow-hidden flex items-center text-left" dir="ltr">
                  <p className="text-xs font-mono font-bold text-slate-700 truncate w-full">{lastBackupName || '📍 لسه مفيش نسخة'}</p>
                </button>
                <button onClick={() => request('backup', '📂 النسخ المحفوظة', handleBrowse)} className="btn btn-warning text-xs px-3 flex items-center justify-center h-[2.5rem]" style={{minWidth:'64px'}}>📂 فتح</button>
              </div>
            </div>
          </div>
          {/* التعديل ٢٥ (دورة سادسة): استخراج ملفات PDF */}
          <div className="card mt-4" style={{padding:'13px'}}>
            <h3 className="font-bold text-slate-700 mb-2">📄 استخراج ملفات PDF</h3>
            <div className="space-y-2">
              {/* v12.9.63: لوحة استخراج — سطرين ثابتين: [استخراج + الفترة] / [اسم الملف + فتح] */}
              <div className="border-2 border-slate-200 rounded-xl p-1.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => guardedPdfExport('vac')} disabled={pdfBusy} className="btn btn-primary text-xs flex-1 h-[2.5rem] flex items-center justify-center">📄 استخراج ملف الإجازات</button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setVacYear(y => y - 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">‹</button>
                    <span className="font-black text-sm text-slate-700 w-12 text-center">{vacYear}</span>
                    <button onClick={() => setVacYear(y => y + 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">›</button>
                  </div>
                </div>
                <div className="flex gap-1.5 items-stretch">
                  <button disabled={!settings.lastPdfVac} onClick={() => settings.lastPdfVac && showPathInfo(settings.lastPdfVac)} className={`flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 h-[2.25rem] flex items-center min-w-0 ${settings.lastPdfVac ? '' : 'opacity-50'}`} dir="ltr">
                    <p className="text-[11px] font-mono font-bold text-slate-700 truncate w-full">{settings.lastPdfVac ? baseName(settings.lastPdfVac) : '📍 لسه مفيش ملف'}</p>
                  </button>
                  <button disabled={!settings.lastPdfVac} onClick={() => doPdfOpen(settings.lastPdfVac, 'ملف الإجازات')} className="btn btn-warning text-xs px-3 h-[2.25rem] flex items-center justify-center">📂 فتح</button>
                </div>
              </div>
              <div className="border-2 border-slate-200 rounded-xl p-1.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => guardedPdfExport('alt')} disabled={pdfBusy} className="btn btn-primary text-xs flex-1 h-[2.5rem] flex items-center justify-center">📄 استخراج ملف الأيام البديلة</button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setAltYear(y => y - 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">‹</button>
                    <span className="font-black text-sm text-slate-700 w-12 text-center">{altYear}</span>
                    <button onClick={() => setAltYear(y => y + 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">›</button>
                  </div>
                </div>
                <div className="flex gap-1.5 items-stretch">
                  <button disabled={!settings.lastPdfAlt} onClick={() => settings.lastPdfAlt && showPathInfo(settings.lastPdfAlt)} className={`flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 h-[2.25rem] flex items-center min-w-0 ${settings.lastPdfAlt ? '' : 'opacity-50'}`} dir="ltr">
                    <p className="text-[11px] font-mono font-bold text-slate-700 truncate w-full">{settings.lastPdfAlt ? baseName(settings.lastPdfAlt) : '📍 لسه مفيش ملف'}</p>
                  </button>
                  <button disabled={!settings.lastPdfAlt} onClick={() => doPdfOpen(settings.lastPdfAlt, 'ملف الأيام البديلة')} className="btn btn-warning text-xs px-3 h-[2.25rem] flex items-center justify-center">📂 فتح</button>
                </div>
              </div>
              <div className="border-2 border-slate-200 rounded-xl p-1.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => guardedPdfExport('extra')} disabled={pdfBusy} className="btn btn-primary text-xs flex-1 h-[2.5rem] flex items-center justify-center">📄 استخراج ملف الإضافي</button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { const m = exMonth - 1; if (m < 1) { setExMonth(12); setExYear(y => y - 1) } else setExMonth(m) }} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">‹</button>
                    <span className="font-black text-xs text-slate-700 w-20 text-center">{AR_MONTHS[exMonth - 1]} {exYear}</span>
                    <button onClick={() => { const m = exMonth + 1; if (m > 12) { setExMonth(1); setExYear(y => y + 1) } else setExMonth(m) }} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">›</button>
                  </div>
                </div>
                <div className="flex gap-1.5 items-stretch">
                  <button disabled={!settings.lastPdfExtra} onClick={() => settings.lastPdfExtra && showPathInfo(settings.lastPdfExtra)} className={`flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 h-[2.25rem] flex items-center min-w-0 ${settings.lastPdfExtra ? '' : 'opacity-50'}`} dir="ltr">
                    <p className="text-[11px] font-mono font-bold text-slate-700 truncate w-full">{settings.lastPdfExtra ? baseName(settings.lastPdfExtra) : '📍 لسه مفيش ملف'}</p>
                  </button>
                  <button disabled={!settings.lastPdfExtra} onClick={() => doPdfOpen(settings.lastPdfExtra, 'ملف الإضافي')} className="btn btn-warning text-xs px-3 h-[2.25rem] flex items-center justify-center">📂 فتح</button>
                </div>
              </div>
              <div className="border-2 border-slate-200 rounded-xl p-1.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => guardedPdfExport('tard')} disabled={pdfBusy} className="btn btn-primary text-xs flex-1 h-[2.5rem] flex items-center justify-center">📄 استخراج ملف التأخيرات</button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setTardYear(y => y - 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">‹</button>
                    <span className="font-black text-sm text-slate-700 w-12 text-center">{tardYear}</span>
                    <button onClick={() => setTardYear(y => y + 1)} className="w-8 h-8 rounded-lg border-2 border-slate-200 font-black text-slate-600">›</button>
                  </div>
                </div>
                <div className="flex gap-1.5 items-stretch">
                  <button disabled={!settings.lastPdfTard} onClick={() => settings.lastPdfTard && showPathInfo(settings.lastPdfTard)} className={`flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 h-[2.25rem] flex items-center min-w-0 ${settings.lastPdfTard ? '' : 'opacity-50'}`} dir="ltr">
                    <p className="text-[11px] font-mono font-bold text-slate-700 truncate w-full">{settings.lastPdfTard ? baseName(settings.lastPdfTard) : '📍 لسه مفيش ملف'}</p>
                  </button>
                  <button disabled={!settings.lastPdfTard} onClick={() => doPdfOpen(settings.lastPdfTard, 'ملف التأخيرات')} className="btn btn-warning text-xs px-3 h-[2.25rem] flex items-center justify-center">📂 فتح</button>
                </div>
              </div>
            </div>
          </div>
          <div className="card cursor-pointer hover:bg-slate-50" onClick={()=>setDisclaimerOpen(true)} style={{padding:'13px'}}>
            <h3 className="font-bold text-slate-700">⚖️ إخلاء المسؤولية القانونية</h3>
            {localStorage.getItem('disclaimerAccepted')==='true' && <p className="text-xs text-green-600 font-bold mt-1">✅ تمت الموافقة بتاريخ {localStorage.getItem('disclaimerDate')||''}</p>}
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">🔄 إعادة الضبط</h3>
            <button onClick={handleReset} className={`w-full btn text-sm ${confirmReset ? 'bg-red-600 text-white' : 'btn-outline'}`}>
              {confirmReset ? '⚠️ اضغط مرة تانية للتأكيد' : 'إعادة الضبط للوضع الافتراضي'}
            </button>
          </div>
          {/* v12.9.63: نافذة العنوان الكامل + نسخ */}
          {pathInfo && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPathInfo(null)}>
              <div className="bg-white rounded-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-extrabold text-slate-800 mb-1 text-center">📍 العنوان الكامل</h3>
                <p className="text-xs font-mono text-slate-600 mb-3 break-all text-center" dir="ltr">{pathInfo}</p>
                <div className="text-[11px] text-slate-400 mb-3 text-center">✅ اتنسخ للحافظة تلقائياً</div>
                <button onClick={() => setPathInfo(null)} className="w-full btn btn-primary text-sm">تمام</button>
              </div>
            </div>
          )}
          {disclaimerOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={()=>setDisclaimerOpen(false)}>
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-bold">⚖️ إخلاء المسؤولية القانونية</h3>
                  <button onClick={()=>setDisclaimerOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✕</button>
                </div>
                <div className="flex-1 overflow-auto p-4 text-sm leading-relaxed whitespace-pre-wrap">{disclaimerText.split('{{DISCLAIMER_ADD}}')[0]}<strong className="block font-extrabold my-2">{DISCLAIMER_ADD}</strong>{disclaimerText.split('{{DISCLAIMER_ADD}}')[1]}</div>
                <div className="p-3 border-t safe-footer">
                  <button onClick={()=>setDisclaimerOpen(false)} className="w-full btn btn-primary text-sm">إغلاق</button>
                </div>
              </div>
            </div>
          )}
          {/* v12.9.57: تقرير فحص الأقواس */}
          {/* التعديل ٧: حوار رمز التشفير (تصدير/استيراد) */}
          {encAsk && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEncAsk(null)}>
              <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-extrabold text-slate-800 mb-1 text-center">🔒 نسخة مشفرة — أدخل الرمز</h3>
                <p className="text-xs text-slate-500 mb-3 text-center">{encAsk.fileName || ''}</p>
                <input type="password" inputMode="numeric" maxLength={6} value={encPinInput} onChange={e => setEncPinInput(normDigits(e.target.value))}
                  placeholder="••••" dir="ltr"
                  className="w-full p-3 text-center text-xl font-bold border-2 border-slate-200 rounded-xl mb-3 outline-none tracking-[0.3em]"
                  onKeyDown={e => e.key === 'Enter' && confirmEncImport()} />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setEncAsk(null)} className="py-2 rounded-xl bg-slate-100 font-bold text-sm">إلغاء</button>
                  <button onClick={() => confirmEncImport()} className="py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">تأكيد</button>
                </div>
              </div>
            </div>
          )}
          {/* التعديل ٨ (ج): تم إنشاء التقرير — فتح / مشاركة / إغلاق */}
          {pdfAsk && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPdfAsk(null)}>
              <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-extrabold text-slate-800 mb-1 text-center">✅ تم إنشاء التقرير</h3>
                <p className="text-xs text-slate-500 mb-3 text-center font-mono" dir="ltr">{pdfAsk.fileName}</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { const p = pdfAsk; setPdfAsk(null); doPdfOpen(p.uri, p.title) }} className="py-2 rounded-xl bg-amber-500 text-white font-bold text-sm">📂 فتح</button>
                  {Capacitor.isNativePlatform() && pdfAsk?.uri && (
                  <button onClick={async () => { const p = pdfAsk; setPdfAsk(null); try { await Share.share({ title: p.title, url: p.uri, dialogTitle: 'مشاركة التقرير' }) } catch {} }} className="py-2 rounded-xl bg-green-600 text-white font-bold text-sm">📤 مشاركة</button>
                )}
                  <button onClick={() => setPdfAsk(null)} className="py-2 rounded-xl bg-slate-100 font-bold text-sm">إغلاق</button>
                </div>
              </div>
            </div>
          )}
          {browseOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={()=>setBrowseOpen(false)}>
              <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-bold">📂 النسخ المحفوظة</h3>
                  <button onClick={()=>setBrowseOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✕</button>
                </div>
                <p className="text-xs text-slate-400 px-4 pt-2 break-all" dir="ltr">{backupPathDisplay}</p>
                <div className="flex-1 overflow-auto p-4 space-y-2">
                  {browseLoading ? <p className="text-center text-slate-400 py-8">جاري التحميل...</p>
                  : backupFiles.length===0 ? <p className="text-center text-slate-400 py-8">لا يوجد نسخ محفوظة</p>
                  : backupFiles.map(f=>(
                    <button key={f.name} onClick={()=>handleRestoreFromFile(f.name)} className="w-full text-right p-3 rounded-xl border border-slate-200 hover:bg-blue-50 flex items-center justify-between">
                      <span className="font-mono text-xs font-bold break-all">{f.name}</span>
                      <span className="text-blue-600 text-xs shrink-0 mr-2">استيراد ↩</span>
                    </button>
                  ))}
                </div>
                <div className="p-3 border-t flex gap-2">
                  <button onClick={()=>setBrowseOpen(false)} className="flex-1 btn btn-outline text-sm">إغلاق</button>
                  <button onClick={handleRestoreFallback} className="flex-1 btn btn-warning text-sm">📤 ملف خارجي</button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="font-bold text-slate-700 mb-2">ℹ️ عن التطبيق</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">الاسم</span><span className="font-bold" dir="ltr">{capConfig.appName || pkg.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الإصدار</span><span className="font-bold">v{pkg.version}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">عدد السجلات</span><span className="font-bold">{recordCount} سجل</span></div>
              <div className="flex justify-between"><span className="text-slate-500">حجم البيانات</span><span className="font-bold">{dataSizeKB} كيلوبايت</span></div>
              <div className="border-t border-slate-100 pt-1 text-center text-slate-400 text-xs" dir="ltr">AmrAdel@2026</div>
            </div>
          </div>
        </div>
      )}

      {/* التعديل ٢ (دورة جديدة): قسم المعلومات اتشال من هنا — بقى لوحة أول الخاصة */}


      {/* التعديل ٢٨: محرر الصورة الشخصية */}
      {photoEditSrc && (
        <PhotoEditor
          src={photoEditSrc}
          onCancel={() => setPhotoEditSrc(null)}
          onSave={(dataUrl) => {
            try {
              const pf = settings.profile || {}
              setSimple('profile', { ...pf, photo: dataUrl, showPhotoHome: pf.showPhotoHome !== false })
              showToast('✅ تم حفظ الصورة')
            } catch {}
            setPhotoEditSrc(null)
          }}
        />
      )}
    </div>
  )
}
