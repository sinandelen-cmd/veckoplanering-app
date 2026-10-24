import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ClassSchedules,{buildClassSchedule} from '../src/ClassSchedules.jsx'
import {sanitizeForStudents} from '../src/App.jsx'
const initial={startDate:'2026-10-19',entryType:'lektion',weeksData:[{weekStart:'2026-10-19',weekNumber:43,lessons:Array.from({length:4},(_,i)=>({name:'Lektion '+(i+1),topics:[{name:'Moment '+(i+1)}]}))}],classGroups:[
{name:'8A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[{name:'Studiedag',type:'Studiedag',startDate:'2026-10-22',endDate:'2026-10-22',classNames:['8B'],verified:true}]},
{name:'8B',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],schoolClosures:[]}
],schoolClosures:[]}
function App(){
 const [plan,setPlan]=useState(initial)
 const student=sanitizeForStudents(plan)
 return <><ClassSchedules plan={plan} onChange={setPlan}/><output data-testid="teacher-plan">{JSON.stringify(plan)}</output><output data-testid="student-plan">{JSON.stringify(student)}</output><output data-testid="8A-schedule">{JSON.stringify(buildClassSchedule(student,student.classGroups[0]).map(r=>({date:r.date,slot:r.slot,time:r.time,name:r.lesson.name})))}</output><output data-testid="8B-schedule">{JSON.stringify(buildClassSchedule(student,student.classGroups[1]).map(r=>({date:r.date,slot:r.slot,time:r.time,name:r.lesson.name})))}</output></>
}
createRoot(document.getElementById('root')).render(<App/>)
