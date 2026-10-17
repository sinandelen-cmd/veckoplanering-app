export default function Navigation({ active = 'arsplan', onNavigate, onNew, onToggleCalendar, calendarOpen = false }) {
  const destinations = [['arsplan', 'Lärarvy'], ['redigera', 'Redigera'], ['mina', 'Mina planer'], ['elevvy', 'Elevvy']]
  return <nav className="unified-navigation" aria-label="Huvudmeny">
    <a className="navigation-brand" href="/">Årsplanering</a>
    {onNavigate ? <>
      <button type="button" className="navigation-new" onClick={onNew}>+ Ny planering</button>
      {destinations.map(([id, label]) => <button key={id} type="button" className={active === id ? 'navigation-link active' : 'navigation-link'} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}>{label}</button>)}
      {onToggleCalendar && active === 'arsplan' && <button type="button" className="navigation-link calendar-toggle" onClick={onToggleCalendar} aria-pressed={calendarOpen}>{calendarOpen ? 'Dölj kalender' : 'Visa kalender'}</button>}
    </> : <><a className="navigation-link" href="/#lararvy">Lärarvy</a><a className="navigation-link" href="/#elevvy">Elevvy</a></>}
  </nav>
}
