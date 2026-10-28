export default function Navigation({ active = 'mina', onNavigate, selectedId, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, planContext, onPrintPlan }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <nav className="planning-unified-navigation" aria-label="Huvudnavigation">
    <div className="planning-unified-left">
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate('bibliotek') }}>⌂ Startsida</button>
    </div>
    <div className="planning-unified-center">
      <button type="button" className={active === 'arsplan' && !calendarOpen && !adminOpen ? 'active' : ''} onClick={() => onNavigate('arsplan')}>Planering</button>
      <button type="button" className={calendarOpen && !adminOpen ? 'active' : ''} onClick={() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.()}>Kalendervy</button>
    </div>
    {(planContext || onPrintPlan) && <div className="planning-nav-tools">
      {planContext && <div className="planning-nav-context" title={[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(" ")}><span className="planning-nav-context-title">{[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(" ")}</span></div>}
      {onPrintPlan && <button type="button" className="planning-nav-print" onClick={onPrintPlan} aria-label="Skriv ut planeringen" title="Skriv ut planeringen">🖨️</button>}
    </div>}
    <div className="planning-unified-right">
      {isAdmin && <button type="button" className={adminOpen ? 'active' : ''} onClick={onOpenAdmin}>⚙ Administration{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </div>
  </nav>
}
