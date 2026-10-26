export default function Navigation({ active = 'mina', onNavigate, onNew, selectedId, onToggleCalendar, calendarOpen = false, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false, planSearch = '', onPlanSearchChange, showArchive = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <nav className="planning-home-navigation" aria-label="Huvudnavigation">
      {active === "bibliotek" && !adminOpen && <div className="nav-plan-search"><label htmlFor="library-plan-search" className="sr-only">Sök planering</label><span className="nav-search-icon" aria-hidden="true">⌕</span><input id="library-plan-search" type="search" placeholder={showArchive ? "Sök i arkivet…" : "Sök planering…"} value={planSearch} onChange={event => onPlanSearchChange?.(event.target.value)} />{planSearch && <button type="button" className="nav-search-clear" onClick={() => onPlanSearchChange?.("")} aria-label="Rensa sökning">×</button>}</div>}
      {active !== 'mina' && <button type="button" className="planning-home-button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>⌂ Startsida</button>}

      {isAdmin && <button type="button" onClick={onOpenAdmin}>⚙ Administration {pendingCount > 0 ? '(' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </nav>

  </>
}