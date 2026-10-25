import React,{useEffect,useState} from 'react'
import {teacherYearWheelSections,chapterColor,stockholmDate,mondayDate} from './weekPresentation.js'
export function useWeekClock(){
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{let timer;const tick=()=>{setNow(Date.now());timer=setTimeout(tick,60000-Date.now()%60000+20)};timer=setTimeout(tick,60000-Date.now()%60000+20);const refresh=()=>setNow(Date.now());window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[])
 return now
}
export default function WeekBoard({weeks,children,enabled=true}){
 const now=useWeekClock(),[expanded,setExpanded]=useState({}),[pastOpen,setPastOpen]=useState({})
 const current=mondayDate(stockholmDate(now)),dateSequence=weeks.map(w=>w.weekStart).join('|')
 useEffect(()=>{setExpanded({});setPastOpen({})},[dateSequence,current])
 if(!enabled)return <>{typeof children==='function'?children(weeks):children}</>
 const wheel=teacherYearWheelSections(weeks,now)
 const items=React.Children.toArray(typeof children==='function'?children(wheel.weeks):children)
 const groups=wheel.sections
 const expandAll=value=>{setExpanded(Object.fromEntries(wheel.weeks.map(w=>[w.weekStart,value])));setPastOpen(Object.fromEntries(groups.map(g=>[g.year+':'+g.chapter,value])))}
 const render=({week,index,past})=><details className="teacher-week-fold" key={week.weekStart} open={expanded[week.weekStart]??!past} onToggle={e=>{const open=e.currentTarget.open;setExpanded(previous=>previous[week.weekStart]===open?previous:{...previous,[week.weekStart]:open})}}>
 <summary><strong>{week.weekStart===current?'Aktuell vecka · ':''}Vecka {week.weekNumber}</strong><span>{week.weekStart}{week.yearWheel?' · Nästa årsvisning':''}{week.hidden?' · Dold för elever':''}</span></summary>{week.yearWheel?<><p className="muted">Årsvisning {week.weekStart}. Originalplanering från {week.originalWeekStart} bevaras. Denna årsvisning är skrivskyddad.</p><fieldset disabled style={{border:0,padding:0,margin:0,minWidth:0}}>{items[index]}</fieldset></>:items[index]}</details>
 return <div className="teacher-week-board"><div className="teacher-fold-actions"><button type="button" onClick={()=>expandAll(true)}>Visa alla veckor för mig</button><button type="button" onClick={()=>expandAll(false)}>Dölj alla veckor för mig</button><small>Årshjul för läraren.</small></div>{groups.map(group=><section className="teacher-chapter-group" key={group.year+':'+group.chapter+':'+group.current[0].week.weekStart} style={{'--chapter-color':chapterColor(group.chapter)}}><h3>{group.year} · {group.chapter}</h3>{group.rolled?<details className="teacher-past-weeks" open={!!pastOpen[group.year+':'+group.chapter]} onToggle={e=>{const open=e.currentTarget.open;setPastOpen(p=>p[group.year+':'+group.chapter]===open?p:{...p,[group.year+':'+group.chapter]:open})}}><summary>Kommande årsveckor ({group.current.length})</summary>{group.current.map(render)}</details>:group.current.map(render)}</section>)}</div>
}
