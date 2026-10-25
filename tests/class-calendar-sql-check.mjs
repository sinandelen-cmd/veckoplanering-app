import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {insertCalendarEventWeek} from '../src/weekEvents.js'
// This runner deliberately refuses to operate against the user's database.
assert.equal(process.env.ANNUAL_SQL_TEST_DATABASE,'synthetic-only')
assert.equal(process.env.PGHOST,'127.0.0.1')
assert.equal(process.env.PGDATABASE,'annual_synthetic_test')
const sql = query => execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-Atc',query],{encoding:'utf8'}).trim()
const literal = value => "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
sql("create role anon; create role authenticated; create table public.veckoplanering(published boolean,public_slug text,published_content text);")
sql(fs.readFileSync(new URL('../server/class-calendar-release.sql',import.meta.url),'utf8'))
const source=fs.readFileSync(new URL('../src/ClassSchedules.jsx',import.meta.url),'utf8')
const build=new Function(source.slice(source.indexOf('const DAYS'),source.indexOf('export default function ClassSchedules')).replaceAll('export function ','function ')+';return buildClassSchedule')()
const days=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
const topic=n=>({name:'Moment '+n,pages:[String(n)],assignments:['1–5'],links:[{url:'https://example.org/'+n+'.pdf',label:'PDF '+n}]})
const base={startDate:'2026-10-12',sharedBaseContent:true,weeksData:Array.from({length:4},(_,w)=>({weekStart:['2026-10-12','2026-10-19','2026-10-26','2026-11-02'][w],chapter:'Tal',lessons:Array.from({length:5},(_,i)=>({name:'Lektion '+(i+1),topics:[topic(w*5+i+1)]}))}))}
const normalize = items=>items.map(x=>({date:x.date,day:x.day,topics:x.lesson.topics,assessment:x.lesson.assessment || null}))
let cases=0
for(const count of [1,2,3,4,5,20]) for(const selectedDays of [['Måndag'],days,['Tisdag','Fredag']]){
 const group={name:'TEST',days:selectedDays,startDate:base.startDate,momentsPerDay:Object.fromEntries(days.map(d=>[d,count]))}
 for(const modifications of [{},{startDate:'2030-01-07'},{schoolClosures:[{type:'Lov',startDate:'2026-10-12',endDate:'2026-11-06'}]},{cancelledDates:['2026-10-12'],extraSlots:[{date:'2026-10-14'}]},{schoolClosures:[{type:'Halvdag',startDate:'2026-10-12',endDate:'2026-10-12',cancelledFrom:'start',cancelledLessons:1}],days:['Måndag','Måndag','Tisdag']}]){
  const g={...group,...modifications}
  const actual=JSON.parse(sql(`select public.annual_class_calendar(${literal(base)},${literal(g)})`)).flatMap(w=>w.lessons.map(lesson=>({date:lesson.date,day:lesson.day,topics:lesson.topics,assessment:lesson.assessment || null})))
  assert.deepEqual(actual,normalize(build(base,g)),JSON.stringify(g));cases++
 }
}
// Assessment boundaries, multiple moments, hidden source, unscheduled class.
for(const group of [{name:'TEST',days:['Måndag'],momentsPerDay:{Måndag:4}},{name:'TEST',days:[]}]){
 const plan=structuredClone(base);plan.weeksData[0].lessons[1].assessment={type:'Prov',title:'Bråk'};plan.weeksData[1].hidden=true
 const actual=JSON.parse(sql(`select public.annual_class_calendar(${literal(plan)},${literal(group)})`)).flatMap(w=>w.lessons.map(lesson=>({date:lesson.date,day:lesson.day,topics:lesson.topics,assessment:lesson.assessment || null})))
 assert.deepEqual(actual,normalize(build(plan,group)));cases++
}
const weeks=['2026-10-05','2026-10-12','2026-10-19','2026-10-26','2026-11-02'].map(weekStart=>({weekStart}))
const show=(date,extra=[])=>JSON.parse(sql(`select public.annual_visible_weeks(${literal([...weeks,...extra])},true,2,'${date}'::date)`)).map(w=>w.weekStart)
assert.deepEqual(show('2026-10-25'),['2026-10-19','2026-10-12'])
assert.deepEqual(show('2026-10-26'),['2026-10-26','2026-10-19'])
assert.deepEqual(show('2026-10-26',[{weekStart:'2026-09-28',keepVisibleExtra:true}]),['2026-10-26','2026-10-19','2026-09-28'])
assert.deepEqual(JSON.parse(sql(`select public.annual_visible_weeks(${literal(weeks)},false,2,'2026-10-26'::date)`)).map(w=>w.weekStart),['2026-10-26','2026-10-19'],'Legacy manual publication still respects the two-week student window')
assert.deepEqual(show('2027-01-04'),[],'Old available rows must expire even if no newer row exists')
// Public endpoint must return only the selected, resolved calendar and release window.
const doc={...base,autoReleaseWeeks:true,visibleWeekCount:2,classSourceWeeks:base.weeksData,classGroups:[{name:'SLOW',days:['Måndag'],weeksData:[{secret:'stale copy'}],overrides:{secret:'old text'}},{name:'FAST',days, momentsPerDay:{Måndag:5,Tisdag:5,Onsdag:5,Fredag:5}}]}
sql(`insert into public.veckoplanering values(true,'synthetic',${"'"+JSON.stringify(doc).replaceAll("'","''")+"'"})`)
for(const klass of ['SLOW','FAST','']){
 const rows=sql(`select published_content from public.get_public_annual_plan_v2('synthetic','${klass}')`)
 const result=JSON.parse(rows)
 assert.equal(result.classSourceWeeks,undefined)
 assert.ok(result.classGroups.every(g=>Object.keys(g).join(',')==='name'))
 assert.equal(result.classScheduleResolved,Boolean(klass))
}
assert.equal(sql("select count(*) from public.get_public_annual_plan_v2('synthetic','unknown')"),'0')
assert.equal(sql("select count(*) from public.get_public_annual_plan_v2('missing','')"),'0')
for(const scope of ['', 'TEST']){
 const group={name:'TEST',days:['Måndag','Onsdag'],momentsPerDay:{Måndag:2,Onsdag:1}}
 const plan=insertCalendarEventWeek({...base,classGroups:[group]},'2026-10-12',{weekStart:'2026-10-19',type:'Prov',title:'Bråkprov',days:['Måndag']},scope)
 const g=plan.classGroups[0]
 const actual=JSON.parse(sql(`select public.annual_class_calendar(${literal(plan)},${literal(g)})`)).flatMap(w=>w.lessons.map(lesson=>({date:lesson.date,day:lesson.day,topics:lesson.topics,assessment:lesson.assessment || null})))
 assert.deepEqual(actual,normalize(build(plan,g)))
 assert.equal(actual.filter(x=>x.assessment?.title==='Bråkprov').length,1)
 assert.deepEqual(actual.filter(x=>!x.assessment).flatMap(x=>x.topics).map(t=>t.name),Array.from({length:20},(_,i)=>'Moment '+(i+1)))
 if(scope)assert.deepEqual(plan.weeksData,base.weeksData)
 else assert.equal(plan.weeksData.find(w=>w.calendarEventWeek).lessons.length,5)
 cases++
}

{
 const plan=structuredClone(base)
 plan.weeksData.forEach((w,i)=>{w.chapter=i===0?'Tal':i===2?'Geometri':''})
 const group={name:'SLOW',days:['Måndag'],momentsPerDay:{Måndag:2}}
 const actual=JSON.parse(sql(`select public.annual_class_calendar(${literal(plan)},${literal(group)})`)).filter(w=>w.lessons.length).map(w=>w.chapter)
 const expected=build(plan,group).map(item=>item.chapter)
 assert.deepEqual(actual,expected,'Chapter follows the actual source moments, including weeks after the base calendar')
}
console.log(`PASS: ${cases} SQL/JavaScript calendar parity cases, resource retention, chapters, assessment boundaries, expiry, pins and public data minimization`)
