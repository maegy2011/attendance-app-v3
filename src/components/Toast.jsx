import { useAttendance } from '../contexts/AttendanceContext'
export default function Toast() {
  const { toast } = useAttendance()
  if (!toast) return null
  return (
    <div className="toast-container">
      <div className="toast">{toast}</div>
    </div>
  )
}