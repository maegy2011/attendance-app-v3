import { useState, useEffect, useRef } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { version as APP_VERSION } from '../../package.json'

// v12.5.5: بلجن إلغاء التثبيت الذاتي (نافذة النظام) — الموافقة شرط إجباري
const Uninstall = registerPlugin('Uninstall')

// v12.5.10: onboarding — أول تشغيل بعد التثبيت + بعد كل تحديث بالترتيب:
// إخلاء مسؤولية ← إذن إشعارات ← إذن منبهات (Exact Alarm يفتح صفحة النظام)
// كل خطوة لوحدها — أي رفض = خروج (إلغاء التثبيت بنافذة النظام)
// لا تُحفظ النسخة إلا عند اكتمال الكل — بعد الاكتمال: الافتتاحية ثم الرئيسية

// v12.9.50: فقرة عدم الاعتماد — عريضة بعد بند 1 (البوابة + الإعدادات)
const DISCLAIMER_ADD = `(البرنامج غير معتمد من اي جهه حكوميه ولا قطاع عام او خاص ولا يهدف الي تداول البيانات ولا يقوم بجمعها ولا يهدف مطور البرنامج الي الاعتماد من اي جهه حكوميه او غيره انما هو وسيله مساعده للمستخدم تعتمد علي البيانات المسجله عن طريقه وتحت مسئوليته الشخصيه والقانونيه ويقر المستخدم مسئوليته الكامله عن الاحتفاظ ببياناته الشخصيه وحذر تداول معلوماته وبياناته مع الغير لان ذلك يضعه تحت طائله القانون)
ولا تعتمد بيانات ومستندات هذا البرنامج في المقارنه او المطالبه او الاحتكام اليه في اي امور رسميه تخص مستخدم البرنامج)`
const DISCLAIMER_TEXT = `نموذج إخلاء المسؤولية القانونية هو وثيقة قانونية تحمي الجهة المعالِجة للبيانات من المسؤولية القانونية الناتجة عن أي مخاطر أو أخطاء غير مقصودة في تسجيل وتداول البيانات.

1. مقدمة وتمهيد
يُشكل هذا الإقرار اتفاقاً قانونياً ملزماً بين مطور البرنامج وبين المستخدم. يغطي هذا النموذج كافة العمليات المتعلقة بجمع، تسجيل، تخزين، معالجة، وتداول البيانات.

{{DISCLAIMER_ADD}}

2. دقة وصحة البيانات
يتحمل المستخدم المسؤولية الكاملة عن صحة ودقة البيانات المقدمة منه للجهة. لا تتحمل الجهة أي مسؤولية عن الأضرار الناتجة عن تقديم بيانات خاطئة، ناقصة، أو مضللة. يلتزم المستخدم بتحديث بياناته فور حدوث أي تغيير عليها.

3. أمن البيانات والاختراقات السيبرانية
تبذل الجهة أقصى جهودها التقنية والتنظيمية لتأمين تداول البيانات وحمايتها وفقاً لأفضل الممارسات والمعايير المعتمدة. يقر المستخدم بأن نقل البيانات عبر الإنترنت لا يمكن أن يكون آمناً بنسبة 100%. تُعفى الجهة من المسؤولية عن أي تسريب أو اختراق سيبراني خارج عن إرادتها المباشرة أو ناتج عن القوة القاهرة.

4. الاستخدام غير المصرح به
يتحمل المستخدم مسؤولية الحفاظ على سرية معلومات الدخول أو الحساب الخاص به. لا تتحمل الجهة أي أضرار ناتجة عن استخدام حساب المستخدم أو بياناته من قبل أطراف ثالثة غير مصرح لها نتيجة إهمال المستخدم.

5. حدود المسؤولية المالية والقانونية
لا تكون الجهة مسؤولة تحت أي ظرف من الظروف عن أي أضرار غير مباشرة، أو عرضية، أو تبعية (بما في ذلك خسارة الأرباح أو توقف الأعمال) الناتجة عن استخدام أو عدم القدرة على استخدام البيانات المتداولة.

6. الامتثال للتشريعات والقوانين
يلتزم الطرفان بكافة القوانين والأنظمة المحلية والدولية المنظمة لحماية البيانات وتداولها (مثل نظام حماية البيانات الشخصية الساري). يحق للجهة الإفصاح عن البيانات للجهات الحكومية أو القضائية المختصة عند وجود أمر قانوني ملزم، دون أي مسؤولية تجاه المستخدم.

7. التعديلات على النموذج
تحتفظ الجهة بالحق في تعديل أو تحديث بنود هذا النموذج في أي وقت. يُعد استمرار المستخدم في استخدام الخدمات وتداول البيانات بعد التعديل موافقة ضمنية على البنود الجديدة.

إقرار وموافقة المستخدم:
بموجب النقر على زر "أوافق" أو التوقيع أدناه، يقر المستخدم بأنه قرأ وفهم كافة بنود إخلاء المسؤولية هذه، ويوافق على الالتزام بها دون قيد أو شرط.`

export default function DisclaimerGate() {
  const [show, setShow] = useState(() => {
    try {
      if (localStorage.getItem('disclaimerAccepted') !== 'true') return true
      if (localStorage.getItem('onboardingVersion') !== APP_VERSION) return true
      return false
    } catch { return true }
  })
  // v12.5.1: خطوات — 1 إخلاء | 2 إشعارات | 3 منبهات
  const [step, setStep] = useState(1)
  const [toast, setToast] = useState('')
  const [permState, setPermState] = useState({ notif: '…', exact: '…' })
  // التعديل ٢ (أ): الرسالة لا تلزق — مسح عند الانتقال + اختفاء تلقائي 5 ثواني
  const toastTimer = useRef(null)
  const showGateToast = (msg) => {
    try { if (toastTimer.current) clearTimeout(toastTimer.current) } catch {}
    setToast(msg)
    if (msg) { try { toastTimer.current = setTimeout(() => setToast(''), 5000) } catch {} }
  }

  useEffect(() => {
    try {
      const d = localStorage.getItem('disclaimerDate')
      if (d && d.includes('2026-09-02')) { localStorage.removeItem('disclaimerAccepted'); localStorage.removeItem('disclaimerDate'); localStorage.removeItem('onboardingVersion'); setShow(true); setStep(1); return }
      if (localStorage.getItem('disclaimerAccepted') !== 'true' || localStorage.getItem('onboardingVersion') !== APP_VERSION) { setShow(true); setStep(1) }
    } catch {}
  }, [])

  const finishAll = () => {
    try {
      localStorage.setItem('disclaimerAccepted', 'true')
      localStorage.setItem('disclaimerDate', new Date().toISOString().slice(0, 10))
      localStorage.setItem('onboardingVersion', APP_VERSION)
    } catch {}
    setShow(false)
    // v12.5.3: إشعار مدير الإشعارات — يبدأ الأذونات/الجدولة بعد الإخلاء (تسلسل إجباري)
    try { window.dispatchEvent(new Event('onboarding-done')) } catch {}
  }

  // متابعة بدون اكتمال — تتقفل الجلسة دي بس وتتعاد أول فتحة جاية
  const skipForNow = () => setShow(false)

  const handleAgree = () => {
    showGateToast('')
    try {
      localStorage.setItem('disclaimerAccepted', 'true')
      localStorage.setItem('disclaimerDate', new Date().toISOString().slice(0, 10))
    } catch {}
    if (!Capacitor.isNativePlatform()) { finishAll(); return }
    setStep(2)
  }

  const handleDisagree = () => {
    // التعديل ٢ (ب/ج): نص صادق + نافذة النظام تفضل كفرصة — البوابة قافلة للرجوع
    if (Capacitor.isNativePlatform()) {
      try { Uninstall.requestUninstall() } catch {}
    }
    showGateToast('⛔ تم رفض الشروط — لا يمكن المتابعة بدون موافقة. ألغِ التثبيت يدويًا من إعدادات الهاتف أو ارجع ووافق')
  }

  // التعديل ٣ (ب/ج): إعادة فحص + الغامض = أعد المحاولة (مش رفض)
  const requestNotif = async () => {
    showGateToast('')
    try {
      if (!Capacitor.isNativePlatform()) { setStep(3); return }
      const cur = await LocalNotifications.checkPermissions()
      const st = cur && cur.display
      if (!st || (st !== 'granted' && st !== 'denied' && st !== 'prompt')) {
        setPermState(s => ({ ...s, notif: 'unknown' }))
        showGateToast('🔄 تعذر جلب حالة الإشعارات — دوس إعادة الفحص وحاول تاني')
        return
      }
      let granted = st === 'granted'
      if (!granted) {
        const req = await LocalNotifications.requestPermissions()
        granted = req && req.display === 'granted'
      }
      setPermState(s => ({ ...s, notif: granted ? 'granted' : 'denied' }))
      if (granted) setStep(3)
      // v12.5.10: الرفض الصريح فقط = خروج (إلغاء التثبيت بنافذة النظام)
      else {
        showGateToast('⛔ إذن الإشعارات شرط لاستخدام البرنامج — ألغِ التثبيت يدويًا من إعدادات الهاتف أو ارجع واسمح')
        if (Capacitor.isNativePlatform()) { try { Uninstall.requestUninstall() } catch {} }
      }
    } catch (e) { showGateToast('⚠️ ' + String(e?.message || e)) }
  }

  const requestExact = async () => {
    showGateToast('')
    try {
      if (!Capacitor.isNativePlatform()) { finishAll(); return }
      // يفتح صفحة النظام (Alarms & reminders) ثم فحص
      try { await LocalNotifications.changeExactNotificationSetting?.() } catch {}
      let v = 'unknown'
      try {
        const r = await LocalNotifications.checkExactNotificationSetting?.()
        v = String(r?.exact_alarm || r?.exactAlarm || 'unknown')
      } catch {}
      setPermState(s => ({ ...s, exact: v }))
      if (v === 'granted') finishAll()
      // التعديل ٣ (ج): الغامض = أعد المحاولة — الرفض الصريح فقط يدخل مسار الإلغاء
      else if (v !== 'denied') {
        showGateToast('🔄 تعذر جلب حالة المنبهات — دوس إعادة الفحص وحاول تاني')
      }
      else {
        showGateToast('⛔ تفعيل Alarms & reminders شرط لاستخدام البرنامج — ألغِ التثبيت يدويًا من إعدادات الهاتف أو ارجع وفعّل')
        if (Capacitor.isNativePlatform()) { try { Uninstall.requestUninstall() } catch {} }
      }
    } catch (e) { showGateToast('⚠️ ' + String(e?.message || e)) }
  }

  if (!show) return toast ? <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-xl text-sm z-50">{toast}</div> : null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {step === 1 && (
          <>
            <div className="p-4 border-b">
              <h3 className="font-extrabold text-lg">⚖️ إخلاء المسؤولية القانونية</h3>
              <p className="text-xs text-slate-400 mt-1">يجب الموافقة للمتابعة (1 من 3)</p>
            </div>
            <div className="flex-1 overflow-auto p-4 text-sm leading-relaxed whitespace-pre-wrap">{DISCLAIMER_TEXT.split('{{DISCLAIMER_ADD}}')[0]}<strong className="block font-extrabold my-2">{DISCLAIMER_ADD}</strong>{DISCLAIMER_TEXT.split('{{DISCLAIMER_ADD}}')[1]}</div>
            <div className="p-3 border-t grid grid-cols-2 gap-3 safe-footer">
              <button onClick={handleDisagree} className="btn btn-outline text-sm">غير موافق</button>
              <button onClick={handleAgree} className="btn btn-primary text-sm">أوافق</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="p-4 border-b">
              <h3 className="font-extrabold text-lg">🔔 إذن الإشعارات</h3>
              <p className="text-xs text-slate-400 mt-1">الخطوة 2 من 3 — التذكيرات محتاجة إذن الإشعارات</p>
            </div>
            <div className="flex-1 overflow-auto p-4 text-sm leading-relaxed">
              <p>عشان توصلك تذكيرات الحضور والانصراف والتصاريح والإجازات لازم تسمح بالإشعارات.</p>
              <p className="text-xs text-slate-500 mt-2">الحالة: {permState.notif === 'granted' ? '✅ مسموح' : permState.notif === 'denied' ? '❌ مرفوض' : '…'}</p>
            </div>
            <div className="p-3 border-t safe-footer flex gap-2">
              <button onClick={requestNotif} className="btn btn-primary text-sm flex-1">سماح بالإشعارات (إجباري)</button>
              <button onClick={requestNotif} className="btn btn-outline text-sm px-3">🔄 إعادة الفحص</button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="p-4 border-b">
              <h3 className="font-extrabold text-lg">⏰ إذن المنبهات والتذكيرات</h3>
              <p className="text-xs text-slate-400 mt-1">الخطوة 3 من 3 — دقة المنبهات (Android 12+)</p>
            </div>
            <div className="flex-1 overflow-auto p-4 text-sm leading-relaxed">
              <p>عشان التذكيرات تيجي في موعدها بالظبط حتى والتطبيق مقفول، فعّل Alarms &amp; reminders للتطبيق من صفحة النظام اللي هتتفتح.</p>
              <p className="text-xs text-slate-500 mt-2">الحالة: {permState.exact === 'granted' ? '✅ مسموح (دقيق)' : permState.exact === 'denied' ? '❌ غير مسموح' : '…'}</p>
            </div>
            <div className="p-3 border-t safe-footer flex gap-2">
              <button onClick={requestExact} className="btn btn-primary text-sm flex-1">فتح صفحة النظام + تأكيد (إجباري)</button>
              <button onClick={requestExact} className="btn btn-outline text-sm px-3">🔄 إعادة الفحص</button>
            </div>
          </>
        )}
        {toast && <div className="p-2 text-center text-sm text-red-600 bg-red-50">{toast}</div>}
      </div>
    </div>
  )
}
