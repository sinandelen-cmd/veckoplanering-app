export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, onOpenPlan, onToggleCalendar, calendarOpen = false }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <aside className="planning-sidebar" aria-label="Mina planeringar">
      <div className="sidebar-brand">Mina planeringar</div>
      <button type="button" className={active === 'mina' ? 'sidebar-link active' : 'sidebar-link'} aria-current={active === 'mina' ? 'page' : undefined} onClick={() => onNavigate('mina')}>Visa alla planeringar</button>
      <button type="button" className="sidebar-new" onClick={onNew}>+ Ny planering</button>
      <div className="sidebar-plan-list" aria-label="Sparade planeringar">
        {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => <button key={row.id} type="button" className={selectedId === row.id ? 'sidebar-plan selected' : 'sidebar-plan'} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => onOpenPlan(row)} title={row.title || 'Utan namn'}>{row.title || 'Utan namn'}</button>)}
      </div>
    </aside>
    <nav className="planning-top-navigation" aria-label="Vyer för öppen planering">
      <span className="top-navigation-brand">Årsplanering</span>
      <button type="button" className={active === 'arsplan' || active === 'redigera' ? 'top-navigation-link active' : 'top-navigation-link'} aria-current={active === 'arsplan' || active === 'redigera' ? 'page' : undefined} onClick={() => onNavigate('arsplan')}>Lärarvy</button>
      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} aria-current={active === 'elevvy' ? 'page' : undefined} onClick={() => onNavigate('elevvy')}>Elevvy</button>
      {onToggleCalendar && active === 'arsplan' && <button type="button" className="top-navigation-link top-calendar" onClick={onToggleCalendar} aria-pressed={calendarOpen}>{calendarOpen ? 'Dölj kalender' : 'Visa kalender'}</button>}
    </nav>
  </>
}
