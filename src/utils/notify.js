import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// التراك الموحد — قناتان ثابتتان: حضور/انصراف (عالية) + عامة (متوسطة)
// تنشأ مرة واحدة قبل أي schedule عشان أندرويد 8+ ميرميش في السايلنت
export const CH_ATTENDANCE = 'attendance-reminders'
export const CH_GENERAL = 'general'
let _channelsOk = false
export async function ensureChannels(muted = false) {
  if (!Capacitor.isNativePlatform()) return
  const key = muted ? 'muted' : 'normal'
  if (_channelsOk === key) return
  try {
    // v12.10.21 — الكتم الكامل: نمسح القنوات ونعيد إنشاءها بأهمية دنيا (صامتة ومستخبية) أو طبيعية
    try { await LocalNotifications.deleteChannel({ id: CH_ATTENDANCE }) } catch {}
    try { await LocalNotifications.deleteChannel({ id: CH_GENERAL }) } catch {}
    await LocalNotifications.createChannel({
      id: CH_ATTENDANCE, name: 'تذكيرات الحضور والانصراف',
      description: 'تنبيهات الحضور والانصراف في مواعيدها',
      importance: muted ? 2 : 5, vibration: !muted, sound: muted ? null : 'default',
    })
    await LocalNotifications.createChannel({
      id: CH_GENERAL, name: 'تنبيهات عامة',
      description: 'إجازات وبديلة وإحصائيات وتخطيط',
      importance: muted ? 2 : 4, vibration: !muted, sound: muted ? null : 'default',
    })
    _channelsOk = key
  } catch (e) { console.warn('createChannel failed', e?.message) }
}

// v12.10.21 — زرار الكتم/الإظهار من كارت الحماية: يعيد بناء القنوات بالوضع المطلوب
// ملحوظة بأمانة: الكتم البرمجي = أهمية دنيا (صامتة تحت)، والكتم الكامل من إعدادات الموبايل بدوسة طويلة
export async function setChannelsMuted(muted) {
  _channelsOk = false
  await ensureChannels(muted)
}

// v12.4.12 — نظام الإشعارات 7 بنود (IDs بعيدة عن المجدول)
// v12.11: كل اللحظي بمفتاح واحد «الإشعارات اللحظية» (notifInstant) + الظهور بعد ثانيتين
export async function fireInstant(title, body, extra = {}) {
  if (!Capacitor.isNativePlatform()) return
  try {
    let on = true
    try {
      const { getSettings } = await import('./storage.js')
      const s = getSettings() || {}
      on = s.notifInstant !== false
    } catch {}
    if (!on) return
    await LocalNotifications.schedule({
      notifications: [{
        id: 150000000 + Math.floor(Math.random() * 50000000),
        title, body, extra, channelId: CH_GENERAL,
        schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
      }],
    })
  } catch (e) { console.warn('fireInstant failed', e?.message) }
}

export function getB(s, n) {
  // beta: يطبق على الجميع — الافتراضي true لو المفتاح مش موجود
  if (s == null) return true
  const v = s['notifB' + n]
  if (v === undefined) return s.notificationsEnabled !== false
  return !!v
}

export function parseHM(t) {
  if (!t || typeof t !== 'string') return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

// v12.4.15 — وزن التأخير اليومي: 0-15→0 | 16-30→1 | 31-45→2 | فوق 45→0 (+تنبيه إذن)
export function delayWeight(min) {
  if (min == null) return 0
  if (min <= 15) return 0
  if (min <= 30) return 1
  if (min <= 45) return 2
  return 0
}

// عدد التأخيرات السنوية: مجموع مرجح (اليوم = 0/1/2)
export function countAnnualDelays(records, settings) {
  const year = String(new Date().getFullYear())
  let c = 0
  for (const [dk, rec] of Object.entries(records || {})) {
    if (!dk.startsWith(year)) continue
    if (!rec?.checkIn) continue
    const shiftKey = rec.shift || rec.dayType || 'shift1'
    const sh = (settings[shiftKey]?.start || settings.shift1?.start || '08:00')
    const sMin = parseHM(sh)
    if (sMin == null) continue
    const d = new Date(rec.checkIn)
    const cMin = d.getHours() * 60 + d.getMinutes()
    if (cMin - sMin > 15) c += delayWeight(cMin - sMin)
  }
  return c
}

// تأخير اليوم بالدقائق (null لو مفيش تأخير)
export function todayDelayMin(rec, settings) {
  if (!rec?.checkIn) return null
  const shiftKey = rec.shift || rec.dayType || 'shift1'
  const sh = (settings[shiftKey]?.start || settings.shift1?.start || '08:00')
  const sMin = parseHM(sh)
  if (sMin == null) return null
  const d = new Date(rec.checkIn)
  const cMin = d.getHours() * 60 + d.getMinutes()
  const diff = cMin - sMin
  return diff > 0 ? diff : 0
}
