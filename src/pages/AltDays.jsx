import { useState, useMemo, useRef, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { getAltDays, saveAltDays, getLeavesV2 } from '../utils/storage'
import { getDayNameAr, formatDateAr } from '../utils/vacationLogic'
import { getDisplayAltDays } from '../utils/altDays'
import { getLeaveCounts } from '../utils/leaveCounts'
import { useAttendance } from '../contexts/AttendanceContext'
import { formatHours } from '../utils/calculations'
import NotesDialog from '../components/NotesDialog'
import PinGate from '../components/PinGate'
import { usePinArea } from '../hooks/usePinArea'

export default function AltDays(){
  const { settings } = useSettings()
  const { records, getDayCalc } = useAttendance()
  const [refresh,setRefresh]=useState(0)
  const [notesDialog,setNotesDialog]=useState({ open:false, date:null })
  // v12.8.3 (بند ٣): تعديلات البديلة تتطلب الرمز — مرة واحدة لكل جلسة
  const { gate, request, handleSuccess, handleClose } = usePinArea()
  // v12.5.1: فلتر + ترتيب — الافتراضي الأحدث→الأقدم + الكل
  const [altFilter,setAltFilter]=useState('all')
  const [showAllAltBoxes,setShowAllAltBoxes]=useState(false)
  const [altFilterOpen,setAltFilterOpen]=useState(false)
  const altFilterRef=useRef(null)
  useEffect(()=>{
    const close=(e)=>{ if(altFilterRef.current && !altFilterRef.current.contains(e.target)) setAltFilterOpen(false) }
    document.addEventListener('mousedown',close)
    return ()=>document.removeEventListener('mousedown',close)
  },[])
  const [altSortDesc,setAltSortDesc]=useState(true)
  const altDays=useMemo(()=>getAltDays(),[refresh])

  // التعديل 24: الجدول سجل تاريخي (كل السنين) — والخانات سنة حالية من التسوية المحسوبة (مصدر واحد)
  // التعديل ١ نقطة 5: سنة العرض — الجدول والخانات حسب السنة المختارة
  const [vYear,setVYear]=useState(new Date().getFullYear())
  const histDisplay=useMemo(()=>getDisplayAltDays(records||{}, altDays, settings.altDayMinHours||6).filter(a=>a.date.startsWith(String(vYear))),[records, settings, altDays, refresh, vYear])
  const altYearData=useMemo(()=>getLeaveCounts(records||{}, getLeavesV2(), altDays, settings, vYear).alt,[records, settings, altDays, refresh, vYear])
  const derivedAlt=useMemo(()=>histDisplay.map(a=>({ dk:a.date, date:a.date, dayName:getDayNameAr(a.date), calc:getDayCalc(a.date), selfService:a.selfService, notes:a.notes||'', hrs:a.hrs })),[histDisplay, getDayCalc])

  const displayAlt = derivedAlt.map(a=>({ date:a.date, dayName:a.dayName, selfService:a.selfService, notes:a.notes, hrs:a.hrs, calc:a.calc }))

  const toggleAltSelf=(date)=>{
    const newAlts=altDays.map(a=>a.date===date?{...a,selfService:!a.selfService}:a)
    if(!newAlts.some(a=>a.date===date)) newAlts.push({date, dayName:getDayNameAr(date), selfService:true, notes:'', createdAt:new Date().toISOString()})
    saveAltDays(newAlts); setRefresh(x=>x+1)
  }
  const handleSaveNotes=(notes)=>{
    const date=notesDialog.date
    if(!date) return
    let newAlts=altDays.map(a=>a.date===date?{...a,notes}:a)
    if(!newAlts.some(a=>a.date===date)) newAlts.push({date, dayName:getDayNameAr(date), selfService:false, notes, createdAt:new Date().toISOString()})
    saveAltDays(newAlts); setRefresh(x=>x+1)
    setNotesDialog({ open:false, date:null })
  }

  // v12.5.1: تطبيق الفلتر + الترتيب على العرض فقط (الملخص يفضل شامل)
  const visibleAlt = displayAlt
    .filter(a=> altFilter==='pending' ? !a.selfService : altFilter==='due' ? !!a.selfService : true)
    .sort((a,b)=> altSortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  // v12.4.15 — مستخدم = بدل الراحة اللي مسدد بـ فيها قيمة | الباقي = مستحق − مستخدم (التعديل 23: من المشترك)
  const eligibleCount = altYearData.eligibleCount
  const usedAltCount = altYearData.usedCount
  const remainingAltCount = altYearData.remainingCount

  return (
    <div className="px-4 pt-2 pb-20 space-y-2 page-alt">
      <div className="bg-gradient-to-br from-teal-700 to-cyan-600 rounded-2xl p-3 text-white mt-4 hd-alt">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">📅 الأيام البديلة</h1>
          {/* التعديل ١ نقطة 5: خانة السنة — الجدول والخانات حسب السنة */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl px-2 py-1 w-fit">
            <button onClick={()=>setVYear(vYear-1)} className="text-slate-600 text-sm px-1 font-bold" title="السنة اللي قبلها">▶</button>
            <span className="text-sm font-bold text-slate-600">{vYear}</span>
            <button onClick={()=>setVYear(vYear+1)} disabled={vYear>=new Date().getFullYear()} className={`text-sm px-1 font-bold ${vYear>=new Date().getFullYear() ? 'text-slate-300' : 'text-slate-600'}`} title="السنة اللي بعدها">◀</button>
          </div>
        </div>
      </div>
      <div>
        <div onClick={()=>setShowAllAltBoxes(!showAllAltBoxes)} className="grid grid-cols-2 gap-1 cursor-pointer">
          <div className="card bg-white border-cyan-300" style={{padding:'5px'}}>
            <div className="flex items-center justify-between">
              <div className="text-right">
                <div className="text-xs text-cyan-700 font-extrabold">مستحق</div>
                <div className="text-xs text-cyan-600">يوم</div>
              </div>
              <div className="text-lg font-black text-cyan-700">{eligibleCount}</div>
            </div>
          </div>
          <div className="card bg-white border-green-300" style={{padding:'5px'}}>
            <div className="flex items-center justify-between">
              <div className="text-right">
                <div className="text-xs text-green-700 font-extrabold">الباقي</div>
                <div className="text-xs text-green-600">متبقي</div>
              </div>
              <div className="text-lg font-black text-green-700">{remainingAltCount}</div>
            </div>
          </div>
          {showAllAltBoxes && (
          <>
          <div className="card bg-white border-slate-300" style={{padding:'5px'}}>
            <div className="flex items-center justify-between">
              <div className="text-right">
                <div className="text-xs text-slate-600 font-extrabold">الإجمالي</div>
                <div className="text-xs text-slate-500">يوم</div>
              </div>
              <div className="text-lg font-black text-slate-700">{displayAlt.length}</div>
            </div>
          </div>
          <div className="card bg-white border-amber-300" style={{padding:'5px'}}>
            <div className="flex items-center justify-between">
              <div className="text-right">
                <div className="text-xs text-amber-700 font-extrabold">مستخدم</div>
                <div className="text-xs text-amber-600">مسدد بـ</div>
              </div>
              <div className="text-lg font-black text-amber-700">{usedAltCount}</div>
            </div>
          </div>
          </>
          )}
        </div>
        {/* تعديل ٢: سطر العرض/الطي زي التصاريح */}
        {!showAllAltBoxes && <div onClick={()=>setShowAllAltBoxes(true)} className="text-center text-xs text-slate-400 py-1 mt-1 cursor-pointer">اضغط لعرض باقي الأنواع ▼</div>}
        {showAllAltBoxes && <div onClick={()=>setShowAllAltBoxes(false)} className="text-center text-xs text-slate-400 py-1 mt-1 cursor-pointer">اضغط للطي ▲</div>}
      </div>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-slate-800">📅 الأيام البديلة المستحقة</h3>
          <div className="flex items-center gap-1">
            <div className="relative" ref={altFilterRef}>
              <button onClick={()=>setAltFilterOpen(!altFilterOpen)} className="sortfilter px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center gap-1 text-xs font-bold whitespace-nowrap shrink-0">🔍 الفلتر ▼</button>
              {altFilterOpen && (
                <div className="absolute top-9 left-0 bg-white border rounded-xl shadow-lg p-3 w-40 max-w-[70vw] z-10">
                  {[{v:'all',label:'الكل'},{v:'pending',label:'المعلقة'},{v:'due',label:'المستحقة'}].map(o=>(
                    <button key={o.v} onClick={()=>{ setAltFilter(o.v); setAltFilterOpen(false) }} className={`w-full text-right px-2 py-1.5 rounded-lg text-sm font-bold ${altFilter===o.v ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}>{altFilter===o.v ? '✅ ' : ''}{o.label}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={()=>setAltSortDesc(!altSortDesc)} className="sortfilter text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-full px-2 py-1.5 whitespace-nowrap shrink-0">{altSortDesc?'⬇️ الأحدث':'⬆️ الأقدم'}</button>
          </div>
        </div>
        {visibleAlt.length===0 ? <p className="text-sm text-slate-400 text-center py-4">لا يوجد أيام بديلة بعد — سجل حضور + يضاف للأيام البديلة + وردية و≥6س</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs ctable">
              <thead><tr className="bg-slate-700 text-white"><th className="p-2 text-right">التاريخ</th><th className="p-2">الساعات</th><th className="p-2">حالة اليوم</th><th className="p-2">خدمة ذاتية</th><th className="p-2">ملاحظات</th></tr></thead>
              <tbody>
                {visibleAlt.map((a,aidx)=>(
                  <tr key={a.date} className={`border-t ct-${aidx%2?'odd':'even'} ${aidx%2?'bg-slate-100':''}`}>
                    <td className="p-2 text-right"><div className="font-bold">{a.dayName}</div><div className="font-mono text-xs text-slate-500">{formatDateAr(a.date)}</div></td>
                    <td className="p-2 text-center text-xs">{a.hrs!=null? formatHours(a.hrs): (a.calc? formatHours(a.calc.displayHours??a.calc.totalHours): '—')}</td>
                    <td className="p-2 text-center"><div className="flex flex-col items-center leading-tight"><span>{a.selfService ? '✅' : '⏳'}</span><span className="text-xs text-black">{a.selfService ? 'مستحق' : 'معلق'}</span></div></td>
                    <td className="p-2 text-center"><input type="checkbox" checked={!!a.selfService} onChange={()=>request('alt','🔄 تعديل يوم بديل',()=>toggleAltSelf(a.date))} className="w-5 h-5" /></td>
                    <td className="p-2 text-center">
                      <button onClick={()=>request('alt','📝 ملاحظات البديل',()=>setNotesDialog({ open:true, date:a.date }))} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 font-bold">
                        {a.notes ? '📝' : '➕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <PinGate open={gate.open} title={gate.title} onSuccess={handleSuccess} onClose={handleClose} />
      <NotesDialog open={notesDialog.open} initialNote={notesDialog.date ? (displayAlt.find(x=>x.date===notesDialog.date)?.notes || altDays.find(x=>x.date===notesDialog.date)?.notes || '') : ''} onSave={handleSaveNotes} onDelete={()=>handleSaveNotes('')} onClose={()=>setNotesDialog({ open:false, date:null })} />
    </div>
  )
}
