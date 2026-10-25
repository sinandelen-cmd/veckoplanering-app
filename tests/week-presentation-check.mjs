import assert from 'node:assert/strict'
import {selectStudentWeeks,teacherWeekGroups,chapterColor,stockholmDate,mondayDate} from '../src/weekPresentation.js'
const weeks=[{weekStart:'2026-02-09',weekNumber:7,chapter:'Kapitel 4'},{weekStart:'2026-02-16',weekNumber:8,chapter:'Kapitel 4'},{weekStart:'2026-02-23',weekNumber:9,chapter:'Kapitel 5'}]
const plan={autoReleaseWeeks:true,visibleWeekCount:2}
const ids=x=>x.map(w=>w.weekNumber)
assert.deepEqual(ids(selectStudentWeeks(weeks,plan,'2026-02-22T23:00:59Z')),[8,7])
assert.deepEqual(ids(selectStudentWeeks(weeks,plan,'2026-02-22T23:01:00Z')),[9,8])
assert.deepEqual(ids(selectStudentWeeks(weeks.filter(w=>w.weekNumber!==8),plan,'2026-02-22T23:01:00Z')),[9],'Old weeks expire even if the previous calendar week is missing')
assert.deepEqual(ids(selectStudentWeeks(weeks,{...plan,visibleWeekCount:3},'2026-02-22T23:01:00Z')),[9,8,7])
assert.deepEqual(ids(selectStudentWeeks([{...weeks[0],keepVisibleExtra:true},...weeks.slice(1)],plan,'2026-02-22T23:01:00Z')),[9,8,7])
assert.deepEqual(ids(selectStudentWeeks(weeks.map(w=>({...w,hidden:w.weekNumber===9})),plan,'2026-02-22T23:01:00Z')),[8])
const before=JSON.stringify(weeks)
const groups=teacherWeekGroups(weeks,'2026-02-22T23:01:00Z')
assert.equal(groups[0].chapter,'Kapitel 5')
assert.equal(groups[0].current[0].week.weekNumber,9)
assert.deepEqual(groups[1].past.map(x=>x.week.weekNumber),[8,7])
assert.equal(JSON.stringify(weeks),before)
assert.equal(chapterColor('Kapitel 4'),chapterColor(' kapitel 4 '))
assert.equal(stockholmDate('2026-10-25T23:01:00Z'),'2026-10-26')
assert.equal(mondayDate(stockholmDate('2027-01-03T23:01:00Z')),'2027-01-04')
assert.deepEqual(selectStudentWeeks([{weekStart:'2026-12-28'},{weekStart:'2027-01-04'}],plan,'2027-01-03T23:01:00Z').map(w=>w.weekStart),['2027-01-04','2026-12-28'])
console.log('PASS: Stockholm Monday 00:01 boundary, expiration, missing weeks, extra weeks, hidden weeks, chapter groups, DST and year boundary')


assert.deepEqual(ids(selectStudentWeeks(weeks,{autoReleaseWeeks:false,visibleWeekCount:2},'2026-02-22T23:01:00Z')),[9,8],'Existing manual plans also show the default two calendar weeks to students')
