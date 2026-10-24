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

// The 104-week safety horizon must terminate when a class has no scheduled weekdays.
const empty = build(base, {name:'C', days:[], schoolClosures:[]})
assert.equal(empty.length, 0)

console.log('Class scheduling regression checks: OK')
