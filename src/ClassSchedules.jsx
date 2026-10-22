import React from 'react'

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']
const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre']
const iso = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-')
const monday = value => {
  const date = new Date((value || iso(new Date())) + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return new Date()
  date.setDate(date.getDate() - ((date.getDay()+6)%7))
  return date
}
const nextDate = (start, offset) => { const d = new Date(start); d.setDate(d.getDate()+offset); return d }
const describe = lesson => (lesson?.topics || []).map(topic => {
  const parts = [topic.name, topic.pagesLabel, topic.assignmentsLabel, ...(topic.pages || []), ...(topic.assignments || [])]
  return parts.filter(Boolean).join(' · ')
}).filter(Boolean).join('; ') || lesson?.name || 'Lektion utan innehåll'

export function buildClassSchedule(plan, group) {
  const lessons = (plan.weeksData || []).flatMap(week => (week.lessons || []).map((lesson, index) => ({
    lesson, weekNumber: week.weekNumber, weekTitle: week.title, weekStart: week.weekStart, index
  })))
  const start = new Date((group.startDate || plan.startDate || iso(new Date())) + 'T12:00:00')
  const days = Array.isArray(group.days) ? group.days : []
  const extraSlots = Array.isArray(group.extraSlots) ? group.extraSlots : []
  const cancelled = Array.isArray(group.cancelledDates) ? group.cancelledDates : []
  const slots = []
  // Varje veckodag kan ha flera lektioner, t.ex. två på måndag.
  for (let offset = 0; offset < 3650 && slots.length < lessons.length + cancelled.length; offset++) {
    const date = nextDate(start, offset)
    const dateKey = iso(date)
    const day = DAYS[(date.getDay()+6)%7]
    if (!day) continue
    const count = days.filter(d => d === day).length + extraSlots.filter(s => s.date === dateKey).length
    if (cancelled.includes(dateKey)) continue
    for (let slot = 0; slot < count; slot++) slots.push({ date: dateKey, day, slot: slot+1 })
  }
  return slots.slice(0, lessons.length).map((slot, i) => ({
    ...slot, ...lessons[i], lessonNumber: i+1,
    override: group.overrides?.[String(i)] || null
  }))
}

export default function ClassSchedules({ plan, onChange }) {
  const groups = Array.isArray(plan.classGroups) ? plan.classGroups : []
  const [name, setName] = React.useState('')
  const [days, setDays] = React.useState(['Måndag'])
  const [selected, setSelected] = React.useState(0)
  const [showAll, setShowAll] = React.useState(false)
  const [compare, setCompare] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [editText, setEditText] = React.useState('')
  const group = groups[selected]
  const lessonsPerWeek = group => (group.days || []).length
  const schedule = React.useMemo(() => group ? buildClassSchedule(plan, group) : [], [plan, group])
  const updateGroup = changes => onChange({ ...plan, classGroups: groups.map((g, i) => i === selected ? { ...g, ...changes } : g) })
  const addClass = () => {
    if (!name.trim() || !days.length || groups.some(g => g.name.toLocaleLowerCase('sv') === name.trim().toLocaleLowerCase('sv'))) return
    onChange({ ...plan, classGroups: [...groups, { name: name.trim(), days: [...days], startDate: plan.startDate, cancelledDates: [], overrides: {} }] })
    setSelected(groups.length); setName('')
  }
  const grouped = schedule.reduce((result, item) => {
    const weekStart = iso(monday(item.date))
    if (!result.length || result[result.length-1].weekStart !== weekStart) result.push({ weekStart, items: [] })
    result[result.length-1].items.push({...item, weekLessonNumber:result[result.length-1].items.length+1})
    return result
  }, [])
  const weeksShown = showAll ? grouped : grouped.slice(0, 8)
  const comparison = groups.map(g => ({name:g.name, weeks:buildClassSchedule(plan,g).reduce((acc,item)=>{const key=iso(monday(item.date));(acc[key] ||= []).push(item);return acc},{})}))
  const comparisonWeeks = [...new Set(comparison.flatMap(g=>Object.keys(g.weeks)))].sort()
  const visibleComparisonWeeks = showAll ? comparisonWeeks : comparisonWeeks.slice(0,8)
  return <section className="card" aria-label="Kopplade klasser">
    <h2>Planera en gång – fördela till dina klasser</h2>
    <p><strong>En grundplanering – flera klasser.</strong> Skriv lektionsinnehållet en gång. Varje klass får sedan samma lektioner i rätt ordning, på sina egna veckodagar och i sin egen takt.</p>
    <p className="muted">Exempel: 8A kan ha 3 lektioner på måndag, onsdag och fredag, medan 8B har 2 på tisdag och torsdag. Båda följer samma innehåll, men blir klara olika veckor.</p>
    <div className="form-grid">
      <label>Ny klass <input value={name} onChange={e => setName(e.target.value)} placeholder="Exempel: 8B" /></label>
    </div>
    <fieldset><legend>Vilka dagar har klassen lektion?</legend>
      {DAYS.map(day => <label key={day} style={{display:'inline-flex',alignItems:'center',gap:5,marginRight:12}}>
        <input type="checkbox" checked={days.includes(day)} onChange={e => setDays(e.target.checked ? [...days,day] : days.filter(d => d !== day))} />{day}
      </label>)}
    </fieldset>
    <p className="muted">Har klassen två lektioner samma dag? Lägg först till klassen och välj sedan antal lektioner per dag.</p>
    <button type="button" disabled={!name.trim() || !days.length || groups.some(g => g.name.toLocaleLowerCase('sv') === name.trim().toLocaleLowerCase('sv'))} onClick={addClass}>+ Lägg till klass</button>
    {groups.length > 0 && <>
      <h3>Klasser kopplade till samma planering</h3>
      <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12}}>{groups.map((g,i) => <button key={i} type="button" className={selected===i?'primary':'secondary'} onClick={()=>{setSelected(i);setEditing(null);setShowAll(false)}} style={{textAlign:'left',minWidth:150}}><strong>{g.name}</strong><span style={{display:'block',fontSize:'.85em',marginTop:4}}>{lessonsPerWeek(g)} lektioner/vecka · {(g.days||[]).length ? [...new Set(g.days)].map(d=>DAY_SHORT[DAYS.indexOf(d)]).join(', ') : 'Inga dagar'}</span></button>)}</div>
      <div className="button-row" style={{display:'flex',gap:10,flexWrap:'wrap',margin:'16px 0'}}><button type="button" className={!compare?'primary':'secondary'} onClick={()=>{setCompare(false);setShowAll(false)}}>▦ Klasskalender</button><button type="button" className={compare?'primary':'secondary'} onClick={()=>{setCompare(true);setShowAll(false)}}>⇄ Jämför klasser</button></div>
      {!compare && <h3>Välj klass</h3>}
      {!compare && <div className="button-row" style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {groups.map((g,i) => <button className={selected===i?'primary':'secondary'} type="button" key={i} onClick={() => {setSelected(i);setEditing(null);setShowAll(false)}} aria-pressed={selected===i}>{g.name}</button>)}
      </div>}
    </>}
    {compare && <div style={{marginTop:18}}>
      <h3>Jämför klassernas veckor</h3>
      <p className="muted">Varje klass har en egen ruta. Lektionerna börjar på 1 varje vecka, medan det gemensamma innehållet fortsätter i rätt ordning.</p>
      {visibleComparisonWeeks.map(key => <section key={key} style={{margin:"18px 0 24px"}}>
        <h4 style={{fontSize:"1.1rem",margin:"0 0 12px",paddingBottom:8,borderBottom:"2px solid #d8e5dc"}}>Vecka {(() => {const d=new Date(key+"T12:00:00");d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()} · {key}</h4>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:14}}>
          {comparison.map((g,i)=>{const items=g.weeks[key]||[];const group=groups[i];return <article key={g.name} style={{border:"1px solid #c9d9d0",borderRadius:14,background:["#f0f7ff","#fff8eb","#f0faf4","#f7f2ff"][i%4],padding:14,boxShadow:"0 2px 7px rgba(30,55,40,.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:12}}>
              <strong style={{fontSize:"1.15rem",color:"#273e34"}}>{g.name}</strong>
              <span style={{fontSize:".82rem",borderRadius:30,padding:"5px 9px",background:"#fff",border:"1px solid #d8e0dc"}}>{lessonsPerWeek(group)} lektioner/vecka</span>
            </div>
            {items.length ? <div style={{display:"grid",gap:9}}>{items.map((item,j)=><div key={item.lessonNumber} style={{background:"#fff",border:"1px solid #e0e7e2",borderRadius:10,padding:"11px 12px"}}>
              <div style={{fontSize:".82rem",color:"#52635c",marginBottom:4}}>{item.day} · {item.date}</div>
              <strong style={{fontSize:"1rem"}}>Lektion {j+1}</strong>
              <div style={{fontSize:".88rem",marginTop:5,whiteSpace:"pre-wrap"}}>{item.override?.text ?? describe(item.lesson)}</div>
              <div style={{fontSize:".77rem",color:"#63756a",marginTop:5}}>Gemensam lektion {item.lessonNumber}</div>
            </div>)}</div>:<div style={{padding:"16px 8px",color:"#65756b"}}>Ingen lektion denna vecka</div>}
          </article>})}
        </div>
      </section>)}
      {comparisonWeeks.length>8 && <button type="button" className="secondary" onClick={()=>setShowAll(!showAll)}>{showAll?"Visa färre veckor":"Visa alla veckor"}</button>}
    </div>}
    {group && !compare && <>
      <h3>{group.name} – eget lektionsschema</h3>
      <p><strong>{lessonsPerWeek(group)} lektioner per vecka.</strong> Ändra antalet för varje dag nedan. En klass kan ha fler eller färre lektioner än de andra.</p>
      <label>Startdatum <input type="date" value={group.startDate || plan.startDate || ''} onChange={e => updateGroup({startDate:e.target.value})} /></label>
      <fieldset><legend>Lektioner per veckodag</legend>
        <div className="form-grid">{DAYS.map((day,i) => {
          const count = (group.days || []).filter(d => d === day).length
          return <label key={day}>{day}
            <select value={count} onChange={e => {
              const other = (group.days || []).filter(d => d !== day)
              updateGroup({days:[...other,...Array(Number(e.target.value)).fill(day)].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b))})
            }}>{[0,1,2,3,4].map(n => <option value={n} key={n}>{n} {n===1?'lektion':'lektioner'}</option>)}</select>
          </label>
        })}</div>
      </fieldset>
      <p><strong>{schedule.length} planerade lektioner</strong> från grundplaneringen. Lektionsnumren börjar om på 1 varje kalendervecka. Det gemensamma innehållet fortsätter i rätt ordning. Ändringar i en klass påverkar inte andra klasser.</p>
      {!(group.days || []).length && <p role="alert">Välj minst en lektion per vecka för att se planeringen.</p>}
      {weeksShown.map(week => <div key={week.weekStart} style={{border:'1px solid #cbd5e1',borderRadius:10,padding:12,margin:'12px 0'}}>
        <h4 style={{margin:'0 0 10px'}}>Vecka {(() => {const d=new Date(week.weekStart+'T12:00:00');d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()} · {week.weekStart}</h4>
        {week.items.map(item => <div key={item.lessonNumber} style={{padding:'8px 0',borderTop:'1px solid #e2e8f0'}}>
          <strong>{DAY_SHORT[DAYS.indexOf(item.day)]} {item.date} – Lektion {item.weekLessonNumber}</strong>
          <div className="muted">Gemensam lektion {item.lessonNumber} · Från grundplaneringens vecka {item.weekNumber || '?'}{item.weekTitle ? ' · '+item.weekTitle : ''}</div>
          <div style={{whiteSpace:'pre-wrap'}}>{item.override?.text ?? describe(item.lesson)}</div>
          {editing===item.lessonNumber ? <div>
            <label>Eget innehåll för {group.name}<textarea value={editText} onChange={e=>setEditText(e.target.value)} /></label>
            <button type="button" onClick={() => {updateGroup({overrides:{...group.overrides,[String(item.lessonNumber-1)]:{text:editText}}});setEditing(null)}}>Spara klassens ändring</button>
            <button type="button" className="secondary" onClick={()=>setEditing(null)}>Avbryt</button>
          </div> : <div className="button-row">
            <button type="button" className="secondary" onClick={()=>{setEditing(item.lessonNumber);setEditText(item.override?.text ?? describe(item.lesson))}}>Ändra bara för {group.name}</button>
            {item.override && <button type="button" className="secondary" onClick={()=>{const overrides={...group.overrides};delete overrides[String(item.lessonNumber-1)];updateGroup({overrides})}}>Återställ grundinnehåll</button>}
            <button type="button" className="secondary" onClick={()=>{
              if (!window.confirm('Ställa in alla lektioner '+item.date+' för '+group.name+'? Innehållet flyttas till nästa tillgängliga lektionstillfälle.')) return
              updateGroup({cancelledDates:[...new Set([...(group.cancelledDates||[]),item.date])]})
            }}>Ställ in datum</button>
          </div>}
        </div>)}
      </div>)}
      {group.cancelledDates?.length > 0 && <div><h4>Inställda datum</h4>{group.cancelledDates.map(date=><div key={date}>{date} <button type="button" className="secondary" onClick={()=>updateGroup({cancelledDates:group.cancelledDates.filter(d=>d!==date)})}>Återställ</button></div>)}</div>}
      {group.overrides && Object.keys(group.overrides).length>0 && <p className="muted">Egna ändringar är sparade separat för {group.name}. Grundplaneringen och övriga klasser påverkas inte.</p>}
      {grouped.length>8 && <button type="button" className="secondary" onClick={()=>setShowAll(!showAll)}>{showAll?'Visa färre veckor':'Visa alla '+grouped.length+' veckor'}</button>}
      <p className="muted">Ändringarna sparas tillsammans med grundplaneringen när du använder appens vanliga Spara-knapp. Inställda lektioner hoppas inte över.</p>
    </>}
  </section>
}
