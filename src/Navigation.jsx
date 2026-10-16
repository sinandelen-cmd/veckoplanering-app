export default function Navigation({ plans = [], onOpenPlan }) {
  const linkStyle = { color: 'white', fontWeight: 700, textDecoration: 'none' }
  return <nav aria-label="Huvudmeny" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', gap: 18, alignItems: 'center', padding: '13px 24px', background: '#075b46', color: 'white', fontFamily: 'Segoe UI,Arial,sans-serif', flexWrap: 'wrap' }}>
    <a style={linkStyle} href="/">Årsplanering</a>
    <a style={linkStyle} href="/#lararvy">Lärarvy</a>
    <a style={linkStyle} href="/#elevvy">Elevvy</a>
    {onOpenPlan && plans.map(plan => <button key={plan.id} type="button" onClick={() => { if (onOpenPlan(plan) !== false) window.scrollTo({ top: 0, behavior: 'smooth' }) }} title={plan.title} style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,.55)', borderRadius: 7, padding: '5px 9px', font: 'inherit', fontWeight: 700, cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.title || 'Utan namn'}</button>)}
    <a style={linkStyle} href="/veckoplanering.html">Veckoplanering</a>
  </nav>
}