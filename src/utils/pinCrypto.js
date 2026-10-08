// التعديل ٧+٩: تشفير النسخ + hash الرمز (WebCrypto — بدون مكتبات)
const te = (s) => new TextEncoder().encode(s)
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const unhex = (h) => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)))
const b64e = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const b64d = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

export const subtleOK = () => { try { return !!(window.crypto && window.crypto.subtle) } catch { return false } }

// التعديل ١٠: تطبيع الأرقام (عربي ٠-٩ + فارسي ۰-۹ → ASCII) قبل أي معالجة للرمز
const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹'
export function normDigits(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
    .replace(/\D/g, '')
}

// حالة مخزن الرمز: hash | plain | none (لبطاقة التشخيص)
export function pinStoreState() {
  try {
    if (localStorage.getItem('att_pin_hash')) return 'hash'
    if (localStorage.getItem('att_pin')) return 'plain'
    return 'none'
  } catch { return 'none' }
}

export async function sha256hex(s) {
  const d = await window.crypto.subtle.digest('SHA-256', te(s))
  return hex(d)
}

// ملح الرمز — يتولد مرة واحدة
export function getPinSalt() {
  let s = null
  try { s = localStorage.getItem('att_pin_salt') } catch {}
  if (!s) {
    const b = new Uint8Array(16)
    window.crypto.getRandomValues(b)
    s = hex(b.buffer)
    try { localStorage.setItem('att_pin_salt', s) } catch {}
  }
  return s
}

// ترحيل صامت: رمز نصي قديم → hash (أول تحقق بعد التحديث) — مع تطبيع الأرقام
async function migrateIfNeeded() {
  try {
    if (localStorage.getItem('att_pin_hash')) return
    const old = normDigits(localStorage.getItem('att_pin'))
    if (/^\d{4,6}$/.test(old)) {
      const h = await sha256hex(getPinSalt() + ':' + old)
      localStorage.setItem('att_pin_hash', h)
      localStorage.removeItem('att_pin')
    }
  } catch {}
}

export function pinExists() {
  try { return !!(localStorage.getItem('att_pin_hash') || localStorage.getItem('att_pin')) } catch { return false }
}

export async function hashAndStorePin(pin) {
  const p = normDigits(pin)
  if (!/^\d{4,6}$/.test(p)) throw new Error('bad-pin')
  const h = await sha256hex(getPinSalt() + ':' + p)
  try {
    localStorage.setItem('att_pin_hash', h)
    localStorage.removeItem('att_pin')
  } catch {}
}

export async function verifyPin(input) {
  await migrateIfNeeded()
  try {
    const h = localStorage.getItem('att_pin_hash')
    if (!h) return false
    return (await sha256hex(getPinSalt() + ':' + normDigits(input))) === h
  } catch { return false }
}

export function clearPin() {
  try { localStorage.removeItem('att_pin_hash'); localStorage.removeItem('att_pin') } catch {}
}

// التعديل ٩: الماستر = رقم الإصدار (تطبيع مرن: v12.9.41 → 12941)
export function normalizeMaster(s) {
  // التعديل ١٠: تحويل العربي أولًا ثم تجريد — كل الصيغ مقبولة
  return normDigits(String(s || '').toLowerCase())
}
export function isMaster(input, appVersion) {
  const a = normalizeMaster(input)
  const b = normalizeMaster(appVersion)
  return a.length >= 3 && a === b
}

// التعديل ٧: مفتاح تشفير النسخة من الرمز لحظة إدخاله (PBKDF2 → AES-GCM)
async function deriveKey(pin, saltB64) {
  const km = await window.crypto.subtle.importKey('raw', te(pin), 'PBKDF2', false, ['deriveKey'])
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64d(saltB64), iterations: 60000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export async function encryptJSON(pin, obj) {
  if (!subtleOK()) throw new Error('no-crypto')
  const saltB = new Uint8Array(16)
  window.crypto.getRandomValues(saltB)
  const iv = new Uint8Array(12)
  window.crypto.getRandomValues(iv)
  const key = await deriveKey(pin, b64e(saltB.buffer))
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te(JSON.stringify(obj)))
  return { v: 1, enc: true, salt: b64e(saltB.buffer), iv: b64e(iv.buffer), data: b64e(ct) }
}

export async function decryptJSON(pin, pack) {
  if (!subtleOK()) throw new Error('no-crypto')
  const key = await deriveKey(pin, pack.salt)
  const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(pack.iv) }, key, b64d(pack.data))
  return JSON.parse(new TextDecoder().decode(pt))
}
