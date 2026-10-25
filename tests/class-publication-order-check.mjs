import assert from 'node:assert/strict'
import fs from 'node:fs'
import {selectStudentWeeks} from '../src/weekPresentation.js'

// Reproduce the publication-order bug without accessing the database.
// Filtering source weeks first loses the slow class's next queued moment.
const source=fs.readFileSync(new URL('../src/ClassSchedules.jsx',import.meta.url),'utf8')
const prefix=source.slice(source.indexOf('const DAYS'),source.indexOf('export default function ClassSchedules')).replaceAll('export function ','function ')
const build=new Function(prefix+'; return buildClassSchedule')()
const topic=n=>({name:'Moment '+n,pages:[String(n)],assignments:['Uppgift '+n],links:[{url:'https://example.org/'+n,label:'Länk '+n}]})
const weeks=Array.from({length:4},(_,w)=>({weekStart:['2026-10-05','2026-10-12','2026-10-19','2026-10-26'][w],lessons:Array.from({length:5},(_,i)=>({topics:[topic(w*5+i+1)]}))}))
const group={name:'Långsam klass',startDate:'2026-10-05',days:['Måndag'],momentsPerDay:{Måndag:1}}
const plan={startDate:'2026-10-05',weeksData:weeks,classGroups:[group],autoReleaseWeeks:true,visibleWeekCount:2}
const before=JSON.stringify(plan)
const now=Date.parse('2026-10-19T08:00:00Z')
const full=build(plan,group)
const calendarWeeks=items=>Object.values(items.reduce((result,item)=>{
 const week=result[item.weekStart]??={weekStart:item.weekStart,lessons:[]}
 week.lessons.push(item.lesson)
 return result
},{}))
const correct=selectStudentWeeks(calendarWeeks(full),plan,now)
assert.deepEqual(correct.flatMap(w=>w.lessons.flatMap(l=>l.topics.map(t=>t.name))),['Moment 3','Moment 2'])
const truncated=build({...plan,weeksData:selectStudentWeeks(weeks,plan,now)},group)
assert.notDeepEqual(calendarWeeks(truncated),calendarWeeks(full))
assert.equal(truncated[0].lesson.topics[0].name,'Moment 6')
assert.equal(full[2].lesson.topics[0].pages[0],'3')
assert.equal(full[2].lesson.topics[0].links[0].url,'https://example.org/3')
assert.equal(JSON.stringify(plan),before)
console.log('PASS: reproduced unsafe source filtering; complete queue before calendar filtering preserves slow-class moments and resources')
