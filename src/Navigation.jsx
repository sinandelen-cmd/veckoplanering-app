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
    <div className="planning-unified-right">
      {planContext && <div className="planning-nav-context" title={[planContext.subject,planContext.textbook,planContext.grade].filter(Boolean).join(" · ")}><span className="planning-nav-context-title">{planContext.subject}</span><span className="planning-nav-context-grade">{planContext.grade}</span>{planContext.textbook && <span className="planning-nav-context-book">{planContext.textbook}</span>}</div>}
      {onPrintPlan && <button type="button" className="planning-nav-print" onClick={onPrintPlan} aria-label="Skriv ut planeringen" title="Skriv ut planeringen">🖨️</button>}
      {isAdmin && <button type="button" className={adminOpen ? 'active' : ''} onClick={onOpenAdmin}>⚙ Administration{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </div>
  </nav>
}
