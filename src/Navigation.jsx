import { useEffect, useRef } from 'react'
export default function Navigation({ active = 'mina', onAllWeeks, onNavigate, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, planContext, onPrintPlan }) {
  const navRef = useRef(null)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const update = () => document.documentElement.style.setProperty('--planning-nav-height', nav.getBoundingClientRect().height + 'px')
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(nav)
    window.addEventListener('resize', update)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); document.documentElement.style.removeProperty('--planning-nav-height') }
  }, [])
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <nav ref={navRef} className="planning-unified-navigation" aria-label="Huvudnavigation">
    <div className="planning-unified-left">
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate('bibliotek') }}>⌂ Startsida</button>
    </div>
    <div className="planning-unified-center">
      <button type="button" className={active === 'arsplan' && !calendarOpen && !adminOpen ? 'active' : ''} onClick={() => { window.dispatchEvent(new Event('planning-home')); onNavigate('arsplan') }}>Planering</button>
      <button type="button" className={calendarOpen && !adminOpen ? 'active' : ''} onClick={() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.()}>Månadsvy</button>
      {onAllWeeks && <button type="button" onClick={onAllWeeks}>Alla veckor</button>}
    </div>
    {planContext && <div className="planning-nav-tools">
      {planContext && <div className="planning-nav-context" title={[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(" ")}><span className="planning-nav-context-title">{[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(" ")}</span></div>}
    </div>}
    <div className="planning-unified-right">
      {isAdmin && <button type="button" className={adminOpen ? 'active' : ''} onClick={onOpenAdmin}>⚙ Administration{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
      {onPrintPlan && <button type="button" className="planning-nav-print" onClick={onPrintPlan} aria-label="Skriv ut planeringen" title="Skriv ut planeringen">🖨️</button>}
    </div>
  </nav>
}
