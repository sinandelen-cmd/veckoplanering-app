export default function Navigation({ active = 'mina', onNavigate, onNew, selectedId, onToggleCalendar, calendarOpen = false, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false, planSearch = '', onPlanSearchChange, showArchive = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <nav className="planning-home-navigation" aria-label="Huvudnavigation">
      {active === "bibliotek" && !adminOpen && <div className="nav-plan-search"><label htmlFor="library-plan-search" className="sr-only">Sök planering</label><span className="nav-search-icon" aria-hidden="true">⌕</span><input id="library-plan-search" type="search" placeholder={showArchive ? "Sök i arkivet…" : "Sök planering…"} value={planSearch} onChange={event => onPlanSearchChange?.(event.target.value)} />{planSearch && <button type="button" className="nav-search-clear" onClick={() => onPlanSearchChange?.("")} aria-label="Rensa sökning">×</button>}</div>}
      {active !== 'mina' && <button type="button" className="planning-home-button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>⌂ Startsida</button>}

      {isAdmin && <button type="button" onClick={onOpenAdmin}>⚙ Administration {pendingCount > 0 ? '(' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </nav>
    {(selectedId || active === "arsplan" || active === "elevvy") && <nav className="planning-top-navigation planning-view-switcher" aria-label="Vyer för öppen planering" role="tablist">
      {selectedId && active !== "new" && <button type="button" className={calendarOpen && active !== "elevvy" ? "top-navigation-link active" : "top-navigation-link"} role="tab" aria-selected={calendarOpen && active !== "elevvy"} onClick={() => { onCloseAdmin?.(); onToggleCalendar?.() }}><span aria-hidden="true">▦</span> Kalendervy</button>}
      <button type="button" className={(active === 'arsplan' || active === 'redigera') && !calendarOpen ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-lararvy" aria-selected={(active === 'arsplan' || active === 'redigera') && !calendarOpen} aria-controls="panel-lararvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('arsplan') }}><span aria-hidden="true">▤</span> Lärarvy</button>

      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-elevvy" aria-selected={active === 'elevvy'} aria-controls="panel-elevvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('elevvy') }}><span aria-hidden="true">♙</span> Elevvy</button>
    </nav>}
  </>
}