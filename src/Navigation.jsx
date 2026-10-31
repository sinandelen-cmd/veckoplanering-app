export default function Navigation({ active = 'mina', onNavigate, onAllWeeks, onNew, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false, onPrintPlan }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <nav className="planning-unified-navigation planning-original-top" aria-label="Huvudnavigation">
    <div className="planning-unified-left">
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate('mina') }}>⌂ Startsida</button>
    </div>
    <div className="planning-unified-center">
      <button type="button" className={active === 'bibliotek' && !adminOpen ? 'active' : ''} onClick={() => { onCloseAdmin?.(); onNavigate('bibliotek') }}>Planering</button>
      <button type="button" className={calendarOpen ? 'active' : ''} onClick={() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.()}>Kalendervy</button>
      {onAllWeeks && active === 'arsplan' && <button type="button" onClick={onAllWeeks}>Alla veckor</button>}
    </div>
    <div className="planning-unified-right">
      {onNew && <button type="button" onClick={onNew}>+ Ny planering</button>}
      {onBack && <button type="button" aria-label="Tillbaka" disabled={!canBack} onClick={onBack}>←</button>}
      {onForward && <button type="button" aria-label="Framåt" disabled={!canForward} onClick={onForward}>→</button>}
      {onPrintPlan && <button type="button" aria-label="Skriv ut" onClick={onPrintPlan}>🖨️</button>}
      {isAdmin && <button type="button" onClick={onOpenAdmin}>⚙ Administration{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </div>
  </nav>
}
