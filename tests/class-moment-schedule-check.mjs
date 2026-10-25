import assert from 'node:assert/strict'
import fs from 'node:fs'
const source = fs.readFileSync(new URL('../src/ClassSchedules.jsx',import.meta.url),'utf8')
const prefix = source.slice(source.indexOf('const DAYS'),source.indexOf('export default function ClassSchedules')).replaceAll('export function ','function ')
const build = new Function(prefix+'; return buildClassSchedule')()
const app = fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const extract = name => {
 const start=app.indexOf('function '+name+'(')
 assert.ok(start>=0,name+' must exist')
 const next=app.slice(start+1).search(/\n(?:function |export |const |class )/)
 return next<0?app.slice(start):app.slice(start,start+1+next)
}
const sanitize = new Function(['toIsoDate','validSchoolClosure','resourceInfo','sanitizeForStudents'].map(extract).join('\n')+'; return sanitizeForStudents')()
const DAYS=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
const freeze = value => {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const topic = index => ({name:'Moment '+index,pages:[String(index)],assignments:['Uppgift '+index],links:[{url:'https://example.org/'+index+'.pdf',label:'Resurs '+index}]})
const firstWeek = {weekStart:'2026-10-12',weekNumber:42,lessons:Array.from({length:5},(_,i)=>({name:'Lektion '+(i+1),day:DAYS[i],topics:[topic(i+1)]}))}
const nextWeek = {weekStart:'2026-11-02',weekNumber:45,lessons:Array.from({length:5},(_,i)=>({name:'Lektion '+(i+1),topics:[topic(i+6)]}))}
const group = {name:'8E',startDate:'2026-10-12',days:DAYS,momentsPerDay:{Måndag:4,Tisdag:1,Onsdag:2,Torsdag:4,Fredag:1},overrides:{},schoolClosures:[]}
const plan=freeze({title:'Syntetisk plan',startDate:'2026-10-12',entryType:'lektion',weeksData:[firstWeek,nextWeek],classGroups:[group],teacherNotes:'Får aldrig publiceras'})
const before=JSON.stringify(plan)
const output=build(plan,group)
assert.deepEqual(output.map(item=>item.lesson.topics.map(t=>t.name)),[
 ['Moment 1','Moment 2','Moment 3','Moment 4'],['Moment 5'],['Moment 6','Moment 7'],['Moment 8','Moment 9','Moment 10']
])
assert.deepEqual(output.map(item=>item.date),['2026-10-12','2026-10-13','2026-10-14','2026-10-15'])
assert.deepEqual(output.flatMap(item=>item.lesson.topics),[...firstWeek.lessons,...nextWeek.lessons].flatMap(l=>l.topics),'Resources and moment order must survive allocation')
assert.equal(JSON.stringify(plan),before,'Computing a class schedule must not mutate source data')

const slow={...group,name:'Slow',days:['Måndag'],momentsPerDay:{Måndag:1}}
const slowOutput=build(plan,slow)
assert.equal(slowOutput.length,10)
assert.equal(slowOutput.at(-1).date,'2026-12-14','Unfinished moments must continue beyond the last source week')
assert.deepEqual(slowOutput.flatMap(item=>item.lesson.topics).map(t=>t.name),output.flatMap(item=>item.lesson.topics).map(t=>t.name))
const cancelled=build(plan,{...group,cancelledDates:['2026-10-12']})
assert.equal(cancelled[0].date,'2026-10-13')
assert.equal(cancelled[0].lesson.topics[0].name,'Moment 1')
assert.equal(cancelled.flatMap(item=>item.lesson.topics).length,10)
const closurePlan={...plan,schoolClosures:[{name:'Studiedag',type:'Studiedag',startDate:'2026-10-12',endDate:'2026-10-12',classNames:['8E']}]}
assert.equal(build(closurePlan,group)[0].date,'2026-10-13')
assert.equal(build(closurePlan,{...group,name:'Other'})[0].date,'2026-10-12')
const halfday=build(plan,{...group,extraSlots:[{date:'2026-10-12'}],lessonTimes:{Måndag:['08:00','13:00']},schoolClosures:[{type:'Halvdag',startDate:'2026-10-12',endDate:'2026-10-12',cancelledFrom:'start',cancelledLessons:1}]})
assert.equal(halfday[0].slot,2)
assert.equal(halfday[0].time,'13:00')
assert.equal(halfday.flatMap(item=>item.lesson.topics).length,10)
assert.equal(build(plan,{...group,days:[]}).length,0)
assert.equal(build({...plan,weeksData:[]},group).length,0)
assert.equal(build({...plan,weeksData:[{...firstWeek,hidden:true},nextWeek]},group).flatMap(item=>item.lesson.topics).length,5)

const assessmentPlan={...plan,weeksData:[{...firstWeek,lessons:[{topics:[topic(1)]},{assessment:{type:'Prov',title:'Kapitelprov'},topics:[]},{topics:[topic(2)]}]}]}
const assessmentOutput=build(assessmentPlan,group)
assert.equal(assessmentOutput.length,3)
assert.equal(assessmentOutput[1].lesson.assessment.title,'Kapitelprov')
assert.equal(assessmentOutput.flatMap(item=>item.lesson.topics).length,2)
const splitAssessment=build({...plan,weeksData:[{...firstWeek,lessons:[{assessment:{type:'Prov',title:'Ett prov'},topics:[topic(1),topic(2),topic(3)]}]}]},{...group,momentsPerDay:{Måndag:2,Tisdag:2}})
assert.equal(splitAssessment.filter(item=>item.lesson.assessment).length,1)
assert.equal(splitAssessment.flatMap(item=>item.lesson.topics).length,3)

const student=sanitize(plan)
assert.equal(student.classGroups[0].momentsPerDay.Måndag,4)
assert.equal(student.classGroups[0].momentsPerDay.Onsdag,2)
assert.ok(!Object.hasOwn(student,'teacherNotes'))
assert.deepEqual(build(student,student.classGroups[0]).flatMap(item=>item.lesson.topics).map(t=>t.name),output.flatMap(item=>item.lesson.topics).map(t=>t.name),'Published and teacher class schedules must agree')
const studentClosures=sanitize({...closurePlan,classGroups:[{...group,schoolClosures:[{type:'Halvdag',startDate:'2026-10-13',endDate:'2026-10-13',cancelledLessons:1}]}]})
assert.deepEqual(studentClosures.schoolClosures[0].classNames,['8E'])
assert.equal(studentClosures.classGroups[0].schoolClosures[0].type,'Halvdag')
const studentAssessments=sanitize(assessmentPlan)
assert.equal(studentAssessments.weeksData[0].lessons[1].assessment.title,'Kapitelprov')
assert.equal(build(studentAssessments,studentAssessments.classGroups[0]).filter(item=>item.lesson.assessment).length,1)
assert.equal(JSON.stringify(plan),before)
console.log('PASS: 8E 4/1/2/4/1 allocation, gaps, slow classes, closures, assessments, public serialization, resources and immutable source')

const update = new Function(prefix+'; return updateClassLessonContent')()
const two={...plan,classGroups:[group,{...group,name:'Other'}]}
const nextLesson={...output[0].lesson,topics:output[0].lesson.topics.map((t,i)=>i? t:{...t,name:'Edited',pages:['45–48'],assignments:['1–5, 8 och 12']})}
const edited=update(two,'8E',output[0],nextLesson)
assert.deepEqual(edited.weeksData,two.weeksData)
assert.deepEqual(edited.classGroups[1],two.classGroups[1])
assert.equal(build(edited,edited.classGroups[0])[0].lesson.topics[0].name,'Edited')
assert.deepEqual(build(edited,edited.classGroups[0])[0].lesson.topics[0].links,topic(1).links)
assert.equal(build(edited,edited.classGroups[0]).flatMap(x=>x.lesson.topics).length,10)
const single={...two,classGroups:[slow,{...group,name:'Other'}]}
let own=update(single,'Slow',build(single,slow)[0],{topics:[topic(101),topic(102)]})
let ownSchedule=build(own,own.classGroups[0])
assert.equal(ownSchedule[0].lesson.topics.length,2,'Adding a moment keeps it in the same meeting')
assert.equal(ownSchedule.flatMap(x=>x.lesson.topics).length,11)
own=update(own,'Slow',ownSchedule[0],{...ownSchedule[0].lesson,topics:[]})
ownSchedule=build(own,own.classGroups[0])
assert.equal(ownSchedule[0].lesson.topics.length,0,'An intentionally cleared meeting remains editable')
assert.equal(ownSchedule[1].lesson.topics[0].name,'Moment 2')
const studentOwn=sanitize(edited)
assert.equal(build(studentOwn,studentOwn.classGroups[0])[0].lesson.topics[0].name,'Edited')
assert.equal(studentOwn.classGroups[0].weeksData[0].teacherNotes,undefined)
assert.equal(JSON.stringify(plan),before)
console.log('PASS: class-only edits, resources, independent base/other class, same-meeting insertion, clearing, student serialization')

for(let size=1;size<=8;size++) for(let perDay=1;perDay<=5;perDay++) {
 const group={name:'A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],momentsPerDay:Object.fromEntries(DAYS.map(d=>[d,perDay]))}
 const fixture={startDate:'2026-10-12',classGroups:[group,{...group,name:'B'}],weeksData:[{weekStart:'2026-10-12',lessons:Array.from({length:3},(_,l)=>({topics:Array.from({length:size},(_,t)=>topic(l*size+t))}))},{weekStart:'2026-10-19',lessons:[{topics:[topic(100)]}]}]}
 const scheduled=build(fixture,group)
 for(const item of scheduled){
  const original=scheduled.flatMap(x=>x.lesson.topics)
  const first=original.findIndex(t=>t.name===item.lesson.topics[0]?.name)
  if(first<0) continue
  const replacement=item.lesson.topics.map(t=>({...t,name:t.name+' edited'}))
  const changed=update(fixture,'A',item,{...item.lesson,topics:replacement})
  assert.deepEqual(build(changed,changed.classGroups[0]).flatMap(x=>x.lesson.topics),[...original.slice(0,first),...replacement,...original.slice(first+replacement.length)],'Split/merge edit must preserve every resource and topic')
  assert.deepEqual(changed.weeksData,fixture.weeksData)
  assert.deepEqual(changed.classGroups[1],fixture.classGroups[1])
  const moved={...changed.classGroups[0],cancelledDates:['2026-10-12','2026-10-13'],days:['Tisdag','Fredag']}
  assert.deepEqual(build(changed,moved).flatMap(x=>x.lesson.topics),build(changed,changed.classGroups[0]).flatMap(x=>x.lesson.topics),'Changing days and closures must preserve all edited topics')
 }
}
console.log('PASS: exhaustive split/merge edits across 40 source sizes and daily allocations, with schedule shifts')

const longTopics=Array.from({length:260},(_,index)=>topic(index+1))
const longPlan={startDate:'2026-10-12',weeksData:[{weekStart:'2026-10-12',lessons:longTopics.map(value=>({topics:[value]}))}]}
const slowGroup={name:'Slow',startDate:'2026-10-12',days:['Måndag']}
assert.deepEqual(build(longPlan,slowGroup).flatMap(item=>item.lesson.topics),longTopics,'A slow class must reach all 260 moments, beyond the former 104-week horizon')
const delayedGroup={...slowGroup,startDate:'2030-01-07'}
assert.equal(build(longPlan,delayedGroup).length,260,'A later class start must not silently remove the queue')
assert.equal(build(longPlan,delayedGroup)[0].date,'2030-01-07')
const closedGroup={...slowGroup,schoolClosures:[{type:'Lov',startDate:'2026-10-12',endDate:'2029-12-31'}]}
assert.deepEqual(build(longPlan,closedGroup).flatMap(item=>item.lesson.topics),longTopics,'A long closure must postpone every moment')
assert.deepEqual(build(longPlan,{...slowGroup,days:[],extraSlots:[]}),[],'A class without teaching slots must terminate')
console.log('PASS: all 260 moments survive slow pace, distant start and long closure; unscheduled classes terminate')

const queueFixture={startDate:'2026-10-12',weeksData:[{weekStart:'2026-10-12',lessons:[1,2,3,4].map(n=>({topics:[topic(n)]}))}],classGroups:[{name:'Queue A',startDate:'2026-10-12',days:['Måndag','Tisdag','Onsdag','Torsdag']},{name:'Queue B',startDate:'2026-10-12',days:['Måndag','Tisdag','Onsdag','Torsdag']}]}
const queueBefore=JSON.stringify(queueFixture)
const queueFirst=build(queueFixture,queueFixture.classGroups[0])[0]
const queueExpanded=update(queueFixture,'Queue A',queueFirst,{...queueFirst.lesson,consumeNextMoment:true})
assert.deepEqual(build(queueExpanded,queueExpanded.classGroups[0]).map(x=>x.lesson.topics.map(t=>t.name)),[['Moment 1','Moment 2'],['Moment 3'],['Moment 4']])
assert.deepEqual(build(queueExpanded,queueExpanded.classGroups[0]).flatMap(x=>x.lesson.topics),queueFixture.weeksData[0].lessons.flatMap(x=>x.topics),'Pulling next moment preserves every resource')
assert.deepEqual(queueExpanded.classGroups[1],queueFixture.classGroups[1])
assert.deepEqual(queueExpanded.weeksData,queueFixture.weeksData)
assert.equal(JSON.stringify(queueFixture),queueBefore)
const allocated=build(queueExpanded,queueExpanded.classGroups[0])[0]
const pageRemoved={...allocated.lesson,topics:allocated.lesson.topics.map((t,i)=>i===0?{...t,pages:[]}:t)}
const pagePlan=update(queueExpanded,'Queue A',allocated,pageRemoved)
const afterPage=build(pagePlan,pagePlan.classGroups[0])[0].lesson.topics[0]
assert.deepEqual(afterPage.assignments,allocated.lesson.topics[0].assignments)
assert.deepEqual(afterPage.links,allocated.lesson.topics[0].links)
const taskRemoved={...allocated.lesson,topics:allocated.lesson.topics.map((t,i)=>i===0?{...t,assignments:[]}:t)}
const taskPlan=update(queueExpanded,'Queue A',allocated,taskRemoved)
assert.deepEqual(build(taskPlan,taskPlan.classGroups[0])[0].lesson.topics[0].pages,allocated.lesson.topics[0].pages)
console.log('PASS: requesting next queued moment reflows only chosen class; pages and assignments delete independently with links preserved')
