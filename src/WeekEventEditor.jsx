import {useState} from 'react'
import {WEEK_EVENT_TYPES} from './weekEvents.js'
const DAYS=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
export default function WeekEventEditor({afterDate,days=DAYS,onAdd,disabled=false}){
 const [type,setType]=useState(WEEK_EVENT_TYPES[0]),[title,setTitle]=useState(''),[selected,setSelected]=useState([...new Set(days)])
 const [offset,setOffset]=useState(1)
 return <details className="week-event-editor"><summary aria-label="Lägg till vecka" style={{cursor:'pointer',color:'#287568',textAlign:'center',padding:10}}>＋ Vecka</summary><form onSubmit={e=>{e.preventDefault();const d=new Date(afterDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset*7);onAdd({weekStart:d.toISOString().slice(0,10),type,title:title.trim()||type,days:selected});e.currentTarget.closest('details').open=false;setTitle('')}} style={{padding:16,background:'var(--plan-light,#f3faf6)',borderRadius:12,display:'grid',gap:10}}>
 <label>Händelse<select value={type} onChange={e=>setType(e.target.value)}>{WEEK_EVENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Rubrik<input value={title} placeholder={type} onChange={e=>setTitle(e.target.value)} /></label>
 <label>Placering<select value={offset} onChange={e=>setOffset(Number(e.target.value))}><option value="1">Veckan direkt efter</option><option value="2">Två veckor efter</option><option value="3">Tre veckor efter</option></select></label>
 <fieldset style={{display:'flex',gap:14,flexWrap:'wrap',border:0,padding:0}}><legend>Vilka lektionsdagar?</legend>{[...new Set(days)].filter(d=>DAYS.includes(d)).map(day=><label key={day}><input type="checkbox" checked={selected.includes(day)} onChange={e=>setSelected(e.target.checked?[...selected,day]:selected.filter(d=>d!==day))}/>{day.slice(0,3)}</label>)}</fieldset>
 <small>Vanliga moment fortsätter i ordning efter de valda händelselektionerna.</small>
 <button type="submit" disabled={disabled||!selected.length}>Lägg till vecka</button>
 </form></details>
}
