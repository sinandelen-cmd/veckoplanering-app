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
const dayLabels=['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag']
const formatDate=value=>new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))
function isoWeek(dateString){
 const d=new Date(dateString+'T12:00:00Z')
 d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7))
 const year=d.getUTCFullYear()
 const first=new Date(Date.UTC(year,0,1))
 return {year,week:Math.ceil((((d-first)/86400000)+1)/7)}
}
function weekMonday(dateString){
 const d=new Date(dateString+'T12:00:00Z')
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7))
 return d.toISOString().slice(0,10)
}
function addDays(value,days){
 const d=new Date(value+'T12:00:00Z')
 d.setUTCDate(d.getUTCDate()+days)
 return d.toISOString().slice(0,10)
}
function App(){
 const [selected,setSelected]=useState(-1)
 const current=selected<0?null:classes[selected]
 const schedule=current?buildClassSchedule(plan,current):plan.weeksData.flatMap(week=>week.lessons.map((lesson,i)=>({date:addDays(week.weekStart,Math.floor(i/4)*7+(i%4===0?0:i%4===1?1:i%4===2?3:4)),day:dayLabels[new Date(addDays(week.weekStart,Math.floor(i/4)*7+(i%4===0?0:i%4===1?1:i%4===2?3:4))+'T12:00:00Z').getUTCDay()],lessonNumber:i+1,lesson})))
 const grouped=schedule.reduce((weeks,row)=>{
   const monday=weekMonday(row.date)
   if(!weeks.some(w=>w.start===monday))weeks.push({start:monday,rows:[]})
   weeks.find(w=>w.start===monday).rows.push(row)
   return weeks
 },[])
 const buttonStyle=active=>({padding:'11px 14px',borderRadius:10,border:'2px solid '+(active?'#146958':'#bdd4cd'),background:active?'#146958':'white',color:active?'white':'#174c46',fontWeight:700,cursor:'pointer',minHeight:44})
 return <main style={{maxWidth:940,margin:'auto',padding:'16px 12px 36px',fontFamily:'system-ui,sans-serif',color:'#263343',boxSizing:'border-box'}}>
  <header style={{background:'#e7f4ee',padding:'18px',borderRadius:14,marginBottom:14}}>
   <h1 style={{margin:'0 0 8px',fontSize:'clamp(1.35rem,4vw,1.9rem)'}}>Testklasser – olika moment</h1>
   <p style={{margin:0}}>Fristående demonstration med syntetiska uppgifter. Ingen inloggning, databas eller sparfunktion används. Dina riktiga klasser påverkas inte.</p>
  </header>
  <section aria-label="Jämför planeringar" style={{padding:'14px',background:'#f5f8fa',border:'1px solid #dce6eb',borderRadius:12,marginBottom:16}}>
   <h2 style={{margin:'0 0 8px',fontSize:'1.05rem'}}>Jämför Grundplanering med en testklass</h2>
   <p style={{margin:'0 0 12px',color:'#52616c'}}>Grundplanering är originalet med 12 moment. Välj sedan en klass för att se samma moment fördelade på klassens lektioner. Inget i originalet ändras.</p>
   <nav aria-label="Välj testklass" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {[{name:'Grundplanering'},...classes].map((c,i)=><button type="button" key={c.name} aria-pressed={selected===i-1} onClick={()=>setSelected(i-1)} style={buttonStyle(selected===i-1)}>{c.name}</button>)}
   </nav>
  </section>
  <section aria-label="Sammanfattning" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:10,marginBottom:16}}>
   <div style={{padding:14,background:'#edf4fc',borderRadius:12}}><strong>Grundplanering</strong><div>12 ursprungliga moment</div></div>
   <div style={{padding:14,background:'#e7f4ee',borderRadius:12}}><strong>{current?current.name:'Grundplanering'}</strong><div>{schedule.length} lektioner · 12 moment</div></div>
   <div style={{padding:14,background:'#f7f0ff',borderRadius:12}}><strong>Fördelning</strong><div>{current?current.description:'Original: 1 moment per lektion'}</div></div>
  </section>
  <h2 style={{fontSize:'clamp(1.15rem,3.5vw,1.5rem)'}}>{current?current.name+' – '+current.description:'Grundplanering – 12 ursprungliga lektioner'}</h2>
  <p style={{color:'#52616c'}}>{current?'Startdatum: 19 oktober 2026 · Schema: måndag, tisdag, torsdag och fredag':'Originalinnehåll: 12 lektioner med ett moment i varje, visade som veckokort med svenska veckonummer och datum.'}</p>
  <section data-testid="moment-demo-weeks" aria-label="Veckoplanering">
   {grouped.map(week=>{
    const number=isoWeek(week.start)
    return <section data-testid="moment-demo-week" key={week.start} style={{border:'1px solid #d7e0e8',borderRadius:14,padding:'14px',marginBottom:16,background:'#fff'}}>
     <h3 style={{margin:'0 0 12px',paddingBottom:10,borderBottom:'2px solid #dce7ef',fontSize:'1.12rem'}}>Vecka {number.week} · {formatDate(week.start)} – {formatDate(addDays(week.start,6))}</h3>
     <div data-testid="moment-demo-lessons" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:10}}>
      {week.rows.map((row,i)=><article key={row.date+'-'+i} style={{background:i%2?'#e7f4ee':'#f0eaff',padding:14,borderRadius:12,border:'1px solid #dcd7d3',minWidth:0,overflowWrap:'anywhere'}}>
       <h4 style={{margin:'0 0 10px',fontSize:'1rem'}}>{row.day} · Lektion {row.lessonNumber} · {formatDate(row.date)}</h4>
       <p style={{fontWeight:700,margin:'0 0 8px'}}>{row.lesson.topics.length} moment</p>
       {row.lesson.topics.map((t,j)=><div key={j} style={{padding:11,background:'white',borderRadius:8,margin:'8px 0'}}><strong>{t.name}</strong><div style={{color:'#5d6670',marginTop:5}}>{t.pagesLabel} · {t.assignmentsLabel}</div></div>)}
      </article>)}
     </div>
    </section>
   })}
  </section>
  <p style={{fontSize:13,color:'#55636d'}}>Alla testklasser använder samma 12 grundmoment i samma ordning. Fler moment per lektion innebär färre lektionstillfällen. Inget sparas.</p>
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
