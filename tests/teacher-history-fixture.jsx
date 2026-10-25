import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ClassSchedules from '../src/ClassSchedules.jsx'
import {usePlanHistory} from '../src/usePlanHistory.js'
const make=(id,name)=>({id,title:name,startDate:'2026-10-19',weeksData:[{weekStart:'2026-10-19',weekNumber:43,lessons:[{name:name+' lektion',topics:[{name:name+' moment'}]}]}],classGroups:[{name:id+'-klass',days:['Måndag','Tisdag'],schoolClosures:[]}]})
const plans={A:make('A','Planering A'),B:make('B','Planering B')}
function App(){
 const [selected,setSelected]=useState('A')
 const [plan,setPlan]=useState(plans.A)
 const {historyRef,historyVersion,undoPlan,redoPlan,resetPlanHistory}=usePlanHistory(plan,setPlan)
 const open=id=>{resetPlanHistory(plans[id]);setSelected(id);setPlan(plans[id])}
 return <><h1>Isolerad lärarvy – historik</h1><button onClick={()=>open('A')}>Öppna planering A</button><button onClick={()=>open('B')}>Öppna planering B</button><output data-testid="selected">{selected}</output><input aria-label="Planeringens namn" value={plan.title} onChange={e=>setPlan(p=>({...p,title:e.target.value}))}/><button onClick={undoPlan} disabled={!historyRef.current.past.length}>Ångra</button><button onClick={redoPlan} disabled={!historyRef.current.future.length}>Gör om</button><ClassSchedules plan={plan} onChange={setPlan} onUndo={undoPlan} onRedo={redoPlan} canUndo={historyRef.current.past.length>0} canRedo={historyRef.current.future.length>0}/><output data-testid="plan">{JSON.stringify(plan)}</output><output data-testid="history">{JSON.stringify({past:historyRef.current.past.length,future:historyRef.current.future.length,version:historyVersion})}</output></>
}
createRoot(document.getElementById('root')).render(<App/>)
