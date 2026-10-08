import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAttendance } from '../contexts/AttendanceContext'
import { useSettings } from '../contexts/SettingsContext'
import { timestampToTime, timestampToDateKey, formatDateAr, getDayNameAr } from '../utils/calendar'
import { formatCurrency } from '../utils/calculations'
import TimeEditDialog from '../components/TimeEditDialog'
import CheckOutDialog from '../components/CheckOutDialog'
import NotesDialog from '../components/NotesDialog'
import YearNotes from '../components/YearNotes'

// v12.11.29 (أول): النص الثلاثي سطرين إجباري (كلمتين + كلمة) — الرئيسية بس
// v12.11.30 (خامس): توصيلة الضغط على أي حتة في الخانة
const fwdCell = (e) => { if (e.target.closest('button')) return; const b = e.currentTarget.querySelector(':scope button'); if (b && !b.disabled) b.click() }
const split2 = (opts) => (opts || []).map(o => {
  const w = String(o.label || '').split(' ')
  return w.length >= 3 ? { ...o, label: w.slice(0, 2).join(' ') + '\n' + w.slice(2).join(' ') } : o
})
import ConfirmDialog from '../components/ConfirmDialog'
import PinGate from '../components/PinGate'
import CardSelect from '../components/CardSelect'
import { usePinArea } from '../hooks/usePinArea'
import { getShiftOptions, getDayStatusOptionsForDay, getDayCalcOptions, getDayCalcValue, getShiftValue, getDayStatusValue, isLeaveCalc, createDayColumnSavers, createDayGuard } from '../utils/dayColumns'
import { formatDateAr as formatDateArVac } from '../utils/vacationLogic'
import { getPermitsV2, savePermitsV2 } from '../utils/storage'
import { getRawLateMin, getTardinessCount, hasLatePermit } from '../utils/tardiness'
import { calcPermitDuration } from '../utils/permits'
import { WaAskDialog } from '../components/WaAskDialog'
import { LEAVE_LABELS, buildLeaveText, buildAltText, checkAltEligible, shareWa } from '../utils/waShare'
import { firstName } from '../utils/firstName'
import { buildNotices, getReadIds } from '../utils/notices'
import { getPlan, ensurePlan, planProgress, settleIfDone, PLAN_EVENT, PLAN_OPEN, SNOOZE_EVENT, snoozePlan, isSnoozed, clearSnooze } from '../utils/planWeek'
import { fireInstant } from '../utils/notify'

// v12.9.48: الشاشة الرئيسية الجديدة (تصميم الصورة — عربي RTL)
// المواصفة المقفولة 2026-09-27: ترحيب + بحث yyyymmdd + كارت أزرق متدرج + تفاصيل + إشعارات + بار عائم

const getEffectiveDayType = (record) => {
  if (record?.dayCalculation) return record.dayCalculation
  if (record?.shift) return record.shift
  return record?.dayStatus || record?.dayType || ''
}

const DAY_OFF_TYPES = ['regular_vacation', 'rest_day', 'special', 'sick', 'unpaid']
const LEAVE_TYPES = ['regular_vacation', 'rest_day', 'weekend_rest', 'sick', 'unpaid', 'special']

export default function HomeNew() {
  const { records, todayRecord, todayKey, checkIn, checkOut, editCheckIn, editCheckOut, getDayCalc, showToast, saveNotes, deleteTime, getLeaveBalances, updateRecordFields, findPendingCheckOut } = useAttendance()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const pf = settings.profile || {}
  const greet = now.getHours() < 12 ? 'صباح الخير' : 'مساء الخير'
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const dateStr = formatDateAr(now)
  const dayName = getDayNameAr(now)
  const sunMoon = now.getHours() < 12 ? '☀️' : '🌙'

  // dialogs + savers (نفس مسار Home/Sجلات — dayColumns)
  const [editDialog, setEditDialog] = useState({ open: false, type: null })
  const [checkOutDlg, setCheckOutDlg] = useState({ open: false, time: '00:00', date: null })
  const [notesDialog, setNotesDialog] = useState({ open: false })
  const [yearNotesOpen, setYearNotesOpen] = useState(false) // v12.11.26 (8)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null })
  const [openDrop, setOpenDrop] = useState(null)
  const [specialDialog, setSpecialDialog] = useState({ open: false, date: null, name: '' })
  const { gate: dayGate, request: dayRequest, handleSuccess: daySuccess, handleClose: dayClose } = usePinArea()
  const [waAsk, setWaAsk] = useState(null)
  const [pendingAlt, setPendingAlt] = useState(null)
  useEffect(() => {
    if (!pendingAlt) return
    const dk = pendingAlt
    setPendingAlt(null)
    if (checkAltEligible(dk, records)) setWaAsk({ kind: 'alt', id: dk, sub: formatDateArVac(dk) })
  }, [records])
  const daySavers = createDayColumnSavers({
    getRecords: () => records, getSettings: () => settings, getLeaveBalances,
    updateRecordFields, showToast,
    openSpecialDialog: (date, name) => setSpecialDialog({ open: true, date, name }),
    onLeave: (dk, type) => setWaAsk({ kind: 'leave', id: dk, type, sub: `${LEAVE_LABELS[type] || type} — ${formatDateArVac(dk)}` }),
  })
  const guardHome = (fn, cell) => createDayGuard({ getRecords: () => records, todayKey, request: dayRequest, area: 'home' })(todayKey, fn, cell)
  const handleHomeSpecialSave = () => {
    if (daySavers.saveSpecial(specialDialog.date, specialDialog.name)) setSpecialDialog({ open: false, date: null, name: '' })
  }
  const [extraOpen, setExtraOpen] = useState(false)
  // v12.11.36 (بند 4+1+2): popup الإجازة + مرجع السطر المرن للسكرول من الآخر
  const [vacPop, setVacPop] = useState(false)
  const flexRef = useRef(null)
  // v12.11.37 (ديمو مؤقت — هيتمسح): إظهار كل الخانات للمعاينة
  const [permitsRefresh, setPermitsRefresh] = useState(0)
  const [permitSel, setPermitSel] = useState(false)
  const [search, setSearch] = useState('')
  // بند 3: التخطيط الأسبوعي — الكارت البرتقالي + popup الرخامة + القفل
  const [plan, setPlan] = useState(() => { try { return getPlan() } catch { return null } })
  const [planPop, setPlanPop] = useState(false)
  const planSet = new Set(plan ? plan.dates : [])
  // تعديل ١٠: الغفوة تفتح البرنامج كله — الحبسة تقف أثناء الغفوة
  const [snoozed, setSnoozed] = useState(() => { try { return isSnoozed() } catch { return false } })
  useEffect(() => {
    const h = () => { try { setSnoozed(isSnoozed()) } catch {} }
    window.addEventListener(SNOOZE_EVENT, h)
    return () => window.removeEventListener(SNOOZE_EVENT, h)
  }, [])
  const planActive = !!plan && !snoozed
  const homeLocked = planActive && !planSet.has(todayKey)
  const planPr = plan ? planProgress(records, plan) : { done: 0, pending: [], pendingCount: 0 }

  const pending = findPendingCheckOut()
  const activeRecord = pending?.record || todayRecord
  const activeKey = pending?.key || todayKey
  const calc = activeRecord ? getDayCalc(activeKey) : null

  const dayType = getEffectiveDayType(todayRecord)
  const isDayOff = DAY_OFF_TYPES.includes(dayType)
  const blockingPermit = (() => { try { return getPermitsV2().find(x => x.date === todayKey) } catch { return null } })()
  // v12.9.55: الحجب فقط (لا يعود) — (يعود/تأخير/بدون حالة) = الحضور والانصراف ظاهرين دائمًا
  const hasBlockingPermit = !!(blockingPermit && (blockingPermit.type === 'special' || blockingPermit.type === 'errand' || blockingPermit.type === 'official_mission') && blockingPermit.state === 'no_return')

  const handleManualCheckIn = () => {
    const n = new Date()
    checkIn(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`)
  }
  const handleManualCheckOut = () => {
    const n = new Date()
    const dk = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    const t = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
    setCheckOutDlg({ open: true, time: t, date: dk })
  }

  const panelData = useMemo(() => {
    const today = getTardinessCount(records, settings, todayKey)
    const rawToday = getRawLateMin(records, settings, todayKey)
    let year = 0
    const y = new Date().getFullYear()
    for (let m = 0; m < 12; m++) {
      const dim = new Date(y, m + 1, 0).getDate()
      for (let d = 1; d <= dim; d++) year += getTardinessCount(records, settings, `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
    let specialUsed = 0, unpaidUsed = 0
    for (const [dk, rec] of Object.entries(records || {})) {
      if (!dk.startsWith(String(y))) continue
      const e = getEffectiveDayType(rec)
      if (e === 'special') specialUsed++
      if (e === 'unpaid') unpaidUsed++
    }
    return { today, rawToday, year, specialUsed, unpaidUsed }
  }, [records, settings])

  const permitsList = permitsRefresh > -1 ? getPermitsV2() : []
  const todayPermit = permitsList.find(pr => pr.date === todayKey)
  const showWarning = panelData.rawToday > 45 && !hasLatePermit(permitsList, todayKey)

  const unread = useMemo(() => {
    try {
      const list = buildNotices(records || {}, settings || {})
      const read = new Set(getReadIds())
      return list.filter(n => !read.has(n.id)).length
    } catch { return 0 }
    // v12.10: plan تدخل في الحسبة — بدء دورة جديدة يصحي الشارة فورًا
  }, [records, settings, plan ? plan.weekId : null])

  // البحث yyyymmdd → القفز لليوم في السجلات
  const doSearch = () => {
    const v = (search || '').replace(/\D/g, '')
    if (v.length !== 8) { showToast('اكتب التاريخ 8 أرقام: yyyymmdd'); return }
    const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8)
    if (m < 1 || m > 12 || d < 1 || d > 31) { showToast('تاريخ غير صحيح'); return }
    try { sessionStorage.setItem('hr_jump_ym', JSON.stringify({ year: y, month: m - 1 })) } catch {}
    try { sessionStorage.setItem('hr_jump_dk', `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`) } catch {}
    showToast(`📅 ${y}/${m}/${d}`)
    navigate('/records')
    try { window.scrollTo(0, 0) } catch {}
  }

  // صف اليوم (نفس منطق السجلات — للخانات الأربع)
  const tRec = records[todayKey] || {}
  const tWds = settings.weekendDays || [5, 6]
  const tDow = new Date(todayKey + 'T12:00:00').getDay()
  const tIsWk = tWds.includes(tDow)
  const tRawCalc = tRec.dayCalculation || ''
  const tRawShift = tRec.shift || ''
  const tRawStatus = tRec.dayStatus || ''
  const tEmpty = !tRawCalc && !tRawShift && !tRawStatus && !tRec.checkIn
  const tRow = {
    dayCalc: (tEmpty && tIsWk) ? 'weekend_rest' : tRawCalc,
    shift: tRawShift,
    // بند 2: حالة اليوم فاضية (-) افتراضيًا (العمود الأول untouched)
    dayStatus: tEmpty ? '' : tRawStatus,
  }
  const tCalcVal = getDayCalcValue(tRow)
  const tOff = isLeaveCalc(tCalcVal)
  // v12.11.36 (بند 3+5): حسابات السطر المرن — مبدئي (now) ثم نهائي (بصمة الانصراف)
  const hasCI = !!tRec.checkIn, hasCO = !!tRec.checkOut
  const isPresent = tCalcVal === 'present'
  const gate4 = isPresent && hasCI
  const shiftVal = getShiftValue(tRow), statusVal = getDayStatusValue(tRow)
  const ciDate = hasCI ? new Date(tRec.checkIn) : null
  const coDate = hasCO ? new Date(tRec.checkOut) : null
  const hrsNow = (hasCI && ciDate) ? Math.max(0, (now - ciDate) / 3600000) : 0
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [lunchAH, lunchAM] = String(settings.lunchAfterTime || '16:31').split(':').map(Number)
  const lunchMinH = settings.lunchMinHours || 8, bonusMinH = settings.bonusMinHours || 7, altMinH = settings.altDayMinHours || 6
  const wkHol = tIsWk || statusVal === 'overtime_holiday' || statusVal === 'weekend_overtime'
  const fmtVal = (v) => (v == null || v === '' ? '—' : String(v))
  let cellLunch = null, cellAlt = null, cellBonus = null, cellTaxi = null
  if (gate4 && !homeLocked) {
    // بدل الغدا 🍽️
    if (hasCO) { if (calc && calc.lunchValue > 0) cellLunch = { fin: true, val: fmtVal(calc.lunchValue) } }
    else if (shiftVal === 'shift1' && hrsNow >= lunchMinH && nowMin >= (lunchAH * 60 + lunchAM)) cellLunch = { prov: true, val: fmtVal(settings.lunchValue || '') }
    // يوم بديل 🔄
    if (statusVal === 'alt_day') {
      if (hasCO) { if (calc && calc.isAltDay && calc.meetsAltMinimum) cellAlt = { fin: true, val: fmtVal(calc.displayHours ?? calc.actualHours ?? '') } }
      else if (hrsNow >= altMinH) cellAlt = { prov: true, val: fmtVal(Math.floor(hrsNow) + 'س') }
    }
    // المكافأة 🎁
    if (settings.bonusEnabled === true && wkHol) {
      if (hasCO) { if (calc && calc.bonusValue > 0) cellBonus = { fin: true, val: fmtVal(calc.bonusValue) } }
      else if (hrsNow >= bonusMinH) cellBonus = { prov: true, val: fmtVal(settings.bonusValue || '') }
    }
    // بدل التاكسي 🚕
    if (shiftVal === 'shift2' && ciDate) {
      const ciM = ciDate.getHours() * 60 + ciDate.getMinutes()
      if (ciM >= 14 * 60 && ciM <= 17 * 60) {
        if (hasCO) { if (calc && calc.taxiValue > 0) cellTaxi = { fin: true, val: fmtVal(calc.taxiValue) } }
        else if (nowMin >= 0 && nowMin <= 5 * 60) cellTaxi = { prov: true, val: fmtVal(settings.taxiValue || '') }
      }
    }
  }
  // v12.11.36 (بند 5/1): المتجاهلة — عدد تراكمي
  const ignCount = useMemo(() => {
    try {
      let n = 0
      for (const [dk, rec] of Object.entries(records || {})) {
        if (dk >= todayKey) continue
        const e = rec?.dayCalculation || rec?.shift || rec?.dayStatus || rec?.dayType || ''
        if (isLeaveCalc(e === '' ? 'present' : e)) continue
        if (!rec?.checkIn || !rec?.checkOut) n++
      }
      return n
    } catch { return 0 }
  }, [records])
  // v12.11.36 (بند 5/2): تصريح اليوم فقط — يختفي عند انتهاء مدته
  const activePermit = (() => {
    try {
      if (!todayPermit) return null
      const rt = todayPermit.returnTime
      if (rt && /^\d{1,2}:\d{2}$/.test(rt)) {
        const [rh, rm] = rt.split(':').map(Number)
        if (nowMin > rh * 60 + rm) return null
      }
      return todayPermit
    } catch { return todayPermit }
  })()
  // v12.11.36 (بند 5/3): الإضافي اليومي — عداد HH:MM محسوب × المضاعف
  // v12.11.41 (القاعدة المنفصلة): التايمر عداد مستقل بالدقيقة — دقائق محسوبة حسب الحالة
  const timerMinAt = (at) => {
    try {
      if (!gate4 || !ciDate) return 0
      const atMs = at.getTime()
      const dow = ciDate.getDay() // 0=أحد .. 6=سبت
      const sunThu = dow >= 0 && dow <= 4
      if (statusVal === 'normal_day' && sunThu) {
        if (shiftVal === 'shift1') {
          const start = new Date(ciDate); start.setHours(16, 0, 0, 0)
          return Math.max(0, (atMs - start.getTime()) / 60000)
        }
        if (shiftVal === 'shift2' || shiftVal === 'shift3') {
          return Math.max(0, (atMs - ciDate.getTime()) / 60000 - 7 * 60)
        }
        return 0
      }
      if (statusVal === 'weekend_overtime' && dow === 5) {
        return Math.max(0, (atMs - ciDate.getTime()) / 60000) * (settings.fridayMultiplier || 2)
      }
      if (statusVal === 'overtime_holiday') {
        return Math.max(0, (atMs - ciDate.getTime()) / 60000) * (settings.holidayMultiplier || 2)
      }
      if (statusVal === 'weekend_overtime' && dow === 6) {
        return Math.max(0, (atMs - ciDate.getTime()) / 60000) * (settings.saturdayMultiplier || 1.5)
      }
      return 0
    } catch { return 0 }
  }
  const provOT = (!hasCO && gate4) ? timerMinAt(now) : 0
  const finalOT = (hasCO && coDate && gate4) ? timerMinAt(coDate) : 0
  let cellOT = null
  if (!homeLocked && gate4) {
    if (hasCO && coDate) {
      if ((now - coDate) <= 5 * 60 * 1000 && finalOT >= 1) {
        const hh = Math.floor(finalOT / 60), mm = Math.floor(finalOT % 60)
        cellOT = { fin: true, val: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') }
      }
    } else if (provOT >= 1) {
      const hh = Math.floor(provOT / 60), mm = Math.floor(provOT % 60)
      cellOT = { prov: true, val: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') }
    }
  }
  const vacName = (() => {
    try {
      const dc = todayRecord?.dayCalculation || ''
      if (dc === 'special') return todayRecord?.specialLabel || 'إجازة خاصة'
      const opts = [...getDayCalcOptions(true, ''), ...getDayCalcOptions(false, '')]
      return (opts.find(o => o.value === dc) || {}).label || dc
    } catch { return '' }
  })()
  // v12.11.37: الديمو يجبر كل الخانات ظاهرة (مبدئي برتقالي) + الإجازة معاهم للمعاينة
  const visCount = tOff ? 1 : (3 + (cellLunch ? 1 : 0) + (cellAlt ? 1 : 0) + (cellBonus ? 1 : 0) + (cellTaxi ? 1 : 0) + ((ignCount > 0) ? 1 : 0) + ((activePermit) ? 1 : 0) + (cellOT ? 1 : 0))
  const isScroll = visCount > 5
  useEffect(() => { try { if (isScroll && flexRef.current) flexRef.current.scrollLeft = flexRef.current.scrollWidth } catch {} }, [isScroll, visCount])

  const confirmPanelAction = () => {
    if (confirmDialog.type === 'permit') {
      if (todayPermit) {
        savePermitsV2(getPermitsV2().filter(pr => pr.id !== todayPermit.id))
        setPermitsRefresh(x => x + 1)
        showToast('🗑️ تم حذف التصريح')
      }
    }
    setConfirmDialog({ open: false })
    setPermitSel(false)
  }

  const isLeaveDay = LEAVE_TYPES.includes(todayRecord?.dayCalculation || '')
  const balances = getLeaveBalances()
  const PT = { special: 'خاص', late: 'إذن تأخير', official: 'تصريح رسمي', official_mission: 'مهمة رسمية', errand: 'مأمورية' }
  const PS = { returns: 'يعود', no_return: 'لا يعود', delay: 'تأخير' }

  // بند 3: بدء الدورة (خميس 6م) + الاستماع لتغييراتها + التسوية عند الاكتمال
  const lastMinRef = useRef(null)
  useEffect(() => {
    const k = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + '-' + now.getHours() + ':' + now.getMinutes()
    if (lastMinRef.current === k) return
    lastMinRef.current = k
    try {
      // تعديل ٩: موعد الدورة من الإعدادات (الافتراضي الخميس 18:00)
      const pcfg = { dow: (settings.planWeekDay ?? 4), time: (settings.planWeekTime || '18:00') }
      const cur = ensurePlan(new Date(), pcfg)
      setPlan(prev => ((prev && prev.weekId) || null) === ((cur && cur.weekId) || null) ? prev : cur)
      // الغفوة خلصت والدورة لسه شغالة → الـ popup يرجع لوحده + الحبسة ترجع
      try { setSnoozed(isSnoozed()) } catch {}
      if (cur && !isSnoozed()) setPlanPop(true)
    } catch {}
  })
  useEffect(() => {
    const h = () => { try { setPlan(getPlan()) } catch {} }
    const o = () => { try { clearSnooze(); setPlanPop(true) } catch {} }
    window.addEventListener(PLAN_EVENT, h)
    window.addEventListener(PLAN_OPEN, o)
    return () => { window.removeEventListener(PLAN_EVENT, h); window.removeEventListener(PLAN_OPEN, o) }
  }, [])
  useEffect(() => {
    if (!plan) return
    try { if (settleIfDone(records, showToast)) { setPlan(null); setPlanPop(false) } } catch {}
  }, [records])
  // تعديل ١٠: إشعار خلفية لحظي عند بدء الدورة (ميستناش نبضة الـ 3 ساعات)
  const prevWeekRef = useRef(null)
  useEffect(() => { prevWeekRef.current = plan ? plan.weekId : null }, [])
  useEffect(() => {
    if (plan && !isSnoozed()) setPlanPop(true)
    try {
      const wid = plan ? plan.weekId : null
      if (wid && prevWeekRef.current && prevWeekRef.current !== wid) {
        try { fireInstant('📋 بدأ تسجيل الوردية الأسبوعي', `سدد أيام ${plan.dates[0]} ← ${plan.dates[plan.dates.length - 1]} من السجلات`) } catch {}
      }
      prevWeekRef.current = wid
    } catch {}
  }, [plan ? plan.weekId : null])
  const handlePlanSnooze = () => {
    try { snoozePlan(); setPlanPop(false) } catch {}
  }
  const openNotices = () => { try { window.dispatchEvent(new Event('open-notices')) } catch {} }

  // سطر حالة الكارت الأزرق
  let statusLine
  if (isLeaveDay) statusLine = null
  else if (!activeRecord?.checkIn) statusLine = (<>لم يتم تسجيل الحضور اليوم. نهارك سعيد {sunMoon}</>)
  else if (activeRecord?.checkIn && !activeRecord?.checkOut) statusLine = (<>تم الحضور {timestampToTime(activeRecord.checkIn)} — لا تنسي تسجيل الانصراف ⏰</>)
  else statusLine = (<span className="claw-hamd">الحمد لله</span>)

  return (
    <div className="claw-home">
      {/* سطر الترحيب لوحده + تحته سطر البحث والجرس والإعدادات — v12.9.50 */}
      <div className="claw-toprow">
        <p className="claw-greet">{greet}{firstName(pf.name) ? ` يا ${firstName(pf.name)}` : ''}</p>
        {/* التعديل ٢٨: الصورة الشخصية أقصى الشمال فوق (64px) — حسب مربع العرض */}
        {pf.photo && pf.showPhotoHome !== false && (
          <img src={pf.photo} alt="" className="claw-avatar" />
        )}
      </div>
      <div className="claw-searchrow">
        <div className="claw-search">
          <button onClick={doSearch} className="claw-searchbtn" title="بحث">🔍</button>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
            inputMode="numeric" placeholder="صيغه البحث yyyymmdd" className="claw-searchinput" />
        </div>
        <button onClick={openNotices} className="claw-iconbtn" title="الإشعارات">🔔
          {unread > 0 && <span className="claw-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button onClick={() => { if (homeLocked) return; navigate('/settings'); try { window.scrollTo(0, 0) } catch {} }} className="claw-iconbtn" title="الإعدادات" style={homeLocked ? { opacity: 0.4 } : undefined}>☰</button>
      </div>

      {/* سطر بيانات اليوم */}
      <div className="claw-section">
        <span className="claw-sectiontitle">بيانات اليوم</span>
        <button onClick={() => { navigate('/records'); try { window.scrollTo(0, 0) } catch {} }} className="claw-all">الكل <span className="claw-arrow">‹</span></button>
      </div>

      {/* الكارت الأزرق المتدرج */}
      <div className="claw-card">
        <div className="claw-cardtop">
          <span className="claw-clock" dir="ltr">{timeStr}</span>
          {/* v12.11.32 (تامن): مسافة فاضية بدل الشرطة */}
          {/* v12.11.34 (تعديل 3): مسافة فاضية بدل الشرطة */}
          {/* v12.11.35 (بند 3): مسافة حقيقية بدل النص الغريب */}
          <span className="claw-date" dir="ltr">{now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} {now.getDate()}/{now.getMonth() + 1}/{now.getFullYear()}</span>
        </div>
        <p className="claw-dhikr">سبحان الله وبحمده سبحان الله العظيم</p>
        {statusLine && <p className="claw-status">{statusLine}</p>}
        {isLeaveDay && !hasBlockingPermit && (() => {
          const dc = todayRecord?.dayCalculation || ''
          const ds = todayRecord?.dayStatus || ''
          const opts = [...getDayCalcOptions(true, ds), ...getDayCalcOptions(false, ds)]
          const nm = dc === 'special' ? (todayRecord?.specialLabel || 'إجازة خاصة') : ((opts.find(o => o.value === dc) || {}).label || dc)
          let info = 'راحة أسبوعية'
          if (dc === 'regular_vacation') info = `المتبقي ${balances.annualRemaining} / الرصيد ${balances.annualBalance || '—'}`
          else if (dc === 'rest_day') info = `المستحق ${balances.altEligible ?? 0} / الباقي ${balances.altRemaining ?? 0}`
          else if (dc === 'sick') info = `المستخدم ${balances.sickUsed} يوم`
          else if (dc === 'unpaid') info = `المستخدم ${panelData.unpaidUsed} يوم`
          else if (dc === 'special') info = `المستخدم ${panelData.specialUsed} يوم`
          return (<div className="claw-leavebox"><div className="claw-leavename">{nm}</div><div className="claw-leaveinfo">{info}</div></div>)
        })()}
        {!isLeaveDay && !hasBlockingPermit && (
          <>
            <button onClick={() => { if (calc) setExtraOpen(true) }} className="claw-extraline">
              <span className="claw-extralabel">إضافي اليوم</span>
              <span className="claw-extraval">{calc ? formatCurrency(calc.grandTotal) : '--'}</span>
            </button>
            <div className="claw-times">
              <button disabled={homeLocked} onClick={() => { activeRecord?.checkIn ? guardHome(() => setEditDialog({ open: true, type: 'checkIn' }), 'checkIn') : handleManualCheckIn() }} className="claw-timebox">
                <span className="claw-timelabel">الحضور</span>
                <span className="claw-timeval">{activeRecord?.checkIn ? timestampToTime(activeRecord.checkIn) : '--:--'}</span>
                <span className="claw-tmarrow">‹</span>
              </button>
              <button disabled={homeLocked} onClick={() => { if (!activeRecord?.checkIn) return; activeRecord?.checkOut ? guardHome(() => setEditDialog({ open: true, type: 'checkOut' }), 'checkOut') : handleManualCheckOut() }} className={'claw-timebox' + (!activeRecord?.checkIn ? ' claw-dim' : '')}>
                <span className="claw-timelabel">الانصراف</span>
                <span className="claw-timeval">{activeRecord?.checkOut ? timestampToTime(activeRecord.checkOut) : '--:--'}</span>
                <span className="claw-tmarrow">‹</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* سطر التفاصيل */}
      <div className="claw-section">
        <span className="claw-sectiontitle">التفاصيل</span>
        <button onClick={() => { navigate('/stats'); try { window.scrollTo(0, 0) } catch {} }} className="claw-all">الكل <span className="claw-arrow">‹</span></button>
      </div>

      {/* v12.11.36 (بند 1+2+3+4+5): السطر المرن — 3/4/5 متسنطر + سكرول من الآخر عند 6+ */}
      <div ref={flexRef} className={'claw-grid4' + (isScroll ? ' is-scroll' : '')}>
        {tOff ? (
          <div className="claw-cell claw-vac" onClick={() => setVacPop(true)}>
            <span className="claw-cellicon">🏖️</span>
            <span className="claw-cellval" style={{ fontSize: '12px' }}>{vacName}</span>
          </div>
        ) : (<>
        <div className="claw-cell" onClick={fwdCell}>
          <span className="claw-cellicon">📅</span>
          <span className="claw-cellabel">نوع الإجازة</span>
          <CardSelect btnClass="claw-pick" options={split2(getDayCalcOptions(tIsWk, tRow.dayStatus))} value={tCalcVal} disabled={homeLocked} onPick={v => guardHome(() => daySavers.handleDayCalcChange(todayKey, v), 'dayCalc')} dropKey="new:dc" openKey={openDrop} setOpenKey={setOpenDrop} />
        </div>
        <div className="claw-cell" onClick={fwdCell}>
          <span className="claw-cellicon">💰</span>
          <span className="claw-cellabel">حالة اليوم</span>
          <CardSelect btnClass={'claw-pick' + (getDayStatusValue(tRow) ? '' : ' claw-empty')} options={split2(getDayStatusOptionsForDay(tIsWk, tRow.dayStatus))} value={getDayStatusValue(tRow)} disabled={tOff || homeLocked} onPick={v => guardHome(() => daySavers.handleDayStatusChange(todayKey, v), 'dayStatus')} dropKey="new:ds" openKey={openDrop} setOpenKey={setOpenDrop} />
        </div>
        <div className="claw-cell" onClick={fwdCell}>
          <span className="claw-cellicon">🕐</span>
          <span className="claw-cellabel">الوردية</span>
          <CardSelect btnClass={'claw-pick' + (getShiftValue(tRow) ? '' : ' claw-empty')} options={split2(getShiftOptions(getShiftValue(tRow)))} value={getShiftValue(tRow)} disabled={tOff || homeLocked} onPick={v => guardHome(() => daySavers.handleShiftChange(todayKey, v), 'shift')} dropKey="new:sh" openKey={openDrop} setOpenKey={setOpenDrop} />
        </div>
        {cellLunch && (<div className={'claw-cell ' + (cellLunch.fin ? 'claw-final' : 'claw-provis')} onClick={() => { navigate('/stats'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">🍽️</span><span className="claw-cellabel">بدل الغدا</span></div>)}
        {cellAlt && (<div className={'claw-cell ' + (cellAlt.fin ? 'claw-final' : 'claw-provis')} onClick={() => { navigate('/alt-days'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">🔄</span><span className="claw-cellabel">يوم بديل</span></div>)}
        {cellBonus && (<div className={'claw-cell ' + (cellBonus.fin ? 'claw-final' : 'claw-provis')} onClick={() => { navigate('/stats'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">🎁</span><span className="claw-cellabel">المكافأة</span></div>)}
        {cellTaxi && (<div className={'claw-cell ' + (cellTaxi.fin ? 'claw-final' : 'claw-provis')} onClick={() => { navigate('/stats'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">🚕</span><span className="claw-cellabel">بدل التاكسي</span></div>)}
        {(ignCount > 0) && (<div className="claw-cell claw-pink" onClick={() => { navigate('/stats'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">⏭️</span><span className="claw-cellabel">متجاهلة</span></div>)}
        {(activePermit) && (<div className="claw-cell claw-indigo" onClick={() => { navigate('/permits'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">📝</span><span className="claw-cellabel">تصريح</span></div>)}
        {cellOT && (<div className={'claw-cell claw-ot55 ' + (cellOT.fin ? 'claw-final' : 'claw-provis')} onClick={() => { navigate('/records'); try { window.scrollTo(0, 0) } catch {} }}><span className="claw-cellicon">⏰</span><span className="claw-cellval" dir="ltr" style={{ fontSize: '15px', marginTop: '-16px', zIndex: 1, background: 'rgba(0,0,0,.30)', borderRadius: '6px', padding: '0 4px' }}>{cellOT.val}</span></div>)}
        </>)}
      </div>
      {/* v12.11.36 (بند 4): تعديل / حذف الإجازة */}
      {vacPop && (
        <div className="dialog-overlay" onClick={() => setVacPop(false)}>
          <div className="dialog-box" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', width: 'fit-content', maxWidth: '92vw', marginLeft: 'auto', marginRight: 'auto' }}>
            <h3>🏖️ {vacName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
              {getDayCalcOptions(false, '').filter(o => o.value !== 'present').map(o => (
                <button key={o.value} onClick={() => { setVacPop(false); guardHome(() => daySavers.handleDayCalcChange(todayKey, o.value), 'dayCalc') }} className="btn btn-outline" style={{ width: '100%' }}>{o.value === tCalcVal ? '✓ ' : ''}{o.label}</button>
              ))}
              <button onClick={() => { setVacPop(false); guardHome(() => daySavers.handleDayCalcChange(todayKey, 'present'), 'dayCalc') }} className="btn btn-primary" style={{ width: '100%' }}>🗑️ حذف (يرجع حضور)</button>
            </div>
          </div>
        </div>
      )}

      {/* v12.11.26 (6+8): شريط ملاحظة اليوم قد شريط البحث + أيقونتين بنفس سيمترية البحث */}
      <div className="claw-noterow">
        <button onClick={() => setNotesDialog({ open: true })} className="claw-notebar" title="ملاحظة اليوم">
          <span className="claw-searchbtn">📝</span>
          <span className={`claw-notebartext ${todayRecord?.notes ? '' : 'claw-empty'}`}>{todayRecord?.notes || 'اكتب ملاحظة اليوم…'}</span>
        </button>
        <button onClick={() => setNotesDialog({ open: true })} className="claw-iconbtn" title="إضافة ملاحظة">✏️</button>
        <button onClick={() => setYearNotesOpen(true)} className="claw-iconbtn" title="ملاحظات السنة">🗂️</button>
      </div>

      {/* بند 3: الكارت البرتقالي للتخطيط الأسبوعي */}
      {planActive && (
        <button onClick={() => setPlanPop(true)} className="plan-card">
          <div className="plan-title">برجاء تحديد نظام العمل لورديتك الأسبوع القادم إن شاء الله</div>
          <div className="plan-sub">باقي {planPr.pendingCount} أيام — اضغط للمتابعة</div>
        </button>
      )}
      {/* TEST اتشال (تعديل ١) — التجربة خلصت */}
      {/* بند 3: popup الرخامة — بلا إغلاق ولا X حتى اكتمال الـ 7 أو الإلغاء */}
      {planPop && planActive && (
        <div className="dialog-overlay">
          <div className="dialog-box" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>📋 برجاء تسجيل نظام العمل والوردية الأسبوع القادم إن شاء الله</h3>
            <p className="plan-remain">باقي {planPr.pendingCount} أيام — رجاء التسديد</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => navigate('/records')} className="btn btn-primary" style={{ flex: 1 }}>دخول</button>
              <button onClick={handlePlanSnooze} className="btn btn-outline" style={{ flex: 1 }}>😴 غفوة ٥ دقايق</button>
            </div>
          </div>
        </div>
      )}

      {/* كارت الإشعارات الأخير */}
      {(() => {
        const cards = []
        if (showWarning) cards.push(
          <div key="w" onClick={() => navigate('/permits')} className="claw-notice claw-warn">
            <div className="claw-noticetitle">التأخيرات</div>
            <div className="claw-noticebody">⚠️ مطلوب تسجيل إذن تأخير حالاً</div>
          </div>
        )
        else if (panelData.today > 0) cards.push(
          <div key="t" onClick={() => navigate('/stats')} className="claw-notice claw-tardy">
            <div className="claw-noticetitle">التأخيرات</div>
            <div className="claw-noticebody">اليوم: {panelData.today} / السنة: {panelData.year}</div>
          </div>
        )
        if (todayPermit) cards.push(
          <div key="p" onClick={() => { setPermitSel(!permitSel) }} className="claw-notice claw-permit">
            <div className="claw-noticetitle">تصريح خروج</div>
            <div className="claw-noticebody">{PT[todayPermit.type] || todayPermit.type} — {PS[todayPermit.state] || todayPermit.state}</div>
            {todayPermit.type !== 'late' && <div className="claw-noticesub">خروج: {todayPermit.exitTime || '—'} | عودة: {todayPermit.returnTime || '—'}</div>}
            {(() => {
              try {
                if (todayPermit.type === 'late') return (<div className="claw-noticesub">المدة: {todayPermit.delayDuration || '—'}</div>)
                if (todayPermit.state === 'returns' && !todayPermit.returnTime) return (<div className="claw-noticesub">المدة: بانتظار العودة</div>)
                const d = calcPermitDuration(todayPermit, settings)
                if (d == null) return null
                return (<div className="claw-noticesub">المدة: {String(Math.floor(d / 60)).padStart(2, '0')}:{String(d % 60).padStart(2, '0')}</div>)
              } catch { return null }
            })()}
            {permitSel && (
              <div className="claw-noticeactions">
                <button onClick={(e) => { e.stopPropagation(); setPermitSel(false); navigate('/permits', { state: { editPermitId: todayPermit.id } }) }} className="claw-miniprimary">✏️ تعديل</button>
                <button onClick={(e) => { e.stopPropagation(); setPermitSel(false); setConfirmDialog({ open: true, type: 'permit' }) }} className="claw-minidanger">🗑️ حذف</button>
              </div>
            )}
          </div>
        )
        if (cards.length === 0) return null
        return (<div className={'claw-notices' + (cards.length > 1 ? ' claw-split' : '')}>{cards}</div>)
      })()}

      {/* v12.9.50: البار في Layout — هنا مكان محجوز فقط */}
      <div className="claw-bottomspace" />

      {/* الحوارات */}
      {extraOpen && calc && !isDayOff && (
        <div className="dialog-overlay" onClick={() => setExtraOpen(false)}>
          <div className="dialog-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">💰 الإضافي — اليوم</h3>
              <button onClick={() => setExtraOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✕</button>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between">
              <span className="font-bold text-slate-700">المجموع الكلي</span>
              <span className="font-extrabold text-lg val-money">{formatCurrency(calc.grandTotal)} {settings.currency}</span>
            </div>
          </div>
        </div>
      )}
      <TimeEditDialog open={editDialog.open && editDialog.type === 'checkIn'} title="تعديل الحضور"
        currentTime={timestampToTime(activeRecord?.checkIn)} hasTime={!!activeRecord?.checkIn}
        onDelete={() => deleteTime(activeKey, 'checkIn')} onSave={(time) => { editCheckIn(activeKey, time) }}
        onClose={() => setEditDialog({ open: false, type: null })} />
      <CheckOutDialog open={checkOutDlg.open} title="🚶 تسجيل الانصراف" currentTime={checkOutDlg.time} currentDate={checkOutDlg.date}
        checkInTime={activeRecord?.checkIn ? timestampToTime(activeRecord.checkIn) : undefined}
        showDate={getEffectiveDayType(activeRecord) === 'shift2'}
        onSave={(time, date) => { checkOut(time, date); setPendingAlt(date || todayKey) }}
        onClose={() => setCheckOutDlg({ open: false })} />
      <CheckOutDialog open={editDialog.open && editDialog.type === 'checkOut'} title="✏️ تعديل الانصراف"
        currentTime={timestampToTime(activeRecord?.checkOut)}
        currentDate={activeRecord?.checkOut ? timestampToDateKey(activeRecord.checkOut) : activeKey}
        checkInTime={activeRecord?.checkIn ? timestampToTime(activeRecord.checkIn) : undefined}
        showDate={getEffectiveDayType(activeRecord) === 'shift2'} hasTime={!!activeRecord?.checkOut}
        onDelete={() => deleteTime(activeKey, 'checkOut')}
        onSave={(time, date) => { editCheckOut(activeKey, time, date); setPendingAlt(activeKey) }}
        onClose={() => setEditDialog({ open: false, type: null })} />
      {yearNotesOpen && (
        <YearNotes records={records} onClose={() => setYearNotesOpen(false)}
          onJump={(dk) => { try { sessionStorage.setItem('hr_jump_ym', JSON.stringify({ year: +dk.slice(0, 4), month: +dk.slice(5, 7) - 1 })); sessionStorage.setItem('hr_jump_dk', dk) } catch {}; setYearNotesOpen(false); navigate('/records'); try { window.scrollTo(0, 0) } catch {} }} />
      )}
      <NotesDialog open={notesDialog.open} onClose={() => setNotesDialog({ open: false })}
        onSave={(note) => saveNotes(todayKey, note)} initialNote={todayRecord?.notes || ''}
        onDelete={todayRecord?.notes ? () => saveNotes(todayKey, '') : undefined} />
      <ConfirmDialog open={confirmDialog.open} title="حذف التصريح" message="هل تريد حذف تصريح اليوم؟"
        onConfirm={confirmPanelAction} onCancel={() => setConfirmDialog({ open: false })} danger={true} confirmText="تأكيد" />
      <WaAskDialog info={waAsk} onNo={() => setWaAsk(null)}
        onYes={() => { const w = waAsk; setWaAsk(null); if (w.kind === 'alt') shareWa('مطلوب تسجيل يوم بديل', buildAltText(w.id)); else shareWa('مطلوب تسجيل إجازة', buildLeaveText(w.id, w.type)) }} />
      {specialDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSpecialDialog({ open: false, date: null, name: '' })}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-3">✏️ اسم الإجازة الخاصة</h3>
            <input value={specialDialog.name} onChange={e => setSpecialDialog(s => ({ ...s, name: e.target.value }))} placeholder="مثلاً: زواج، حج، مولود..." className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setSpecialDialog({ open: false, date: null, name: '' })} className="flex-1 btn btn-outline text-sm">إلغاء</button>
              <button onClick={handleHomeSpecialSave} className="flex-1 btn btn-primary text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}
      <PinGate open={dayGate.open} title={dayGate.title} onSuccess={daySuccess} onClose={dayClose} />
    </div>
  )
}
