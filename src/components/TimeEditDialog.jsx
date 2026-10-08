import { useState, useEffect } from 'react'
export default function TimeEditDialog({ open, onClose, onSave, title, currentTime, onDelete, hasTime }) {
  const [time, setTime] = useState(currentTime || '08:00')
  const [savedTime, setSavedTime] = useState(currentTime || '08:00')
  const [confirming, setConfirming] = useState(false)
  
  useEffect(() => { 
    if (open) {
      const initial = currentTime || '08:00'
      setTime(initial)
      setSavedTime(initial)
      setConfirming(false)
    }
  }, [open, currentTime])
  
  if (!open) return null
  
  const handleSave = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    const success = onSave(time)
    if (success !== false) onClose()
  }
  
  const handleRestore = () => {
    setTime(savedTime)
    setConfirming(false)
  }
  
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-center mb-4">{title}</h3>
        <input type="time" value={time} onChange={e => { setTime(e.target.value); setConfirming(false) }}
          className="w-full p-3 text-center text-xl font-bold border-2 border-blue-200 rounded-xl focus:border-blue-500 outline-none mb-4" dir="ltr" />
        
        {confirming && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-center">
            <p className="text-amber-700 font-bold text-sm">⚠️ هل تريد حفظ التعديل؟</p>
            <p className="text-amber-600 text-xs mt-1">من {savedTime} إلى {time}</p>
          </div>
        )}
        
        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
          {hasTime && time !== savedTime && (
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
