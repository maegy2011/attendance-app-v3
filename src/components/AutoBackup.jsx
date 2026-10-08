import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { backupAll } from '../utils/storage'
import { fireInstant } from '../utils/notify'
import { version as APP_VERSION } from '../../package.json'

// v12.4.12 — بند 7: نسخ يومي عند أول فتحة بعد 01:00 + حذف >شهرين + لحظي بدون مفتاح (شغال دايمًا)
// تعديل ٧: التوحيد مع اليدوي — الكل في HR Assist/Backups (مجلد Overtime القديم اتهجر)
const FOLDER = 'HR Assist/Backups'
const DIR = Directory.Documents
const FLAG = 'lastAutoBackup'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tsName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}

async function doBackup() {
  const data = backupAll()
  const jsonStr = JSON.stringify(data)
  const fileName = `HRassist-auto-v${APP_VERSION}-${tsName()}.json`
  try { await Filesystem.mkdir({ directory: DIR, path: FOLDER, recursive: true }) } catch {}
  await Filesystem.writeFile({ directory: DIR, path: `${FOLDER}/${fileName}`, data: jsonStr, encoding: Encoding.UTF8, recursive: true })
  // حذف النسخ اللي عدى عليها شهرين تلقائي
  try {
    const res = await Filesystem.readdir({ directory: DIR, path: FOLDER })
    const cutoff = Date.now() - 60 * 24 * 3600 * 1000
    for (const f of (res.files || [])) {
      try {
        if (!f.name.endsWith('.json')) continue
        const st = await Filesystem.stat({ directory: DIR, path: `${FOLDER}/${f.name}` })
        const mt = new Date(st.mtime || st.ctime || 0).getTime()
        if (mt && mt < cutoff) await Filesystem.deleteFile({ directory: DIR, path: `${FOLDER}/${f.name}` })
      } catch {}
    }
  } catch {}
  localStorage.setItem(FLAG, todayKey())
  try { await fireInstant('💾 تم تخزين نسخه احتياطيه بنجاح', fileName) } catch {}
}

export default function AutoBackup() {
  const done = useRef(false)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (done.current) return
    done.current = true
    const check = async () => {
      try {
        const last = localStorage.getItem(FLAG) || ''
        const now = new Date()
        if (last === todayKey()) return
        // beta: يطبق على الجميع — نسخ يومي 01:00 (لو الساعة عدت 1 أو للتجربة أول فتح)
        if (now.getHours() >= 1) await doBackup()
      } catch (e) { console.warn('auto backup', e?.message) }
    }
    check()
    const iv = setInterval(check, 15 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  return null
}
