import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {StudentView,LessonDetails} from '../../src/App.jsx'
import ClassSchedules from '../../src/ClassSchedules.jsx'
import {recordPlanHistory,undoPlanHistory,redoPlanHistory} from '../../src/planHistory.js'
const topic=(name)=>({name,pages:['45–48'],assignments:['1–5, 8 och 12'],links:[{url:'https://example.org/exercise',label:'Övningar'}]})
const seed={sharedBaseContent:true,title:'Syntetiskt funktionstest',entryType:'lektion',startDate:'2026-10-12',weeksData:[{weekStart:'2026-10-12',weekNumber:42,title:'Vecka 42',lessons:['Bråk','Procent','Geometri','Algebra','Ekvationer'].map((name,index)=>({name:'Lektion '+(index+1),day:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'][index],topics:[topic(name)]}))}],classGroups:[{name:'TEST A',startDate:'2026-10-12',days:['Måndag','Tisdag'],momentsPerDay:{Måndag:2}},{name:'TEST B',startDate:'2026-10-12',days:['Måndag','Tisdag']}]}
function Demo(){
const [history,setHistory]=useState(()=>recordPlanHistory({},'synthetic:1',seed))
const [selected,setSelected]=useState('')
const [student,setStudent]=useState(false)
const plan=JSON.parse(history.current)
const change=fn=>setHistory(h=>recordPlanHistory(h,'synthetic:1',typeof fn==='function'?fn(JSON.parse(h.current)):fn))
return <main className="shell"><h1>Testversion – endast påhittade data</h1><p>Ingenting här sparas till din databas. Ladda om sidan för att återställa testet.</p><div style={{display:'flex',flexWrap:'wrap',gap:8}}><button onClick={()=>setHistory(undoPlanHistory)} disabled={!history.past.length}>Ångra teständring</button><button onClick={()=>setHistory(redoPlanHistory)} disabled={!history.future.length}>Gör om teständring</button><button onClick={()=>setSelected('')}>Grundplanering</button><button onClick={()=>setStudent(!student)}>{student?'Lärarvy':'Elevvy'}</button></div>
<ClassSchedules plan={plan} selectedClassName={selected} onSelectClass={setSelected} onChange={change}/>
{selected?<StudentView key={selected+student} plan={plan} preview hideSelector initialClass={selected}/>:<LessonDetails week={plan.weeksData[0]} onChange={student?undefined:changes=>change(p=>({...p,weeksData:[{...p.weeksData[0],...changes}]}))}/>}
<pre aria-label="Kontrollresultat">{JSON.stringify({base:plan.weeksData[0].lessons.flatMap(l=>l.topics).map(t=>t.name),classes:plan.classGroups.map(g=>({name:g.name,ownCopy:!!g.weeksData,moments:g.weeksData?.flatMap(w=>w.lessons).flatMap(l=>l.topics).map(t=>t.name)}))},null,2)}</pre></main>
}
createRoot(document.getElementById('root')).render(<Demo/>)
