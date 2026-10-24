import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ClassSchedules,{remapClassOverridesAfterInsertion} from '../src/ClassSchedules.jsx'
import {usePlanHistory} from '../src/usePlanHistory.js'
const week=(start,id)=>({weekStart:start,weekNumber:1,title:'Vecka',lessons:[{id,name:id,topics:[{name:id}]}]})
const initial={startDate:'2026-01-05',weeksData:[week('2026-01-05','Original 1'),week('2026-01-12','Original 2'),week('2026-01-19','Original 3')],classGroups:[{name:'8A',startDate:'2026-01-05',days:['Måndag'],overrides:{'1':{text:'Anpassad ursprungslektion'}}},{name:'8B',startDate:'2026-01-05',days:['Fredag'],overrides:{'1':{text:'Klass B ursprung'}}}]}
function App(){
 const [plan,setPlan]=useState(initial)
 const {undoPlan,redoPlan,historyRef}=usePlanHistory(plan,setPlan)
 const insert=()=>{
  const next={...plan,weeksData:[plan.weeksData[0],week('2026-01-12','Ny provvecka'),{...plan.weeksData[1],weekStart:'2026-01-19'},{...plan.weeksData[2],weekStart:'2026-01-26'}]}
  next.classGroups=remapClassOverridesAfterInsertion(plan,next,0)
  setPlan(next)
 }
 return <><button onClick={insert}>Test: infoga vecka</button><button onClick={undoPlan} disabled={!historyRef.current.past.length}>Test: ångra</button><button onClick={redoPlan} disabled={!historyRef.current.future.length}>Test: gör om</button><output data-testid="override-index">{Object.keys(plan.classGroups[0].overrides).join(',')}</output><output data-testid="week-count">{plan.weeksData.length}</output><ClassSchedules plan={plan} onChange={setPlan}/></>
}
createRoot(document.getElementById('root')).render(<App/>)
