import { useState } from 'react'

export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, getPlanTheme, onOpenPlan, onDeletePlan, onToggleCalendar, calendarOpen = false, onOpenExample, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin }) {
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
    <aside className="planning-sidebar" aria-label="Mina planeringar">
      <button type="button" className="sidebar-link sidebar-home-link" aria-current={active === "mina" && !adminOpen ? "page" : undefined} onClick={() => { onCloseAdmin?.(); onNavigate?.("mina") }} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,width:"100%",padding:"17px 16px",borderRadius:16,background:active === "mina" && !adminOpen ? "#f4c9d0" : "#fffaf1",border:"2px solid #b66b7c",boxShadow:"0 3px 0 #e7b7bd",color:"#773c4c",fontSize:"1.15rem",fontWeight:800,cursor:"pointer",marginBottom:18}}><svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/></svg><span>Startsida</span></button><div className="sidebar-brand">Mina planeringar</div>
      <div className="sidebar-plan-list" aria-label="Sparade planeringar">
        {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => <div key={row.id} className="sidebar-plan-entry" style={getPlanTheme ? { '--item-accent': getPlanTheme(row).accent, '--item-light': getPlanTheme(row).light, '--item-ink': getPlanTheme(row).ink } : undefined}><button type="button" style={getPlanTheme ? { '--item-accent': getPlanTheme(row).accent, '--item-light': getPlanTheme(row).light, '--item-ink': getPlanTheme(row).ink } : undefined} className={selectedId === row.id ? 'sidebar-plan selected' : 'sidebar-plan'} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => { onCloseAdmin?.(); onOpenPlan?.(row) }} title={row.title || 'Utan namn'}>{row.title || 'Utan namn'}</button><button type="button" className="sidebar-plan-delete" onClick={() => onDeletePlan?.(row)} aria-label={`Radera planering ${row.title || 'Utan namn'}`} title="Radera planering">🗑️</button></div>)}
      </div>
      {examples.some(example => !hiddenExamples.includes(example.id)) && <section aria-label="Exempelplaneringar" style={{marginTop:18,marginBottom:14}}>
        <div className="sidebar-brand" style={{marginBottom:8}}>Exempelplaneringar</div>
        <p style={{fontSize:12,opacity:.75,margin:"0 8px 10px"}}>Testexempel – påverkar inte dina sparade planeringar.</p>
        {examples.filter(example => !hiddenExamples.includes(example.id)).map(example => <div key={example.id} className="sidebar-plan-entry" style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
          <button type="button" className="sidebar-plan" style={{flex:1,textAlign:"left",background:"#f6f0fc",border:"1px solid #d8c5e7",borderRadius:10,padding:"10px 9px",cursor:"pointer"}} onClick={() => { onCloseAdmin?.(); onOpenExample?.(example.id) }}>{example.icon} {example.name}</button>
          <button type="button" className="sidebar-plan-delete" aria-label={`Ta bort exempel ${example.name}`} title="Ta bort exemplet från menyn" onClick={() => hideExample(example.id)}>✕</button>
        </div>)}
      </section>}
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