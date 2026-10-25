import React from 'react'
import {createRoot} from 'react-dom/client'
import {buildClassSchedule} from '../src/ClassSchedules.jsx'

const source={startDate:'2026-10-19',weeksData:[{weekStart:'2026-10-19',weekNumber:43,title:'Vecka 43',lessons:[
  {name:'Algebra 1',topics:[{name:'Moment 1'}]},
  {name:'Algebra 2',topics:[{name:'Moment 2'}]},
  {name:'Algebra 3',topics:[{name:'Moment 3'}]},
  {name:'Algebra 4',topics:[{name:'Moment 4'}]},
]}],schoolClosures:[]}
const classes=[
  {name:'8A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[{type:'Lov',startDate:'2026-10-19',endDate:'2026-10-23'}]},
  {name:'8B',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[]},
  {name:'8C',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],extraSlots:[{date:'2026-10-19'}],lessonTimes:{Måndag:['08:15','13:10']},schoolClosures:[{type:'Halvdag',startDate:'2026-10-19',endDate:'2026-10-19',cancelledLessons:1,cancelledFrom:'start'}]},
  {name:'8D',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[{type:'Studiedag',startDate:'2026-10-19',endDate:'2026-10-19'}]},
]
function App(){
 const [selected,setSelected]=React.useState('8A')
 const group=classes.find(c=>c.name===selected)
 const rows=buildClassSchedule(source,group)
 const weeks=[...new Set(rows.map(row=>row.date.slice(0,10)))].map(date=>date)
 return <main><h1>Elevvy – isolerat klasschema</h1><nav>{classes.map(c=><button key={c.name} onClick={()=>setSelected(c.name)}>{c.name}</button>)}</nav><h2 data-testid="selected-class">{selected}</h2><p data-testid="source-count">Grundplanering: {source.weeksData[0].lessons.length} lektioner</p><section data-testid="student-weeks">{rows.map((r,i)=><article key={i} data-testid="student-lesson"><time>{r.date}</time><span> {r.lesson.name}</span><span data-testid="slot"> {r.slot}</span><span data-testid="time"> {r.time}</span></article>)}</section><p data-testid="last-date">{rows.at(-1)?.date||''}</p></main>
}
createRoot(document.getElementById('root')).render(<App/>)
