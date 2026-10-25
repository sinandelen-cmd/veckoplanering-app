import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {buildClassSchedule} from './ClassSchedules.jsx'

const topicNames=['Bråk och decimalform','Addition av bråk','Subtraktion av bråk','Multiplikation av bråk','Division av bråk','Procent och andelar','Tal i potensform','Prioriteringsregler','Negativa tal','Algebraiska uttryck','Ekvationer','Problemlösning']
const plan={startDate:'2026-10-19',schoolClosures:[],weeksData:[{weekStart:'2026-10-19',weekNumber:43,lessons:topicNames.map((name,i)=>({name:'Grundmoment '+(i+1),topics:[{name:'Moment '+(i+1)+': '+name,pagesLabel:'Sida '+(10+i),assignmentsLabel:'Uppgift '+(i+1)}]}))}]}
const classes=[
{name:'Test 1',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:1,Tisdag:1,Torsdag:1,Fredag:1},description:'1 moment per lektion'},
{name:'Test 2',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:2,Tisdag:2,Torsdag:2,Fredag:2},description:'2 moment per lektion'},
{name:'Test 3',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:3,Tisdag:3,Torsdag:3,Fredag:3},description:'3 moment per lektion'},
{name:'Test 4',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:4,Tisdag:4,Torsdag:4,Fredag:4},description:'4 moment per lektion'},
{name:'Test Mix',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:1,Tisdag:2,Torsdag:3,Fredag:4},description:'Måndag 1, tisdag 2, torsdag 3, fredag 4 moment'}]
function App(){
 const [selected,setSelected]=useState(-1)
 const current=selected<0?null:classes[selected]
 const schedule=current?buildClassSchedule(plan,current):plan.weeksData.flatMap(week=>week.lessons.map((lesson,i)=>({date:week.weekStart,day:'Grundplanering',lessonNumber:i+1,lesson})))
 return <main style={{maxWidth:900,margin:'auto',padding:'20px 14px',fontFamily:'system-ui,sans-serif',color:'#263343'}}>
 <header style={{background:'#e7f4ee',padding:18,borderRadius:14,marginBottom:14}}><h1 style={{margin:'0 0 8px'}}>Testklasser – olika moment</h1><p style={{margin:0}}>Fristående demonstration med syntetiska uppgifter. Ingen inloggning, databas eller sparfunktion används. Dina riktiga klasser påverkas inte.</p></header>
 <nav aria-label="Välj testklass" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18}}>{[{name:'Grundplanering'},...classes].map((c,i)=><button type="button" key={c.name} aria-pressed={selected===i-1} onClick={()=>setSelected(i-1)} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #a3c6bd',background:selected===i-1?'#177766':'white',color:selected===i-1?'white':'#174c46',fontWeight:700}}>{c.name}</button>)}</nav>
 <h2>{current?current.name+' – '+current.description:'Grundplanering – 12 ursprungliga lektioner'}</h2><p>{current?'Startdatum: 19 oktober 2026 · Schema: måndag, tisdag, torsdag och fredag':'Originalinnehåll: 12 lektioner med ett moment i varje. Här visas grundmaterialet före fördelning till testklasserna.'}</p>
 <section data-testid="moment-demo-lessons">{schedule.map((row,i)=><article key={row.date+'-'+i} style={{background:i%2?'#e7f4ee':'#f0eaff',padding:16,borderRadius:12,marginBottom:12,border:'1px solid #dcd7d3'}}><h3 style={{margin:'0 0 10px'}}>{current?row.day:'Grundplanering'} · Lektion {row.lessonNumber}{current?' · '+row.date:''}</h3><p style={{fontWeight:700}}>{row.lesson.topics.length} {row.lesson.topics.length===1?'moment':'moment'}</p>{row.lesson.topics.map((t,j)=><div key={j} style={{padding:'12px',background:'white',borderRadius:8,margin:'8px 0'}}><strong>{t.name}</strong><div style={{color:'#5d6670',marginTop:5}}>{t.pagesLabel} · {t.assignmentsLabel}</div></div>)}</article>)}</section>
 <p style={{fontSize:13,color:'#55636d'}}>Alla testklasser använder samma 12 grundmoment. Fler moment per lektion innebär att samma innehåll fördelas över färre lektionstillfällen. Inget sparas.</p></main>
}
createRoot(document.getElementById('root')).render(<App/>)
