import { useState } from 'react'

export default function Navigation({ active = 'mina', onAllWeeks, onNavigate, onToggleCalendar, calendarOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, planContext, onPrintPlan, plans = [], selectedId, onOpenPlan, onDeletePlan, getPlanTheme, onNew, planSearch = '', onPlanSearchChange, onOpenArchive, showArchive, onOpenExample, onBack, onForward, canBack = false, canForward = false }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navigationChoice, setNavigationChoice] = useState(null)
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  const navigate = (action, destination = null) => { const allowed = action?.(); if (allowed !== false) { setMobileOpen(false); if (destination) setNavigationChoice(destination) } }
  const visiblePlans = plans.filter(row => String(row.title || row.name || '').toLocaleLowerCase('sv').includes(planSearch.toLocaleLowerCase('sv')))
  const currentPage = adminOpen ? 'Administration' : showArchive ? 'Arkiv' : calendarOpen ? 'Månadsvy' : active === 'bibliotek' ? (navigationChoice === 'Startsida' ? 'Startsida' : 'Planbibliotek') : active === 'arsplan' ? (navigationChoice === 'Alla veckor' ? 'Alla veckor' : 'Planering') : 'Startsida'
  const currentPlan = plans.find(row => row.id === selectedId)
  const crumbs = currentPage === 'Administration' ? ['Startsida', 'Administration'] : currentPage === 'Arkiv' ? ['Startsida', 'Planbibliotek', 'Arkiv'] : currentPage === 'Planbibliotek' || currentPage === 'Startsida' ? ['Startsida', ...(currentPage === 'Planbibliotek' ? ['Planbibliotek'] : [])] : ['Startsida', 'Planering', ...(currentPlan ? [currentPlan.title || currentPlan.name || 'Min planering'] : []), ...(currentPage !== 'Planering' ? [currentPage] : [])]
  return <>
    <aside className={`planning-sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label="Sidomeny" id="planning-sidebar">
      <div className="sidebar-brand">Årsplanering</div>
      <button type="button" className={`sidebar-link${active === 'bibliotek' ? ' active' : ''}`} onClick={() => navigate(() => { const result = onNavigate('bibliotek'); if (result !== false) onCloseAdmin?.(); return result }), 'Startsida')}>⌂ Startsida</button>
      <button type="button" className={`sidebar-link${active === 'arsplan' && !calendarOpen ? ' active' : ''}`} onClick={() => navigate(() => onNavigate('arsplan', true), 'Planering')}>Planering</button>
      <button type="button" className={`sidebar-link${calendarOpen ? ' active' : ''}`} onClick={() => navigate(() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.(), 'Månadsvy')}>Månadsvy</button>
      {onAllWeeks && <button type="button" className="sidebar-link" onClick={() => navigate(onAllWeeks, 'Alla veckor')}>Alla veckor</button>}
      <div className="sidebar-divider" />
      <button type="button" className={`sidebar-link${active === 'bibliotek' ? ' active' : ''}`} onClick={() => navigate(() => onNavigate('bibliotek'), 'Planbibliotek')}>Planbibliotek</button>
      {onNew && <button type="button" className="sidebar-new" onClick={() => navigate(onNew, 'Planering')}>+ Ny planering</button>}
      {onPlanSearchChange && <input className="sidebar-search" aria-label="Sök planering" placeholder="Sök planering…" value={planSearch} onChange={event => onPlanSearchChange(event.target.value)} />}
      <div className="sidebar-plan-list" aria-label="Mina planeringar">
        {visiblePlans.map(row => <div className="sidebar-plan-row" key={row.id}>
          <button type="button" className={`sidebar-plan${selectedId === row.id ? ' selected' : ''}`} style={getPlanTheme ? { borderLeft: `3px solid ${getPlanTheme(row)?.accent || '#a8c6e0'}` } : undefined} title={row.title || row.name || 'Planering'} onClick={() => navigate(() => onOpenPlan?.(row), 'Planering')}>{row.title || row.name || 'Planering'}</button>
          {onDeletePlan && <button type="button" className="sidebar-plan-delete" aria-label={`Ta bort ${row.title || 'planering'}`} title="Ta bort planering" onClick={() => onDeletePlan(row)}>×</button>}
        </div>)}
        {!visiblePlans.length && <span className="sidebar-empty">Inga planeringar</span>}
      </div>
      {onOpenArchive && <button type="button" className="sidebar-link" onClick={() => navigate(onOpenArchive, 'Arkiv')}>{showArchive ? 'Arkiv öppet' : 'Arkiv'}</button>}
      {onOpenExample && <button type="button" className="sidebar-link" onClick={() => navigate(onOpenExample, 'Planering')}>Exempelplanering</button>}
      <div className="sidebar-divider" />
      {isAdmin && <button type="button" className={`sidebar-link${adminOpen ? ' active' : ''}`} onClick={() => navigate(onOpenAdmin, 'Administration')}>⚙ Administration{pendingCount > 0 ? ` (${pendingCount})` : ''}</button>}
      <button type="button" className="sidebar-link" onClick={() => navigate(onSignOut)}>Logga ut</button>
    </aside>
    {mobileOpen && <button type="button" className="planning-sidebar-backdrop" aria-label="Stäng meny" onClick={() => setMobileOpen(false)} />}
    <nav className="planning-unified-navigation" aria-label="Huvudnavigation">
      <button type="button" className="planning-menu-toggle" aria-label={mobileOpen ? 'Stäng menyn' : 'Öppna menyn'} aria-expanded={mobileOpen} aria-controls="planning-sidebar" onClick={() => setMobileOpen(value => !value)}>☰</button>
      <div className="planning-unified-left">
        <button type="button" aria-label="Tillbaka" title="Tillbaka" disabled={!canBack} onClick={onBack}>←</button>
        <button type="button" aria-label="Framåt" title="Framåt" disabled={!canForward} onClick={onForward}>→</button>
      </div>
      <div className="planning-nav-tools"><div className="planning-breadcrumbs" aria-label="Du är här" title={crumbs.join(' › ')}>{crumbs.map((crumb, index) => <span className="planning-breadcrumb-item" key={index}>{index > 0 && <span className="planning-breadcrumb-separator" aria-hidden="true">›</span>}<span className={index === crumbs.length - 1 ? 'planning-breadcrumb-current' : 'planning-breadcrumb-parent'} aria-current={index === crumbs.length - 1 ? 'page' : undefined}>{crumb}</span></span>)}</div>{planContext && <span className="planning-breadcrumb-subtitle" title={[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(' ')}>{[planContext.textbook || planContext.subject, planContext.grade].filter(Boolean).join(' ')}</span>}</div>
      <div className="planning-unified-right">{onPrintPlan && <button type="button" className="planning-nav-print" onClick={onPrintPlan} aria-label="Skriv ut planeringen" title="Skriv ut planeringen">🖨️</button>}</div>
    </nav>
  </>
}
