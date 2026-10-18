export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, onOpenPlan, onToggleCalendar, calendarOpen = false, onOpenExample, onOpenArchive }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <aside className="planning-sidebar" aria-label="Mina planeringar">
      <button type="button" className="sidebar-new" onClick={onNew}>+ Ny planering</button>
      <div className="sidebar-brand">Mina planeringar</div>
      <div className="sidebar-plan-list" aria-label="Sparade planeringar">
        {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => <button key={row.id} type="button" className={selectedId === row.id ? 'sidebar-plan selected' : 'sidebar-plan'} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => onOpenPlan(row)} title={row.title || 'Utan namn'}>{row.title || 'Utan namn'}</button>)}
      </div>
      <div className="sidebar-brand sidebar-examples-heading">Testplaneringar (påhittade)</div>
      <button type="button" className="sidebar-plan" onClick={() => onOpenExample?.("math")}>Exempel: Matematik åk 6</button>
      <button type="button" className="sidebar-plan" onClick={() => onOpenExample?.("swedish")}>Exempel: Svenska åk 5</button>
      <button type="button" className="sidebar-plan" onClick={() => onOpenExample?.("science")}>Exempel: NO åk 7</button>
      <button type="button" className="sidebar-link sidebar-archive-link" onClick={onOpenArchive}>Arkiv</button>
    </aside>
    <nav className="planning-top-navigation" aria-label="Vyer för öppen planering" role="tablist">
      <button type="button" className={active === 'arsplan' || active === 'redigera' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-lararvy" aria-selected={active === 'arsplan' || active === 'redigera'} aria-controls="panel-lararvy" onClick={() => onNavigate('arsplan')}>Lärarvy</button>
      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-elevvy" aria-selected={active === 'elevvy'} aria-controls="panel-elevvy" onClick={() => onNavigate('elevvy')}>Elevvy</button>
      {onToggleCalendar && active === 'arsplan' && <button type="button" className="top-navigation-link top-calendar" role="button" onClick={onToggleCalendar} aria-pressed={calendarOpen}>{calendarOpen ? 'Dölj kalender' : 'Visa kalender'}</button>}
    </nav>
  </>
}
