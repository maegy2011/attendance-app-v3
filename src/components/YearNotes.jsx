// v12.11.26 (8): popup ملاحظات السنة — كروت (تاريخ + ملاحظة) للأيام اللي فيها ملاحظات بس
import { useMemo, useState } from 'react'
import { getDayNameAr, formatDateAr } from '../utils/calendar'

export default function YearNotes({ records, onClose, onJump }) {
  const [newestFirst, setNewestFirst] = useState(true)
  const year = String(new Date().getFullYear())
  const items = useMemo(() => {
    const arr = Object.entries(records || {})
      .filter(([dk, r]) => dk.startsWith(year) && r && r.notes && String(r.notes).trim())
      .map(([dk, r]) => ({ dk, note: String(r.notes).trim() }))
    arr.sort((a, b) => newestFirst ? (a.dk < b.dk ? 1 : -1) : (a.dk > b.dk ? 1 : -1))
    return arr
  }, [records, newestFirst, year])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="card w-full max-w-md flex flex-col" style={{ padding: '14px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-700 mb-2 text-sm text-center">🗂️ ملاحظات {year} ({items.length})</h3>
        <button onClick={() => setNewestFirst(!newestFirst)}
          className="mb-2 py-2 text-xs font-extrabold rounded-xl bg-slate-200 text-slate-700">
          🔃 {newestFirst ? 'الأقدم أولًا' : 'الأحدث أولًا'}
        </button>
        <div className="flex-1 overflow-auto space-y-2">
          {items.length === 0 && <p className="text-center text-xs font-bold text-slate-400 py-6">لا توجد ملاحظات مسجلة هذه السنة</p>}
          {items.map(it => (
            <button key={it.dk} onClick={() => onJump(it.dk)}
              className="w-full text-right p-2 rounded-xl border-2 border-slate-200 bg-white">
              <div className="text-xs font-extrabold text-slate-700">📅 {getDayNameAr(it.dk)} — {formatDateAr(it.dk)}</div>
              <div className="text-xs font-bold text-slate-500 mt-0.5">{it.note}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-2 py-2.5 text-sm font-extrabold rounded-xl bg-slate-200 text-slate-700">إغلاق</button>
      </div>
    </div>
  )
}
