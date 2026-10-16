export default function Navigation() {
  const linkStyle = { color: 'white', fontWeight: 700, textDecoration: 'none' }
  return <nav aria-label="Huvudmeny" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', gap: 18, alignItems: 'center', padding: '13px 24px', background: '#075b46', color: 'white', fontFamily: 'Segoe UI,Arial,sans-serif', flexWrap: 'wrap' }}>
    <a style={linkStyle} href="/">Årsplanering</a>
    <a style={linkStyle} href="/#lararvy">Lärarvy</a>
    <a style={linkStyle} href="/#elevvy">Elevvy</a>
    <a style={linkStyle} href="/veckoplanering.html">Veckoplanering</a>
  </nav>
}