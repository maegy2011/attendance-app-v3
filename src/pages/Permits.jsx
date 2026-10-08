import { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getPermitsV2, savePermitsV2 } from '../utils/storage'
import { SHIFT_OPTIONS, SHIFT_LABEL, allowedShifts, parseTimeToMin, minToHM, getShiftStartMin, getShiftEndMin, calcPermitDuration, validatePermit } from '../utils/permits'
import { getB, fireInstant } from '../utils/notify'
import { getDayNameAr, formatDateAr, timestampToTime } from '../utils/calendar'
import { useAttendance } from '../contexts/AttendanceContext'
import { useSettings } from '../contexts/SettingsContext'
import NotesDialog from '../components/NotesDialog'
import PinGate from '../components/PinGate'
import { usePinArea } from '../hooks/usePinArea'

// v12.4.8: إشعارات المعلقة — واحد لكل تصريح، متكرر كل 30 دقيقة
// v12.4.15: 6 تذكيرات كل 30د لمدة 3 ساعات من الجدولة — بدون تجديد
async function schedulePendingReminders(LN, Cap, permit, typeLabel){
  if(!Cap.isNativePlatform()) return
  try{
    const base = permitIdBase(permit)
    const notifs=[]
    for(let i=1;i<=6;i++){
      notifs.push({ id: base*100+i, title:'⏳ بانتظار العودة', body:`سجّل عودة تصريح ${typeLabel(permit.type)} — خروج ${permit.exitTime||''} — ${permit.date}`, schedule:{ at:new Date(Date.now()+i*30*60*1000) }, extra:{ editPermitId: permit.id, route:'/permits' }, autoCancel:true })
    }
    await LN.schedule({ notifications:notifs })
  }catch{}
}
async function cancelPendingReminders(LN, Cap, permitId){
  if(!Cap.isNativePlatform()) return
  try{
    const base = permitIdBase({ id:permitId })
    await LN.cancel({ notifications: Array.from({length:6},(_,i)=>({ id: base*100+i+1 })) })
  }catch{}
}
// v12.4.11 — بند 2: خلفية ثابتة (sticky) + تجاوز ساعتين + عودة
async function scheduleSticky(LN, Cap, permit, typeLabel, stateLabel){
  if(!Cap.isNativePlatform()) return
  try{
    const base = permitIdBase(permit)
    await LN.schedule({ notifications:[{ id: base*100, title:`📋 ${typeLabel(permit.type)} — ${stateLabel(permit.state)}`, body:`خروج ${permit.exitTime||'—'} — سجّل العودة من التصاريح (${permit.date})`, extra:{ editPermitId: permit.id, route:'/permits' }, schedule:{ at:new Date(Date.now()+1000) }, ongoing:true, autoCancel:false }] })
  }catch{}
}
async function cancelSticky(LN, Cap, permitId){
  if(!Cap.isNativePlatform()) return
  try{ const base = permitIdBase({ id:permitId }); await LN.cancel({ notifications:[{ id: base*100 }] }) }catch{}
}
async function scheduleExceedDelayed(permit, settings){
  // v12.11: مربوط بمفتاح B2 — لحظية متأخرة بعد ساعتين من الخروج للخاص-يعود
  if(!Capacitor.isNativePlatform()) return
  try { if(settings && getB(settings,2)===false) return } catch {}
  try{
    if(permit.type!=='special'||permit.state!=='returns'||!permit.exitTime) return
    const [h,m]=(permit.exitTime||'').split(':').map(Number)
    if(isNaN(h)||isNaN(m)) return
    const d=new Date(permit.date+'T00:00:00'); d.setHours(h,m+120,0,0)
    if(d<=new Date()) return
    await LocalNotifications.schedule({ notifications:[{ id:(Date.now()%80000)+5000, title:'⏰ تجاوز الساعتين', body:`تصريحك تجاوز ساعتين — خروج ${permit.exitTime} — سجّل العودة (${permit.date})`, extra:{ editPermitId: permit.id, route:'/permits' }, schedule:{ at:d } }] })
  }catch{}
}

const PERMIT_TYPES = [
  { v: 'special', label: 'خاص' },
  { v: 'late', label: 'إذن تأخير' },
  { v: 'official_mission', label: 'مهمة رسمية' },
  { v: 'errand', label: 'مأمورية' },
]
const PERMIT_STATE = [
  { v: 'returns', label: 'يعود' },
  { v: 'no_return', label: 'لا يعود' },
  { v: 'delay', label: 'تأخير' },
]

// التعديل 21: الحسابات في utils/permits (كل مدة حسب وردية التصريح نفسه)
// v12.4.8: معلق = يعود بدون عودة مسجلة (كل أنواع يعود)
function isPendingPermit(p){ return !!(p && p.type!=='late' && p.state==='returns' && !p.returnTime) }
function permitIdBase(p){ try{ const s=String(p?.id||''); let a=0; for(const c of s) a=(a+c.charCodeAt(0))%80000; return 1000+a }catch{ return 5000 } }

export default function Permits(){
  const { records, updateRecordFields, showToast } = useAttendance()
  const { settings } = useSettings()
  const location = useLocation()
  const [refresh,setRefresh]=useState(0)
  const [notesDialog,setNotesDialog]=useState({ open:false, id:null })
  const [filterOpen,setFilterOpen]=useState(false)
  const filterRef=useRef(null)
  useEffect(()=>{
    if(!filterOpen) return
    const close=(e)=>{ if(filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('mousedown',close)
    document.addEventListener('touchstart',close)
    return ()=>{ document.removeEventListener('mousedown',close); document.removeEventListener('touchstart',close) }
  },[filterOpen])
  const [filterTypes,setFilterTypes]=useState(PERMIT_TYPES.map(p=>p.v))
  // v12.5.1: زر ترتيب فقط — الافتراضي الأحدث→الأقدم
  const [sortDesc,setSortDesc]=useState(true)
  const [showAllBoxes,setShowAllBoxes]=useState(false)
  const [addOpen,setAddOpen]=useState(false)
  const [editOpen,setEditOpen]=useState({ open:false, id:null })
  // التعديل 21: خانة الوردية (الافتراضي لا يوجد تكليف) — delayDuration للتأخير عرض محسوب فقط
  const [addForm,setAddForm]=useState({ date: new Date().toISOString().slice(0,10), type:'special', state:'no_return', shift:'no_task', exitTime:'10:00', returnTime:'' })
  // التعديل 23 نقطة 1: إذن التأخير — موعد الوصول يتملى تلقائياً من سجل حضور نفس اليوم (لو فاضي)
  useEffect(()=>{
    if (addForm.type !== 'late' || !addForm.date || addForm.returnTime) return
    const ci = records[addForm.date]?.checkIn
    if (ci) { const t = timestampToTime(ci); if (t) setAddForm(f=>({ ...f, returnTime: f.returnTime || t })) }
  },[addForm.type, addForm.date, addForm.returnTime, records])
  const [editForm,setEditForm]=useState({ type:'special', state:'no_return', shift:'no_task', exitTime:'10:00', returnTime:'' })

  // v12.4.9: حماية من بيانات مستوردة تالفة — لازم مصفوفة دائمًا
  const permitsAll = useMemo(()=>{ const v=getPermitsV2(); return Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[] },[refresh])
  const permCounts = useMemo(()=>{
    const m={}; PERMIT_TYPES.forEach(p=>m[p.v]=0); permitsAll.forEach(p=>{ if(m[p.type]!==undefined) m[p.type]++ }); return m
  },[permitsAll])
  // v12.4.9: ترتيب آمن — الصفوف من غير تاريخ تنزل تحت بدل ما توقع الصفحة
  const sortedPermits = useMemo(()=>[...permitsAll].sort((a,b)=> sortDesc ? String(b.date||'').localeCompare(String(a.date||'')) : String(a.date||'').localeCompare(String(b.date||''))),[permitsAll, sortDesc])
  // التعديل ١ نقطة 5: فلتر سنة للجدول (الملخص حسب النوع يفضل شاملاً)
  const [pYear,setPYear]=useState(new Date().getFullYear())
  const filteredPermits = useMemo(()=>sortedPermits.filter(p=>filterTypes.includes(p.type) && String(p.date||'').startsWith(String(pYear))),[sortedPermits, filterTypes, pYear])

  const getPermitDuration = (p)=>{
    if(p.type==='late' && p.delayDuration) return parseTimeToMin(p.delayDuration)
    return calcPermitDuration(p, settings)
  }
  const getDelayDuration = (p)=>{
    if(p.type==='late' && p.delayDuration) return parseTimeToMin(p.delayDuration)
    // v12.4.8: خاص بس — مدة التأخير = مدة التصريح − ساعتين، ولو ≤ ساعتين → (—)
    if(p.type!=='special') return null
    if(isPendingPermit(p)) return null
    const d=calcPermitDuration(p, settings)
    if(d==null) return null
    if(d<=120) return null
    return d-120
  }
  const isPendingRow = (p)=> isPendingPermit(p)
  const formatDuration = (min)=> min==null?'—':minToHM(min)
  const isOverTwoHours = (min)=> min!=null && min>120

  const typeLabel=(t)=> PERMIT_TYPES.find(x=>x.v===t)?.label || t
  const stateLabel=(s)=> PERMIT_STATE.find(x=>x.v===s)?.label || s
  const getStateOptions=(type)=>{
    if(type==='late') return [{ v:'delay', label:'تأخير' }]
    return PERMIT_STATE.filter(s=>s.v!=='delay')
  }
  const visibleTypes = showAllBoxes ? PERMIT_TYPES : PERMIT_TYPES.slice(0,2)
  // التعديل 21: خيارات الوردية حسب النوع + المدة المحسوبة للعرض (عرض فقط)
  const fmtShiftT = (min) => { const v = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}` }
  const addShiftOpts = SHIFT_OPTIONS.filter(o=>allowedShifts(addForm.type).includes(o.v))
  const addShiftEff = addShiftOpts.some(o=>o.v===addForm.shift) ? addForm.shift : 'no_task'
  const addLateDur = addForm.type==='late' && addForm.returnTime ? calcPermitDuration({type:'late',returnTime:addForm.returnTime,shift:addShiftEff}, settings) : null
  const editShiftOpts = SHIFT_OPTIONS.filter(o=>allowedShifts(editForm.type).includes(o.v))
  const editShiftEff = editShiftOpts.some(o=>o.v===editForm.shift) ? editForm.shift : 'no_task'
  const editLateDur = editForm.type==='late' && editForm.returnTime ? calcPermitDuration({type:'late',returnTime:editForm.returnTime,shift:editShiftEff}, settings) : null

  const handleAddPermit = async ()=>{
    const date = addForm.date
    if(!date){ showToast('اختر التاريخ'); return }
    if(permitsAll.some(p=>p.date===date)){
      showToast('مستحيل تصريحين في نفس اليوم')
      return
    }
    // التعديل 21: تحقق موحد (الوردية + المدد حسب الوردية) — يعود بدون عودة = معلق (مسموح)
    const addErr = validatePermit(addForm, settings)
    if(addErr){ showToast(addErr); return }
    // v12.4.8: حد الخاص الشهري — بحد أقصى 2 تصريح خاص في نفس الشهر، التالت يترفض
    if(addForm.type==='special'){
      const mk=(addForm.date||'').slice(0,7)
      const cnt=permitsAll.filter(p=>p.type==='special' && (p.date||'').slice(0,7)===mk).length
      if(cnt>=2){ showToast('مرفوض: الحد الأقصى 2 تصريح خاص شهريًا'); return }
    }
    const isLate = addForm.type==='late'
    // التعديل 21: تثبيت الوردية (الفلترة في الشاشة + إجبار هنا) — مدة التأخير محسوبة ومخزنة
    const addShift = allowedShifts(addForm.type).includes(addForm.shift) ? (addForm.shift||'no_task') : 'no_task'
    const addLateDur = isLate ? calcPermitDuration({ type:'late', returnTime:addForm.returnTime, shift:addShift }, settings) : null
    const newPermit = {
      id: date, date,
      type: addForm.type, state: isLate ? 'delay' : addForm.state,
      shift: addShift,
      exitTime: isLate ? '' : (addForm.exitTime||''), returnTime: isLate ? (addForm.returnTime||'') : (addForm.state==='returns'? (addForm.returnTime||''):''),
      delayDuration: isLate ? (addLateDur!=null?minToHM(addLateDur):'') : '',
      notes: '',
    }
    const dur = calcPermitDuration(newPermit, settings)
    if(!isLate && dur!=null && dur>120) newPermit.notes='تجاوز الساعتين'
    // ربط مع سجلات الحضور — مثال 2 و 3: مهمة رسمية + إذن تأخير + خاص/مأمورية يعدل السجل
    try{
      if(newPermit.type==='special' || newPermit.type==='official_mission' || newPermit.type==='errand'){
        const rec=records[date]||{}
        const checkIn=rec.checkIn || new Date(date+'T08:00:00').toISOString()
        // التعديل 21: الوردية المختارة + انصراف العمل الرسمي التلقائي مع (لا يعود) فقط
        const fields = { checkIn, shift:newPermit.shift||'no_task', dayStatus:'normal_day' }
        if(newPermit.state!=='returns') fields.checkOut=new Date(date+'T'+(settings.officialEnd||'15:00')+':00').toISOString()
        updateRecordFields(date, fields)
      } else if(newPermit.type==='late' && newPermit.returnTime && newPermit.delayDuration){
        const retMin=parseTimeToMin(newPermit.returnTime)
        const dMin=parseTimeToMin(newPermit.delayDuration)
        if(retMin!=null && dMin!=null){
          let checkInMin=retMin - dMin
          if(checkInMin<0) checkInMin+=24*60
          const hh=String(Math.floor(checkInMin/60)%24).padStart(2,'0'), mm=String(checkInMin%60).padStart(2,'0')
          const checkIn=new Date(date+'T'+hh+':'+mm+':00').toISOString()
          // حضور محسوب = العودة - المدة (= بداية الوردية) + الوردية المختارة بدل الأولى الإجبارية
          updateRecordFields(date, { checkIn, shift:newPermit.shift||'no_task', dayStatus:'normal_day', dayCalculation:'' })
        }
      }
    }catch{}
    const isPendAdd = isPendingPermit(newPermit)
    savePermitsV2([...permitsAll, newPermit]); setRefresh(x=>x+1); setAddOpen(false)
    // v12.4.11 — بند 2: لحظية بدون مفتاح + (انتظار/خلفية بمفتاح B2) + تجاوز
    if(Capacitor.isNativePlatform()){ try{ const bodyLate = isLate ? `${newPermit.returnTime} - ${newPermit.delayDuration}` : `${newPermit.exitTime||''} ${newPermit.state==='returns'&&newPermit.returnTime? '→ '+newPermit.returnTime:''}`; await fireInstant('📝 تم تسجيل تصريح', `${PERMIT_TYPES.find(t=>t.v===newPermit.type)?.label||newPermit.type} — ${bodyLate} ${dur!=null? `(${minToHM(dur)})`:''}`, { route:'/permits' }) }catch{} }
    if(!isLate && dur!=null && dur>120 && getB(settings,2)){ try{ await fireInstant('⏰ تجاوز الساعتين', `تصريحك تجاوز ساعتين — خروج ${newPermit.exitTime} — سجّل العودة (${date})`, { route:'/permits' }) }catch{} }
    if(isPendAdd && Capacitor.isNativePlatform() && getB(settings,2)){ try{ await LocalNotifications.schedule({ notifications:[{ id: Date.now()%100000, title:'⏳ بانتظار العودة', body:`سجّل عودة تصريح ${PERMIT_TYPES.find(x=>x.v===newPermit.type)?.label||newPermit.type} — خروج ${newPermit.exitTime||''} — ${date}`, extra:{ editPermitId: newPermit.id, route:'/permits' }, schedule:{ at: new Date(Date.now()+1000) } }] }); await schedulePendingReminders(LocalNotifications, Capacitor, newPermit, (v)=>PERMIT_TYPES.find(x=>x.v===v)?.label||v); await scheduleSticky(LocalNotifications, Capacitor, newPermit, (v)=>PERMIT_TYPES.find(x=>x.v===v)?.label||v, (s)=>PERMIT_STATE.find(x=>x.v===s)?.label||s) }catch{} }
    try{ await scheduleExceedDelayed(newPermit, settings) }catch{}
  }
  // v12.8.3 (بند ٣): إضافة/تعديل/حذف التصاريح يتطلب الرمز — مرة واحدة لكل جلسة
  const { gate, request, handleSuccess, handleClose } = usePinArea()
  const openEdit = (p)=>{
    request('permits', '✏️ تعديل تصريح', ()=>{
      setEditForm({ type:p.type, state:p.state, shift:p.shift||'no_task', exitTime:p.exitTime||'', returnTime:p.returnTime||'' })
      setEditOpen({ open:true, id:p.id })
    })
  }
  // فتح شاشة التعديل مباشرة عند القدوم من خانة تصريح الرئيسية
  // v12.4.10: شيلنا مستمع الإشعارات من هنا (كان بيوقع الصفحة) — الضغط على الإشعار يفتح التطبيق وصفحة التصاريح
  useEffect(()=>{
    const id = location.state?.editPermitId
    if(id){
      try{ const p = getPermitsV2().find(x=>x.id===id); if(p) openEdit(p) }catch{}
      window.history.replaceState({}, '')
    }
  },[])
  // v12.4.15: انتهاء 3 ساعات — إلغاء المعلق+الثابتة المنتهية بدون تجديد
  useEffect(()=>{
    (async()=>{
      try{
        if(!Capacitor.isNativePlatform()) return
        const now = Date.now()
        for(const p of getPermitsV2()){
          if(!isPendingPermit(p) || !p.exitTime || !p.date) continue
          const [h,m] = String(p.exitTime).split(':').map(Number)
          if(isNaN(h)||isNaN(m)) continue
          const ex = new Date(p.date+'T00:00:00'); ex.setHours(h,m,0,0)
          if(now - ex.getTime() > 3*3600*1000){
            await cancelPendingReminders(LocalNotifications, Capacitor, p.id)
            await cancelSticky(LocalNotifications, Capacitor, p.id)
          }
        }
      }catch{}
    })()
  },[])
  const handleEditSave = async ()=>{
    const id=editOpen.id
    const cur=getPermitsV2()
    const idx=cur.findIndex(p=>p.id===id)
    if(idx<0) return
    const orig=cur[idx]
    const isLate = editForm.type==='late'
    // v12.4.8: حد الخاص الشهري في التعديل
    if(editForm.type==='special' && orig.type!=='special'){
      const mk=(orig.date||'').slice(0,7)
      try{
        const cnt=getPermitsV2().filter(x=>x.type==='special' && (x.date||'').slice(0,7)===mk && x.id!==id).length
        if(cnt>=2){ showToast('مرفوض: الحد الأقصى 2 تصريح خاص شهريًا'); return }
      }catch{}
    }
    // التعديل 21: نفس قواعد الإضافة (وردية + تحقق + مدة محسوبة)
    const editErr = validatePermit(editForm, settings)
    if(editErr){ showToast(editErr); return }
    const editShift = allowedShifts(editForm.type).includes(editForm.shift) ? (editForm.shift||'no_task') : 'no_task'
    const editLateDur = isLate ? calcPermitDuration({ type:'late', returnTime:editForm.returnTime, shift:editShift }, settings) : null
    const updated={ ...orig, type:editForm.type, state: isLate ? 'delay' : editForm.state, shift:editShift, exitTime: isLate ? '' : (editForm.exitTime||''), returnTime: isLate ? (editForm.returnTime||'') : (editForm.state==='returns'? (editForm.returnTime||'') : ''), delayDuration: isLate ? (editLateDur!=null?minToHM(editLateDur):'') : '' }
    const dur = calcPermitDuration(updated, settings)
    if(!isLate && dur!=null && dur>120) updated.notes='تجاوز الساعتين'
    else if(updated.notes==='تجاوز الساعتين' && (!isLate && dur!=null && dur<=120)) updated.notes=''
    // تحديث سجل الحضور عند التعديل
    try{
      if(updated.type==='late' && updated.returnTime && updated.delayDuration){
        const retMin=parseTimeToMin(updated.returnTime), dMin=parseTimeToMin(updated.delayDuration)
        if(retMin!=null && dMin!=null){
          let checkInMin=retMin - dMin; if(checkInMin<0) checkInMin+=24*60
          const hh=String(Math.floor(checkInMin/60)%24).padStart(2,'0'), mm=String(checkInMin%60).padStart(2,'0')
          const checkIn=new Date(updated.date+'T'+hh+':'+mm+':00').toISOString()
          updateRecordFields(updated.date, { checkIn, shift:updated.shift||'no_task', dayStatus:'normal_day', dayCalculation:'' })
        }
      } else if(['special','official_mission','errand'].includes(updated.type)){
        const rec=records[updated.date]||{}
        const checkIn=rec.checkIn || new Date(updated.date+'T08:00:00').toISOString()
        // v12.5.6: انصراف 15:00 التلقائي مع (لا يعود) فقط — (يعود) مايلمسش الانصراف الموجود
        const fields = { checkIn, shift:updated.shift||'no_task', dayStatus:'normal_day' }
        if(updated.state!=='returns') fields.checkOut=new Date(updated.date+'T'+(settings.officialEnd||'15:00')+':00').toISOString()
        updateRecordFields(updated.date, fields)
      }
    }catch{}
    const wasPend = isPendingPermit(orig), nowPend = isPendingPermit(updated)
    cur[idx]=updated
    savePermitsV2(cur); setRefresh(x=>x+1); setEditOpen({ open:false, id:null })
    // v12.4.11 — بند 2: إلغاء/جدولة بمفتاح B2 + عودة + تجاوز
    try{
      if(wasPend && !nowPend){
        await cancelPendingReminders(LocalNotifications, Capacitor, updated.id);
        try{ await cancelSticky(LocalNotifications, Capacitor, updated.id) }catch{}
        if(getB(settings,2)){
          const nd2=calcPermitDuration(updated, settings);
          let dDelay=null;
          if(updated.type==='special'&&nd2!=null&&nd2>120) dDelay=nd2-120;
          try{ await LocalNotifications.schedule({ notifications:[{ id: Date.now()%100000, title:'✅ تم تسجيل العودة', extra:{ route:'/permits' }, body:`اتسجلت العودة — ${typeLabel(updated.type)} — عودة ${updated.returnTime||''} | مدة ${nd2!=null?minToHM(nd2):'—'}${dDelay!=null?` | تأخير ${minToHM(dDelay)}`:''}`, schedule:{ at:new Date(Date.now()+1000) } }] }) }catch{}
        }
      } else if(nowPend && getB(settings,2)){
        await schedulePendingReminders(LocalNotifications, Capacitor, updated, typeLabel);
        await scheduleSticky(LocalNotifications, Capacitor, updated, typeLabel, stateLabel)
      }
    }catch{}
    if(!isLate && getB(settings,2)){ const dd=calcPermitDuration(updated, settings); if(dd!=null&&dd>120){ try{ await fireInstant('⏰ تجاوز الساعتين', `تصريح خاص-يعود — خروج ${updated.exitTime} — تجاوز ساعتين (${updated.date})`, { route:'/permits' }) }catch{} } }
    if(Capacitor.isNativePlatform()){ try{ const nd=calcPermitDuration(updated, settings); const bodyLate = isLate ? `${updated.returnTime} - ${updated.delayDuration}` : `${updated.exitTime||''}`; await fireInstant('✏️ تم تعديل تصريح', `${typeLabel(updated.type)} — ${bodyLate} ${nd!=null? `(${minToHM(nd)})`:''}`, { route:'/permits' }) }catch{} }
  }
  const deletePermit = async (id)=>{
    if(!confirm('حذف هذا التصريح؟')) return
    savePermitsV2(getPermitsV2().filter(p=>p.id!==id)); setRefresh(x=>x+1)
    try{ await cancelPendingReminders(LocalNotifications, Capacitor, id); await cancelSticky(LocalNotifications, Capacitor, id) }catch{}
  }
  const handleSaveNotes=(notes)=>{
    const id=notesDialog.id
    if(!id) return
    const cur=getPermitsV2()
    const idx=cur.findIndex(p=>p.id===id)
    if(idx>=0){ cur[idx].notes=notes; savePermitsV2(cur); setRefresh(x=>x+1) }
    setNotesDialog({ open:false, id:null })
  }

  return (
    <div className="px-4 pt-2 pb-20 space-y-2 flex flex-col min-h-[80vh] page-perm">
      <div className="bg-gradient-to-br from-indigo-800 to-indigo-600 rounded-2xl p-3 text-white mt-4 hd-perm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">📝 التصاريح</h1>
          {/* التعديل ١ نقطة 5: خانة السنة — فلتر سنة للجدول */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl px-2 py-1 w-fit">
            <button onClick={()=>setPYear(pYear-1)} className="text-slate-600 text-sm px-1 font-bold" title="السنة اللي قبلها">▶</button>
            <span className="text-sm font-bold text-slate-600">{pYear}</span>
            <button onClick={()=>setPYear(pYear+1)} disabled={pYear>=new Date().getFullYear()} className={`text-sm px-1 font-bold ${pYear>=new Date().getFullYear() ? 'text-slate-300' : 'text-slate-600'}`} title="السنة اللي بعدها">◀</button>
          </div>
        </div>
      </div>

      {/* لوحة 1: الـ 5 خانات — منفصلة */}
      <div onClick={()=>setShowAllBoxes(!showAllBoxes)} className="card cursor-pointer select-none">
        <h3 className="font-bold text-slate-700 mb-2 text-center text-sm">📊 ملخص التصاريح حسب النوع</h3>
        <div className="grid grid-cols-2 gap-1">
          {visibleTypes.map(pt=>{
            const tc = pt.v==='special' ? ['text-purple-700','text-purple-600','text-purple-800'] : pt.v==='late' ? ['text-amber-700','text-amber-600','text-amber-800'] : pt.v==='official_mission' ? ['text-teal-700','text-teal-600','text-teal-800'] : ['text-slate-600','text-slate-500','text-slate-700']
            return (
            <div key={pt.v} className={`card bg-white ${pt.v==='special'?'border-purple-300':pt.v==='late'?'border-amber-300':pt.v==='official_mission'?'border-teal-300':'border-slate-300'}`} style={{padding:'5px'}}>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <div className={`text-xs font-extrabold ${tc[0]}`}>{pt.label}</div>
                  <div className={`text-xs ${tc[1]}`}>مسجلة</div>
                </div>
                <div className={`text-lg font-black ${tc[2]}`}>{permCounts[pt.v] ?? 0}</div>
              </div>
            </div>
            )
          })}
        </div>
        {!showAllBoxes && <div className="text-center text-xs text-slate-400 py-1 mt-1">اضغط لعرض باقي الأنواع ▼</div>}
        {showAllBoxes && <div className="text-center text-xs text-slate-400 py-1 mt-1">اضغط للطي ▲</div>}
      </div>

      {/* لوحة 2: جدول تصاريح خروج — منفصلة */}
      <div className="card flex-1 flex flex-col">
        {/* تعديل ٤: العنوان سطر لوحده + الزرارين تحته شمال */}
        <div className="mb-3">
          <h3 className="font-extrabold text-slate-800">📋 سجل تصاريح الخروج</h3>
          <div className="flex items-center gap-1 mt-2 justify-end">
          <button onClick={()=>setSortDesc(!sortDesc)} className="sortfilter text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-full px-2 py-1.5 whitespace-nowrap shrink-0">{sortDesc?'⬇️ الأحدث':'⬆️ الأقدم'}</button>
          <div className="relative" ref={filterRef}>
            <button onClick={()=>setFilterOpen(!filterOpen)} className="sortfilter px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center gap-1 text-xs font-bold whitespace-nowrap shrink-0">🔍 الفلتر ▼</button>
            {filterOpen && (
              <div className="absolute top-9 left-0 bg-white border rounded-xl shadow-lg p-3 w-52 max-w-[70vw] z-10">
                {PERMIT_TYPES.map(o=>(
                  <label key={o.v} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                    <input type="checkbox" checked={filterTypes.includes(o.v)} onChange={e=>{ if(e.target.checked) setFilterTypes([...filterTypes,o.v]); else setFilterTypes(filterTypes.filter(x=>x!==o.v)) }} className="w-4 h-4" />
                    {o.label}
                  </label>
                ))}
                <div className="flex gap-1 mt-2 pt-2 border-t">
                  <button onClick={()=>setFilterTypes(PERMIT_TYPES.map(p=>p.v))} className="flex-1 text-xs bg-blue-50 text-blue-700 rounded-lg py-1">الكل</button>
                  <button onClick={()=>setFilterTypes([])} className="flex-1 text-xs bg-slate-100 rounded-lg py-1">إلغاء</button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
        <div className="flex justify-end items-center mb-3">
          <button onClick={()=>request('permits','➕ إضافة تصريح',()=>setAddOpen(true))} className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">+ إضافة تصريح</button>
        </div>

        {filteredPermits.length===0 ? (
          <p className="text-sm text-slate-400 text-center py-8 flex-1 flex items-center justify-center">لا يوجد تصاريح — اضغط + إضافة تصريح</p>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs ctable">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2">نوع التصريح</th>
                  <th className="p-2">حالة التصريح</th>
                  <th className="p-2">ساعة الخروج</th>
                  <th className="p-2">ساعة العودة</th>
                  <th className="p-2">مدة التصريح</th>
                  <th className="p-2">مدة التأخير</th>
                  <th className="p-2">ملاحظات</th>
                  <th className="p-2">تعديل</th>
                  <th className="p-2">حذف</th>
                </tr>
              </thead>
              <tbody>
                {filteredPermits.map((p,pidx)=>{
                  const pend=isPendingRow(p)
                  const dur=getPermitDuration(p)
                  const dDelay=getDelayDuration(p)
                  const over=isOverTwoHours(dur)
                  return (
                    <tr key={p.id} className={`border-t ct-${pidx%2?'odd':'even'} ${pidx%2?'bg-slate-100':''} ${over?'!bg-red-50':''}`}>
                      <td className="p-2 font-mono text-xs">{formatDateAr(p.date)}<div className="text-xs text-slate-400">{getDayNameAr(p.date)}</div></td>
                      <td className="p-2 text-center font-bold">{typeLabel(p.type)}</td>
                      <td className="p-2 text-center">{stateLabel(p.state)}</td>
                      <td className="p-2 text-center font-mono">{p.type==='late'?'—':(p.exitTime||'—')}</td>
                      <td className="p-2 text-center font-mono">{p.type==='late'?'—':(p.returnTime||'—')}</td>
                      <td className={`p-2 font-mono text-center font-bold ${over?'text-red-600':''}`}>{pend?'بانتظار العودة':formatDuration(dur)}</td>
                      <td className="p-2 font-mono text-center">{pend?'بانتظار العودة':formatDuration(dDelay)}</td>
                      <td className="p-2 text-center">
                        <button onClick={()=>request('permits','📝 ملاحظات التصريح',()=>setNotesDialog({open:true,id:p.id}))} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 font-bold">{p.notes?'📝':'➕'}</button>
                        {p.notes&&<div className="text-xs text-red-600">{p.notes}</div>}
                      </td>
                      <td className="p-2 text-center"><button onClick={()=>openEdit(p)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-2 py-1 font-bold">✏️</button></td>
                      <td className="p-2 text-center"><button onClick={()=>request('permits','🗑️ حذف تصريح',()=>deletePermit(p.id))} className="text-red-500 hover:text-red-700 text-xs">🗑️</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog إضافة */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setAddOpen(false)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="font-extrabold text-slate-800 mb-3">+ إضافة تصريح خروج</h3>
            <div className="space-y-2">
              <div><label className="text-xs font-bold text-slate-600">التاريخ</label><input type="date" value={addForm.date} onChange={e=>setAddForm({...addForm,date:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs font-bold text-slate-600">نوع التصريح</label><select value={addForm.type} onChange={e=>{ const v=e.target.value; const opts=allowedShifts(v); setAddForm({...addForm,type:v, state: v==='late' ? 'delay' : 'no_return', shift: opts.includes(addForm.shift)?addForm.shift:'no_task'})}} className="w-full border rounded-lg px-3 py-2 text-sm">{PERMIT_TYPES.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-600">الوردية</label><select value={addShiftEff} onChange={e=>setAddForm({...addForm,shift:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">{addShiftOpts.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              </div>
              <div className="text-xs text-slate-500 text-center">🕐 {SHIFT_LABEL[addShiftEff]}: حضور {fmtShiftT(getShiftStartMin(settings,addShiftEff))} — انصراف {fmtShiftT(getShiftEndMin(settings,addShiftEff))}</div>
              <div><label className="text-xs font-bold text-slate-600">حالة التصريح</label><select value={addForm.state} onChange={e=>setAddForm({...addForm,state:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">{getStateOptions(addForm.type).map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              {addForm.type!=='late' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-bold text-slate-600">ساعة الخروج</label><input type="time" value={addForm.exitTime} onChange={e=>setAddForm({...addForm,exitTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs font-bold text-slate-600">ساعة العودة</label><input type="time" value={addForm.returnTime} disabled={addForm.state==='no_return'} onChange={e=>setAddForm({...addForm,returnTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
                </div>
              )}
              {addForm.type==='late' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-bold text-slate-600">ساعة العودة (الوصول)</label><input type="time" value={addForm.returnTime} onChange={e=>setAddForm({...addForm,returnTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs font-bold text-slate-600">مدة التأخير (تلقائي)</label><div className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-slate-100 text-slate-700 font-bold">{addLateDur!=null?minToHM(addLateDur):'—'}</div></div>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={()=>setAddOpen(false)} className="flex-1 py-2 rounded-xl bg-slate-100 font-bold text-sm">إلغاء</button>
                <button onClick={handleAddPermit} className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">حفظ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog تعديل — التاريخ ثابت بدون تعديل */}
      {editOpen.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setEditOpen({open:false,id:null})}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="font-extrabold text-slate-800 mb-3">✏️ تعديل تصريح</h3>
            <div className="space-y-2">
              <div><label className="text-xs font-bold text-slate-600">التاريخ (ثابت)</label><input type="text" value={(()=>(filteredPermits.find(x=>x.id===editOpen.id)?.date||''))()} disabled className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-500" /><div className="text-xs text-slate-400 mt-1">{(()=>(filteredPermits.find(x=>x.id===editOpen.id)?.date? formatDateAr(filteredPermits.find(x=>x.id===editOpen.id).date)+' — '+getDayNameAr(filteredPermits.find(x=>x.id===editOpen.id).date):''))()}</div></div>
              <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs font-bold text-slate-600">نوع التصريح</label><select value={editForm.type} onChange={e=>{ const v=e.target.value; const opts=allowedShifts(v); setEditForm({...editForm,type:v, state: v==='late' ? 'delay' : editForm.state==='delay' ? 'no_return' : editForm.state, shift: opts.includes(editForm.shift)?editForm.shift:'no_task'})}} className="w-full border rounded-lg px-3 py-2 text-sm">{PERMIT_TYPES.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-600">الوردية</label><select value={editShiftEff} onChange={e=>setEditForm({...editForm,shift:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">{editShiftOpts.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              </div>
              <div className="text-xs text-slate-500 text-center">🕐 {SHIFT_LABEL[editShiftEff]}: حضور {fmtShiftT(getShiftStartMin(settings,editShiftEff))} — انصراف {fmtShiftT(getShiftEndMin(settings,editShiftEff))}</div>
              <div><label className="text-xs font-bold text-slate-600">حالة التصريح</label><select value={editForm.state} onChange={e=>setEditForm({...editForm,state:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">{getStateOptions(editForm.type).map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
              {editForm.type!=='late' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-bold text-slate-600">ساعة الخروج</label><input type="time" value={editForm.exitTime} onChange={e=>setEditForm({...editForm,exitTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs font-bold text-slate-600">ساعة العودة</label><input type="time" value={editForm.returnTime} disabled={editForm.state==='no_return'} onChange={e=>setEditForm({...editForm,returnTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
                </div>
              )}
              {editForm.type==='late' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-bold text-slate-600">ساعة العودة (الوصول)</label><input type="time" value={editForm.returnTime} onChange={e=>setEditForm({...editForm,returnTime:e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs font-bold text-slate-600">مدة التأخير (تلقائي)</label><div className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-slate-100 text-slate-700 font-bold">{editLateDur!=null?minToHM(editLateDur):'—'}</div></div>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={()=>setEditOpen({open:false,id:null})} className="flex-1 py-2 rounded-xl bg-slate-100 font-bold text-sm">إلغاء</button>
                <button onClick={handleEditSave} className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">حفظ التعديل</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PinGate open={gate.open} title={gate.title} onSuccess={handleSuccess} onClose={handleClose} />
      <NotesDialog open={notesDialog.open} initialNote={notesDialog.id ? (permitsAll.find(x=>x.id===notesDialog.id)?.notes || '') : ''} onSave={handleSaveNotes} onDelete={()=>handleSaveNotes('')} onClose={()=>setNotesDialog({ open:false, id:null })} />
    </div>
  )
}
