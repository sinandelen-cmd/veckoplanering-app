import React from 'react'
const DAYS=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
export default function ClassSchedules({plan,onChange}) {
 const groups=plan.classGroups||[]
 const [name,setName]=React.useState('')
 const [days,setDays]=React.useState(['Måndag'])
 const [selected,setSelected]=React.useState(0)
 const group=groups[selected]
 const lessons=(plan.weeksData||[]).flatMap(w=>(w.lessons||[]).map(l=>({lesson:l,week:w})))
 const start=new Date((group?.startDate||plan.startDate)+'T12:00:00')
 const schedule=[]
 if(group&&Number.isFinite(start.getTime())) for(let i=0;i<730&&schedule.length<lessons.length;i++){
  const date=new Date(start);date.setDate(date.getDate()+i)
  if(!group.days.includes(DAYS[(date.getDay()+6)%7]))continue
  const item=lessons[schedule.length]
  schedule.push({date:date.toLocaleDateString('sv-SE'),...item})
 }
 return <section className="card"><h2>Gemensam grundplanering – kopplade klasser</h2>
 <p>Innehållet hämtas från denna grundplanering. Varje klass följer sina egna lektionsdagar.</p>
 <label>Klassnamn <input value={name} onChange={e=>setName(e.target.value)}/></label>
 <fieldset><legend>Lektionsdagar</legend>{DAYS.map(day=><label key={day}><input type="checkbox" checked={days.includes(day)} onChange={e=>setDays(e.target.checked?[...days,day]:days.filter(x=>x!==day))}/>{day}</label>)}</fieldset>
 <button type="button" disabled={!name.trim()||!days.length} onClick={()=>{onChange({...plan,classGroups:[...groups,{name:name.trim(),days:[...days],startDate:plan.startDate}]});setSelected(groups.length);setName('')}}>Koppla klass</button>
 <div>{groups.map((g,i)=><button type="button" key={i} onClick={()=>setSelected(i)} aria-pressed={selected===i}>{g.name}</button>)}</div>
 {group&&<><label>Startdatum för {group.name}<input type="date" value={group.startDate||plan.startDate} onChange={e=>onChange({...plan,classGroups:groups.map((g,i)=>i===selected?{...g,startDate:e.target.value}:g)})}/></label>
 <p>{group.days.join(', ')} – {schedule.length} lektioner</p>
 <ol>{schedule.map((item,i)=><li key={i}>{item.date}: Lektion {i+1} – {(item.lesson.topics||[]).map(t=>t.name).filter(Boolean).join(', ')||item.week.content||'Ej ifylld'}</li>)}</ol></>}
 </section>
}