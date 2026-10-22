export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, getPlanTheme, onOpenPlan, onDeletePlan, onToggleCalendar, calendarOpen = false, onOpenExample, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin }) {
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <aside className="planning-sidebar" aria-label="Mina planeringar">
      <button type="button" className={active === "new" ? "sidebar-new selected" : "sidebar-new"} aria-current={active === "new" ? "page" : undefined} onClick={() => { onCloseAdmin?.(); onNew?.() }}>+ Ny planering</button>
      <button type="button" className="sidebar-link sidebar-home-link" onClick={() => { onCloseAdmin?.(); onNavigate?.("mina") }}>⌂ Startsida</button><div className="sidebar-brand">Mina planeringar</div>
      <div className="sidebar-plan-list" aria-label="Sparade planeringar">
        {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => <div key={row.id} className="sidebar-plan-entry" style={getPlanTheme ? { '--item-accent': getPlanTheme(row).accent, '--item-light': getPlanTheme(row).light, '--item-ink': getPlanTheme(row).ink } : undefined}><button type="button" style={getPlanTheme ? { '--item-accent': getPlanTheme(row).accent, '--item-light': getPlanTheme(row).light, '--item-ink': getPlanTheme(row).ink } : undefined} className={selectedId === row.id ? 'sidebar-plan selected' : 'sidebar-plan'} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => { onCloseAdmin?.(); onOpenPlan?.(row) }} title={row.title || 'Utan namn'}>{row.title || 'Utan namn'}</button><button type="button" className="sidebar-plan-delete" onClick={() => onDeletePlan?.(row)} aria-label={`Radera planering ${row.title || 'Utan namn'}`} title="Radera planering">🗑️</button></div>)}
      </div>
      <button type="button" className="sidebar-link sidebar-archive-link" onClick={() => { onCloseAdmin?.(); onOpenArchive?.() }}>Arkiv</button>
      {isAdmin && <button type="button" className="sidebar-link sidebar-admin-link" style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid #ddd", paddingTop: 14 }} onClick={onOpenAdmin} aria-label="Administration" aria-expanded={adminOpen} title="Administration"><span>⚙ Administration</span>{pendingCount > 0 && <span aria-label={`${pendingCount} väntande ansökningar`} style={{ background: "#253c58", color: "white", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{pendingCount}</span>}</button>}
    </aside>
    <nav className="planning-top-navigation planning-view-switcher" aria-label="Vyer för öppen planering" role="tablist">
      {selectedId && active !== "new" && <button type="button" className={calendarOpen && active !== "elevvy" ? "top-navigation-link active" : "top-navigation-link"} role="tab" aria-selected={calendarOpen && active !== "elevvy"} onClick={() => { onCloseAdmin?.(); onToggleCalendar?.() }}><span aria-hidden="true">▦</span> Kalendervy</button>}
      <button type="button" className={(active === 'arsplan' || active === 'redigera') && !calendarOpen ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-lararvy" aria-selected={(active === 'arsplan' || active === 'redigera') && !calendarOpen} aria-controls="panel-lararvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('arsplan') }}><span aria-hidden="true">▦</span> Lärarvy</button>

      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-elevvy" aria-selected={active === 'elevvy'} aria-controls="panel-elevvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('elevvy') }}><span aria-hidden="true">♧</span> Elevvy</button>
    </nav>
  </>
}
