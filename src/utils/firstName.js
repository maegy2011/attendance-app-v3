// v12.9.51: الاسم الأول فقط من اسم الملف الشخصي
// القاعدة: أول كلمة — ولو (عبد/أبو/أم/نور/سيف) ناخد اللي بعدها كمان
// أي كلمة فيها أرقام (عربي/إنجليزي) تتجاهل — ولو مفيش صالح يرجع فاضي
const SECOND_WORD = ['عبد', 'ابو', 'أبو', 'ام', 'أم', 'نور', 'سيف']

export function firstName(full) {
  try {
    const tokens = String(full || '').trim().split(/\s+/).filter(t => t && !/[0-9٠-٩]/.test(t))
    if (!tokens.length) return ''
    if (SECOND_WORD.includes(tokens[0]) && tokens[1]) return `${tokens[0]} ${tokens[1]}`
    return tokens[0]
  } catch { return '' }
}
