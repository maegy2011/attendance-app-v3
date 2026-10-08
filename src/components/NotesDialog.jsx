import { useState, useEffect } from 'react'
export default function NotesDialog({ open, onClose, onSave, initialNote = '', onDelete }) {
  const [note, setNote] = useState('')
  useEffect(() => { if (open) setNote(initialNote) }, [open, initialNote])
  if (!open) return null
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">📝</div>
          <h3 className="text-lg font-bold text-slate-800">ملاحظات</h3>
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="اكتب ملاحظتك..."
          className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm resize-none focus:border-blue-500 outline-none" rows={4} dir="auto" />
        <div className="flex gap-2 mt-4">
          {onDelete && initialNote && (
            <button onClick={() => { onDelete(); onClose() }} className="flex-1 font-bold py-2 px-4 rounded-lg text-white bg-red-500 hover:bg-red-600">🗑️ حذف</button>
          )}
          <button onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
          <button onClick={() => { onSave(note); onClose() }} className="btn btn-primary flex-1">💾 حفظ</button>
        </div>
      </div>
    </div>
  )
}