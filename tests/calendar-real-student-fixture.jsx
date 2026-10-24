import React from 'react'
import {createRoot} from 'react-dom/client'
import {StudentView,sanitizeForStudents} from '../src/App.jsx'

// Real StudentView, real student serialization and real scheduling algorithm.
// No remote auth, database or production endpoint is used.
const source={
  title:'Isolerat elevvystest',subject:'Matematik',startDate:'2026-10-19',
  entryType:'lektion',studentLayout:'list',autoReleaseWeeks:false,
  weeksData:[{weekStart:'2026-10-19',weekNumber:43,title:'Vecka 43',lessons:[
    {name:'Algebra 1',topics:[{name:'Moment 1'}]},
    {name:'Algebra 2',topics:[{name:'Moment 2'}]},
    {name:'Algebra 3',topics:[{name:'Moment 3'}]},
    {name:'Algebra 4',topics:[{name:'Moment 4'}]},
  ]}],
  classGroups:[
    {name:'8A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[{type:'Lov',startDate:'2026-10-19',endDate:'2026-10-23'}]},
    {name:'8B',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag']},
    {name:'8C',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],extraSlots:[{date:'2026-10-19'}],lessonTimes:{Måndag:['08:15','13:10']},schoolClosures:[{type:'Halvdag',startDate:'2026-10-19',endDate:'2026-10-19',cancelledLessons:1,cancelledFrom:'start'}]},
    {name:'8D',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[{type:'Studiedag',startDate:'2026-10-19',endDate:'2026-10-19'}]}
  ]
}
const studentPlan=sanitizeForStudents(source)
function Fixture(){
 const [selected,setSelected]=React.useState('8A')
 return <><nav aria-label="Testklasser">{studentPlan.classGroups.map(group=><button type="button" key={group.name} onClick={()=>setSelected(group.name)}>{group.name}</button>)}</nav><p data-testid="selected-class">{selected}</p><StudentView key={selected} plan={studentPlan} preview initialClass={selected} hideSelector /></>
}
createRoot(document.getElementById('root')).render(<Fixture/>)
