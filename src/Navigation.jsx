export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, onOpenPlan, onToggleCalendar, calendarOpen = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <aside className="planning-sidebar" aria-label="Huvudmeny">
    <div className="sidebar-brand">Årsplanering</div>
    <button type="button" className={active === 'mina' ? 'sidebar-link active' : 'sidebar-link'} aria-current={active === 'mina' ? 'page' : undefined} onClick={() => onNavigate('mina')}>Mina planeringar</button>
    <button type="button" className="sidebar-new" onClick={onNew}>+ Ny planering</button>
    <div className="sidebar-plan-list" aria-label="Sparade planeringar">
      {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => <button key={row.id} type="button" className={selectedId === row.id ? 'sidebar-plan selected' : 'sidebar-plan'} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => onOpenPlan(row)} title={row.title || 'Utan namn'}>{row.title || 'Utan namn'}</button>)}
    </div>
    <div className="sidebar-divider" />
    <button type="button" className={active === 'arsplan' || active === 'redigera' ? 'sidebar-link active' : 'sidebar-link'} aria-current={active === 'arsplan' || active === 'redigera' ? 'page' : undefined} onClick={() => onNavigate('arsplan')}>Lärarvy</button>
    <button type="button" className={active === 'elevvy' ? 'sidebar-link active' : 'sidebar-link'} aria-current={active === 'elevvy' ? 'page' : undefined} onClick={() => onNavigate('elevvy')}>Elevvy</button>
    {onToggleCalendar && active === 'arsplan' && <button type="button" className="sidebar-link sidebar-calendar" onClick={onToggleCalendar} aria-pressed={calendarOpen}>{calendarOpen ? 'Dölj kalender' : 'Visa kalender'}</button>}
  </aside>
}
