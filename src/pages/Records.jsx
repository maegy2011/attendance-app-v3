import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAttendance } from '../contexts/AttendanceContext'
import { useSettings } from '../contexts/SettingsContext'
import { getDayNameAr, timestampToTime, timestampToDateKey } from '../utils/calendar'
import { formatCurrency, formatHours, migrateDayType, getShiftFromRecord } from '../utils/calculations'
import CardSelect from '../components/CardSelect'
import { getShiftOptions, getDayStatusOptionsForDay, getDayCalcOptions, cardSelectClass, getDayCalcValue, getShiftValue, getDayStatusValue, isLeaveCalc, createDayColumnSavers, createDayGuard } from '../utils/dayColumns'
import TimeEditDialog from '../components/TimeEditDialog'
import CheckOutDialog from '../components/CheckOutDialog'
import NotesDialog from '../components/NotesDialog'
import PinGate from '../components/PinGate'
import { usePinArea } from '../hooks/usePinArea'
import { WaAskDialog } from '../components/WaAskDialog'
import { LEAVE_LABELS, buildLeaveText, buildAltText, checkAltEligible, shareWa } from '../utils/waShare'
import { formatDateAr as formatDateArVac } from '../utils/vacationLogic'
import { getPlan, planProgress, settleIfDone, planClearPatches, isDaySettled, PLAN_EVENT, isSnoozed, SNOOZE_EVENT } from '../utils/planWeek'

// صفحة السجلات (الجديدة — حلت محل القديمة بأمر عمرو):
// نفس المحتوى والتحكم الكامل + عمود خاصية أرفع (80px/خط 10) + كروت مدورة + تباعد 10px
// وضع العرض (أفقي/رأسي) خاص بالصفحة دي ومايأثرش على السجلات

const hdrGrad = { background:'linear-gradient(to bottom,color-mix(in srgb,var(--c-thbg,#dbeafe) 85%,white),color-mix(in srgb,var(--c-thbg,#dbeafe) 68%,white))', color:'var(--c-thtext,#000)' }

export default function Records() {
  const { records, getDayCalc, editCheckIn, editCheckOut, deleteTime, updateRecordFields, saveNotes, showToast, getLeaveBalances } = useAttendance()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const now = new Date()
  const [month, setMonth] = useState(() => {
    // قفزة البحث yyyymmdd (منقولة من السجلات — تُستهلك مرة واحدة)
    try {
      const j = JSON.parse(sessionStorage.getItem('hr_jump_ym') || 'null')
      if (j && typeof j.year === 'number' && typeof j.month === 'number') {
        sessionStorage.removeItem('hr_jump_ym')
        return { year: j.year, month: j.month }
      }
    } catch {}
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  // وضع العرض خاص بصفحة test (مستقل عن السجلات)
  const [orientation, setOrientation] = useState(() => settings.recordsOrientation || 'vertical')
  const isVertical = orientation === 'vertical'
  const [timeDialog, setTimeDialog] = useState({ open: false, date: null, field: null })
  const [notesDialog, setNotesDialog] = useState({ open: false, date: null })
  const [specialDialog, setSpecialDialog] = useState({ open: false, date: null, name: '' })
  const [openDrop, setOpenDrop] = useState(null)
  const { gate, request, handleSuccess, handleClose } = usePinArea()
  const [plan, setPlan] = useState(() => { try { return getPlan() } catch { return null } })
  useEffect(() => {
    const h = () => { try { setPlan(getPlan()) } catch {} }
    window.addEventListener(PLAN_EVENT, h)
    return () => window.removeEventListener(PLAN_EVENT, h)
  }, [])
  const planSet = new Set(plan ? plan.dates : [])
  // أيام أسبوع الدورة الغير متسددة → خلفية وردي غامق — المتسدد يرجع للونه الأصلي
  const [snoozed, setSnoozed] = useState(() => { try { return isSnoozed() } catch { return false } })
  useEffect(() => {
    const h = () => { try { setSnoozed(isSnoozed()) } catch {} }
    window.addEventListener(SNOOZE_EVENT, h)
    const iv = setInterval(h, 30000)
    return () => { window.removeEventListener(SNOOZE_EVENT, h); try { clearInterval(iv) } catch {} }
  }, [])
  const planLocked = (dk) => !!(plan && !snoozed && !planSet.has(dk))
  useEffect(() => {
    if (!plan) return
    try { if (settleIfDone(records, showToast)) setPlan(null) } catch {}
  }, [records])
  const fabArmed = useRef(false)
  const handlePlanFab = () => {
    if (!fabArmed.current) {
      fabArmed.current = true
      try {
        const p = getPlan(); if (!p) return
        const patches = planClearPatches(records, p)
        for (const [dk, patch] of Object.entries(patches)) updateRecordFields(dk, patch, true)
        showToast('اتمسحت تعديلات الأسبوع — دوس تاني للرجوع للرئيسية')
      } catch {}
      setTimeout(() => { fabArmed.current = false }, 10000)
      return
    }
    fabArmed.current = false
    try { navigate('/'); } catch {}
    try { window.scrollTo(0, 0) } catch {}
  }

  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const prevMonth = () => setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 })
  const nextMonth = () => setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 })

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const todayKeyRef = todayKey
  const guardRecord = (dk, fn, cell) => createDayGuard({ getRecords: () => records, todayKey: todayKeyRef, request })(dk, fn, cell)

  const weekendDays = (settings.weekendDays && settings.weekendDays.length === 2) ? settings.weekendDays : [5, 6]
  const days = []
  for (let day = 1; day <= daysInMonth; day++) {
    const dk = `${month.year}-${String(month.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const record = records[dk]
    const calc = record ? getDayCalc(dk) : null
    const dayOfWeek = new Date(dk).getDay()
    let dayCalc = record?.dayCalculation || ''
    let shift = record?.shift || ''
    let dayStatus = record?.dayStatus || ''
    if (!dayCalc && !shift && !dayStatus && record?.dayType) {
      const migrated = migrateDayType(record.dayType)
      dayCalc = migrated.dayCalc
      shift = migrated.shift
      dayStatus = migrated.dayStatus
    }
    const isWeekendDay = weekendDays.includes(dayOfWeek)
    if (!dayCalc && !shift && !dayStatus && !record?.checkIn) {
      if (isWeekendDay) dayCalc = 'weekend_rest'
      dayStatus = ''
      shift = ''
    }
    days.push({ dk, day, dayName: getDayNameAr(dk), record, calc, isToday: dk === todayKey, isWeekend: isWeekendDay, isFriday: dayOfWeek === weekendDays[0], dayCalc, shift, dayStatus })
  }

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
  const handleDayCalcChange = daySavers.handleDayCalcChange
  const handleShiftChange = daySavers.handleShiftChange
  const handleDayStatusChange = daySavers.handleDayStatusChange
  const handleSpecialSave = () => {
    if (daySavers.saveSpecial(specialDialog.date, specialDialog.name)) setSpecialDialog({ open:false, date:null, name:'' })
  }

  const displayCell = (d, field) => {
    const isOff = isLeaveCalc(d.dayCalc)
    const isAltDay = d.dayStatus === 'alt_day'
    if (isOff) return '0'
    if (isAltDay) {
      if (field === 'hours') return d.calc ? formatHours(d.calc.overtimeHours || 0) : '—'
      if (field === 'taxi') {
        if (getShiftFromRecord(d.record) === 'shift2' && d.calc?.taxiValue > 0) return formatCurrency(d.calc.taxiValue)
        if (getShiftFromRecord(d.record) === 'shift2') return '—'
        return '0'
      }
      return '0'
    }
    switch (field) {
      case 'hours': return d.calc ? formatHours(d.calc.overtimeHours || 0) : '—'
      case 'overtimeValue': return d.calc?.overtimeValue > 0 ? formatCurrency(d.calc.overtimeValue) : '—'
      case 'lunchValue': return d.calc?.lunchValue > 0 ? formatCurrency(d.calc.lunchValue) : '—'
      case 'totalExtras': return d.calc ? formatCurrency(d.calc.totalExtras) : '—'
      case 'bonus': return d.calc?.bonusValue > 0 ? formatCurrency(d.calc.bonusValue) : '—'
      case 'taxi':
        if (getShiftFromRecord(d.record) === 'shift2' && d.calc?.taxiValue > 0) return formatCurrency(d.calc.taxiValue)
        if (getShiftFromRecord(d.record) === 'shift2') return '—'
        return '0'
      case 'grandTotal': return d.calc ? formatCurrency(d.calc.grandTotal) : '—'
      default: return '—'
    }
  }

  const VROWS = [
    { key:'dayCalc', label:'نوع الاجازه' },
    { key:'dayStatus', label:'حاله اليوم' },
    { key:'shift', label:'الورديه' },
    { key:'checkIn', label:'وقت الحضور' },
    { key:'checkOut', label:'وقت الانصراف' },
    { key:'hours', label:'ساعات الإضافي' },
    { key:'overtimeValue', label:'المقابل النقدي' },
    { key:'lunchValue', label:'بدل الغدا' },
    { key:'totalExtras', label:'مجموع الاضافي' },
    { key:'bonus', label:'المكافأة' },
    { key:'taxi', label:'بدل التاكسي' },
    { key:'notes', label:'الملاحظات' },
  ]
  const rowBg = (ri) => (((ri + 1) % 2 === 1) ? 'color-mix(in srgb, var(--c-hd_records,#1e40af) 10%, white)' : '#ffffff')

  const dayCellInner = (d, key, hMode) => {
    const isOff = isLeaveCalc(d.dayCalc)
    const isAltDay = d.dayStatus === 'alt_day'
    if (key === 'dayCalc') return <CardSelect btnClass={cardSelectClass('dayCalc',getDayCalcValue(d),hMode)} options={getDayCalcOptions(d.isWeekend,d.dayStatus)} value={getDayCalcValue(d)} onPick={v=>guardRecord(d.dk,()=>handleDayCalcChange(d.dk,v),'dayCalc')} disabled={planLocked(d.dk)} dropKey={'t'+d.dk+':dc'} openKey={openDrop} setOpenKey={setOpenDrop} />
    if (key === 'dayStatus') return <CardSelect btnClass={cardSelectClass('dayStatus',getDayStatusValue(d),hMode)} options={getDayStatusOptionsForDay(d.isWeekend,d.dayStatus)} value={getDayStatusValue(d)} onPick={v=>guardRecord(d.dk,()=>handleDayStatusChange(d.dk,v),'dayStatus')} disabled={isOff || planLocked(d.dk)} dropKey={'t'+d.dk+':ds'} openKey={openDrop} setOpenKey={setOpenDrop} />
    if (key === 'shift') return <CardSelect btnClass={cardSelectClass('shift',getShiftValue(d),hMode)} options={getShiftOptions(getShiftValue(d))} value={getShiftValue(d)} onPick={v=>guardRecord(d.dk,()=>handleShiftChange(d.dk,v),'shift')} disabled={isOff || planLocked(d.dk)} dropKey={'t'+d.dk+':sh'} openKey={openDrop} setOpenKey={setOpenDrop} />
    if (key === 'checkIn') return isLeaveCalc(getDayCalcValue(d)) ? <span className="text-slate-400">—</span> : <button disabled={isOff || planLocked(d.dk)} onClick={()=>{const fn=()=>setTimeDialog({open:true,date:d.dk,field:'checkIn'}); if(d.record?.checkIn) guardRecord(d.dk,fn,'checkIn'); else fn()}} className={`font-bold ${isOff?'text-slate-400':'text-black'}`}>{d.record?.checkIn?timestampToTime(d.record.checkIn):'تسجيل'} ▼</button>
    if (key === 'checkOut') return isLeaveCalc(getDayCalcValue(d)) ? <span className="text-slate-400">—</span> : <button disabled={isOff || planLocked(d.dk)} onClick={()=>{const fn=()=>setTimeDialog({open:true,date:d.dk,field:'checkOut'}); if(d.record?.checkOut) guardRecord(d.dk,fn,'checkOut'); else fn()}} className={`font-bold ${isOff?'text-slate-400':'text-black'}`}>{d.record?.checkOut?timestampToTime(d.record.checkOut):'تسجيل'} ▼</button>
    if (key === 'hours') return <span className={`font-bold text-xs ${isAltDay?'text-slate-400':'text-blue-700'}`}>{displayCell(d,'hours')}</span>
    if (key === 'overtimeValue') return <span className={`font-bold text-xs ${isAltDay?'text-slate-400':'text-green-600'}`}>{displayCell(d,'overtimeValue')}</span>
    if (key === 'lunchValue') return <span className="text-xs">{displayCell(d,'lunchValue')}</span>
    if (key === 'totalExtras') return <span className={`font-bold text-xs ${isAltDay?'text-slate-400':'text-green-600'}`}>{displayCell(d,'totalExtras')}</span>
    if (key === 'bonus') return <span className="text-xs">{d.calc?.bonusValue>0?'✅':'—'}</span>
    if (key === 'taxi') return <span className="text-xs">{displayCell(d,'taxi')}</span>
    if (key === 'notes') return <button onClick={()=>guardRecord(d.dk,()=>setNotesDialog({open:true,date:d.dk}),'notes')} className="text-xs bg-slate-100 rounded px-2 py-1 font-bold">{d.record?.notes?'📝':'➕'}</button>
    return <span>—</span>
  }

  // الوقوف على كارت/صف اليوم تلقائيًا — أو اليوم المطلوب من جدول المتجاهلة (hr_jump_dk)
  const wrapRef = useRef(null)
  useEffect(() => {
    try {
      const wrap = wrapRef.current
      if (!wrap) return
      let targetIdx = null
      try {
        const jdk = sessionStorage.getItem('hr_jump_dk')
        if (jdk) {
          sessionStorage.removeItem('hr_jump_dk')
          const jy = +jdk.slice(0, 4), jm = +jdk.slice(5, 7) - 1, jd = parseInt(jdk.slice(8, 10), 10)
          if (jy === month.year && jm === month.month && jd >= 1 && jd <= days.length) targetIdx = jd
        }
      } catch {}
      if (targetIdx == null) {
        if (month.year !== now.getFullYear() || month.month !== now.getMonth()) return
        targetIdx = now.getDate()
      }
      if (isVertical) {
        const cards = wrap.querySelectorAll('[data-daycard]')
        const card = cards[targetIdx - 1]
        if (card) {
          // ضبط التمركز تحت العمود (منقول من السجلات — قياس حقيقي للتداخل بدل التخمين)
          card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
          requestAnimationFrame(() => {
            try {
              const labels = wrap.querySelector('[data-labelscol]')
              if (!labels) return
              const cr = card.getBoundingClientRect()
              const lr = labels.getBoundingClientRect()
              const overlap = cr.right - lr.left
              if (overlap > 0) {
                const cur = parseFloat(wrap.style.scrollPaddingRight) || 20
                wrap.style.scrollPaddingRight = (cur + 2 * (overlap + 6)) + 'px'
                card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
              } else {
                wrap.style.scrollPaddingRight = '20px'
              }
            } catch {}
          })
        }
      } else {
        const rows = wrap.querySelectorAll('[data-dayrow]')
        const row = rows[targetIdx - 1]
        if (row) row.scrollIntoView({ block: 'center' })
      }
    } catch {}
  }, [month.year, month.month, isVertical])

  return (
    <div className="px-4 py-2 space-y-2 page-records" style={{ paddingBottom: 'calc(3rem + env(safe-area-inset-bottom, 24px))' }}>
      {/* الهيدر — نفس هيدر السجلات + عنوان صغير + تبديل عرض خاص بالصفحة */}
      <div className={"bg-gradient-to-br from-blue-800 to-blue-600 rounded-2xl p-3 text-white mt-4 flex items-center justify-between hd-records" + (isVertical ? '' : ' sticky z-20')} style={{ minHeight: '52px', top: 'env(safe-area-inset-top, 0px)' }}>
        <span className="font-extrabold whitespace-nowrap truncate" style={{ fontSize: '14px' }}>📋 سجلات الحضور</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOrientation(isVertical ? 'horizontal' : 'vertical')} className="bg-white/15 rounded-xl px-2 py-1 text-xs font-bold whitespace-nowrap" title="تبديل العرض">
            {isVertical ? '↕️ رأسي' : '↔️ أفقي'}
          </button>
          <div className="flex items-center gap-1 bg-white/15 rounded-xl px-2 py-1">
            <button onClick={prevMonth} className="text-white text-xs px-1">▶</button>
            <span className="font-bold whitespace-nowrap" style={{ fontSize: '11px' }}>{monthNames[month.month]} {month.year}</span>
            <button onClick={nextMonth} className="text-white text-xs px-1">◀</button>
          </div>
        </div>
      </div>

      {isVertical ? (
        <div className="card records-table-card overflow-hidden">
          <div className="overflow-x-auto bg-slate-100" ref={wrapRef} style={{scrollPaddingRight:'20px'}}>
            <div className="flex justify-start gap-2.5" style={{ width: 'max-content' }}>
              {/* عمود الخاصية — أقصى اليمين + أرفع + خط أصغر */}
              <div data-labelscol className="w-[80px] shrink-0 rounded-r-2xl overflow-hidden sticky right-0 z-10 border-[3px] border-transparent" style={{background:'linear-gradient(to bottom,color-mix(in srgb,var(--c-propcol,#f1f5f9) 85%,white),color-mix(in srgb,var(--c-propcol,#f1f5f9) 68%,white))'}}>
                <div className="h-12 flex items-center justify-center font-extrabold" style={{ ...hdrGrad, fontSize: '12px' }}>الخاصية</div>
                {VROWS.map((row,ri)=> (row.key==='bonus' && settings.bonusEnabled!==true) ? null : (
                  <div key={row.key} className="h-10 flex items-center justify-center font-extrabold px-1 text-center border-t border-slate-200/60" style={{ fontSize: '11px', background:rowBg(ri)}}>{row.label}</div>
                ))}
              </div>
              {/* كروت الأيام — حواف مدورة + تباعد 10px + نفس التحكم الكامل */}
              {days.map((d)=>{
                const inPlanWeek = plan && planSet.has(d.dk) && !isDaySettled(d.record)
                const isIgnored = !isLeaveCalc(d.dayCalc || '') && (!d.record?.checkIn || !d.record?.checkOut) && d.dk < todayKey
                return (
                <div key={d.dk} data-daycard className="w-[168px] shrink-0 overflow-hidden rounded-xl border-[3px]" style={inPlanWeek?{borderColor:'#F59E0B',background:'linear-gradient(to bottom,#FCD34D,#FFFBEB)'}:(isIgnored?{borderColor:'#F06292',background:'linear-gradient(to bottom,#FCE4EC,#F8BBD0)'}:(d.isToday?{borderColor:'var(--c-hd_records,#1e40af)',background:'linear-gradient(to bottom,color-mix(in srgb,var(--c-todaycard,#eff6ff) 85%,white),color-mix(in srgb,var(--c-todaycard,#eff6ff) 68%,white))',boxShadow:'0 2px 12px rgba(30,64,175,.28)'}:(d.isWeekend?{borderColor:'transparent',background:'linear-gradient(to bottom,#F8FAFC,#F1F5F9)'}:{borderColor:'transparent',background:'#ffffff'}))) }>
                  <div className="h-12 flex flex-col items-center justify-center font-bold text-sm" style={inPlanWeek?{background:'transparent',color:'#ffffff'}:(isIgnored?{background:'transparent',color:'#880E4F'}:(d.isWeekend&&!d.isToday?{background:'transparent',color:'#475569'}:hdrGrad))}><span className="font-extrabold" style={{ fontSize: '14px', lineHeight: 1.2 }}>{d.day}</span><span className="font-bold" style={{ fontSize: '11px' }}>{d.dayName}</span></div>
                  {VROWS.map((row,ri)=> (row.key==='bonus' && settings.bonusEnabled!==true) ? null : (
                    <div key={row.key} className="h-10 flex items-center justify-center px-1.5 border-t border-slate-100 text-xs" style={{background:(inPlanWeek||(d.isWeekend&&!d.isToday))?'transparent':rowBg(ri)}}>{dayCellInner(d,row.key,false)}</div>
                  ))}
                </div>
                )})}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2" ref={wrapRef}>
          {days.map((d) => {
            const isOff = isLeaveCalc(d.dayCalc)
            const inPlanWeek = plan && planSet.has(d.dk) && !isDaySettled(d.record)
            const isIgnored = !isLeaveCalc(d.dayCalc || '') && (!d.record?.checkIn || !d.record?.checkOut) && d.dk < todayKey
            const valCell = (label, content, color) => (
              <div className="bg-slate-50 rounded-xl px-2 py-1.5 text-center">
                <div className="text-[10px] text-slate-500 font-bold">{label}</div>
                <div className={`text-xs font-bold ${color||'text-slate-800'}`}>{content}</div>
              </div>
            )
            return (
            <div key={d.dk} data-dayrow className="card overflow-hidden rounded-xl border-[3px]" style={inPlanWeek ? { borderColor: '#F59E0B', background: 'linear-gradient(to bottom,#FCD34D,#FFFBEB)' } : (isIgnored ? { borderColor: '#F06292', background: 'linear-gradient(to bottom,#FCE4EC,#F8BBD0)' } : (d.isToday ? { borderColor: 'var(--c-hd_records,#1e40af)', background: 'linear-gradient(to bottom,color-mix(in srgb,var(--c-todaycard,#eff6ff) 85%,white),color-mix(in srgb,var(--c-todaycard,#eff6ff) 68%,white))' } : (d.isWeekend && !d.isToday ? { borderColor: 'transparent', background: 'linear-gradient(to bottom,#F8FAFC,#F1F5F9)' } : { borderColor: 'transparent' })))}>
              <div className="flex items-center justify-between px-3 py-2 font-bold text-sm" style={hdrGrad}>
                <span>{d.dayName} {d.day} {d.isFriday&&'🕌'}{d.isWeekend&&!d.isFriday&&'🛌'}</span>
                {d.isToday && <span className="text-xs">اليوم 📍</span>}
              </div>
              <div className="p-2 space-y-2">
                {dayCellInner(d,'dayCalc',true)}
                {dayCellInner(d,'dayStatus',true)}
                {dayCellInner(d,'shift',true)}
                <div className="grid grid-cols-2 gap-2">
                  {valCell('الحضور', dayCellInner(d,'checkIn',true))}
                  {valCell('الانصراف', dayCellInner(d,'checkOut',true))}
                  {valCell('ساعات الإضافي', displayCell(d,'hours'), 'text-blue-700')}
                  {valCell('المقابل النقدي', displayCell(d,'overtimeValue'), 'text-green-600')}
                  {valCell('بدل الغدا', displayCell(d,'lunchValue'))}
                  {valCell('مجموع الاضافي', displayCell(d,'totalExtras'), 'text-green-600')}
                  {settings.bonusEnabled===true && valCell('المكافأة', d.calc?.bonusValue>0?'✅':'—')}
                  {valCell('بدل التاكسي', displayCell(d,'taxi'))}
                  {valCell('الملاحظات', dayCellInner(d,'notes',true))}
                </div>
              </div>
            </div>
            )})}
        </div>
      )}

      {plan && (
        <button onClick={handlePlanFab} className="plan-fab" title="مسح تعديلات الأسبوع / رجوع للرئيسية">🧹</button>
      )}

      {timeDialog.field === 'checkOut' ? (
        <CheckOutDialog open={timeDialog.open}
          title="⏰ وقت الانصراف"
          currentTime={timeDialog.date && records[timeDialog.date] ? timestampToTime(records[timeDialog.date]?.checkOut) : '08:00'}
          currentDate={timeDialog.date && records[timeDialog.date]?.checkOut ? timestampToDateKey(records[timeDialog.date].checkOut) : timeDialog.date}
          checkInTime={timeDialog.date && records[timeDialog.date]?.checkIn ? timestampToTime(records[timeDialog.date].checkIn) : undefined}
          showDate={timeDialog.date && records[timeDialog.date] ? (records[timeDialog.date].shift === 'shift2' || records[timeDialog.date].dayType === 'shift2') : false}
          hasTime={timeDialog.date && records[timeDialog.date] ? !!records[timeDialog.date]?.checkOut : false}
          onSave={(time, date) => {
            editCheckOut(timeDialog.date, time, date)
            setPendingAlt(timeDialog.date)
            setTimeDialog({ open: false, date: null, field: null })
          }}
          onDelete={() => {
            deleteTime(timeDialog.date, 'checkOut')
            setTimeDialog({ open: false, date: null, field: null })
          }}
          onClose={() => setTimeDialog({ open: false, date: null, field: null })} />
      ) : (
      <TimeEditDialog open={timeDialog.open}
        title="⏰ وقت الحضور"
        currentTime={timeDialog.date && records[timeDialog.date] ? timestampToTime(records[timeDialog.date]?.checkIn) : '08:00'}
        hasTime={timeDialog.date && records[timeDialog.date] ? !!records[timeDialog.date]?.checkIn : false}
        onSave={(time) => {
          editCheckIn(timeDialog.date, time)
          setTimeDialog({ open: false, date: null, field: null })
        }}
        onDelete={() => {
          deleteTime(timeDialog.date, 'checkIn')
          setTimeDialog({ open: false, date: null, field: null })
        }}
        onClose={() => setTimeDialog({ open: false, date: null, field: null })} />
      )}

      {specialDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={()=>setSpecialDialog({ open:false, date:null, name:'' })}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-3">✏️ اسم الإجازة الخاصة</h3>
            <input value={specialDialog.name} onChange={e=>setSpecialDialog(s=>({...s, name:e.target.value}))} placeholder="مثلاً: زواج، حج، مولود..." className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={()=>setSpecialDialog({ open:false, date:null, name:'' })} className="flex-1 btn btn-outline text-sm">إلغاء</button>
              <button onClick={handleSpecialSave} className="flex-1 btn btn-primary text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}
      <WaAskDialog info={waAsk} onNo={() => setWaAsk(null)}
        onYes={() => { const w = waAsk; setWaAsk(null); if (w.kind === 'alt') shareWa('مطلوب تسجيل يوم بديل', buildAltText(w.id)); else shareWa('مطلوب تسجيل إجازة', buildLeaveText(w.id, w.type)) }} />
      <PinGate open={gate.open} title={gate.title} onSuccess={handleSuccess} onClose={handleClose} />
      <NotesDialog open={notesDialog.open}
        initialNote={notesDialog.date ? records[notesDialog.date]?.notes || '' : ''}
        onSave={(note) => { saveNotes(notesDialog.date, note); setNotesDialog({ open: false, date: null }) }}
        onDelete={() => { saveNotes(notesDialog.date, ''); setNotesDialog({ open: false, date: null }) }}
        onClose={() => setNotesDialog({ open: false, date: null })} />
    </div>
  )
}
