export default function Navigation({ active = 'mina', onAllWeeks, onNavigate, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, planContext, onPrintPlan, onNew, onOpenArchive, showArchive, onBack, onForward, canBack = false, canForward = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  const items = [
    { id: 'mina', title: 'Startsida', run: () => onNavigate('mina') },
    { id: 'arsplan', title: 'Planering', run: () => onNavigate('arsplan', true) },
    { id: 'bibliotek', title: 'Mina planeringar', run: () => onNavigate('bibliotek') },
    { id: 'calendar', title: 'Månadsvy', run: () => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.() },
    ...(onAllWeeks ? [{ id: 'weeks', title: 'Alla veckor', run: onAllWeeks }] : []),
  ]
  return <nav className="planning-unified-navigation planning-top-only" aria-label="Övre meny">
    <div className="planning-top-brand">Årsplanering</div>
    <div className="planning-top-links" aria-label="Välj vy">
      {items.map(item => <button type="button" key={item.id} className={((item.id === 'calendar' && calendarOpen) || (item.id !== 'calendar' && item.id !== 'weeks' && active === item.id && !calendarOpen)) ? 'active' : ''} onClick={item.run}>{item.title}</button>)}
      {onNew && <button type="button" onClick={onNew}>+ Ny</button>}
      {onOpenArchive && <button type="button" onClick={onOpenArchive}>{showArchive ? 'Arkiv öppet' : 'Arkiv'}</button>}
      {isAdmin && <button type="button" className={adminOpen ? 'active' : ''} onClick={onOpenAdmin}>Administration{pendingCount ? ` (${pendingCount})` : ''}</button>}
    </div>
    <div className="planning-top-actions">
      <button type="button" aria-label="Tillbaka" title="Tillbaka" disabled={!canBack} onClick={onBack}>←</button>
      <button type="button" aria-label="Framåt" title="Framåt" disabled={!canForward} onClick={onForward}>→</button>
      {onPrintPlan && <button type="button" aria-label="Skriv ut" title="Skriv ut" onClick={onPrintPlan}>🖨️</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </div>
  </nav>
}
