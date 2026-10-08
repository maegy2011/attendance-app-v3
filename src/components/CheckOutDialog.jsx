import { useState, useEffect } from 'react'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// شاشة تسجيل/تعديل الانصراف
// - حقل التاريخ بيظهر تلقائيًا لو الوقت المدخل قبل وقت الحضور (يعني بعد منتصف الليل)
// - أو لو الوردية تانية (showDate) — المستخدم يقدر يعدل التاريخ يدويًا
export default function CheckOutDialog({ open, onClose, onSave, title = 'تسجيل الانصراف', currentTime, currentDate, checkInTime, showDate, hasTime, onDelete }) {
  const [time, setTime] = useState(currentTime || '00:00')
  const [date, setDate] = useState(currentDate || todayKey())
  const [confirming, setConfirming] = useState(false)
  const [savedTime, setSavedTime] = useState(currentTime || '00:00')
  const [savedDate, setSavedDate] = useState(currentDate || todayKey())

  useEffect(() => {
    if (open) {
      const t = currentTime || '00:00'
      const d = currentDate || todayKey()
      setTime(t); setDate(d)
      setSavedTime(t); setSavedDate(d)
      setConfirming(false)
    }
  }, [open, currentTime, currentDate])

  if (!open) return null

  // حقل التاريخ بيظهر للوردية التانية بس (showDate) — مش لأي وردية تانية بعد منتصف الليل
  const needDate = showDate

  const handleSave = () => {
    if (!confirming) { setConfirming(true); return }
    const success = onSave(time, needDate ? date : undefined)
    if (success !== false) onClose()
  }

  const handleRestore = () => {
    setTime(savedTime); setDate(savedDate); setConfirming(false)
  }

  const changed = time !== savedTime || (needDate && date !== savedDate)

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-center mb-4">{title}</h3>
        <input type="time" value={time} onChange={e => { setTime(e.target.value); setConfirming(false) }}
          className="w-full p-3 text-center text-xl font-bold border-2 border-blue-200 rounded-xl focus:border-blue-500 outline-none mb-4" dir="ltr" />

        {needDate ? (
          <div className="mb-4">
            <label className="block text-sm font-bold text-slate-500 mb-1 text-center">📅 تاريخ الانصراف</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setConfirming(false) }}
              className="w-full p-3 text-center text-lg font-bold border-2 border-indigo-200 bg-indigo-50 rounded-xl focus:border-indigo-500 outline-none" dir="ltr" />
            <p className="text-xs text-amber-600 mt-2 text-center">الانصراف بعد منتصف الليل — التاريخ مختلف عن يوم الحضور</p>
          </div>
        ) : null}

        {confirming && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-center">
            <p className="text-amber-700 font-bold text-sm">⚠️ هل تريد حفظ البيانات؟</p>
            <p className="text-amber-600 text-xs mt-1">{needDate ? `${date} — ${time}` : time}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
          {hasTime && changed && (
            <button onClick={handleRestore} className="flex-1 font-bold py-2 px-4 rounded-lg text-white bg-amber-500 hover:bg-amber-600">↩️ استعادة</button>
          )}
          {onDelete && hasTime && (
            <button onClick={() => { onDelete(); onClose() }} className="flex-1 font-bold py-2 px-4 rounded-lg text-white bg-red-500 hover:bg-red-600">🗑️ حذف</button>
          )}
          <button onClick={handleSave} className={`btn flex-1 ${confirming ? 'bg-green-600 hover:bg-green-700 text-white' : 'btn-primary'}`}>
            {confirming ? '✅ تأكيد' : (hasTime ? '💾 حفظ' : '✅ تسجيل')}
          </button>
        </div>
      </div>
    </div>
  )
}