import React,{useEffect,useState} from 'react'
import {teacherWeekGroups,chapterColor,stockholmDate,mondayDate} from './weekPresentation.js'
export function useWeekClock(){
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{let timer;const tick=()=>{setNow(Date.now());timer=setTimeout(tick,60000-Date.now()%60000+20)};timer=setTimeout(tick,60000-Date.now()%60000+20);const refresh=()=>setNow(Date.now());window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[])
 return now
}
export default function WeekBoard({weeks,children,enabled=true}){
 const now=useWeekClock(),[expanded,setExpanded]=useState({}),[pastOpen,setPastOpen]=useState({})
 if(!enabled)return <>{children}</>
 const items=React.Children.toArray(children),current=mondayDate(stockholmDate(now))
 const groups=teacherWeekGroups(weeks,now)
 const expandAll=value=>{setExpanded(Object.fromEntries(weeks.map(w=>[w.weekStart,value])));setPastOpen(Object.fromEntries(groups.map(g=>[g.chapter,value])))}
 const render=({week,index,past})=><details className="teacher-week-fold" key={week.weekStart} open={expanded[week.weekStart]??!past} onToggle={e=>{const open=e.currentTarget.open;setExpanded(previous=>previous[week.weekStart]===open?previous:{...previous,[week.weekStart]:open})}}>
 <summary><strong>{week.weekStart===current?'Aktuell vecka · ':''}Vecka {week.weekNumber}</strong><span>{week.weekStart}{week.hidden?' · Dold för elever':''}</span></summary>{items[index]}</details>
 return <div className="teacher-week-board"><div className="teacher-fold-actions"><button type="button" onClick={()=>expandAll(true)}>Visa alla veckor för mig</button><button type="button" onClick={()=>expandAll(false)}>Dölj alla veckor för mig</button><small>Påverkar bara lärarvyn.</small></div>{groups.map(group=><section className="teacher-chapter-group" key={group.chapter} style={{'--chapter-color':chapterColor(group.chapter)}}><h3>{group.chapter}</h3>{group.current.map(render)}{!!group.past.length&&<details className="teacher-past-weeks" open={!!pastOpen[group.chapter]} onToggle={e=>{const open=e.currentTarget.open;setPastOpen(p=>p[group.chapter]===open?p:{...p,[group.chapter]:open})}}><summary>Tidigare veckor ({group.past.length})</summary>{group.past.map(render)}</details>}</section>)}</div>
}
