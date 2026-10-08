// التعديل ١٣+١٤: حوار سؤال الواتساب المشترك (الرئيسية + السجلات)
export function WaAskDialog({ info, onNo, onYes }) {
  if (!info) return null
  const isAlt = info.kind === 'alt'
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onNo}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-extrabold text-slate-800 mb-2 text-center">
          {isAlt ? '📩 تحب تبعت تسجيل اليوم البديل على جروب الواتساب؟' : '📩 تحب تبعت طلب الإجازة على جروب الواتساب؟'}
        </h3>
        <div className="text-xs text-slate-500 mb-4 text-center">{info.sub || ''}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onNo} className="py-2 rounded-xl bg-slate-100 font-bold text-sm">لا</button>
          <button onClick={onYes} className="py-2 rounded-xl bg-green-600 text-white font-bold text-sm">واتساب ✅</button>
        </div>
      </div>
    </div>
  )
}
