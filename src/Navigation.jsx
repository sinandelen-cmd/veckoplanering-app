export default function Navigation({ active = 'mina', onNavigate, onNew, selectedId, onToggleCalendar, calendarOpen = false, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false, planSearch = '', onPlanSearchChange, showArchive = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    {selectedId && !adminOpen && (active === 'arsplan' || active === 'elevvy') && <nav className="planning-view-tabs" aria-label="Välj planeringsvy">
      <button type="button" className={active === 'arsplan' && !calendarOpen ? 'active' : ''} aria-current={active === 'arsplan' && !calendarOpen ? 'page' : undefined} onClick={() => onNavigate?.('arsplan')}>Planering</button>
      <button type="button" className={calendarOpen ? 'active' : ''} aria-current={calendarOpen ? 'page' : undefined} onClick={() => calendarOpen ? onNavigate?.('arsplan') : onToggleCalendar?.()}>Kalender</button>
      <button type="button" className={active === 'elevvy' ? 'active' : ''} aria-current={active === 'elevvy' ? 'page' : undefined} onClick={() => onNavigate?.('elevvy')}>Elevvy</button>
      <button type="button" onClick={() => window.print()}>Utskrift</button>
    </nav>}
    <nav className="planning-home-navigation" aria-label="Huvudnavigation">
      {active === "bibliotek" && !adminOpen && <div className="nav-plan-search"><label htmlFor="library-plan-search" className="sr-only">Sök planering</label><span className="nav-search-icon" aria-hidden="true">⌕</span><input id="library-plan-search" type="search" placeholder={showArchive ? "Sök i arkivet…" : "Sök planering…"} value={planSearch} onChange={event => onPlanSearchChange?.(event.target.value)} />{planSearch && <button type="button" className="nav-search-clear" onClick={() => onPlanSearchChange?.("")} aria-label="Rensa sökning">×</button>}</div>}
      {active !== 'mina' && <button type="button" className="planning-home-button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>⌂ Startsida</button>}

      {isAdmin && <button type="button" onClick={onOpenAdmin}>⚙ Administration {pendingCount > 0 ? '(' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </nav>

  </>
}