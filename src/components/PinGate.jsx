import { useState } from 'react'
import { verifyPin, hashAndStorePin, isMaster, normDigits } from '../utils/pinCrypto'
import { version as APP_VERSION } from '../../package.json'

// v12.8.3 (بند ٣): بوابة رمز للعمليات الحساسة — نفس سلوك PinLock (3 محاولات غلط = قفل 30 ثانية)
// التعديل ٩: تحقق hash (غير متزامن) + "نسيت الرمز؟" بالماستر (رقم الإصدار) + تعيين جديد بتأكيد مزدوج
export default function PinGate({ open, title, onSuccess, onClose, allowForgot = true }) {
  const [input, setInput] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mode, setMode] = useState('enter') // enter | master | reset
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const locked = Date.now() < lockedUntil
  const flashErr = (msg) => { setError(msg); setTimeout(() => setError(''), 1500) }

  const handleSubmit = async () => {
    if (locked || busy) return
    if (mode === 'master') {
      if (isMaster(input, APP_VERSION)) {
        setInput(''); setConfirm(''); setError(''); setAttempts(0)
        setMode('reset')
      } else {
        const n = attempts + 1
        setAttempts(n); setInput('')
        flashErr('الماستر غير صحيح')
        if (n >= 3) setLockedUntil(Date.now() + 30000)
      }
      return
    }
    if (mode === 'reset') {
      const a = normDigits(input), b = normDigits(confirm)
      if (a.length < 4) { flashErr('الرمز 4-6 أرقام'); return }
      if (a !== b) { flashErr('الرمز والتأكيد غير متطابقين'); return }
      setBusy(true)
      try { await hashAndStorePin(a) } catch { setBusy(false); flashErr('⚠️ تعذر الحفظ — التشفير غير مدعوم'); return }
      setBusy(false)
      setInput(''); setConfirm(''); setError(''); setAttempts(0); setMode('enter')
      onSuccess()
      return
    }
    setBusy(true)
    let ok = false
    try { ok = await verifyPin(normDigits(input)) } catch {}
    setBusy(false)
    if (ok) {
      setInput(''); setAttempts(0); setError('')
      onSuccess()
    } else {
      const n = attempts + 1
      setAttempts(n); setError(''); setInput('')
      flashErr('الرمز خاطئ — حاول تاني')
      if (n >= 3) setLockedUntil(Date.now() + 30000)
    }
  }

  const resetModes = () => { setMode('enter'); setInput(''); setConfirm(''); setError('') }

  return (
    <div className="dialog-overlay" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="dialog-box text-center" onClick={e => e.stopPropagation()}>
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          {mode === 'master' ? '🔑 إدخال الماستر' : mode === 'reset' ? '✏️ تعيين رمز جديد' : (title || 'عملية محمية')}
        </h3>
        
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
        {error ? <p className="text-red-500 text-sm font-bold mb-2 animate-pulse">{locked ? '⏳ محاولات كتير — حاول بعد 30 ثانية' : error}</p> : null}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 font-bold text-sm">إلغاء</button>
          <button onClick={handleSubmit} disabled={busy} className="btn btn-primary flex-1 py-3 text-base font-extrabold">تأكيد</button>
        </div>
        {allowForgot && mode === 'enter' && (
          <button onClick={() => { setMode('master'); setInput(''); setError('') }} className="text-xs text-blue-600 font-bold mt-3">نسيت الرمز؟</button>
        )}
        {mode !== 'enter' && (
          <button onClick={resetModes} className="text-xs text-slate-400 font-bold mt-3">رجوع</button>
        )}
      </div>
    </div>
  )
}
