import { useState } from 'react'
import { useAttendance } from '../contexts/AttendanceContext'
import { formatDateAr, getDayNameAr } from '../utils/calendar'

const dayTypes = [
  { key: 'overtime', label: 'إضافة', icon: '➕', desc: 'يوم عمل إضافي' },
  { key: 'rest_day', label: 'بدل راحة', icon: '😴', desc: 'يوم إجازة (بدل راحة)' },
  { key: 'regular_vacation', label: 'إجازة اعتيادية', icon: '🏖️', desc: 'إجازة مدفوعة الأجر' },
  { key: 'alt_day', label: 'يضاف إلى الأيام البديلة', icon: '📅', desc: 'شغل فعلي — بدل راحة بحد أدنى 6 ساعات' },
  { key: 'overtime_holiday', label: 'إضافي عطلة رسمية', icon: '🎌', desc: 'يحتسب مثل يوم الجمعة' },
]

export default function DayTypeDialog() {
  const { dayTypeDialog, closeDayTypeDialog, setDayTypeForDate } = useAttendance()
  const [selected, setSelected] = useState(null)
  if (!dayTypeDialog.open || !dayTypeDialog.date) return null
  const date = dayTypeDialog.date

  const handleConfirm = () => {
    if (!selected) return
    setDayTypeForDate(date, selected)
    setSelected(null)
    closeDayTypeDialog()
  }

  return (
    <div className="dialog-overlay" onClick={closeDayTypeDialog}>
      <div className="dialog-box" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">📅</div>
          <h3 className="text-lg font-bold text-slate-800">{getDayNameAr(date)} — {formatDateAr(date)}</h3>
        </div>
        <div className="space-y-2 mb-4">
          {dayTypes.map(type => (
            <button key={type.key} onClick={() => setSelected(type.key)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selected === type.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <span className="text-2xl">{type.icon}</span>
              <div className="text-right">
                <span className="font-bold text-slate-800 block">{type.label}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={closeDayTypeDialog} className="btn btn-outline flex-1">إلغاء</button>
          <button onClick={handleConfirm} disabled={!selected} className={`btn flex-1 ${selected ? 'btn-primary' : 'bg-slate-200 text-slate-400'}`}>تأكيد</button>
        </div>
      </div>
    </div>
  )
}