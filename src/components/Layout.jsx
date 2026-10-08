import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getPlan, PLAN_EVENT, isSnoozed, SNOOZE_EVENT } from '../utils/planWeek'

// v12.9.50: البار الجديد معمم على كل الصفحات + إلغاء السحب نهائيًا
// v12.9.53: بار سياقي — الجوانب = الخمسة ماعدا الحالية (الإعدادات تعرض الخمسة)
// تعديل ٨: ترتيب صريح لكل صفحة من اليمين للشمال (عربي) — الدايرة في النص دائمًا
// الإعدادات من الرئيسية فقط (☰ في هيدر الجديدة) + الجرس في الجديدة فقط

const PAGE_META = {
  '/records': { icon: '📋', label: 'السجلات' },
  '/alt-days': { icon: '📅', label: 'البديلة' },
  '/vacations': { icon: '🏖️', label: 'الإجازات' },
  '/permits': { icon: '📝', label: 'التصاريح' },
  '/stats': { icon: '📊', label: 'الإحصائيات' },
}

// right/left = يمين/شمال (الترتيب هنا من اليمين للشمال) — الصفحة الحالية مبتظهرش (ما عدا الإعدادات)
const BAR_ORDER = {
  '/': { right: ['/alt-days', '/vacations'], left: ['/permits', '/stats'], main: 'records' },
  '/records': { right: ['/alt-days', '/vacations'], left: ['/permits', '/stats'], main: 'home' },
  '/alt-days': { right: ['/records', '/vacations'], left: ['/permits', '/stats'], main: 'home' },
  '/vacations': { right: ['/alt-days', '/records'], left: ['/permits', '/stats'], main: 'home' },
  '/permits': { right: ['/alt-days', '/vacations'], left: ['/records', '/stats'], main: 'home' },
  '/stats': { right: ['/alt-days', '/vacations'], left: ['/records', '/permits'], main: 'home' },
  '/settings': { right: ['/records', '/alt-days', '/vacations'], left: ['/permits', '/stats'], main: 'home' },
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const go = (path) => {
    if (path !== location.pathname) navigate(path)
    try { window.scrollTo(0, 0) } catch {}
  }
  // بند 3: الحبسة — البار كله واقف ما عدا الدايرة (الرئيسية ↔ السجلات فقط)
  // تعديل ١٠: الغفوة تفتح البرنامج كله مؤقتًا (الحبسة تقف أثناء الغفوة)
  const [planActive, setPlanActive] = useState(() => { try { return !!getPlan() && !isSnoozed() } catch { return false } })
  useEffect(() => {
    const h = () => { try { setPlanActive(!!getPlan() && !isSnoozed()) } catch {} }
    window.addEventListener(PLAN_EVENT, h)
    window.addEventListener(SNOOZE_EVENT, h)
    return () => { window.removeEventListener(PLAN_EVENT, h); window.removeEventListener(SNOOZE_EVENT, h) }
  }, [])
  const cfg = BAR_ORDER[location.pathname] || BAR_ORDER['/settings']

  const btn = (path) => {
    const p = { path, ...PAGE_META[path] }
    return (
      <button key={p.path} onClick={() => { if (planActive) return; go(p.path) }} disabled={planActive} className={"claw-nav" + (planActive ? ' nav-disabled' : '')}>
        <span className="claw-navicon">{p.icon}</span>
        <span className="claw-navlabel">{p.label}</span>
      </button>
    )
  }

  return (
    <div className="page-content">
      <div key={location.pathname}>
        <Outlet />
      </div>
      <nav className="claw-bottombar" dir="ltr">
        <div className="claw-side">
          {cfg.left.map(btn)}
        </div>
        {cfg.main === 'records' ? (
          <button key="main" onClick={() => go('/records')} className="claw-navmain" title="سجلات الحضور">
            <span className="claw-navmainicon">📋</span>
          </button>
        ) : (
          <button key="main" onClick={() => go('/')} className="claw-navmain" title="الرئيسية">
            <span className="claw-navmainicon">🏠</span>
          </button>
        )}
        <div className="claw-side">
          {cfg.right.map(btn)}
        </div>
      </nav>
    </div>
  )
}
