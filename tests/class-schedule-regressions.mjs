import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Exercise the real scheduling function without loading React or the browser UI.
const source = fs.readFileSync(new URL('../src/ClassSchedules.jsx', import.meta.url), 'utf8')
const start = source.indexOf("const DAYS =")
const end = source.indexOf("export function remapClassOverridesAfterInsertion")
assert.ok(start >= 0 && end > start, 'Could not locate scheduling implementation')
const implementation = source.slice(start, end).replace('export function buildClassSchedule', 'function buildClassSchedule')
const build = vm.runInNewContext(implementation + '\n buildClassSchedule', { Date, Set, Array, Math, Number, String })

const week = { weekStart: '2026-10-19', weekNumber: 43, lessons: Array.from({length: 4}, (_, i) => ({
  name: 'Lesson ' + (i + 1),
  topics: [{name: 'Topic ' + (i + 1)}],
})) }
const base = {startDate: '2026-10-19', weeksData: [week], schoolClosures: []}
const group = (name, closures = []) => ({name, days: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'], schoolClosures: closures})
const closure = (type, date, other = {}) => ({type, startDate: date, endDate: date, ...other})
const dates = rows => Array.from(rows, row => row.date)
const names = rows => Array.from(rows, row => row.lesson.name)

// Missing saved source weeks must not become missing teaching weeks.
// Lessons remain in source order and the saved plan is never modified.
const sparsePlan = {
  startDate:'2026-10-12',
  weeksData:[
    {weekStart:'2026-10-12',weekNumber:42,lessons:Array.from({length:4},(_,i)=>({name:'42-'+i,topics:[{name:'42-'+i}]}))},
    {weekStart:'2026-11-02',weekNumber:45,lessons:Array.from({length:8},(_,i)=>({name:'45-'+i,topics:[{name:'45-'+i}]}))}
  ],
  schoolClosures:[]
}
const sparseSnapshot = JSON.stringify(sparsePlan)
const sparse8A = build(sparsePlan,{name:'8A',startDate:'2026-10-12',days:['Måndag','Tisdag','Torsdag','Fredag']})
const sparse8C = build(sparsePlan,{name:'8C',startDate:'2026-10-12',days:['Måndag','Tisdag','Onsdag']})
assert.deepEqual(dates(sparse8A).slice(0,8),['2026-10-12','2026-10-13','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-22','2026-10-23'])
assert.deepEqual(dates(sparse8C).slice(0,6),['2026-10-12','2026-10-13','2026-10-14','2026-10-19','2026-10-20','2026-10-21'])
assert.equal(sparse8A.some(item=>item.date.startsWith('2026-10-26')),true)
assert.deepEqual(names(sparse8A),['42-0','42-1','42-2','42-3',...Array.from({length:8},(_,i)=>'45-'+i)])
assert.equal(JSON.stringify(sparsePlan),sparseSnapshot)
console.log('PASS sparse source weeks: 8A and 8C fill calendar weeks 43–44 without changing saved data')

// Isolated demo: one, two, three, four and mixed moments per meeting.
const demoPlan={startDate:'2026-10-19',weeksData:[{weekStart:'2026-10-19',weekNumber:43,lessons:Array.from({length:12},(_,i)=>({name:'Moment '+(i+1),topics:[{name:'Moment '+(i+1),pagesLabel:'Sida '+i,assignmentsLabel:'Uppgift '+i}]}))}],schoolClosures:[]}
const demoOriginal=JSON.stringify(demoPlan)
for(const count of [1,2,3,4]){
 const rows=build(demoPlan,{name:'Test '+count,days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:count,Tisdag:count,Torsdag:count,Fredag:count}})
 assert.equal(rows.length,Math.ceil(12/count))
 assert.deepEqual(Array.from(rows).flatMap(row=>Array.from(row.lesson.topics,t=>t.name)),Array.from({length:12},(_,i)=>'Moment '+(i+1)))
 assert.equal(rows[0].lesson.topics.length,count)
}
const mixed=build(demoPlan,{name:'Test Mix',days:['Måndag','Tisdag','Torsdag','Fredag'],momentsPerDay:{Måndag:1,Tisdag:2,Torsdag:3,Fredag:4}})
assert.deepEqual(Array.from(mixed.slice(0,4),row=>row.lesson.topics.length),[1,2,3,4])
assert.deepEqual(Array.from(mixed).flatMap(row=>Array.from(row.lesson.topics,t=>t.name)),Array.from({length:12},(_,i)=>'Moment '+(i+1)))
assert.equal(JSON.stringify(demoPlan),demoOriginal)
console.log('PASS isolated demo classes: 1, 2, 3, 4 and mixed moments preserve order and source data')

const normal = build(base, group('A'))
assert.deepEqual(dates(normal), ['2026-10-19','2026-10-20','2026-10-21','2026-10-22'])
assert.deepEqual(names(normal), ['Lesson 1','Lesson 2','Lesson 3','Lesson 4'])

// Study day and holiday shift the entire queue without dropping or duplicating lessons.
const blocked = build(base, group('A', [
  closure('Studiedag','2026-10-19'),
  closure('Lov','2026-10-20'),
]))
assert.deepEqual(dates(blocked), ['2026-10-21','2026-10-22','2026-10-23','2026-10-26'])
assert.deepEqual(names(blocked), names(normal))

// One regular slot: a half-day cancelling one slot must shift, not delete, the lesson.
const half = build(base, group('A', [closure('Halvdag','2026-10-19',{cancelledLessons:1})]))
assert.deepEqual(dates(half), ['2026-10-20','2026-10-21','2026-10-22','2026-10-23'])
assert.deepEqual(names(half), names(normal))

// Overlapping closure rules must not schedule any lessons on a fully closed day.
const overlapping = build(base, group('A', [
  closure('Halvdag','2026-10-19',{cancelledLessons:1}),
  closure('Studiedag','2026-10-19'),
]))
assert.equal(dates(overlapping).includes('2026-10-19'), false)
assert.deepEqual(names(overlapping), names(normal))

// Class-specific closure must not affect a different class or mutate source planning.
const untouched = JSON.stringify(base)
assert.deepEqual(dates(build(base, group('B'))), dates(normal))
assert.equal(JSON.stringify(base), untouched)

// A holiday in class A must not affect class B even when they share the source plan.
const classA = build(base, group('A', [closure('Studiedag','2026-10-19')]))
const classB = build(base, group('B'))
assert.equal(classA[0].date, '2026-10-20')
assert.equal(classB[0].date, '2026-10-19')
assert.deepEqual(names(classA), names(classB))

// An entire source week closed for one class must be moved into the next week.
const longClosure = build(base, group('A', [{
  type:'Lov', startDate:'2026-10-19', endDate:'2026-10-23'
}]))
assert.deepEqual(dates(longClosure), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29'])
assert.deepEqual(names(longClosure), names(normal))

// Two meetings on one day: morning and afternoon cancellations retain the original slot.
for (const [cancelledFrom, expectedSlot] of [['start', 2], ['end', 1]]) {
  const twoSlots = group('A', [closure('Halvdag', '2026-10-19', {
    cancelledLessons: 1, cancelledFrom
  })])
  twoSlots.extraSlots = [{date:'2026-10-19'}]
  const rows = build(base, twoSlots)
  assert.equal(rows[0].date, '2026-10-19')
  assert.equal(rows[0].slot, expectedSlot)
  assert.deepEqual(names(rows), names(normal))
}

// The 104-week safety horizon must terminate when a class has no scheduled weekdays.
const empty = build(base, {name:'C', days:[], schoolClosures:[]})
assert.equal(empty.length, 0)


// Global closures may target a single class; unaffected classes keep their slots.
const globalPlan = {...base, schoolClosures: [
  {...closure('Studiedag', '2026-10-19'), classNames:['A']},
]}
assert.deepEqual(dates(build(globalPlan, group('A'))), ['2026-10-20','2026-10-21','2026-10-22','2026-10-23'])
assert.deepEqual(dates(build(globalPlan, group('B'))), dates(normal))

// The student payload must retain class closures, and the student week
// timeline must include the last lesson moved beyond the source plan.
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const sanitizeStart = appSource.indexOf('function sanitizeForStudents(')
const sanitizeEnd = appSource.indexOf('\nfunction ', sanitizeStart + 1)
assert.ok(sanitizeStart >= 0 && sanitizeEnd > sanitizeStart, 'Student sanitization function missing')
const studentSanitizer = appSource.slice(sanitizeStart, sanitizeEnd)
assert.match(studentSanitizer, /schoolClosures:Array\.isArray\(g\.schoolClosures\)/)
assert.match(studentSanitizer, /momentsPerDay:g\.momentsPerDay/)
const timelineStart = appSource.indexOf('const classWeekTimeline = sourceClassWeeks.length')
const timelineEnd = appSource.indexOf('const classWeeks = selectedClass', timelineStart)
assert.ok(timelineStart > 0 && timelineEnd > timelineStart, 'Student class timeline missing')
const timelineSource = appSource.slice(timelineStart, timelineEnd)
assert.match(timelineSource, /classLessons\[classLessons\.length-1\]\.date/)
assert.match(timelineSource, /date<=timelineEnd/)

// A class-specific week-long holiday pushes the last lesson to a new week.
const moved = build(base, group('A', [{
  type:'Lov', startDate:'2026-10-19', endDate:'2026-10-23'
}]))
const lastDate = moved.at(-1).date
assert.equal(lastDate, '2026-10-29')
assert.equal(lastDate > base.weeksData[0].weekStart, true)
assert.equal(moved.length, base.weeksData[0].lessons.length)

// Morning half-day closure keeps the afternoon slot, without affecting class B.
const halfGroup = group('A', [closure('Halvdag', '2026-10-19', {cancelledLessons:1,cancelledFrom:'start'})])
halfGroup.extraSlots = [{date:'2026-10-19'}]
halfGroup.lessonTimes = {Måndag:['08:15','13:10']}
const afternoon = build(base, halfGroup)
assert.equal(afternoon[0].time, '13:10')
assert.equal(afternoon[0].slot, 2)
assert.equal(build(base, group('B'))[0].date, '2026-10-19')


// Multiple overlapping half-days: cancelled slots must not duplicate lessons.
// A fully cancelled day pushes every original lesson forward intact.
const overlappingHalves = group('A', [
  closure('Halvdag','2026-10-19',{cancelledLessons:1,cancelledFrom:'start'}),
  closure('Halvdag','2026-10-19',{cancelledLessons:1,cancelledFrom:'end'}),
])
overlappingHalves.extraSlots = [{date:'2026-10-19'}]
const overlapRows = build(base, overlappingHalves)
assert.equal(dates(overlapRows).includes('2026-10-19'), false)
assert.deepEqual(names(overlapRows), names(normal))
assert.equal(new Set(names(overlapRows)).size, normal.length)

// A long but supported interruption (52 weeks) must preserve ordering,
// topics, and all source lessons, without altering the underlying plan.
const extendedPlanSnapshot = JSON.stringify(base)
const yearClosure = group('A',[{
  type:'Lov',startDate:'2026-10-19',endDate:'2027-10-18'
}])
const yearRows = build(base, yearClosure)
assert.equal(yearRows.length,normal.length)
assert.deepEqual(names(yearRows),names(normal))
assert.deepEqual(Array.from(yearRows,row=>row.lesson.topics[0].name),
  Array.from(normal,row=>row.lesson.topics[0].name))
assert.ok(yearRows[0].date > '2027-10-18')
assert.equal(JSON.stringify(base),extendedPlanSnapshot)
assert.deepEqual(dates(build(base,group('B'))),dates(normal))

// A closure beyond the 104-extra-week safety horizon cannot be scheduled.
// Verify the source lessons remain untouched; this is a documented limit,
// not evidence that the unscheduled lessons were deleted.
const beyondHorizon = build(base,group('A',[{
  type:'Lov',startDate:'2026-10-19',endDate:'2030-01-01'
}]))
assert.equal(beyondHorizon.length,0)
assert.deepEqual(base.weeksData[0].lessons.map(lesson=>lesson.name),names(normal))
console.log('PASS overlap half-days, 52-week delay, source integrity and 104-week horizon boundary')


// A class consumes moments continuously across base lesson boundaries.
const momentPlan = {...base, weeksData:[{...week, lessons:[
  {name:'Base 1',topics:[{name:'A',pages:['11'],assignments:['Read']},{name:'B',pages:['12']}]},
  {name:'Base 2',topics:[{name:'C',pages:['13'],assignments:['Solve']},{name:'D',pages:['14']}]},
  {name:'Base 3',topics:[{name:'E',pages:['15']},{name:'F',pages:['16']},{name:'G',pages:['17']}]},
  {name:'Base 4',topics:[{name:'H',pages:['18']}]},
]}]}
const twoDayClass = {name:'8C',days:['Måndag','Torsdag'],momentsPerDay:{Måndag:3,Torsdag:2}}
const distributed = build(momentPlan,twoDayClass)
assert.deepEqual(Array.from(distributed,row=>Array.from(row.lesson.topics,t=>t.name)),[['A','B','C'],['D','E'],['F','G','H']])
assert.deepEqual(Array.from(distributed,row=>Array.from(row.lesson.topics,t=>t.pages[0])),[['11','12','13'],['14','15'],['16','17','18']])
assert.equal(distributed[0].lesson.topics[2].assignments[0],'Solve')
assert.deepEqual(dates(distributed),['2026-10-19','2026-10-22','2026-10-26'])
assert.equal(momentPlan.weeksData[0].lessons[1].topics[0].name,'C')
const delayedMoments=build(momentPlan,{...twoDayClass,schoolClosures:[closure('Studiedag','2026-10-19')]})
assert.deepEqual(Array.from(delayedMoments,row=>Array.from(row.lesson.topics,t=>t.name)),[['A','B'],['C','D','E'],['F','G'],['H']])


const classStarts = [
  {name:'8A',days:['Måndag'],startDate:'2026-11-02'},
  {name:'8B',days:['Tisdag'],startDate:'2026-10-12'},
  {name:'8C',days:['Onsdag'],startDate:'2026-10-12'}
]
const startPlan = {...momentPlan,startDate:'2026-10-12',weeksData:[{...momentPlan.weeksData[0],weekStart:'2026-10-12'}]}
const classResults = classStarts.map(group=>build(startPlan,group))
assert.equal(classResults[0][0].date,'2026-11-02')
assert.equal(classResults[1][0].date,'2026-10-13')
assert.equal(classResults[2][0].date,'2026-10-14')
assert.equal(classResults[1][0].lesson.topics[0].name,'A')
assert.equal(classResults[2][0].lesson.topics[0].name,'A')
const aligned = build(startPlan,{...classStarts[0],startDate:'2026-10-12'})
assert.equal(aligned[0].date,'2026-10-12')
assert.equal(startPlan.weeksData[0].lessons[0].topics[0].name,'A')

console.log('Class scheduling regression checks: OK')
