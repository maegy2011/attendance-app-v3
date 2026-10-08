import { useState, useEffect } from 'react'
import { getSettings } from '../utils/storage'
import { verifyPin, hashAndStorePin, pinExists, isMaster, normDigits } from '../utils/pinCrypto'
import { version as APP_VERSION } from '../../package.json'

// التعديل ٩: تحقق hash (غير متزامن) + "نسيت الرمز؟" بالماستر (رقم الإصدار)
export default function PinLock({ onUnlock }) {
  const [input, setInput] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mode, setMode] = useState('enter') // enter | master | reset
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [busy, setBusy] = useState(false)
  // تعديل ٥: قفل فتح البرنامج يُتحكم فيه من مربع (فتح البرنامج) في القايمة
  const enabled = (() => {
    try {
      const s = getSettings()
      if (!s.pinEnabled || !pinExists()) return false
      return ((s.pinAreas || {}).app !== false)
    } catch { return false }
  })()

  useEffect(() => {
    if (!enabled) { onUnlock(); return }
    setReady(true)
  }, [enabled])

  if (!enabled || !ready) return null

  const flashErr = () => { setError(true); setTimeout(() => setError(false), 1000) }

  const handleSubmit = async () => {
    if (Date.now() < lockedUntil || busy) { setError(true); return }
    if (mode === 'master') {
      if (isMaster(input, APP_VERSION)) {
        setInput(''); setConfirm(''); setError(false); setAttempts(0); setMode('reset')
      } else {
        const n = attempts + 1
        setAttempts(n); setInput(''); flashErr()
        if (n >= 3) setLockedUntil(Date.now() + 30000)
      }
      return
    }
    if (mode === 'reset') {
      const a = normDigits(input), b = normDigits(confirm)
      if (a.length < 4 || a !== b) { flashErr(); return }
      setBusy(true)
      try { await hashAndStorePin(a) } catch { setBusy(false); flashErr(); return }
      setBusy(false)
      setAttempts(0); onUnlock()
      return
    }
    if (normDigits(input).length < 4) { flashErr(); return }
    setBusy(true)
    let ok = false
    try { ok = await verifyPin(normDigits(input)) } catch {}
    setBusy(false)
    if (ok) { setAttempts(0); onUnlock() }
    else {
      const n = attempts + 1
      setAttempts(n); setError(true); setInput('')
      setTimeout(() => setError(false), 1000)
      if (n >= 3) setLockedUntil(Date.now() + 30000)
    }
  }

  return (
    <div className="dialog-overlay" style={{ zIndex: 9999, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="dialog-box text-center bg-white rounded-2xl p-6 w-[90%] max-w-sm shadow-2xl">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          {mode === 'master' ? '🔑 إدخال الماستر' : mode === 'reset' ? '✏️ تعيين رمز جديد' : 'التطبيق محمي'}
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          {mode === 'master' ? '🔑 أدخل الماستر' : mode === 'reset' ? 'أدخل الرمز الجديد مرتين' : 'أدخل رمز الدخول للمتابعة'} // التعديل ٧: بلا تلميح — القاعدة سرية
        </p>
        <input type="password" inputMode="numeric" maxLength={6} value={input}
          onChange={e => setInput(normDigits(e.target.value))}
          className={`w-full p-4 text-center text-2xl font-bold border-2 rounded-xl mb-3 outline-none tracking-[0.3em] ${error ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-500'}`}
          placeholder="••••" dir="ltr" autoFocus
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        {mode === 'reset' && (
          <input type="password" inputMode="numeric" maxLength={6} value={confirm}
            onChange={e => setConfirm(normDigits(e.target.value))}
            className="w-full p-4 text-center text-2xl font-bold border-2 rounded-xl mb-3 outline-none tracking-[0.3em] border-slate-200 focus:border-blue-500"
            placeholder="•••• تأكيد" dir="ltr"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        )}
        {error && <p className="text-red-500 text-sm font-bold mb-2 animate-pulse">{Date.now() < lockedUntil ? '⏳ حاول بعد 30 ثانية' : 'الرمز خاطئ — حاول تاني'}</p>}
        <button onClick={handleSubmit} disabled={busy} className="btn btn-primary w-full py-3 text-base font-extrabold">دخول</button>
        {mode === 'enter'
          ? <button onClick={() => { setMode('master'); setInput(''); setError(false) }} className="text-xs text-blue-600 font-bold mt-3">نسيت الرمز؟</button>
          : <button onClick={() => { setMode('enter'); setInput(''); setConfirm(''); setError(false) }} className="text-xs text-slate-400 font-bold mt-3">رجوع</button>}
      </div>
    </div>
  )
}
