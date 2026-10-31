import { useState } from 'react'

export default function Navigation({ active = 'mina', onNavigate, onAllWeeks, onNew, onToggleCalendar, calendarOpen = false, hasOpenPlan = false, allWeeksOpen = false, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut, onBack, onForward, canBack = false, canForward = false, onPrintPlan, previousLabel = 'Startsida', onPrevious, planTitle = '' }) {
  const [planningMenuOpen, setPlanningMenuOpen] = useState(false)
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  const choose = action => { setPlanningMenuOpen(false); action() }
  return <nav className="planning-unified-navigation planning-original-top" aria-label="Huvudnavigation">
    <div className="planning-unified-left">
      <button type="button" onClick={() => choose(() => { onCloseAdmin?.(); if (onPrevious) onPrevious(); else onNavigate('mina') })}>← {previousLabel}</button>
    </div>
    <div className="planning-unified-center">
      {planTitle ? <strong className="planning-active-plan-title" title={planTitle}>{planTitle}</strong> : <div className="planning-nav-dropdown">
        <button type="button" className={(active === 'bibliotek' || active === 'arsplan') && !adminOpen ? 'active' : ''} aria-expanded={planningMenuOpen} aria-haspopup="true" onClick={() => { onCloseAdmin?.(); setPlanningMenuOpen(value => !value) }}>Planering <span aria-hidden="true">{planningMenuOpen ? '▴' : '▾'}</span></button>
        {planningMenuOpen && <div className="planning-nav-submenu" role="group" aria-label="Planeringsmeny">
          <button type="button" onClick={() => choose(() => onNavigate('bibliotek'))}>📁 Mina planeringar</button>
          {hasOpenPlan && <>
            <button type="button" onClick={() => choose(() => onNavigate('arsplan'))}>📘 Grundplanering</button>
            <button type="button" onClick={() => choose(() => calendarOpen ? onNavigate('arsplan') : onToggleCalendar?.())}>🗓 Kalendervy</button>
            {onAllWeeks && <button type="button" onClick={() => choose(() => { onNavigate('arsplan'); onAllWeeks() })}>{allWeeksOpen ? "▦ Stäng alla veckor" : "▦ Visa alla veckor"}</button>}
          </>}
        </div>}
      </div>}
    </div>
    <div className="planning-unified-right">
      {onNew && <button type="button" onClick={onNew}>+ Ny planering</button>}
      {onBack && <button type="button" aria-label="Tillbaka" disabled={!canBack} onClick={onBack}>←</button>}
      {onForward && <button type="button" aria-label="Framåt" disabled={!canForward} onClick={onForward}>→</button>}
      {onPrintPlan && <button type="button" aria-label="Skriv ut" onClick={onPrintPlan}>🖨️</button>}
      {isAdmin && <button type="button" onClick={() => choose(onOpenAdmin)}>⚙ Administration{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </div>
  </nav>
}
