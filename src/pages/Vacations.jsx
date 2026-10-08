import { useMemo, useState, useRef, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { getLeavesV2, saveLeavesV2 } from '../utils/storage'
import { getDayNameAr, formatDateAr } from '../utils/vacationLogic'
import { getLeaveCounts } from '../utils/leaveCounts'
import { useAttendance } from '../contexts/AttendanceContext'
import { getAltDays } from '../utils/storage'
import NotesDialog from '../components/NotesDialog'
// التعديل ١٣: نفس باني الرسالة المشترك (بسطور الرصيد)
import { buildLeaveText, shareWa } from '../utils/waShare'
import PinGate from '../components/PinGate'
import { usePinArea } from '../hooks/usePinArea'

export default function Vacations(){
  const { settings } = useSettings()
  const { records, updateRecordFields } = useAttendance()
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
  const [filterTypes,setFilterTypes]=useState(['regular_vacation','rest_day','sick','unpaid','special'])
  // v12.5.1: زر ترتيب فقط — الافتراضي الأحدث→الأقدم
  const [sortDesc,setSortDesc]=useState(true)
  const [showAllBoxes,setShowAllBoxes]=useState(false)
  const [editDialog,setEditDialog]=useState({ open:false, id:null, type:'regular_vacation' })
  // التعديل ١٢: سؤال الواتساب بعد تأكيد الإجازة
  const [waAsk,setWaAsk]=useState(null)
  const LEAVE_LABELS = { regular_vacation:'إجازة اعتيادية', rest_day:'إجازة بدل راحة', sick:'إجازة مرضي', unpaid:'بدون أجر', special:'إجازة خاصة' }
  const shareLeaveWa = async (info) => {
    await shareWa('مطلوب تسجيل إجازة', buildLeaveText(info.id, info.type))
    setWaAsk(null)
  }
  const leaves=useMemo(()=>getLeavesV2(),[refresh])
  const altDays=getAltDays()

  // التعديل 23 نقطة 4: القايمة والعدادات من utils/leaveCounts (مصدر واحد للصفحة والسياق والكروت)
  // التعديل ١ نقطة 5: سنة العرض — الجدول والخانات حسب السنة المختارة
  const [vYear,setVYear]=useState(new Date().getFullYear())
  const leaveData=useMemo(()=>getLeaveCounts(records||{}, leaves, altDays, settings, vYear),[records, leaves, altDays, settings, refresh, vYear])
  const displayLeaves=leaveData.displayLeaves
  const annualTotal=leaveData.annualTotal
  const sickTotal=leaveData.sickTotal
  const altTotal=leaveData.alt.eligibleCount
  const restUsed=leaveData.restUsed
  const annualUsed=leaveData.annualUsed
  const sickUsed=leaveData.sickUsed
  const unpaidUsed=leaveData.unpaidUsed
  const annualRemaining=leaveData.annualRemaining
  const sickRemaining=leaveData.sickRemaining
  const specialCount=leaveData.specialCount

  const toggleLeaveSelf=(id)=>{
    const cur=getLeavesV2()
    let newLeaves=cur.map(l=>l.id===id?{...l,selfService:!l.selfService}:l)
    if(!newLeaves.some(l=>l.id===id)){
      const dl=displayLeaves.find(l=>l.id===id)
      if(dl) newLeaves.push({ id:dl.id, date:dl.date, type:dl.type, paidBy:dl.paidBy||null, selfService:true, notes:dl.notes||'' })
    }
    saveLeavesV2(newLeaves); setRefresh(x=>x+1)
  }
  const handleSaveNotes=(notes)=>{
    const id=notesDialog.id
    if(!id) return
    const cur=getLeavesV2()
    let newLeaves=cur.map(l=>l.id===id?{...l,notes}:l)
    if(!newLeaves.some(l=>l.id===id)){
      const dl=displayLeaves.find(l=>l.id===id)
      if(dl) newLeaves.push({ id:dl.id, date:dl.date, type:dl.type, paidBy:dl.paidBy||null, selfService:!!dl.selfService, notes })
    }
    saveLeavesV2(newLeaves); setRefresh(x=>x+1)
    setNotesDialog({ open:false, id:null })
  }

  const handleDeleteLeave=(id)=>{
    if(!confirm('حذف هذه الإجازة؟ سيتم إرجاع اليوم إلى حضور + إضافي أسبوعي عادي + لا يوجد تكليف')) return
    // 1. حذف من جدول الإجازات
    const cur=getLeavesV2().filter(l=>l.id!==id)
    saveLeavesV2(cur)
    // 2. مسح تلقائي من سجلات الحضور
    try{
      updateRecordFields(id, { dayCalculation:'', dayType:'', shift:'no_task', dayStatus:'normal_day', specialLabel:'' })
    }catch(e){ console.error(e) }
    setRefresh(x=>x+1)
  }
  // v12.8.3 (بند ٣): تعديلات الإجازات تتطلب الرمز — مرة واحدة لكل جلسة
  const { gate, request, handleSuccess, handleClose } = usePinArea()
  const openEdit=(l)=>{
    request('vac', '🏖️ تعديل إجازة', ()=>setEditDialog({ open:true, id:l.id, type:l.type }))
  }
  const handleEditSave=()=>{
    const id=editDialog.id
    const newType=editDialog.type
    if(!id || !newType) return
    // تحديث الإجازة في leavesV2
    const cur=getLeavesV2()
    let idx=cur.findIndex(x=>x.id===id)
    if(idx>=0){ cur[idx]={ ...cur[idx], type:newType }; saveLeavesV2(cur) }
    else { cur.push({ id, date:id, type:newType, selfService:false, notes:'' }); saveLeavesV2(cur) }
    // تحديث سجل الحضور
    try{ updateRecordFields(id, { dayCalculation:newType, dayType:newType }) }catch{}
    setEditDialog({ open:false, id:null, type:'regular_vacation' })
    // التعديل ١٢: بعد التأكيد اسأل عن الإرسال على جروب الواتساب
    setWaAsk({ id, type:newType })
    setRefresh(x=>x+1)
  }

  const sortedLeaves = [...displayLeaves].sort((a,b)=> sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
  const filteredLeaves = sortedLeaves.filter(l=> filterTypes.includes(l.type))

  const paidByCell=(l)=>{
    if(l.type==='rest_day') return l.paidBy ? formatDateAr(l.paidBy) : '—'
    if(l.type==='regular_vacation'){
      const idx = sortedLeaves.filter(x=>x.type==='regular_vacation').findIndex(x=>x.id===l.id)
      const rem = Math.max(0, annualTotal - idx - 1)
      return `متبقي ${rem} من ${annualTotal||'—'}`
    }
    if(l.type==='sick'){
      const idx = sortedLeaves.filter(x=>x.type==='sick').findIndex(x=>x.id===l.id)
      const rem = Math.max(0, sickTotal - idx - 1)
      return `متبقي ${rem} من ${sickTotal||'—'}`
    }
    if(l.type==='unpaid'){
      const idx = sortedLeaves.filter(x=>x.type==='unpaid').findIndex(x=>x.id===l.id)
      return `بدون أجر ${idx+1}`
    }
    if(l.type==='special'){
      const idx = sortedLeaves.filter(x=>x.type==='special').findIndex(x=>x.id===l.id)
      return `خاصة ${idx+1}`
    }
    return '—'
  }


  return (
    <div className="px-4 pt-2 pb-20 space-y-2 flex flex-col min-h-[80vh] page-vac">
      {/* هيدر الصفحة */}
      <div className="bg-gradient-to-br from-amber-600 to-amber-500 rounded-2xl p-3 text-white mt-4 hd-vac">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">🏖️ الإجازات السنوية</h1>
          {/* التعديل ١ نقطة 5: خانة السنة — الجدول والخانات حسب السنة */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl px-2 py-1 w-fit">
            <button onClick={()=>setVYear(vYear-1)} className="text-slate-600 text-sm px-1 font-bold" title="السنة اللي قبلها">▶</button>
            <span className="text-sm font-bold text-slate-600">{vYear}</span>
            <button onClick={()=>setVYear(vYear+1)} disabled={vYear>=new Date().getFullYear()} className={`text-sm px-1 font-bold ${vYear>=new Date().getFullYear() ? 'text-slate-300' : 'text-slate-600'}`} title="السنة اللي بعدها">◀</button>
          </div>
        </div>
      </div>

      {/* خانات الأرصدة — toggle على اللوحة */}
      <div onClick={()=>setShowAllBoxes(!showAllBoxes)} className="grid grid-cols-2 gap-1 cursor-pointer">
        <div className="card bg-white border-emerald-300" style={{padding:'5px'}}>
          <div className="flex items-center justify-between">
            <div className="text-right">
              <div className="text-xs text-emerald-700 font-extrabold">اعتيادي</div>
              <div className="text-xs text-emerald-600">{annualUsed} مستخدم</div>
            </div>
            <div className="text-lg font-black text-emerald-800">{annualRemaining} / {annualTotal||'—'}</div>
          </div>
        </div>
        <div className="card bg-white border-amber-300" style={{padding:'5px'}}>
          <div className="flex items-center justify-between">
            <div className="text-right">
              <div className="text-xs text-amber-700 font-extrabold">بديل</div>
              <div className="text-xs text-amber-600">{restUsed} مسدد</div>
            </div>
            <div className="text-lg font-black text-amber-800">{Math.max(0, altTotal - restUsed)} / {altTotal}</div>
          </div>
        </div>
        {showAllBoxes && (
          <>
            <div className="card bg-white border-sky-300" style={{padding:'5px'}}>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <div className="text-xs text-sky-700 font-extrabold">مرضي</div>
                  <div className="text-xs text-sky-600">{sickUsed} مستخدم</div>
                </div>
                <div className="text-lg font-black text-sky-800">{sickRemaining} / {sickTotal||'—'}</div>
              </div>
            </div>
            <div className="card bg-white border-slate-300" style={{padding:'5px'}}>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <div className="text-xs text-slate-600 font-extrabold">بدون أجر</div>
                  <div className="text-xs text-slate-500">مفتوحة</div>
                </div>
                <div className="text-lg font-black text-slate-700">{unpaidUsed}</div>
              </div>
            </div>
            <div className="card bg-white border-purple-300 col-span-2" style={{padding:'5px'}}>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <div className="text-xs text-purple-700 font-extrabold">خاصة ⭐</div>
                  <div className="text-xs text-purple-600">مسجلة</div>
                </div>
                <div className="text-lg font-black text-purple-800">{specialCount}</div>
              </div>
            </div>
          </>
        )}
      </div>
      {/* تعديل ٢: سطر العرض/الطي زي التصاريح */}
      {!showAllBoxes && <div onClick={()=>setShowAllBoxes(true)} className="text-center text-xs text-slate-400 py-1 mt-1 cursor-pointer">اضغط لعرض باقي الأنواع ▼</div>}
      {showAllBoxes && <div onClick={()=>setShowAllBoxes(false)} className="text-center text-xs text-slate-400 py-1 mt-1 cursor-pointer">اضغط للطي ▲</div>}

      {/* كارت الجدول — v12.1.12: الفلتر شمال العنوان + شيل التعليق + أعمدة محسّنة */}
      <div className="card flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-slate-800">🗓️ الإجازات السنوية</h3>
          <button onClick={()=>setSortDesc(!sortDesc)} className="sortfilter text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-full px-2 py-1.5">{sortDesc?'⬇️ الأحدث':'⬆️ الأقدم'}</button>
          <div className="relative" ref={filterRef}>
            <button onClick={()=>setFilterOpen(!filterOpen)} className="sortfilter px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center gap-1 text-xs font-bold">🔍 الفلتر ▼</button>
            {filterOpen && (
              <div className="absolute top-9 left-0 bg-white border rounded-xl shadow-lg p-3 w-48 max-w-[70vw] z-10">
                {[
                  {v:'regular_vacation',label:'اعتيادي'},
                  {v:'rest_day',label:'بدل راحة'},
                  {v:'sick',label:'مرضي'},
                  {v:'unpaid',label:'بدون أجر'},
                  {v:'special',label:'خاصة'},
                ].map(o=>(
                  <label key={o.v} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                    <input type="checkbox" checked={filterTypes.includes(o.v)} onChange={e=>{ if(e.target.checked) setFilterTypes([...filterTypes,o.v]); else setFilterTypes(filterTypes.filter(x=>x!==o.v)) }} className="w-4 h-4" />
                    {o.label}
                  </label>
                ))}
                <div className="flex gap-1 mt-2 pt-2 border-t">
                  <button onClick={()=>setFilterTypes(['regular_vacation','rest_day','sick','unpaid','special'])} className="flex-1 text-xs bg-blue-50 text-blue-700 rounded-lg py-1">الكل</button>
                  <button onClick={()=>setFilterTypes([])} className="flex-1 text-xs bg-slate-100 rounded-lg py-1">إلغاء</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {filteredLeaves.length===0 ? (
          <p className="text-sm text-slate-400 text-center py-8 flex-1 flex items-center justify-center">لا يوجد إجازات — سجل إجازة في السجلات</p>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs ctable">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="p-2 text-right w-[22%]">التاريخ</th>
                  <th className="p-2 w-[18%]">النوع</th>
                  <th className="p-2 w-[18%]">مسددة بـ</th>
                  <th className="p-2 w-[10%]">ذاتية</th>
                  <th className="p-2 w-[10%]">ملاحظات</th>
                  <th className="p-2 w-[11%]">تعديل</th>
                  <th className="p-2 w-[11%]">حذف</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaves.map((l,idx)=>{
                  const isRed=l.type==='sick'||l.type==='unpaid'
                  const typeLabelNode = l.type==='special'
                    ? <><div>إجازة خاصة</div><div className="text-xs text-purple-600">{l.specialLabel||''}</div></>
                    : (l.type==='regular_vacation'?'اعتيادي':l.type==='rest_day'?'بدل راحة':l.type==='sick'?'مرضي':'بدون أجر')
                  return (
                    <tr key={l.id} className={`border-t ct-${idx%2?'odd':'even'} ${idx%2?'bg-slate-100':''}`}>
                      <td className={`p-2 font-mono text-xs ${isRed?'text-red-700 font-bold':''}`}>{formatDateAr(l.date)}<div className="text-xs text-slate-400">{getDayNameAr(l.date)}</div></td>
                      <td className={`p-2 ${isRed?'text-red-600 font-extrabold':''}`}>{typeLabelNode}</td>
                      <td className="p-2 text-xs font-mono">{paidByCell(l)}</td>
                      <td className="p-2 text-center"><input type="checkbox" checked={!!l.selfService} onChange={()=>request('vac','🏖️ تعديل إجازة',()=>toggleLeaveSelf(l.id))} className="w-5 h-5" /></td>
                      <td className="p-2 text-center">
                        <button onClick={()=>request('vac','📝 ملاحظات الإجازة',()=>setNotesDialog({ open:true, id:l.id }))} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 font-bold">
                          {l.notes ? '📝' : '➕'}
                        </button>
                      </td>
                      <td className="p-2 text-center"><button onClick={()=>openEdit(l)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-2 py-1 font-bold">✏️</button></td>
                      <td className="p-2 text-center"><button onClick={()=>request('vac','🗑️ حذف إجازة',()=>handleDeleteLeave(l.id))} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg px-2 py-1 font-bold">🗑️</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog تعديل نوع الإجازة */}
      {editDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setEditDialog({open:false,id:null,type:'regular_vacation'})}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="font-extrabold text-slate-800 mb-3">✏️ تعديل الإجازة — {formatDateAr(editDialog.id)}</h3>
            <div className="text-xs text-slate-400 mb-2">{getDayNameAr(editDialog.id)}</div>
            <select value={editDialog.type} onChange={e=>setEditDialog({...editDialog,type:e.target.value})} className="w-full border-2 border-slate-200 rounded-xl p-3 font-bold text-sm">
              <option value="regular_vacation">اعتيادي</option>
              <option value="rest_day">بدل راحة</option>
              <option value="sick">مرضي</option>
              <option value="unpaid">بدون أجر</option>
              <option value="special">خاصة</option>
            </select>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={()=>setEditDialog({open:false,id:null,type:'regular_vacation'})} className="py-2 rounded-xl bg-slate-100 font-bold text-sm">إلغاء</button>
              <button onClick={handleEditSave} className="py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}
      {/* التعديل ١٢: سؤال الإرسال على جروب الواتساب بعد تأكيد الإجازة */}
      {waAsk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setWaAsk(null)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="font-extrabold text-slate-800 mb-2 text-center">📩 تحب تبعت طلب الإجازة على جروب الواتساب؟</h3>
            <div className="text-xs text-slate-500 mb-4 text-center">{LEAVE_LABELS[waAsk.type] || waAsk.type} — {formatDateAr(waAsk.id)}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>setWaAsk(null)} className="py-2 rounded-xl bg-slate-100 font-bold text-sm">لا</button>
              <button onClick={()=>shareLeaveWa(waAsk)} className="py-2 rounded-xl bg-green-600 text-white font-bold text-sm">واتساب ✅</button>
            </div>
          </div>
        </div>
      )}
      <PinGate open={gate.open} title={gate.title} onSuccess={handleSuccess} onClose={handleClose} />
      <NotesDialog open={notesDialog.open} initialNote={notesDialog.id ? (displayLeaves.find(x=>x.id===notesDialog.id)?.notes || '') : ''} onSave={handleSaveNotes} onDelete={()=>handleSaveNotes('')} onClose={()=>setNotesDialog({ open:false, id:null })} />
    </div>
  )
}
