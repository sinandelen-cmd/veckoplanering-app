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

console.log('Class scheduling regression checks: OK')
