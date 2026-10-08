import { useState } from 'react'
import { THEME_LIST, APP_STRIP_SLOTS, resolveAppTheme } from '../utils/themes'
import { HOME_THEME_LIST, HOME_STRIP_SLOTS, homeSlotHex } from '../utils/homeThemes'
import { HarmonyGen } from './HarmonyGen'
import { ColorWheel } from './ColorWheel'

// التعديل ١٥ (دورة سادسة): اللوحة بيضا + التبويبان يتبعوا الثيم + قائمة الكبسولة + حذف المشتق
// (الأسماء الجديدة مؤجلة — مستنية الاعتماد)
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const normHex = (v) => {
  let h = (v || '').trim()
  if (!h.startsWith('#')) h = '#' + h
  return HEX_RE.test(h) ? h : null
}
const uid = () => 'c' + Date.now().toString(36)
const arr = (v) => (Array.isArray(v) ? v : [])

function snapshotHome(themeKey, appColors, customs, overrides) {
  const o = {}
  for (const s of HOME_STRIP_SLOTS) o[s.key] = homeSlotHex(themeKey, s.key, appColors, customs, overrides)
  return o
}

function snapshotApp(appKey, customs, overrides) {
  const r = resolveAppTheme(appKey, customs, overrides)
  const o = {}
  for (const s of APP_STRIP_SLOTS) {
    const v = (r.colors || {})[s.k]
    o[s.k] = (typeof v === 'string' && HEX_RE.test(v)) ? v : '#888888'
  }
  return { snap: o, base: r.base }
}

const slotLabelHome = (k) => (HOME_STRIP_SLOTS.find(s => s.key === k) || {}).label || k
const slotLabelApp = (k) => (APP_STRIP_SLOTS.find(s => s.k === k) || {}).label || k

export function ThemeBoards({ settings, save, showToast }) {
  const [palTab, setPalTab] = useState('app')
  const [ed, setEd] = useState(null) // { board, slot, slotLabel, value, themeLabel, target:{kind,...}, isNew }
  const [edHex, setEdHex] = useState('')
  const [edName, setEdName] = useState('')
  const [ren, setRen] = useState(null) // { board, id, name }
  const [ov, setOv] = useState(null) // نص دايرة الاختيارات فوق الكبسولة { board, kind, key, id, name, custom }
  const [armed, setArmed] = useState(null) // بعد 🎨: الشريحة الجاية تفتح المحرر
  const [gen, setGen] = useState(null) // مولد الهارموني { board }

  const homeOv = settings.homeThemeOverrides || {}
  const appOv = settings.appThemeOverrides || {}
  const appRes = resolveAppTheme(settings.appTheme, settings.appCustomThemes, appOv)
  const appColors = appRes.colors || {}
  const homeCustoms = arr(settings.homeCustomThemes)
  const appCustoms = arr(settings.appCustomThemes)
  const appliedHome = settings.homeTheme || 'classic'

  const openEd = (e) => {
    setEd(e)
    setEdHex(e.value)
    setEdName('')
  }

  const saveEditor = () => {
    const hex = normHex(edHex)
    if (!hex) { showToast('⚠️ رقم اللون غير صالح (مثال: #2563eb)'); return }
    if (ed.board === 'app') {
      if (ed.target.kind === 'app-custom') {
        const next = appCustoms.map(c => (c.id === ed.target.id ? { ...c, overrides: { ...(c.overrides || {}), [ed.slot]: hex } } : c))
        save({ ...settings, appCustomThemes: next })
        showToast('✅ اتحفظ اللون')
      } else if (ed.target.kind === 'app-builtin') {
        // التعديل ٢٤: الحفظ على نفس الثيم الأصلي (override — بلا كارت جديد)
        const k = ed.target.key
        const cur = { ...((settings.appThemeOverrides || {})[k] || {}) }
        cur[ed.slot] = hex
        save({ ...settings, appThemeOverrides: { ...(settings.appThemeOverrides || {}), [k]: cur } })
        showToast('✅ اتحفظ على الثيم نفسه')
      } else {
        const r = snapshotApp(settings.appTheme || 'classic', appCustoms, appOv)
        const baseKey = r.base
        const snap = r.snap
        snap[ed.slot] = hex
        const name = (edName || '').trim() || `مخصصة ${appCustoms.length + 1}`
        const next = [...appCustoms, { id: uid(), name, base: baseKey, overrides: { [ed.slot]: snap[ed.slot] } }]
        save({ ...settings, appCustomThemes: next })
        showToast(`✅ اتعمل كارت «${name}» — دوس على الشريحة ثم ✅`)
      }
    } else {
      if (ed.target.kind === 'home-custom') {
        const next = homeCustoms.map(c => {
          if (c.id !== ed.target.id) return c
          if (ed.slot === 'header') return { ...c, header: hex }
          return { ...c, colors: { ...(c.colors || {}), [ed.slot]: hex } }
        })
        save({ ...settings, homeCustomThemes: next })
        showToast('✅ اتحفظ اللون')
      } else if (ed.target.kind === 'home-builtin') {
        // التعديل ٢٤: الحفظ على نفس الثيم الأصلي (override — بلا كارت جديد)
        const k = ed.target.key
        const cur = { ...((settings.homeThemeOverrides || {})[k] || {}) }
        cur[ed.slot] = hex
        save({ ...settings, homeThemeOverrides: { ...(settings.homeThemeOverrides || {}), [k]: cur } })
        showToast('✅ اتحفظ على الثيم نفسه')
      } else {
        let baseKey = 'classic'
        let snap
        const ak = appliedHome
        if (ak.startsWith('custom:')) {
          const cc = homeCustoms.find(x => x && x.id === ak.slice(7))
          baseKey = (cc && cc.base) || 'classic'
        } else baseKey = ak
        snap = snapshotHome(ak, appColors, homeCustoms, homeOv)
        if (ed.slot === 'header') snap.header = hex
        else snap[ed.slot] = hex
        const { header, ...rest } = snap
        const name = (edName || '').trim() || `مخصصة ${homeCustoms.length + 1}`
        const next = [...homeCustoms, { id: uid(), name, base: baseKey, header, colors: rest }]
        save({ ...settings, homeCustomThemes: next })
        showToast(`✅ اتعمل كارت «${name}» — دوس على الشريحة ثم ✅`)
      }
    }
    setArmed(null)
    setEd(null)
  }

  const resetSlot = () => {
    // التعديل ٢٤: مسح override الخانة من الثيم الأصلي
    if (ed.board === 'app' && ed.target.kind === 'app-builtin') {
      const cur = { ...((settings.appThemeOverrides || {})[ed.target.key] || {}) }
      delete cur[ed.slot]
      const all = { ...(settings.appThemeOverrides || {}) }
      if (Object.keys(cur).length) all[ed.target.key] = cur
      else delete all[ed.target.key]
      save({ ...settings, appThemeOverrides: all })
      showToast('↩️ رجع اللون للأصل')
      setEd(null)
      return
    }
    if (ed.board === 'home' && ed.target.kind === 'home-builtin') {
      const cur = { ...((settings.homeThemeOverrides || {})[ed.target.key] || {}) }
      delete cur[ed.slot]
      const all = { ...(settings.homeThemeOverrides || {}) }
      if (Object.keys(cur).length) all[ed.target.key] = cur
      else delete all[ed.target.key]
      save({ ...settings, homeThemeOverrides: all })
      showToast('↩️ رجع اللون للأصل')
      setEd(null)
      return
    }
    if (ed.board === 'app' && ed.target.kind === 'app-custom') {
      const next = appCustoms.map(c => {
        if (c.id !== ed.target.id) return c
        const ov = { ...(c.overrides || {}) }
        delete ov[ed.slot]
        return { ...c, overrides: ov }
      })
      save({ ...settings, appCustomThemes: next })
      showToast('↩️ رجع اللون للأصل')
      setEd(null)
    } else if (ed.board === 'home' && ed.target.kind === 'home-custom') {
      const c = homeCustoms.find(x => x && x.id === ed.target.id)
      const baseSnap = snapshotHome((c && c.base) || 'classic', appColors, homeCustoms, {})
      const next = homeCustoms.map(x => {
        if (!x || x.id !== ed.target.id) return x
        if (ed.slot === 'header') return { ...x, header: baseSnap.header }
        return { ...x, colors: { ...(x.colors || {}), [ed.slot]: baseSnap[ed.slot] } }
      })
      save({ ...settings, homeCustomThemes: next })
      showToast('↩️ رجع اللون للأصل')
      setEd(null)
    }
  }

  // التعديل ٢٤: مسح كل overrides الثيم الأصلي
  const resetAll = () => {
    if (!ed || !ed.target.key) return
    if (ed.board === 'app') {
      const all = { ...(settings.appThemeOverrides || {}) }
      delete all[ed.target.key]
      save({ ...settings, appThemeOverrides: all })
    } else {
      const all = { ...(settings.homeThemeOverrides || {}) }
      delete all[ed.target.key]
      save({ ...settings, homeThemeOverrides: all })
    }
    showToast('↩️ رجع الثيم كله للأصل')
    setEd(null)
  }

  const delCustom = (board, id) => {
    if (board === 'app') {
      const next = appCustoms.filter(c => c && c.id !== id)
      const patch = { appCustomThemes: next }
      if (settings.appTheme === 'custom:' + id) patch.appTheme = 'classic'
      save({ ...settings, ...patch })
    } else {
      const next = homeCustoms.filter(c => c && c.id !== id)
      const patch = { homeCustomThemes: next }
      if (appliedHome === 'custom:' + id) patch.homeTheme = 'classic'
      save({ ...settings, ...patch })
    }
    showToast('🗑️ اتمسح الكارت')
  }

  const confirmRename = () => {
    const name = (ren.name || '').trim()
    if (!name) { showToast('⚠️ اكتب الاسم'); return }
    if (ren.board === 'app') {
      save({ ...settings, appCustomThemes: appCustoms.map(c => (c.id === ren.id ? { ...c, name } : c)) })
    } else {
      save({ ...settings, homeCustomThemes: homeCustoms.map(c => (c.id === ren.id ? { ...c, name } : c)) })
    }
    setRen(null)
    showToast('✅ اتغير الاسم')
  }

  const sameCap = (a, b) => a && b && a.board === b.board && (a.kind === 'custom' ? (b.kind === 'custom' && a.id === b.id) : (b.kind !== 'custom' && a.key === b.key))
  const applyOv = () => {
    if (!ov) return
    if (ov.board === 'app') {
      save({ ...settings, appTheme: ov.custom ? 'custom:' + ov.id : ov.key })
    } else {
      save({ ...settings, homeTheme: ov.custom ? 'custom:' + ov.id : ov.key })
    }
    setOv(null)
    showToast('✅ اتطبق الثيم')
  }
  // التعديل ١٦: أول دوسة شريحة = الاختيارات — بعد 🎨 الدوسة الجاية = المحرر
  const tapStrip = (cap, i, openEditorAt) => {
    if (armed && sameCap(armed, cap)) { setArmed(null); openEditorAt(i); return }
    setArmed(null)
    setOv(cap)
  }

  // كبسولة 76×300 — الاسم نص بلا فعل — الجسم يفتح القائمة — الشرائح تحرر مباشرة
  // التعديل ١٧: أيقونات على نصف دايرة علوي بزوايا 60° (نصف قطر 44px حول المركز 38/150 — شفاف تماماً)
  const arcBtn = (a) => {
    const r = (a.d * Math.PI) / 180
    const left = 38 + 44 * Math.cos(r)
    const top = 150 - 44 * Math.sin(r)
    return (
      <button key={a.e + a.d} onClick={(e) => { e.stopPropagation(); a.fn() }} title={a.t}
        className="absolute w-[30px] h-[30px] flex items-center justify-center text-[26px] leading-none"
        style={{ left, top, transform: 'translate(-50%,-50%)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}>
        {a.e}
      </button>
    )
  }
  const capsule = (key, name, applied, custom, hexes, menuInfo, onStrip) => {
    const isRen = ren && ren.board === menuInfo.board && ren.id === menuInfo.id
    return (
      <div key={key} className="flex flex-col items-center shrink-0 w-[76px]">
        <div className="w-full text-center text-slate-700 text-xs font-bold truncate mb-1 px-0.5" title={name}>
          {!custom && ((menuInfo.board === 'app' && Object.keys(appOv[menuInfo.key] || {}).length > 0) || (menuInfo.board === 'home' && Object.keys(homeOv[menuInfo.key] || {}).length > 0)) && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 ml-1" />}{name}
        </div>
        {isRen && (
          <div className="flex items-center gap-1 mb-1 w-full">
            <input value={ren.name} onChange={e => setRen({ ...ren, name: e.target.value })} placeholder="الاسم"
              className="w-full min-w-0 bg-slate-100 border border-slate-300 rounded-lg px-1 py-0.5 text-slate-800 text-[11px] font-bold text-center" />
            <button onClick={confirmRename} className="text-green-600 font-black text-xs shrink-0">✓</button>
            <button onClick={() => setRen(null)} className="text-slate-400 font-black text-xs shrink-0">✕</button>
          </div>
        )}
        <div className="relative w-[76px] h-[300px] rounded-full flex flex-col shadow-md ring-1 ring-slate-200">
          {hexes.map((h, i) => (
            // التعديل ٧ (دورة جديدة): رجوع الشريحة لون واحد (الشق كان يبان غلطة)
            <button key={i} title={h}
              onClick={e => { e.stopPropagation(); tapStrip(menuInfo, i, onStrip) }}
              className={`flex-1 w-full active:opacity-70 transition-opacity${i === 0 ? ' rounded-t-[38px]' : ''}${i === hexes.length - 1 ? ' rounded-b-[38px]' : ''}`}
              style={{ background: h }} />
          ))}
          {ov && sameCap(ov, menuInfo) && (
            <div className="absolute inset-0 z-50" style={{ overflow: 'visible' }} onClick={(e) => { e.stopPropagation(); setOv(null) }}>
              {(menuInfo.custom ? [
                { e: '✅', d: 0, t: 'تطبيق', fn: () => applyOv() },
                { e: '🎨', d: 60, t: 'تعديل', fn: () => { setOv(null); setArmed(menuInfo); showToast('🎨 اختار اللون من الكبسولة') } },
                { e: '✏️', d: 120, t: 'إعادة تسمية', fn: () => { setOv(null); setRen({ board: menuInfo.board, id: menuInfo.id, name: menuInfo.name }) } },
                { e: '🗑️', d: 180, t: 'حذف', fn: () => { delCustom(menuInfo.board, menuInfo.id); setOv(null) } },
              ] : [
                { e: '✅', d: 60, t: 'تطبيق', fn: () => applyOv() },
                { e: '🎨', d: 120, t: 'تعديل', fn: () => { setOv(null); setArmed(menuInfo); showToast('🎨 اختار اللون من الكبسولة') } },
              ]).map(arcBtn)}
            </div>
          )}
          {applied && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center shadow-xl">
                <span className="text-slate-900 font-black text-xl">✓</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // التعديل ٩: مولد الهارموني — إنشاء كارت مخصص من الألوان المولدة
  const applyGen = (board, hexes, name) => {
    if (board === 'app') {
      const r = snapshotApp(settings.appTheme || 'classic', appCustoms, appOv)
      const nm = name || `مخصصة ${appCustoms.length + 1}`
      const overrides = {}
      APP_STRIP_SLOTS.forEach((s, i) => { overrides[s.k] = hexes[i] || '#888888' })
      save({ ...settings, appCustomThemes: [...appCustoms, { id: uid(), name: nm, base: r.base, overrides }] })
      showToast(`✅ اتعمل كارت «${nm}» — دوس على الشريحة ثم ✅`)
    } else {
      const ak = appliedHome
      let baseKey = 'classic'
      if (ak.startsWith('custom:')) {
        const cc = homeCustoms.find(x => x && x.id === ak.slice(7))
        baseKey = (cc && cc.base) || 'classic'
      } else baseKey = ak
      const keys = HOME_STRIP_SLOTS.map(s => s.key)
      const nm = name || `مخصصة ${homeCustoms.length + 1}`
      const rest = {}
      keys.slice(1).forEach((k, i) => { rest[k] = hexes[i + 1] || '#888888' })
      save({ ...settings, homeCustomThemes: [...homeCustoms, { id: uid(), name: nm, base: baseKey, header: hexes[0] || '#2563eb', colors: rest }] })
      showToast(`✅ اتعمل كارت «${nm}» — دوس على الشريحة ثم ✅`)
    }
    setGen(null)
  }

  // الكبسولة الفاضية: حد متقطع + ➕ — الدوسة تفتح الاختيارات (🎡 مولد / 🎨 يدوي)
  const emptyCapsule = (key, name, board, onManual) => {
    const menuInfo = { board, kind: 'empty', key: 'new', id: null, name, custom: false, onManual }
    return (
      <div key={key} className="flex flex-col items-center shrink-0 w-[76px]">
        <div className="w-full text-center text-slate-400 text-xs font-bold truncate mb-1 px-0.5">{name}</div>
        <div className="relative">
          <button onClick={() => { setArmed(null); setOv(menuInfo) }}
            className="w-[76px] h-[300px] rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center active:scale-[.98] transition-transform">
            <span className="text-slate-400 font-black text-3xl">➕</span>
          </button>
          {ov && sameCap(ov, menuInfo) && (
            <div className="absolute inset-0 z-50" style={{ overflow: 'visible' }} onClick={(e) => { e.stopPropagation(); setOv(null) }}>
              {[
                { e: '🎡', d: 60, t: 'مولد الألوان', fn: () => { setOv(null); setGen({ board }) } },
                { e: '🎨', d: 120, t: 'يدوي', fn: () => { setOv(null); onManual() } },
              ].map(arcBtn)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ——— تبويب البرنامج ———
  const appCapsules = () => {
    const out = []
    for (const t of THEME_LIST) {
      const r = resolveAppTheme(t.v, appCustoms, appOv)
      const hexes = APP_STRIP_SLOTS.map(s => (r.colors[s.k] || '#888888'))
      out.push(capsule('app-' + t.v, t.label, settings.appTheme === t.v, false, hexes,
        { board: 'app', kind: 'builtin', key: t.v, id: null, name: t.label, custom: false },
        (i) => openEd({ board: 'app', slot: APP_STRIP_SLOTS[i].k, slotLabel: slotLabelApp(APP_STRIP_SLOTS[i].k), value: hexes[i], themeLabel: t.label, target: { kind: 'app-builtin', key: t.v }, isNew: false })))
    }
    for (const c of appCustoms) {
      const r = resolveAppTheme('custom:' + c.id, appCustoms, appOv)
      const hexes = APP_STRIP_SLOTS.map(s => (r.colors[s.k] || '#888888'))
      out.push(capsule('appc-' + c.id, (c.name || 'مخصصة') + ' 🎨', settings.appTheme === 'custom:' + c.id, true, hexes,
        { board: 'app', kind: 'custom', key: null, id: c.id, name: c.name, custom: true },
        (i) => openEd({ board: 'app', slot: APP_STRIP_SLOTS[i].k, slotLabel: slotLabelApp(APP_STRIP_SLOTS[i].k), value: hexes[i], themeLabel: c.name, target: { kind: 'app-custom', id: c.id }, isNew: false })))
    }
    const snap = snapshotApp(settings.appTheme || 'classic', appCustoms, appOv).snap
    out.push(emptyCapsule('app-new', 'المخصصة', 'app', () => openEd({
      board: 'app', slot: APP_STRIP_SLOTS[0].k, slotLabel: slotLabelApp(APP_STRIP_SLOTS[0].k),
      value: snap[APP_STRIP_SLOTS[0].k], themeLabel: 'مخصصة جديدة', target: { kind: 'app-new' }, isNew: true,
    })))
    return out
  }

  // ——— تبويب الرئيسية (المشتق 🎯 اتمسح — التحرير يبدأ من classic) ———
  const homeCapsules = () => {
    const out = []
    for (const t of HOME_THEME_LIST) {
      const hexes = HOME_STRIP_SLOTS.map(s => homeSlotHex(t.v, s.key, appColors, homeCustoms, homeOv))
      out.push(capsule('home-' + t.v, t.label, appliedHome === t.v, false, hexes,
        { board: 'home', kind: 'builtin', key: t.v, id: null, name: t.label, custom: false },
        (i) => openEd({ board: 'home', slot: HOME_STRIP_SLOTS[i].key, slotLabel: slotLabelHome(HOME_STRIP_SLOTS[i].key), value: hexes[i], themeLabel: t.label, target: { kind: 'home-builtin', key: t.v }, isNew: false })))
    }
    for (const c of homeCustoms) {
      const hexes = HOME_STRIP_SLOTS.map(s => homeSlotHex('custom:' + c.id, s.key, appColors, homeCustoms, homeOv))
      out.push(capsule('homec-' + c.id, (c.name || 'مخصصة') + ' 🎨', appliedHome === 'custom:' + c.id, true, hexes,
        { board: 'home', kind: 'custom', key: null, id: c.id, name: c.name, custom: true },
        (i) => openEd({ board: 'home', slot: HOME_STRIP_SLOTS[i].key, slotLabel: slotLabelHome(HOME_STRIP_SLOTS[i].key), value: hexes[i], themeLabel: c.name, target: { kind: 'home-custom', id: c.id }, isNew: false })))
    }
    const snap = snapshotHome(appliedHome, appColors, homeCustoms, homeOv)
    out.push(emptyCapsule('home-new', 'المخصصة', 'home', () => openEd({
      board: 'home', slot: 'header', slotLabel: slotLabelHome('header'),
      value: snap.header, themeLabel: 'مخصصة جديدة', target: { kind: 'home-new' }, isNew: true,
    })))
    return out
  }

  const showReset = ed && ((ed.board === 'app' && ed.target.kind === 'app-custom') || (ed.board === 'home' && ed.target.kind === 'home-custom') || ((ed.board === 'app' && ed.target.kind === 'app-builtin' && ((settings.appThemeOverrides || {})[ed.target.key] || {})[ed.slot]) || (ed.board === 'home' && ed.target.kind === 'home-builtin' && ((settings.homeThemeOverrides || {})[ed.target.key] || {})[ed.slot])))
  // التعديل ٢٤: زر ↩️ الكل يظهر لو الثيم الأصلي عليه أي overrides
  const showResetAll = ed && ed.target.key && (ed.target.kind === 'app-builtin' || ed.target.kind === 'home-builtin') && (Object.keys(ed.board === 'app' ? (((settings.appThemeOverrides || {})[ed.target.key]) || {}) : (((settings.homeThemeOverrides || {})[ed.target.key]) || {})).length > 0)

  return (
    <div className="card mt-4">
      <h3 className="font-bold text-slate-700 mb-2">🎨 الثيمات</h3>
      <div className="flex gap-2 mb-3 rounded-full p-1 bg-slate-100">
        <button onClick={() => setPalTab('app')}
          className="flex-1 py-1.5 rounded-full font-bold text-sm"
          style={palTab === 'app' ? { background: 'var(--c-btnprim,#2563eb)', color: '#fff' } : { color: '#64748b' }}>ثيمات البرنامج</button>
        <button onClick={() => setPalTab('home')}
          className="flex-1 py-1.5 rounded-full font-bold text-sm"
          style={palTab === 'home' ? { background: 'var(--c-btnprim,#2563eb)', color: '#fff' } : { color: '#64748b' }}>ثيمات الرئيسية</button>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 pt-1 px-1">
        {palTab === 'app' ? appCapsules() : homeCapsules()}
      </div>
      {ov && !ed && (
        <div className="fixed inset-0 z-40" onClick={() => { setOv(null); setArmed(null) }} />
      )}
      {gen && (
        <HarmonyGen board={gen.board} slots={gen.board === 'app' ? APP_STRIP_SLOTS : HOME_STRIP_SLOTS}
          onApply={(hexes, nm) => applyGen(gen.board, hexes, nm)} onClose={() => setGen(null)} showToast={showToast} />
      )}
      {ed && (
        <div className="dialog-overlay" onClick={() => setEd(null)}>
          <div className="dialog-box" onClick={e => e.stopPropagation()} style={{ background: '#24282e', color: '#fff' }}>
            <h3 className="font-bold text-white mb-2">🎨 {ed.themeLabel} — {ed.slotLabel}</h3>
            <div className="h-12 rounded-xl border border-white/10 shadow-inner mb-2" style={{ background: normHex(edHex) || ed.value }} />
            <div className="flex justify-center mb-1">
              <ColorWheel size={140} initial={normHex(edHex) || ed.value} onPick={(hex) => setEdHex(hex)} />
            </div>
            <p className="text-center text-slate-300 mb-2" style={{ fontSize: '11px' }}>🎡 المس الدايرة لاختيار اللون</p>
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={normHex(edHex) || ed.value} onChange={e => setEdHex(e.target.value)} className="w-12 h-10 shrink-0 cursor-pointer" />
              <input value={edHex} onChange={e => setEdHex(e.target.value)} dir="ltr" placeholder="#2563eb"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm font-bold text-center text-white" />
            </div>
            {ed.isNew && (
              <input value={edName} onChange={e => setEdName(e.target.value)} placeholder="اسم الكارت الجديد"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm font-bold mb-2 text-white" />
            )}
            <div className="flex gap-2">
              <button onClick={saveEditor} className="flex-1 p-2 rounded-xl bg-blue-600 text-white font-bold text-sm">💾 حفظ{ed.isNew ? ' كارت جديد' : ''}</button>
              {showReset && <button onClick={resetSlot} className="p-2 rounded-xl border border-white/20 font-bold text-sm text-white">↩️</button>}
              {showResetAll && <button onClick={resetAll} className="p-2 rounded-xl border border-white/20 font-bold text-sm text-white">↩️ الكل</button>}
              <button onClick={() => setEd(null)} className="p-2 rounded-xl border border-white/20 font-bold text-sm text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
