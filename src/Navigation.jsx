export default function Navigation({ plans = [], onOpenPlan, selectedId, onToggleCalendar, calendarOpen = false }) {
  const linkStyle = { color: 'white', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }
  const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#ede9fe', '#ffedd5']
  return <nav aria-label="Huvudmeny" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', gap: 14, alignItems: 'center', padding: '13px 24px', background: '#075b46', color: 'white', fontFamily: 'Segoe UI,Arial,sans-serif', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
    <a style={linkStyle} href="/">Årsplanering</a>
    <a style={linkStyle} href="/#lararvy">Lärarvy</a>
    <a style={linkStyle} href="/#elevvy">Elevvy</a>
    {onOpenPlan && plans.map((plan, index) => <button key={plan.id} type="button" onClick={() => onOpenPlan(plan)} title={`${plan.title || 'Utan namn'}${selectedId === plan.id ? ' (öppen)' : ''}`} aria-current={selectedId === plan.id ? 'page' : undefined} style={{ background: colors[index % colors.length], color: '#1f2937', border: selectedId === plan.id ? '3px solid #ffffff' : '2px solid transparent', boxShadow: selectedId === plan.id ? '0 0 0 2px #1f2937' : 'none', borderRadius: 7, padding: '5px 9px', font: 'inherit', fontWeight: 700, cursor: 'pointer', maxWidth: 220, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.title || 'Utan namn'}</button>)}
    <a style={linkStyle} href="/veckoplanering.html">Veckoplanering</a>
    {onToggleCalendar && <button type="button" onClick={onToggleCalendar} aria-pressed={calendarOpen} style={{ marginLeft: "auto", flexShrink: 0, background: calendarOpen ? "#fff" : "#fef3c7", color: "#173b30", border: "2px solid #fff", borderRadius: 9, padding: "7px 12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{calendarOpen ? "✕ Stäng årskalender" : "🔎 Zoom · Årskalender"}</button>}
  </nav>
}