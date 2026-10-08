export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmText = 'تأكيد', danger = false }) {
  if (!open) return null
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box text-center" onClick={e => e.stopPropagation()}>
        <div className="text-3xl mb-2">⚠️</div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-outline flex-1">إلغاء</button>
          <button onClick={onConfirm} className={`flex-1 font-bold py-2 px-4 rounded-lg text-white transition-all ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}
