import { useState } from 'react'

export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, getPlanTheme, onOpenPlan, onDeletePlan, onToggleCalendar, calendarOpen = false, onOpenExample, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin, onSignOut }) {
  const [expandedPlans, setExpandedPlans] = useState({})
  const subjectIcon = title => {
    const name = String(title || '').toLocaleLowerCase('sv')
    if (name.includes('matematik') || name.includes('matte')) return '📐'
    if (/svenska|engelska|tyska|franska|spanska/.test(name)) return '📚'
    if (/fysik|kemi|biologi|naturkunskap/.test(name)) return '🔬'
    if (/historia|geografi|religion|samhäll/.test(name)) return '🌍'
    if (/idrott|hälsa/.test(name)) return '🏃'
    if (name.includes('musik')) return '🎵'
    if (name.includes('bild')) return '🎨'
    if (/teknik|programmering/.test(name)) return '💻'
    if (name.includes('slöjd')) return '🛠️'
    return '📘'
  }
  const planClasses = row => { try { const data = JSON.parse(row.content || '{}'); return Array.isArray(data.classGroups) ? data.classGroups : Array.isArray(data.plan?.classGroups) ? data.plan.classGroups : [] } catch { return [] } }
  const [hiddenExamples, setHiddenExamples] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('arsplanering-hidden-sidebar-examples') || '[]') } catch { return [] }
  })
  const examples = [{ id: 'math', name: 'Matematik 8B', icon: '📐' }, { id: 'swedish', name: 'Svenska åk 5', icon: '📖' }, { id: 'science', name: 'NO åk 7', icon: '🔬' }]
  const hideExample = id => {
    const next = [...hiddenExamples, id]
    setHiddenExamples(next)
    try { window.localStorage.setItem('arsplanering-hidden-sidebar-examples', JSON.stringify(next)) } catch { /* no storage */ }
  }
  if (!onNavigate) return <nav className="public-navigation" aria-label="Huvudmeny"><a href="/">Årsplanering</a></nav>
  return <>
    <nav className="planning-home-navigation" aria-label="Huvudnavigation">
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>⌂ Startsida</button>
      <button type="button" onClick={() => { onCloseAdmin?.(); onNew?.() }}>＋ Ny planering</button>
      <button type="button" onClick={() => { onCloseAdmin?.(); onNavigate?.('mina') }}>▤ Mina planeringar</button>
      <button type="button" onClick={() => { onCloseAdmin?.(); onOpenArchive?.() }}>Arkiv</button>
      {isAdmin && <button type="button" onClick={onOpenAdmin}>⚙ Administration {pendingCount > 0 ? '(' + pendingCount + ')' : ''}</button>}
      <button type="button" onClick={onSignOut}>Logga ut</button>
    </nav>
    <nav className="planning-top-navigation planning-view-switcher" aria-label="Vyer för öppen planering" role="tablist">
      {selectedId && active !== "new" && <button type="button" className={calendarOpen && active !== "elevvy" ? "top-navigation-link active" : "top-navigation-link"} role="tab" aria-selected={calendarOpen && active !== "elevvy"} onClick={() => { onCloseAdmin?.(); onToggleCalendar?.() }}><span aria-hidden="true">▦</span> Kalendervy</button>}
      <button type="button" className={(active === 'arsplan' || active === 'redigera') && !calendarOpen ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-lararvy" aria-selected={(active === 'arsplan' || active === 'redigera') && !calendarOpen} aria-controls="panel-lararvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('arsplan') }}><span aria-hidden="true">▤</span> Lärarvy</button>

      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-elevvy" aria-selected={active === 'elevvy'} aria-controls="panel-elevvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('elevvy') }}><span aria-hidden="true">♙</span> Elevvy</button>
    </nav>
  </>
}