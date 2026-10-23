export default function Navigation({ active = 'mina', onNavigate, onNew, selectedId, onToggleCalendar, calendarOpen = false, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <nav className="planning-home-navigation" aria-label="Huvudnavigation">
      <button type="button" className="planning-home-button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>⌂ Startsida</button>
      <div className="planning-history-buttons" aria-label="Sidnavigering"><button type="button" onClick={onBack} disabled={!canBack} title="Till föregående sida">← Tillbaka</button><button type="button" onClick={onForward} disabled={!canForward} title="Till nästa sida">Framåt →</button></div>
      {active !== 'arsplan' && active !== 'elevvy' && active !== 'redigera' && <button type="button" onClick={() => { onCloseAdmin?.(); onNew?.() }}>＋ Ny planering</button>}
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate?.('bibliotek') }}>▤ Mina planeringar</button>
      <button type="button" onClick={() => { onCloseAdmin?.(); onOpenArchive?.() }}>Arkiv</button>
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