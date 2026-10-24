import fs from 'node:fs'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  function insertBlankWeekAfter(index) {')
const end = source.indexOf('\n  function updateWeek(', start)
assert.ok(start >= 0 && end > start, 'Week insertion function must exist')
const actualFunction = source.slice(start, end)

const addWeeks = (date, amount) => {
  const value = new Date(date + 'T12:00:00Z')
  value.setUTCDate(value.getUTCDate() + amount * 7)
  return value.toISOString().slice(0, 10)
}
const calendarWeekNumber = date => {
  const d = new Date(date + 'T12:00:00Z')
  const weekday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() + 3 - weekday)
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)
}
const displayWeeks = plan => plan.weeksData
const makeWeeks = (plan) => [{
  weekStart: plan.startDate,
  weekNumber: calendarWeekNumber(plan.startDate),
  title: 'Vecka ' + calendarWeekNumber(plan.startDate),
  lessons: Array.from({ length: plan.lessonsPerWeek }, (_, i) => ({ id: 'new-' + i, topics: [] })),
}]
const classSource = fs.readFileSync(new URL('../src/ClassSchedules.jsx', import.meta.url), 'utf8')
const classStart = classSource.indexOf('export function buildClassSchedule(plan, group) {')
const classEnd = classSource.indexOf('\nexport function remapClassOverridesAfterInsertion(', classStart)
assert.ok(classStart >= 0 && classEnd > classStart, 'Class schedule builder must exist')
const classBuilder = classSource.slice(classStart, classEnd).replace('export function ', 'function ')
const DAYS = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
const monday = value => {const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
const nextDate = (start,offset)=>{const d=new Date(start);d.setDate(d.getDate()+offset);return d}
const buildClassSchedule = new Function('DAYS','iso','monday','nextDate',classBuilder+'\nreturn buildClassSchedule')(DAYS,iso,monday,nextDate)

// Regression: class-specific closures must defer, never discard, source lessons.
{
  const lessons = ['A','B','C','D'].map(id => ({id,name:id,topics:[]}))
  const p = {weeksData:[
    {weekStart:'2026-10-05',weekNumber:41,lessons:lessons.slice(0,2)},
    {weekStart:'2026-10-12',weekNumber:42,lessons:lessons.slice(2)}
  ]}
  const a = {days:['Måndag','Onsdag'],schoolClosures:[{type:'Studiedag',startDate:'2026-10-07',endDate:'2026-10-07'}],overrides:{'1':{text:'Own B'}}}
  const b = {days:['Måndag','Onsdag']}
  const sa = buildClassSchedule(p,a)
  const sb = buildClassSchedule(p,b)
  assert.deepEqual(sa.map(x=>x.lesson.id),['A','B','C','D'])
  assert.deepEqual(sa.map(x=>x.date),['2026-10-05','2026-10-12','2026-10-14','2026-10-19'])
  assert.equal(sa[1].override.text,'Own B')
  assert.equal(sb[1].date,'2026-10-07')
  const half = buildClassSchedule(p,{days:['Måndag'],momentsPerDay:{Måndag:2},schoolClosures:[{type:'Halvdag',startDate:'2026-10-05',cancelledLessons:1}]})
  assert.deepEqual(half.map(x=>x.lesson.id),['A','B','C','D'])
  assert.deepEqual(half.map(x=>x.date),['2026-10-05','2026-10-12','2026-10-12','2026-10-19'])
  const holiday = buildClassSchedule(p,{days:['Måndag'],schoolClosures:[{type:'Lov',startDate:'2026-10-05',endDate:'2026-10-16'}]})
  assert.deepEqual(holiday.map(x=>x.lesson.id),['A','B','C','D'])
  assert.equal(holiday[0].date,'2026-10-19')
  console.log('PASS class closures preserve lesson queue, overrides and daily counts')
}
const remapStart = classSource.indexOf('export function remapClassOverridesAfterInsertion(')
const remapEnd = classSource.indexOf('\nexport default function ClassSchedules', remapStart)
assert.ok(remapStart>=0 && remapEnd>remapStart)
const remapBody=classSource.slice(remapStart,remapEnd).replace('export function ','function ')
const remapClassOverridesAfterInsertion=new Function('buildClassSchedule',remapBody+'\nreturn remapClassOverridesAfterInsertion')(buildClassSchedule)

const insert = new Function('displayWeeks','addWeeks','calendarWeekNumber','makeWeeks','plan','window','setPlan','setStatus','remapClassOverridesAfterInsertion',actualFunction + '\nreturn insertBlankWeekAfter') 
const week = (date, name) => ({weekStart:date,weekNumber:calendarWeekNumber(date),title:'Vecka '+calendarWeekNumber(date),lessons:[{id:name,topics:[{name}]}]})
let passed=0
function test(name, dates, prompts, expected, lessonsPerWeek=3) {
  let plan={weeksData:dates.map((d,i)=>week(d,'original-'+i)),lessonsPerWeek,weeks:dates.length}
  const before=structuredClone(plan)
  let status=''
  const ask=[...prompts]
  const fn=insert(displayWeeks,addWeeks,calendarWeekNumber,makeWeeks,plan,{prompt:()=>ask.shift()},updater=>{plan=updater(plan)},message=>{status=message},remapClassOverridesAfterInsertion)
  fn(0)
  expected(plan,before,status)
  passed++
  console.log('PASS '+name)
}
const base=['2026-10-05','2026-10-12','2026-10-19']
test('W01 ordinary week shifts following dates',base,['1'],(p,b)=>{assert.equal(p.weeks,4);assert.deepEqual(p.weeksData.map(w=>w.weekStart),['2026-10-05','2026-10-12','2026-10-19','2026-10-26']);assert.equal(p.weeksData[2].lessons[0].id,b.weeksData[1].lessons[0].id)})
test('W02 all lessons train',base,['2'],p=>{assert.equal(p.weeksData[1].weekActivity,'provtraning');assert.ok(p.weeksData[1].lessons.every(l=>l.topics[0].name==='Träna inför prov'))})
test('W03 last lesson exam',base,['3','3','Geometri'],p=>{const ls=p.weeksData[1].lessons;assert.deepEqual(ls.map(l=>l.topics[0].name),['Träna inför prov','Träna inför prov','Geometri']);assert.equal(ls[2].assessment.type,'Prov')})
test('W04 first lesson exam',base,['3','1','Prov'],p=>{assert.equal(p.weeksData[1].lessons[0].assessment.type,'Prov');assert.ok(p.weeksData[1].lessons.slice(1).every(l=>!l.assessment))})
test('W05 middle lesson exam',base,['3','2','Prov'],p=>{assert.equal(p.weeksData[1].lessons[1].assessment.type,'Prov');assert.equal(p.weeksData[1].lessons[0].topics[0].name,'Träna inför prov')})
test('W07 blank title defaults',base,['3','2','  '],p=>assert.equal(p.weeksData[1].lessons[1].assessment.title,'Prov'))
for (const [name,prompts] of [['W08 cancel',[null]],['W09 invalid',['4']],['W10 cancel exam',['3',null]],['W11 invalid lesson',['3','0']]]) test(name,base,prompts,(p,b)=>assert.deepEqual(p,b))
test('W12 single lesson exam',base,['3','1','Prov'],p=>assert.equal(p.weeksData[1].lessons.length,1),1)
test('W19 new year dates',['2026-12-21','2026-12-28','2027-01-04'],['1'],p=>assert.deepEqual(p.weeksData.map(w=>w.weekStart),['2026-12-21','2026-12-28','2027-01-04','2027-01-11']))
test('W21 preserve custom title',base,['1'],p=>assert.equal(p.weeksData[2].title,'Vecka '+calendarWeekNumber('2026-10-19')))

function testWithPlan(name, initial, prompts, index, expected) {
  let plan = structuredClone(initial)
  const before = structuredClone(plan)
  const answers = [...prompts]
  let promptCalls = 0
  const fn = insert(displayWeeks, addWeeks, calendarWeekNumber, makeWeeks, plan,
    { prompt: () => { promptCalls++; return answers.shift() } },
    updater => { plan = updater(plan) }, () => {},remapClassOverridesAfterInsertion)
  fn(index)
  expected(plan, before, promptCalls)
  passed++
  console.log('PASS ' + name)
}
const consecutive = (start, count) => Array.from({length:count}, (_,i)=>week(addWeeks(start,i),'original-'+i))
const planOf = (count, start='2026-01-05') => ({
  weeksData:consecutive(start,count), weeks:count, lessonsPerWeek:3,
  classGroups:[{name:'A',startDate:'2026-01-05',days:['Måndag'],cancelledDates:['2026-02-02'],overrides:{}},{name:'B',startDate:'2026-01-05',days:['Fredag'],extraSlots:[{date:'2026-02-13'}],lessonTimes:{Fredag:['10:15']},overrides:{}}]
})
testWithPlan('W17 insert 52nd week',planOf(51),['1'],0,(p,b)=>{
  assert.equal(p.weeks,52)
  assert.equal(p.weeksData.length,52)
  assert.equal(new Set(p.weeksData.map(w=>w.weekStart)).size,52)
  assert.deepEqual(p.classGroups,b.classGroups)
})
testWithPlan('W18 reject insertion at 52-week limit',planOf(52),['1'],0,(p,b,calls)=>{
  assert.deepEqual(p,b)
  assert.equal(calls,0)
})
testWithPlan('W16 reject last index',planOf(3),['1'],2,(p,b,calls)=>{
  assert.deepEqual(p,b)
  assert.equal(calls,0)
})
testWithPlan('W16 reject negative index',planOf(3),['1'],-1,(p,b,calls)=>{
  assert.deepEqual(p,b)
  assert.equal(calls,0)
})
testWithPlan('W20 ISO year boundary',planOf(3,'2026-12-21'),['1'],0,p=>{
  assert.deepEqual(p.weeksData.map(w=>w.weekNumber),[52,53,1,2])
  assert.deepEqual(p.weeksData.map(w=>w.weekStart),['2026-12-21','2026-12-28','2027-01-04','2027-01-11'])
})
testWithPlan('W21 custom title remains unchanged',(()=>{
  const p=planOf(3);p.weeksData[1].title='Eget tema';return p
})(),['1'],0,p=>assert.equal(p.weeksData[2].title,'Eget tema'))
testWithPlan('W22 lesson contents and metadata preserved',(()=>{
  const p=planOf(3)
  p.weeksData[1].lessons[0]={id:'special',topics:[{name:'Algebra',pages:['42'],assignments:['A'],links:['https://example.org']}],assessment:{type:'Prov',title:'Gammalt prov'}}
  p.weeksData[1].notes='Bevara anteckning'
  return p
})(),['2'],0,(p,b)=>{
  assert.deepEqual(p.weeksData[2].lessons,b.weeksData[1].lessons)
  assert.equal(p.weeksData[2].notes,'Bevara anteckning')
  assert.deepEqual(p.classGroups,b.classGroups)
})
testWithPlan('W32 class group metadata unchanged',planOf(3),['3','2','Prov'],0,(p,b)=>{
  assert.deepEqual(p.classGroups,b.classGroups)
  assert.equal(p.weeksData[1].lessons[1].assessment.type,'Prov')
})
testWithPlan('W23 publication and hide dates remain calendar-anchored',(()=>{
  const p=planOf(3)
  p.weeksData[1].publishDate='2026-02-01'
  p.weeksData[1].hideDate='2026-02-28'
  return p
})(),['1'],0,(p,b)=>{
  assert.equal(p.weeksData[2].publishDate,b.weeksData[1].publishDate)
  assert.equal(p.weeksData[2].hideDate,b.weeksData[1].hideDate)
  assert.equal(p.weeksData[2].weekStart,addWeeks(b.weeksData[1].weekStart,1))
})
testWithPlan('W33 class exceptions and overrides preserved',planOf(3),['1'],0,(p,b)=>{
  assert.deepEqual(p.classGroups[0].cancelledDates,b.classGroups[0].cancelledDates)
  assert.deepEqual(p.classGroups[0].overrides,b.classGroups[0].overrides)
  assert.deepEqual(p.classGroups[1].extraSlots,b.classGroups[1].extraSlots)
  assert.deepEqual(p.classGroups[1].lessonTimes,b.classGroups[1].lessonTimes)
})
testWithPlan('W14 insert after first week leaves first unchanged',planOf(3),['1'],0,(p,b)=>{
  assert.deepEqual(p.weeksData[0],b.weeksData[0])
  assert.equal(p.weeksData[2].weekStart,addWeeks(b.weeksData[1].weekStart,1))
})
testWithPlan('W15 insert before last week moves last exactly one week',planOf(3),['1'],1,(p,b)=>{
  assert.deepEqual(p.weeksData[0],b.weeksData[0])
  assert.deepEqual(p.weeksData[1],b.weeksData[1])
  assert.equal(p.weeksData[3].weekStart,addWeeks(b.weeksData[2].weekStart,1))
})
testWithPlan('W11 reject fractional lesson number',planOf(3),['3','1.5'],0,(p,b)=>assert.deepEqual(p,b))
testWithPlan('W10 cancel exam title',planOf(3),['3','2',null],0,(p,b)=>assert.deepEqual(p,b))
// The React undo/redo hooks are not mounted here. Verify the full-snapshot
// contract with synthetic data; browser behavior remains unverified.
{
  const before=planOf(3)
  let after
  const fn=insert(displayWeeks,addWeeks,calendarWeekNumber,makeWeeks,before,
    {prompt:()=> '1'},updater=>{after=updater(before)},()=>{},remapClassOverridesAfterInsertion)
  fn(0)
  const history={past:[JSON.stringify(before)],current:JSON.stringify(after),future:[]}
  history.future.unshift(history.current)
  history.current=history.past.pop()
  assert.deepEqual(JSON.parse(history.current),before)
  history.past.push(history.current)
  history.current=history.future.shift()
  assert.deepEqual(JSON.parse(history.current),after)
  passed++
  console.log('PASS W25-W26 synthetic snapshot undo/redo contract (not React UI)')
}


testWithPlan('W34 class A and B map to inserted base week',planOf(3),['3','2','Matteprov'],0,(p,b)=>{
  const a=buildClassSchedule(p,p.classGroups[0])
  const bLessons=buildClassSchedule(p,p.classGroups[1])
  assert.ok(a.some(item=>item.weekStart===p.weeksData[1].weekStart))
  assert.ok(bLessons.some(item=>item.weekStart===p.weeksData[1].weekStart))
  // Deferred lessons may take place after the last base week; their source
  // week must still exist in the plan and their dates must not move backwards.
  assert.ok(a.every(item=>p.weeksData.some(w=>w.weekStart===item.sourceWeekStart)))
  assert.ok(bLessons.every(item=>p.weeksData.some(w=>w.weekStart===item.sourceWeekStart)))
  assert.ok(a.every((item,i)=>i===0||item.date>=a[i-1].date))
  assert.ok(bLessons.every((item,i)=>i===0||item.date>=bLessons[i-1].date))
  assert.deepEqual(p.classGroups,b.classGroups)
})
testWithPlan('W33 cancelled class day stays cancelled',planOf(6),['1'],0,(p)=>{
  const a=buildClassSchedule(p,p.classGroups[0])
  assert.ok(!a.some(item=>item.date==='2026-02-02'))
  assert.ok(a.some(item=>item.date==='2026-01-12'))
})
testWithPlan('W34 class override index stays unchanged',(()=>{const p=planOf(3);p.classGroups[0].overrides={'1':{text:'Special'}};return p})(),['1'],0,(p,b)=>{
  const before=buildClassSchedule(b,b.classGroups[0])
  const after=buildClassSchedule(p,p.classGroups[0])
  const original=before[1]
  const moved=after.find(item=>item.lesson.id===original.lesson.id)
  assert.ok(moved, 'original lesson must remain in the class queue')
  assert.equal(original.override?.text,'Special')
  assert.equal(moved.override?.text,'Special')
  assert.deepEqual(p.classGroups[0].overrides,{[String(moved.lessonNumber-1)]:{text:'Special'}})
  assert.equal(after[1].override,null)
})


testWithPlan('W32 class B Friday slots follow shifted weeks',planOf(4),['2'],0,p=>{
  const items=buildClassSchedule(p,p.classGroups[1])
  assert.ok(items.some(item=>item.date==='2026-01-16' && item.weekStart==='2026-01-12'))
  assert.ok(items.some(item=>item.date==='2026-01-23' && item.weekStart==='2026-01-19'))
  assert.ok(items.every(item=>item.day==='Fredag'))
})
testWithPlan('W33 class B extra slot remains calendar-based',planOf(7),['1'],0,p=>{
  const items=buildClassSchedule(p,p.classGroups[1])
  assert.equal(items.filter(item=>item.date==='2026-02-13').length,2)
})
testWithPlan('W32 hidden source week produces no class lessons',(()=>{
  const p=planOf(3)
  p.weeksData[1].hidden=true
  return p
})(),['1'],0,p=>{
  const a=buildClassSchedule(p,p.classGroups[0])
  assert.ok(!a.some(item=>item.weekStart===p.weeksData[2].weekStart))
})
{
  // Verify actual undo/redo handlers, without mounting React.
  const historySource=fs.readFileSync(new URL('../src/usePlanHistory.js',import.meta.url),'utf8')
  const undoStart=historySource.indexOf('  const undoPlan = () => {')
  const redoEnd=historySource.indexOf('  return { undoPlan, redoPlan,',undoStart)
  assert.ok(undoStart>=0 && redoEnd>undoStart)
  const handlers=historySource.slice(undoStart,redoEnd)
  const first=planOf(3)
  const second=structuredClone(first)
  second.weeksData[1].title='Redigerad'
  const third=structuredClone(second)
  third.weeksData[2].title='Nästa ändring'
  const historyRef={current:{past:[JSON.stringify(first),JSON.stringify(second)],current:JSON.stringify(third),future:[]}}
  const historySkipRef={current:false}
  let plan=third
  let changes=0
  const {undoPlan,redoPlan}=new Function('historyRef','historySkipRef','setPlan','setHistoryVersion',handlers+'\nreturn {undoPlan,redoPlan}')(
    historyRef,historySkipRef,next=>{plan=next},callback=>{changes=callback(changes)})
  undoPlan()
  assert.deepEqual(plan,second)
  undoPlan()
  assert.deepEqual(plan,first)
  redoPlan()
  assert.deepEqual(plan,second)
  redoPlan()
  assert.deepEqual(plan,third)
  assert.equal(changes,4)
  assert.equal(historySkipRef.current,true)
  passed++
  console.log('PASS W25-W28 actual undo/redo handlers (without React lifecycle)')
}


testWithPlan('W06 custom exam title',planOf(3),['3','2','Algebra delprov'],0,p=>{
  assert.equal(p.weeksData[1].lessons[1].assessment.title,'Algebra delprov')
  assert.equal(p.weeksData[1].lessons[1].topics[0].name,'Algebra delprov')
})
testWithPlan('W13 no lessons refuses insertion',{...planOf(3),lessonsPerWeek:0},[],0,(p,b,calls)=>{
  assert.deepEqual(p,b)
  assert.equal(calls,0)
})
testWithPlan('W22 preserve custom week fields',(()=>{
  const p=planOf(3);p.weeksData[1].chapter='Funktioner';p.weeksData[1].links=['https://example.org/lesson'];p.weeksData[1].keepVisibleExtra=true;return p
})(),['1'],0,(p,b)=>{
  assert.equal(p.weeksData[2].chapter,b.weeksData[1].chapter)
  assert.deepEqual(p.weeksData[2].links,b.weeksData[1].links)
  assert.equal(p.weeksData[2].keepVisibleExtra,true)
})
testWithPlan('W32 two classes retain different schedules',planOf(4),['1'],0,p=>{
  const a=buildClassSchedule(p,p.classGroups[0]);const b=buildClassSchedule(p,p.classGroups[1])
  assert.ok(a.every(x=>x.day==='Måndag'))
  assert.ok(b.every(x=>x.day==='Fredag'))
  assert.ok(a.some(x=>x.weekStart===p.weeksData[1].weekStart))
  assert.ok(b.some(x=>x.weekStart===p.weeksData[1].weekStart))
})
testWithPlan('W33 class holiday removes affected lessons',(()=>{
  const p=planOf(4);p.classGroups[0].schoolClosures=[{startDate:'2026-01-12',endDate:'2026-01-12',type:'Studiedag'}];return p
})(),['1'],0,p=>assert.ok(!buildClassSchedule(p,p.classGroups[0]).some(x=>x.date==='2026-01-12')))
testWithPlan('W33 half day reduces extra slots',(()=>{
  const p=planOf(7);p.classGroups[1].schoolClosures=[{startDate:'2026-02-13',endDate:'2026-02-13',type:'Halvdag',cancelledLessons:1}];return p
})(),['1'],0,p=>assert.equal(buildClassSchedule(p,p.classGroups[1]).filter(x=>x.date==='2026-02-13').length,1))
testWithPlan('W23 publication metadata does not leak to inserted week',(()=>{
  const p=planOf(3);p.weeksData[1].publishDate='2026-01-15';p.weeksData[1].hideDate='2026-02-15';return p
})(),['3','1','Prov'],0,p=>{
  assert.equal(p.weeksData[1].publishDate,undefined)
  assert.equal(p.weeksData[1].hideDate,undefined)
  assert.equal(p.weeksData[2].publishDate,'2026-01-15')
  assert.equal(p.weeksData[2].hideDate,'2026-02-15')
})


{
  const historySource=fs.readFileSync(new URL('../src/usePlanHistory.js',import.meta.url),'utf8')
  const undoStart=historySource.indexOf('  const undoPlan = () => {')
  const redoEnd=historySource.indexOf('  return { undoPlan, redoPlan,',undoStart)
  assert.ok(undoStart>=0 && redoEnd>undoStart)
  const handlers=historySource.slice(undoStart,redoEnd)
  const first=planOf(3)
  const next=structuredClone(first);next.weeksData[1].title='Ny rubrik'
  const historyRef={current:{past:[JSON.stringify(first)],current:JSON.stringify(next),future:[]}}
  const historySkipRef={current:false}
  let plan=next
  const {undoPlan,redoPlan}=new Function('historyRef','historySkipRef','setPlan','setHistoryVersion',handlers+'\nreturn {undoPlan,redoPlan}')(
    historyRef,historySkipRef,value=>{plan=value},()=>{},remapClassOverridesAfterInsertion)
  undoPlan()
  assert.deepEqual(plan,first)
  assert.equal(historyRef.current.future.length,1)
  // Emulate the useEffect new-edit transition: new edits invalidate redo.
  historySkipRef.current=false
  const edited=structuredClone(first);edited.weeksData[0].title='Annan ändring'
  historyRef.current.past.push(historyRef.current.current)
  historyRef.current.current=JSON.stringify(edited)
  historyRef.current.future=[]
  redoPlan()
  assert.deepEqual(plan,first)
  assert.equal(historyRef.current.future.length,0)
  passed++
  console.log('PASS W27 redo invalidated by new edit (history effect transition emulated)')
}


testWithPlan('W32 two classes remap independently',(()=>{
  const p=planOf(4)
  p.classGroups[0].overrides={'1':{text:'A original second'}}
  p.classGroups[1].overrides={'1':{text:'B original second'}}
  return p
})(),['1'],0,(p,b)=>{
  for (const [i, text] of [[0,'A original second'],[1,'B original second']]) {
    const original=buildClassSchedule(b,b.classGroups[i])[1]
    const updated=buildClassSchedule(p,p.classGroups[i])
    const moved=updated.find(item=>item.lesson.id===original.lesson.id)
    assert.ok(moved, 'class '+i+' original lesson survives insertion')
    assert.equal(moved.override?.text,text)
    assert.equal(updated[1].override,null)
  }
  assert.deepEqual(b.classGroups[0].overrides,{'1':{text:'A original second'}})
})
testWithPlan('W32 overrides before insertion stay in place',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'0':{text:'Before insertion'}}
  return p
})(),['1'],0,p=>{
  assert.equal(buildClassSchedule(p,p.classGroups[0])[0].override?.text,'Before insertion')
  assert.deepEqual(p.classGroups[0].overrides,{'0':{text:'Before insertion'}})
})
testWithPlan('W32 legacy nonnumeric override keys are preserved',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'legacy-2025':{text:'Legacy'},'1':{text:'Second lesson'}}
  return p
})(),['1'],0,(p,b)=>{
  assert.deepEqual(p.classGroups[0].overrides['legacy-2025'],{text:'Legacy'})
  const original=buildClassSchedule(b,b.classGroups[0])[1]
  const moved=buildClassSchedule(p,p.classGroups[0]).find(item=>item.lesson.id===original.lesson.id)
  assert.ok(moved)
  assert.equal(moved.override?.text,'Second lesson')
})
testWithPlan('W32 legacy out-of-range index is preserved safely in archive',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'999':{text:'Orphan'}}
  return p
})(),['1'],0,p=>{
  assert.equal(p.classGroups[0].overrides['999'],undefined)
  assert.deepEqual(p.classGroups[0].overrides['legacy-unmapped:999'],{text:'Orphan'})
})
testWithPlan('W33 cancelled class day keeps later override on original lesson',(()=>{
  const p=planOf(5)
  p.classGroups[0].cancelledDates=['2026-01-12']
  p.classGroups[0].overrides={'1':{text:'Originally Jan 19'}}
  return p
})(),['1'],0,(p,b)=>{
  const before=buildClassSchedule(b,b.classGroups[0])
  const after=buildClassSchedule(p,p.classGroups[0])
  const old=before.find(item=>item.override?.text==='Originally Jan 19')
  const moved=after.find(item=>item.override?.text==='Originally Jan 19')
  assert.equal(old.lesson.id,moved.lesson.id)
  assert.ok(moved.date >= old.date, 'deferred class lesson must not move backwards')
  assert.ok(p.weeksData.some(w=>w.weekStart===moved.sourceWeekStart), 'source lesson must remain in base plan')
})
testWithPlan('W25 undo snapshot restores original class override indices',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'1':{text:'Original'}}
  return p
})(),['1'],0,(p,b)=>{
  assert.deepEqual(JSON.parse(JSON.stringify(b)).classGroups[0].overrides,{'1':{text:'Original'}})
  assert.deepEqual(p.classGroups[0].overrides,{'2':{text:'Original'}})
})


testWithPlan('W32 zero-padded and negative legacy keys remain unchanged',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'01':{text:'Padded'},'-1':{text:'Negative'},'1':{text:'Real'}}
  return p
})(),['1'],0,p=>{
  assert.deepEqual(p.classGroups[0].overrides['01'],{text:'Padded'})
  assert.deepEqual(p.classGroups[0].overrides['-1'],{text:'Negative'})
  assert.equal(p.classGroups[0].overrides['2']?.text,'Real')
})
testWithPlan('W32 no classGroups remains absent for legacy plan',(()=>{
  const p=planOf(3)
  delete p.classGroups
  return p
})(),['1'],0,p=>{
  assert.equal(Object.hasOwn(p,'classGroups'),false)
  assert.equal(p.weeksData.length,4)
})
testWithPlan('W33 school closure before inserted week retains override target',(()=>{
  const p=planOf(5)
  p.classGroups[0].schoolClosures=[{startDate:'2026-01-12',type:'Studiedag'}]
  p.classGroups[0].overrides={'1':{text:'January 19'}}
  return p
})(),['1'],0,(p,b)=>{
  const old=buildClassSchedule(b,b.classGroups[0]).find(x=>x.override?.text==='January 19')
  const after=buildClassSchedule(p,p.classGroups[0]).find(x=>x.override?.text==='January 19')
  assert.equal(after?.lesson.id,old?.lesson.id)
})
testWithPlan('W23 publication metadata unchanged after undo snapshot',(()=>{
  const p=planOf(3)
  p.weeksData[1].publishDate='2026-01-15'
  p.weeksData[1].hideDate='2026-02-15'
  p.classGroups[0].overrides={'1':{text:'Original'}}
  return p
})(),['1'],0,(p,b)=>{
  assert.equal(p.weeksData[2].publishDate,b.weeksData[1].publishDate)
  assert.equal(p.weeksData[2].hideDate,b.weeksData[1].hideDate)
  assert.equal(b.classGroups[0].overrides['1'].text,'Original')
})


{
  // Execute the real student-publication sanitizer on an isolated draft snapshot.
  const from=source.indexOf('function sanitizeForStudents(plan) {')
  const to=source.indexOf('\nfunction resourceInfo(',from)
  assert.ok(from>=0 && to>from)
  const sanitizer=new Function('displayWeeks','makeWeeks','validSchoolClosure','toIsoDate','resourceInfo',
    source.slice(from,to)+'\nreturn sanitizeForStudents')(
      displayWeeks,makeWeeks,()=>false,d=>d.toISOString().slice(0,10),()=>null)
  const draft=planOf(3)
  draft.weeksData[0].hidden=true
  draft.weeksData[1].publishDate='2026-01-12'
  draft.weeksData[1].hideDate='2026-02-01'
  draft.classGroups[0].overrides={'1':{text:'Teacher note'}}
  draft.privateTeacherOnly='secret'
  const published=sanitizer(draft)
  assert.equal(published.published,true)
  assert.equal(published.weeksData.length,2)
  assert.equal(published.weeksData[0].weekStart,'2026-01-12')
  assert.equal(published.weeksData[0].publishDate,'2026-01-12')
  assert.equal(published.weeksData[0].hideDate,'2026-02-01')
  assert.equal(Object.hasOwn(published,'privateTeacherOnly'),false)
  const frozenPublished=JSON.stringify(published)
  draft.weeksData[1].title='Unpublished draft edit'
  draft.classGroups[0].overrides['1'].text='Changed draft'
  draft.classGroups[1].lessonTimes.Fredag[0]='12:30'
  assert.equal(JSON.stringify(published),frozenPublished)
  assert.equal(published.classGroups[0].overrides['1'].text,'Teacher note')
  assert.equal(published.classGroups[1].lessonTimes.Fredag[0],'10:15')
  const republished=sanitizer(draft)
  assert.notEqual(JSON.stringify(republished),frozenPublished)
  const publicationStart=source.indexOf('function publicationFields(publish, keepPublished, slug, publishedPayload) {')
  const publicationEnd=source.indexOf('\nfunction Login(',publicationStart)
  assert.ok(publicationStart>=0 && publicationEnd>publicationStart)
  const publicationFields=new Function(source.slice(publicationStart,publicationEnd)+'\nreturn publicationFields')()
  const firstFields=publicationFields(true,false,'isolated-test',published)
  assert.equal(firstFields.published,true)
  assert.equal(firstFields.public_slug,'isolated-test')
  assert.equal(firstFields.published_content,frozenPublished)
  assert.deepEqual(publicationFields(false,true,'ignored',republished),{})
  assert.equal(publicationFields(false,false,null,null).published_content,null)
  assert.notEqual(publicationFields(true,false,'isolated-test',republished).published_content,firstFields.published_content)

  passed++
  console.log('PASS W30-W31 actual student sanitizer snapshot stays unchanged until explicit resanitization')
}


testWithPlan('W32 several overrides preserve individual lesson identities',(()=>{
  const p=planOf(5)
  p.classGroups[0].overrides={'0':{text:'First'},'1':{text:'Second'},'2':{text:'Third'}}
  return p
})(),['1'],0,(p,b)=>{
  const before=buildClassSchedule(b,b.classGroups[0])
  const after=buildClassSchedule(p,p.classGroups[0])
  for(const label of ['First','Second','Third']){
    const original=before.find(x=>x.override?.text===label)
    const shifted=after.find(x=>x.override?.text===label)
    assert.equal(shifted?.lesson.id,original?.lesson.id)
  }
})
testWithPlan('W32 hidden week does not consume ordinal override',(()=>{
  const p=planOf(5)
  p.weeksData[1].hidden=true
  p.classGroups[0].overrides={'1':{text:'Visible third week'}}
  return p
})(),['1'],0,(p,b)=>{
  const old=buildClassSchedule(b,b.classGroups[0]).find(x=>x.override?.text==='Visible third week')
  const moved=buildClassSchedule(p,p.classGroups[0]).find(x=>x.override?.text==='Visible third week')
  assert.equal(moved?.lesson.id,old?.lesson.id)
})


testWithPlan('W32 orphan numeric collision does not overwrite valid lesson override',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={'2':{text:'Third original'},'3':{text:'Orphan historical'}}
  return p
})(),['1'],0,(p,b)=>{
  const overrides=p.classGroups[0].overrides
  assert.equal(overrides['3']?.text,'Third original')
  assert.equal(overrides['legacy-unmapped:3']?.text,'Orphan historical')
  const before=buildClassSchedule(b,b.classGroups[0]).find(x=>x.override?.text==='Third original')
  const after=buildClassSchedule(p,p.classGroups[0]).find(x=>x.override?.text==='Third original')
  assert.equal(before?.lesson.id,after?.lesson.id)
})
testWithPlan('W32 noncolliding historical numeric orphan is safely archived',(()=>{
  const p=planOf(3);p.classGroups[0].overrides={'99':{text:'Unmapped'}};return p
})(),['1'],0,p=>assert.deepEqual(p.classGroups[0].overrides,{'legacy-unmapped:99':{text:'Unmapped'}}))


testWithPlan('W32 archived legacy key collision preserves both archived and orphaned values',(()=>{
  const p=planOf(3)
  p.classGroups[0].overrides={
    '2':{text:'Valid original'},
    '3':{text:'Orphan numeric'},
    'legacy-unmapped:3':{text:'Existing archive'}
  }
  return p
})(),['1'],0,p=>{
  const values=p.classGroups[0].overrides
  assert.equal(values['3']?.text,'Valid original')
  assert.equal(values['legacy-unmapped:3']?.text,'Existing archive')
  assert.equal(values['legacy-unmapped:3:1']?.text,'Orphan numeric')
})

testWithPlan('W36 orphan numeric ordinal that becomes valid after insertion stays archived',(()=>{
  const p=planOf(2)
  p.classGroups[0].overrides={'2':{text:'Old orphan'}}
  return p
})(),['1'],0,p=>{
  assert.equal(p.classGroups[0].overrides['2'],undefined)
  assert.equal(p.classGroups[0].overrides['legacy-unmapped:2']?.text,'Old orphan')
  assert.equal(buildClassSchedule(p,p.classGroups[0]).some(item=>item.override?.text==='Old orphan'),false)
})

console.log('Actual insertion function: '+passed+' synthetic checks passed (not browser or integration tests)')
