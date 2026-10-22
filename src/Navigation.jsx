import { useState } from 'react'

export default function Navigation({ active = 'mina', onNavigate, onNew, plans = [], selectedId, getPlanTheme, onOpenPlan, onDeletePlan, onToggleCalendar, calendarOpen = false, onOpenExample, onOpenArchive, isAdmin = false, onOpenAdmin, adminOpen = false, pendingCount = 0, onCloseAdmin }) {
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
    <aside className="planning-sidebar" aria-label="Mina planeringar">
      <button type="button" className="sidebar-link sidebar-home-link" aria-current={active === "mina" && !adminOpen ? "page" : undefined} onClick={() => { onCloseAdmin?.(); onNavigate?.("mina") }} ><svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/></svg><span>Startsida</span></button><div className="sidebar-brand">Mina planeringar</div>
      <div className="sidebar-plan-list" aria-label="Sparade planeringar">
        {plans.length === 0 ? <p className="sidebar-empty">Inga sparade planeringar ännu</p> : plans.map(row => { const classes = planClasses(row); const expanded = expandedPlans[row.id] ?? (selectedId === row.id); return <div key={row.id} className="sidebar-plan-entry" style={getPlanTheme ? { '--item-accent': getPlanTheme(row).accent, '--item-light': getPlanTheme(row).light, '--item-ink': getPlanTheme(row).ink } : undefined}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            {classes.length>0 && <button type="button" aria-label={(expanded?"Dölj":"Visa")+" klasser för "+row.title} aria-expanded={expanded} onClick={()=>setExpandedPlans(p=>({...p,[row.id]:!expanded}))} style={{border:0,background:"transparent",cursor:"pointer",padding:"5px 3px",flexShrink:0}}>{expanded?"▾":"▸"}</button>}
            <button type="button" className={selectedId===row.id?'sidebar-plan selected':'sidebar-plan'} style={{flex:1,minWidth:0,textAlign:"left"}} onClick={()=>{onCloseAdmin?.();onOpenPlan?.(row)}} title={row.title||'Utan namn'}><span aria-hidden="true" style={{marginRight:7}}>{subjectIcon(row.title)}</span>{row.title||"Utan namn"}</button>
          </div>
          {classes.length>0 && expanded && <div style={{margin:"4px 0 8px 19px",paddingLeft:9,borderLeft:"2px solid #d8c7a1"}}>
            <button type="button" onClick={()=>{onCloseAdmin?.();onOpenPlan?.(row)}} style={{display:"block",border:0,background:"transparent",padding:"6px 4px",cursor:"pointer",textAlign:"left",fontSize:13}}>📖 Grundplanering</button>
            {classes.map((g,i)=><button key={i} type="button" onClick={()=>{onCloseAdmin?.();onOpenPlan?.(row,g.name)}} style={{display:"block",width:"100%",border:0,background:"transparent",padding:"6px 4px",cursor:"pointer",textAlign:"left",fontSize:13}}>↳ {g.name}</button>)}
          </div>}
        </div>})}
      </div>
      {examples.some(example => !hiddenExamples.includes(example.id)) && <section aria-label="Exempelplaneringar" style={{marginTop:18,marginBottom:14}}>
        <div className="sidebar-brand" style={{marginBottom:8}}>Exempelplaneringar</div>
        <p style={{fontSize:12,opacity:.75,margin:"0 8px 10px"}}>Testexempel – påverkar inte dina sparade planeringar.</p>
        {examples.filter(example => !hiddenExamples.includes(example.id)).map(example => <div key={example.id} className="sidebar-plan-entry" style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
          <button type="button" className="sidebar-plan" style={{flex:1,textAlign:"left",background:"#f6f0fc",border:"1px solid #d8c5e7",borderRadius:10,padding:"10px 9px",cursor:"pointer"}} onClick={() => { onCloseAdmin?.(); onOpenExample?.(example.id) }}>{example.icon} {example.name}</button>
          
        </div>)}
      </section>}
      <button type="button" className="sidebar-link sidebar-archive-link" onClick={() => { onCloseAdmin?.(); onOpenArchive?.() }}>Arkiv</button>
      {isAdmin && <button type="button" className="sidebar-link sidebar-admin-link" style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid #ddd", paddingTop: 14 }} onClick={onOpenAdmin} aria-label="Administration" aria-expanded={adminOpen} title="Administration"><span>⚙ Administration</span>{pendingCount > 0 && <span aria-label={`${pendingCount} väntande ansökningar`} style={{ background: "#253c58", color: "white", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{pendingCount}</span>}</button>}
    </aside>
    <nav className="planning-top-navigation planning-view-switcher" aria-label="Vyer för öppen planering" role="tablist">
      {selectedId && active !== "new" && <button type="button" className={calendarOpen && active !== "elevvy" ? "top-navigation-link active" : "top-navigation-link"} role="tab" aria-selected={calendarOpen && active !== "elevvy"} onClick={() => { onCloseAdmin?.(); onToggleCalendar?.() }}><span aria-hidden="true">▦</span> Kalendervy</button>}
      <button type="button" className={(active === 'arsplan' || active === 'redigera') && !calendarOpen ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-lararvy" aria-selected={(active === 'arsplan' || active === 'redigera') && !calendarOpen} aria-controls="panel-lararvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('arsplan') }}><span aria-hidden="true">▤</span> Lärarvy</button>

      <button type="button" className={active === 'elevvy' ? 'top-navigation-link active' : 'top-navigation-link'} role="tab" id="tab-elevvy" aria-selected={active === 'elevvy'} aria-controls="panel-elevvy" onClick={() => { onCloseAdmin?.(); onNavigate?.('elevvy') }}><span aria-hidden="true">♙</span> Elevvy</button>
    </nav>
  </>
}