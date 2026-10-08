import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// v12.11.3 — مستمع ضغطة الإشعارات: كل إشعار يودّي على صفحته (extra.route)
// الضغطة على أي إشعار تفتح البرنامج افتراضيًا — ده يكمّلها بالتنقل للصفحة الصح
export default function NotifTap() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle = null
    try {
      handle = LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
        try {
          const n = ev?.notification || {}
          const ex = n.extra || {}
          if (ex.route) {
            setTimeout(() => { try { navigate(ex.route) } catch {} }, 600)
          }
        } catch {}
      })
    } catch {}
    return () => { try { handle && handle.remove && handle.remove() } catch {} }
  }, [navigate])
  return null
}
