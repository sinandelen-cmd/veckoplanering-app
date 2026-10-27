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
  const days = Array.isArray(group.days) ? group.days : []
  const extraSlots = Array.isArray(group.extraSlots) ? group.extraSlots : []
  const cancelled = new Set(Array.isArray(group.cancelledDates) ? group.cancelledDates : [])
  const closures = Array.isArray(group.schoolClosures) ? group.schoolClosures : []
  const firstDate = group.startDate || plan.startDate || ''
  let lessonNumber = 0
  // Varje klass använder innehållet från rätt grundvecka.
  // Lektioner från en vecka flyttas aldrig automatiskt till nästa vecka.
  return (plan.weeksData || []).flatMap(week => {
    if (!week?.weekStart || week.hidden) return []
    const source = Array.isArray(week.lessons) ? week.lessons : []
    const mondayDate = monday(week.weekStart)
    const slots = []
    for (let offset = 0; offset < 5; offset++) {
      const date = nextDate(mondayDate, offset)
      const dateKey = iso(date)
      const day = DAYS[offset]
      if ((firstDate && dateKey < firstDate) || cancelled.has(dateKey)) continue
      const closure = closures.find(event => dateKey >= event.startDate && dateKey <= (event.endDate || event.startDate))
      if (closure && closure.type !== 'Halvdag') continue
      const scheduledCount = days.filter(d => d === day).length + extraSlots.filter(slot => slot.date === dateKey).length
      const count = closure?.type === 'Halvdag' ? Math.max(0,scheduledCount - Math.max(1,Number(closure.cancelledLessons)||1)) : scheduledCount
      for (let n = 0; n < count; n++) slots.push({date:dateKey,day,slot:n+1,time:group.lessonTimes?.[day]?.[n] || ''})
    }
    return slots.map((slot, index) => {
      const lesson = source[index] || {name:'Lektion '+(index+1),topics:[]}
      lessonNumber++
      return {...slot,lesson,weekNumber:week.weekNumber,weekTitle:week.title,weekStart:week.weekStart,index,lessonNumber,override:group.overrides?.[String(lessonNumber-1)] || null}
    })
  })
}

export default function ClassSchedules({ plan, onChange, publicSlug = "", editingClassView = "", setEditingClassView, onSelectClassPreview, onOpenCalendar, onGoHome, onUndo, onRedo, canUndo, canRedo, onSetAllDisplayMode, allWeeksDisplayMode, weeksBusy }) {
  const groups = Array.isArray(plan.classGroups) ? plan.classGroups : []
  const preserveScrollOnClassChange = (className) => {
    const top = window.scrollY
    setEditingClassView?.(className)
    onSelectClassPreview?.(Boolean(className))
    // Avoid browser scroll anchoring jumping when the annual plan and class preview swap.
    requestAnimationFrame(() => window.scrollTo({ top, behavior: 'instant' }))
  }
  const [name, setName] = React.useState('')
  const [addingClass, setAddingClass] = React.useState(false)
  const [days, setDays] = React.useState([])
  const [selected, setSelected] = React.useState(0)
  const [showAll, setShowAll] = React.useState(false)
  const [expandedWeek, setExpandedWeek] = React.useState(null)
  const [showMatrix, setShowMatrix] = React.useState(true)
  const [showClassMenu, setShowClassMenu] = React.useState(false)
  const [compare, setCompare] = React.useState(false)
  const [showClassDetails, setShowClassDetails] = React.useState(false)
  const [selectedComparisonWeek, setComparisonWeek] = React.useState(0)
  const [editing, setEditing] = React.useState(null)
  const [editText, setEditText] = React.useState('')
  const [showClosures, setShowClosures] = React.useState(false)
  const [closureType, setClosureType] = React.useState('Studiedag')
  const [closureStart, setClosureStart] = React.useState('')
  const [closureEnd, setClosureEnd] = React.useState('')
  const [closureNote, setClosureNote] = React.useState('')
  const group = groups[selected]
  const lessonsPerWeek = group => (group.days || []).length
  const schedule = React.useMemo(() => group ? buildClassSchedule(plan, group) : [], [plan, group])
  const updateGroup = changes => onChange({ ...plan, classGroups: groups.map((g, i) => i === selected ? { ...g, ...changes } : g) })
  // Tidigare schematider bevaras i datat, men behöver inte redigeras i matrisen.
  const setLessonTime = (classIndex, day, slotIndex, value) => {
    onChange({ ...plan, classGroups: groups.map((row, index) => {
      if (index !== classIndex) return row
      const times = { ...(row.lessonTimes || {}) }
      const dayTimes = [...(times[day] || [])]
      dayTimes[slotIndex] = value
      times[day] = dayTimes
      return { ...row, lessonTimes: times }
    }) })
  }
  const addClass = () => {
    if (!name.trim() || groups.some(g => g.name.toLocaleLowerCase('sv') === name.trim().toLocaleLowerCase('sv'))) return
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
  const unscheduledGroups = groups.filter(g => !(g.days || []).length)
  return <section className="card" aria-label="Kopplade klasser">

    <div className="class-mini-row">
      
      <div className="class-mini-chips"><button type="button" className={"class-mini-chip"+(!editingClassView?" active":"")} onClick={()=>preserveScrollOnClassChange("")} aria-pressed={!editingClassView}>📘 Grundplanering</button>{groups.map((g,i)=><button type="button" key={i} className={'class-mini-chip'+(editingClassView===g.name?' active':'')} aria-pressed={editingClassView===g.name} onClick={()=>{setSelected(i);preserveScrollOnClassChange(g.name);setCompare(false);setShowClassDetails(false)}}>{g.name}</button>)}
        
        <button type="button" className="class-mini-add" onClick={()=>setAddingClass(v=>!v)} aria-expanded={addingClass}>+ Klass</button>
      </div>
      {onOpenCalendar && <button type="button" className="class-mini-chip" onClick={onOpenCalendar}>📅 Kalendervy</button>}
      <button type="button" className="class-mini-schema" disabled={!groups.length} aria-expanded={showClassMenu} onClick={()=>{setShowClassMenu(v=>!v);setCompare(false);setShowClassDetails(false)}}>▦ Schema</button>
    </div>
    
    <div className="class-toolbar-more class-toolbar-expanded"><div className="class-toolbar-actions">{group && <button type="button" className="secondary" aria-expanded={showClosures} onClick={()=>setShowClosures(v=>!v)}>📅 {showClosures?'Dölj':'Lägg till'} studiedag / halvdag / lov</button>}<details className="class-schedule-help"><summary>ⓘ Hjälp</summary><p>Skriv lektionsinnehållet en gång. Lägg sedan till klasser med egna lektionsdagar. Klasserna följer samma grundinnehåll i sin egen takt.</p></details><button type="button" className="class-mini-schema" onClick={async()=>{if(!publicSlug){window.alert("Elevlänken är inte publicerad ännu. Lägg till lektionsinnehåll och kontrollera att planeringen är publicerad.");return}const url=window.location.origin+"/elev/"+encodeURIComponent(publicSlug)+(editingClassView?"?klass="+encodeURIComponent(editingClassView):"");try{await navigator.clipboard.writeText(url);window.alert("Elevlänken har kopierats:\n"+url)}catch{window.prompt("Kopiera elevlänken:",url)}}}>🔗 Elevlänk</button>
<button type="button" className="secondary" disabled={!canUndo} onClick={onUndo}>↶ Ångra</button><button type="button" className="secondary" disabled={!canRedo} onClick={onRedo}>↷ Gör om</button><label className="class-bulk-visibility">Elevvisning <select aria-label="Elevvisning för alla veckor" value={allWeeksDisplayMode} disabled={weeksBusy} onChange={e=>onSetAllDisplayMode?.(e.target.value)}><option value="" disabled>Blandade inställningar</option><option value="normal">Automatisk</option><option value="extra">Visa manuellt för elever (även passerade veckor)</option><option value="hidden">Dölj för elever</option></select></label></div></div>
    {addingClass && <div className="class-mini-new"><label>Ny klass <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addClass();if(name.trim())setAddingClass(false)}}} placeholder="T.ex. EK26A" /></label><button type="button" disabled={!name.trim()||groups.some(g=>g.name.toLocaleLowerCase('sv')===name.trim().toLocaleLowerCase('sv'))} onClick={()=>{addClass();setAddingClass(false);setShowClassMenu(true)}}>Lägg till</button></div>}
    {unscheduledGroups.length>0 && <p role="alert" className="class-mini-warning">Välj lektionsdagar för {unscheduledGroups.map(g=>g.name).join(', ')} via Schema.</p>}
    {showClassMenu && group && <div className="class-mini-panel">
      <div className="class-mini-panel-title"><strong>{group.name} · Lektionsdagar</strong><button type="button" className="secondary" onClick={()=>setShowClassMenu(false)} aria-label="Stäng schema">✕</button></div>
      <div className="class-mini-days">{DAYS.map((day,i)=><div key={day} className={'class-mini-day'+((group.days||[]).includes(day)?' checked':'')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}><label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,cursor:'pointer'}}><span>{DAY_SHORT[i]}</span><input type="checkbox" aria-label={group.name+' '+day} checked={(group.days||[]).includes(day)} onChange={e=>updateGroup({days:e.target.checked?[...(group.days||[]),day].sort((x,y)=>DAYS.indexOf(x)-DAYS.indexOf(y)):(group.days||[]).filter(d=>d!==day)})}/></label>{(group.days||[]).includes(day)&&<div style={{display:'flex',alignItems:'center',gap:3,fontSize:12}}><button type="button" aria-label={'Minska moment '+day} disabled={(group.momentsPerDay?.[day]||1)<=1} onClick={()=>updateGroup({momentsPerDay:{...group.momentsPerDay,[day]:Math.max(1,(group.momentsPerDay?.[day]||1)-1)}})} style={{padding:'1px 4px',minWidth:18}}>−</button><strong>{group.momentsPerDay?.[day]||1}</strong><button type="button" aria-label={'Öka moment '+day} onClick={()=>updateGroup({momentsPerDay:{...group.momentsPerDay,[day]:(group.momentsPerDay?.[day]||1)+1}})} style={{padding:'1px 4px',minWidth:18}}>+</button></div>}</div>)}</div>
      <p className="muted">{(group.days||[]).length} lektioner per vecka. Ändringarna sparas med planeringen.</p>
      <button type="button" className="secondary" onClick={()=>{setShowClassDetails(v=>!v);setCompare(false)}}>{showClassDetails?'Dölj klassens ändringar':'Visa klassens ändringar'}</button><button type="button" className="secondary" onClick={() => {
        if (!window.confirm('Återställa '+group.name+' till grundplaneringen? Klassens egna lektionsändringar och inställda datum tas bort. Grundplaneringen och andra klasser påverkas inte.')) return
        updateGroup({overrides:{},cancelledDates:[],extraSlots:[],schoolClosures:[]})
        setEditing(null)
      }}>↺ Återställ klass</button>
    </div>}
    {group && <div className="class-closure-section">
      
      {showClosures && <div className="class-closure-editor">
        <strong>Lediga dagar för {group.name}</strong>
        <p className="muted">Datum påverkar bara denna klass. Grundplaneringens moment och innehåll raderas inte.</p>
        <div className="class-closure-fields">
          <label>Typ<select value={closureType} onChange={e=>setClosureType(e.target.value)}>{['Studiedag','Halvdag','Lov','Helgdag','Inställd lektion','Annan ledighet'].map(t=><option key={t}>{t}</option>)}</select></label>
          <label>Från datum<input type="date" value={closureStart} onChange={e=>{setClosureStart(e.target.value);if(!closureEnd||closureEnd<e.target.value)setClosureEnd(e.target.value)}}/></label>
          <label>Till datum<input type="date" value={closureEnd} min={closureStart} onChange={e=>setClosureEnd(e.target.value)}/></label>
          <label>Anteckning<input value={closureNote} placeholder="Valfri information" onChange={e=>setClosureNote(e.target.value)}/></label>
        </div>
        <button type="button" disabled={!closureStart || (closureEnd && closureEnd<closureStart)} onClick={()=>{updateGroup({schoolClosures:[...(group.schoolClosures||[]),{id:Date.now().toString(36),type:closureType,startDate:closureStart,endDate:closureEnd||closureStart,note:closureNote,cancelledLessons:1}]});setClosureStart('');setClosureEnd('');setClosureNote('')}}>+ Lägg till</button>
        {(group.schoolClosures||[]).map(event=><div className="class-closure-item" key={event.id}><span><strong>{event.type}</strong> · {event.startDate}{event.endDate!==event.startDate?' – '+event.endDate:''}{event.note?' · '+event.note:''}</span><button type="button" aria-label={'Ta bort '+event.type+' '+event.startDate} onClick={()=>updateGroup({schoolClosures:(group.schoolClosures||[]).filter(e=>e.id!==event.id)})}>Ta bort</button></div>)}
      </div>}
    </div>}
    {showClassMenu && groups.length > 0 && <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}>
      <button type="button" className="secondary" aria-expanded={compare} onClick={()=>{setCompare(v=>!v);setShowAll(false)}}>{compare?"▾ Dölj klassernas veckor":"▸ Visa klassernas veckor"}</button>
      <button type="button" className="secondary" aria-expanded={!compare&&showClassDetails} onClick={()=>{setCompare(false);setShowClassDetails(v=>!v);setShowAll(false)}}>{!compare&&showClassDetails?"▾ Dölj enskilda ändringar":"⚙ Visa enskilda ändringar"}</button>
    </div>}
    {showClassMenu && compare && <div style={{marginTop:18}}>
      <h3>Jämför klasser – veckomatris</h3>
      <p className="muted">Varje klass har sin egen ruta. Lektionsnumren börjar på 1 varje vecka, men innehållet fortsätter i rätt ordning.</p>
      {comparisonWeeks.length>0 && <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10,margin:"14px 0 18px"}}>
        <button type="button" className="secondary" disabled={selectedComparisonWeek<=0} onClick={()=>setComparisonWeek(n=>Math.max(0,n-1))}>← Föregående vecka</button>
        <strong style={{fontSize:"1.12rem"}}>Vecka {(() => {const d=new Date(comparisonWeeks[selectedComparisonWeek]+"T12:00:00");d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()}</strong>
        <button type="button" className="secondary" disabled={selectedComparisonWeek>=comparisonWeeks.length-1} onClick={()=>setComparisonWeek(n=>Math.min(comparisonWeeks.length-1,n+1))}>Nästa vecka →</button>
        <select aria-label="Välj vecka att jämföra" value={selectedComparisonWeek} onChange={e=>setComparisonWeek(Number(e.target.value))}>{comparisonWeeks.map((key,i)=><option key={key} value={i}>{key}</option>)}</select>
      </div>}
      {comparisonWeeks[selectedComparisonWeek] && <div style={{width:"100%",paddingBottom:10}}><div style={{display:"grid",gridTemplateColumns:`repeat(${comparison.length}, minmax(0, 1fr))`,gap:8,width:"100%"}}>
        {comparison.map((g,i)=>{const items=g.weeks[comparisonWeeks[selectedComparisonWeek]]||[];const group=groups[i];return <article key={g.name} style={{border:"1px solid #c9d9d0",borderRadius:12,background:["#eaf3ff","#fff1db","#e8f6eb","#f2ebfa"][i%4],padding:8,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:12}}>
            <strong style={{fontSize:"1rem",color:"#273e34"}}>{g.name}</strong>
            <span style={{fontSize:".72rem",borderRadius:30,padding:"3px 6px",background:"#fff"}}>{lessonsPerWeek(group)} lek/vecka</span>
          </div>
          <div style={{display:"grid",gap:6}}>
            {items.length?items.map((item,j)=><div key={item.lessonNumber} style={{background:"#fff",border:"1px solid #e0e7e2",borderRadius:8,padding:"8px 7px",overflowWrap:"anywhere"}}>
              <div style={{fontSize:".75rem",color:"#52635c",marginBottom:4}}>{item.day} · {item.date}</div>
              <strong>Lektion {j+1}</strong>
              <div style={{fontSize:".8rem",marginTop:5,whiteSpace:"pre-wrap"}}>{item.override?.text ?? describe(item.lesson)}</div>
              <div style={{fontSize:".7rem",color:"#63756a",marginTop:5}}>Gemensam lektion {item.lessonNumber}</div>
            </div>):<div style={{background:"#fff",padding:14,borderRadius:10,color:"#65756b"}}>Ingen lektion denna vecka</div>}
          </div>
        </article>})}
      </div></div>}
    </div>}
    {showClassMenu && group && !compare && showClassDetails && <>
      <h3>{group.name} – eget lektionsschema</h3>
      <p><strong>{lessonsPerWeek(group)} lektioner per vecka.</strong> Lektionsdagarna visas i matrisen ovan. En klass kan ha fler eller färre lektioner än de andra.</p>
      <label>Startdatum <input type="date" value={group.startDate || plan.startDate || ''} onChange={e => updateGroup({startDate:e.target.value})} /></label>
      <p className="muted">Lektionsdagar och antal lektioner ändras i klassmatrisen ovan. Här hanterar du endast särskilda ändringar för den valda klassen.</p>
      <p><strong>{schedule.length} planerade lektioner</strong> från grundplaneringen. Lektionsnumren börjar om på 1 varje kalendervecka. Det gemensamma innehållet fortsätter i rätt ordning. Ändringar i en klass påverkar inte andra klasser.</p>
      {!(group.days || []).length && <p role="alert">Välj minst en lektion per vecka för att se planeringen.</p>}
      {weeksShown.map(week => <div key={week.weekStart} className="class-week-compact">
        <button type="button" className="class-week-compact-toggle" aria-expanded={expandedWeek===week.weekStart} onClick={()=>setExpandedWeek(current=>current===week.weekStart?null:week.weekStart)}><span>{expandedWeek===week.weekStart?"▾":"▸"} Vecka {(() => {const d=new Date(week.weekStart+'T12:00:00');d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()}</span><span>{week.items.length} lektioner · {week.weekStart}</span></button>
        {expandedWeek===week.weekStart && week.items.map(item => <div key={item.lessonNumber} style={{padding:'8px 0',borderTop:'1px solid #e2e8f0'}}>
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
