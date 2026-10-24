import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ClassSchedules,{buildClassSchedule} from '../src/ClassSchedules.jsx'
import {sanitizeForStudents} from '../src/App.jsx'
const initial={startDate:'2026-10-19',entryType:'lektion',weeksData:[{weekStart:'2026-10-19',weekNumber:43,lessons:Array.from({length:4},(_,i)=>({name:'Lektion '+(i+1),topics:[{name:'Moment '+(i+1)}]}))}],classGroups:[
{name:'8A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[]},
{name:'8B',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[]}
],schoolClosures:[{name:'Studiedag',type:'Studiedag',startDate:'2026-10-22',endDate:'2026-10-22',classNames:['8B'],verified:true}]}
function App(){
 const [plan,setPlan]=useState(initial)
 const [selectedClass,setSelectedClass]=useState('')
 const student=sanitizeForStudents(plan)
 return <><nav aria-label="Elevvyns klassval"><button onClick={()=>setSelectedClass('')}>Grundplanering</button>{plan.classGroups.map(g=><button key={g.name} onClick={()=>setSelectedClass(g.name)}>Elevvy {g.name}</button>)}</nav><output data-testid="active-class">{selectedClass}</output><button type="button" onClick={()=>setPlan(previous=>({...previous,classGroups:previous.classGroups.map(g=>g.name==='8A'?{...g,startDate:'2026-11-02'}:g)}))}>Testa senare startdatum</button><ClassSchedules plan={plan} onChange={setPlan} selectedClassName={selectedClass} onSelectClass={setSelectedClass}/><output data-testid="teacher-plan">{JSON.stringify(plan)}</output><output data-testid="student-plan">{JSON.stringify(student)}</output><output data-testid="8A-schedule">{JSON.stringify(buildClassSchedule(student,student.classGroups[0]).map(r=>({date:r.date,slot:r.slot,time:r.time,name:r.lesson.name})))}</output><output data-testid="8B-schedule">{JSON.stringify(buildClassSchedule(student,student.classGroups[1]).map(r=>({date:r.date,slot:r.slot,time:r.time,name:r.lesson.name})))}</output></>
}
createRoot(document.getElementById('root')).render(<App/>)
