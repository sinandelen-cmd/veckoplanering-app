import { useState } from 'react'

export default function Navigation({ active = 'mina', onAllWeeks, onNavigate, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, planContext, onPrintPlan, plans = [], selectedId, onOpenPlan, onDeletePlan, getPlanTheme, onNew, planSearch = '', onPlanSearchChange, onOpenArchive, showArchive, onOpenExample, onBack, onForward, canBack = false, canForward = false }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  const navigate = action => { const allowed = action?.(); if (allowed !== false) setMobileOpen(false) }
  const visiblePlans = plans.filter(row => String(row.title || row.name || '').toLocaleLowerCase('sv').includes(planSearch.toLocaleLowerCase('sv')))
  return <>
    <aside className={`planning-sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label="Sidomeny" id="planning-sidebar">
      <div className="sidebar-brand">Årsplanering</div>
      <button type="button" className={`sidebar-link${active === 'bibliotek' ? ' active' : ''}`} onClick={() => navigate(() => { const result = onNavigate('bibliotek'); if (result !== false) onCloseAdmin?.(); return result })}>⌂ Startsida</button>
      <button type="button" className={`sidebar-link${active === 'arsplan' && !calendarOpen ? ' active' : ''}`} onClick={() => navigate(() => onNavigate('arsplan', true))}>Planering</button>
      <button type="button" className={`sidebar-link${calendarOpen ? ' active' : ''}`} onClick={() => navigate(() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.())}>Månadsvy</button>
      {onAllWeeks && <button type="button" className="sidebar-link" onClick={() => navigate(onAllWeeks)}>Alla veckor</button>}
      <div className="sidebar-divider" />
      <button type="button" className={`sidebar-link${active === 'bibliotek' ? ' active' : ''}`} onClick={() => navigate(() => onNavigate('bibliotek'))}>Planbibliotek</button>
      {onNew && <button type="button" className="sidebar-new" onClick={() => navigate(onNew)}>+ Ny planering</button>}
      {onPlanSearchChange && <input className="sidebar-search" aria-label="Sök planering" placeholder="Sök planering…" value={planSearch} onChange={event => onPlanSearchChange(event.target.value)} />}
      <div className="sidebar-plan-list" aria-label="Mina planeringar">
        {visiblePlans.map(row => <div className="sidebar-plan-row" key={row.id}>
          <button type="button" className={`sidebar-plan${selectedId === row.id ? ' selected' : ''}`} style={getPlanTheme ? { borderLeft: `3px solid ${getPlanTheme(row)?.accent || '#a8c6e0'}` } : undefined} title={row.title || row.name || 'Planering'} onClick={() => navigate(() => onOpenPlan?.(row))}>{row.title || row.name || 'Planering'}</button>
          {onDeletePlan && <button type="button" className="sidebar-plan-delete" aria-label={`Ta bort ${row.title || 'planering'}`} title="Ta bort planering" onClick={() => onDeletePlan(row)}>×</button>}
        </div>)}
        {!visiblePlans.length && <span className="sidebar-empty">Inga planeringar</span>}
      </div>
      {onOpenArchive && <button type="button" className="sidebar-link" onClick={() => navigate(onOpenArchive)}>{showArchive ? 'Arkiv öppet' : 'Arkiv'}</button>}
      {onOpenExample && <button type="button" className="sidebar-link" onClick={() => navigate(onOpenExample)}>Exempelplanering</button>}
      <div className="sidebar-divider" />
      {isAdmin && <button type="button" className={`sidebar-link${adminOpen ? ' active' : ''}`} onClick={() => navigate(onOpenAdmin)}>⚙ Administration{pendingCount > 0 ? ` (${pendingCount})` : ''}</button>}
      <button type="button" className="sidebar-link" onClick={() => navigate(onSignOut)}>Logga ut</button>
    </aside>
    {mobileOpen && <button type="button" className="planning-sidebar-backdrop" aria-label="Stäng meny" onClick={() => setMobileOpen(false)} />}
    <nav className="planning-unified-navigation" aria-label="Huvudnavigation">
      <button type="button" className="planning-menu-toggle" aria-label={mobileOpen ? 'Stäng menyn' : 'Öppna menyn'} aria-expanded={mobileOpen} aria-controls="planning-sidebar" onClick={() => setMobileOpen(value => !value)}>☰</button>
      <div className="planning-unified-left">
        <button type="button" aria-label="Tillbaka" title="Tillbaka" disabled={!canBack} onClick={onBack}>←</button>
        <button type="button" aria-label="Framåt" title="Framåt" disabled={!canForward} onClick={onForward}>→</button>
      </div>
      {planContext && <div className="planning-nav-tools"><div className="planning-nav-context" title={[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(' ')}><span className="planning-nav-context-title">{[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(' ')}</span></div></div>}
      <div className="planning-unified-right">{onPrintPlan && <button type="button" className="planning-nav-print" onClick={onPrintPlan} aria-label="Skriv ut planeringen" title="Skriv ut planeringen">🖨️</button>}</div>
    </nav>
  </>
}
