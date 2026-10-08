import { registerPlugin, Capacitor } from '@capacitor/core'

// v12.9.63: صلاحية "إدارة كل الملفات" — natively عبر StoragePermPlugin (Java)
// على أندرويد 11+ لازم الإذن يتفعّل من صفحة الإعدادات (المستخدم هو اللي بيحكم)
const StoragePerm = registerPlugin('StoragePerm')

export async function hasStoragePermission() {
  try {
    if (!Capacitor.isNativePlatform()) return true
    const r = await StoragePerm.isGranted()
    return !!(r && r.granted)
  } catch { return false }
}

export async function askStoragePermission() {
  try {
    if (!Capacitor.isNativePlatform()) return true
    await StoragePerm.request()
    return true
  } catch { return false }
}
