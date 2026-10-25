import assert from 'node:assert/strict'
import {selectStudentWeeks,teacherWeekGroups,teacherWeekSections,chapterColor,stockholmDate,mondayDate} from '../src/weekPresentation.js'
import fs from 'node:fs'
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

const years=[{weekStart:'2028-01-03',chapter:'Tal'},{weekStart:'2026-10-12',chapter:'Tal'},{weekStart:'2027-01-04',chapter:'Geometri'},{weekStart:'2026-10-19',chapter:'Tal'},{weekStart:'2026-10-26',chapter:'Geometri'}]
const sections=teacherWeekSections(years,'2026-10-25T12:00:00Z')
assert.deepEqual(sections.flatMap(g=>g.current).map(i=>i.week.weekStart),['2026-10-19','2026-10-26','2027-01-04','2028-01-03'],'Keep global date order even when a chapter repeats in another year')
assert.deepEqual(sections.flatMap(g=>g.past).map(i=>i.week.weekStart),['2026-10-12'])
assert.equal(sections.flatMap(g=>g.current).find(i=>i.week.weekStart==='2028-01-03').index,0,'Preserve original child/index mapping')
assert.equal(sections.filter(g=>g.chapter==='Tal').flatMap(g=>g.past).length,1,'Past weeks appear only once for a chapter')

// Exercise the actual renumbering handler: all preceding and following dates
// move with the selected anchor; lesson/resource objects remain unchanged.
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const extract=name=>{const start=app.indexOf('function '+name+'(');assert.ok(start>=0);const next=app.slice(start+1).search(/\n(?:function |export |const |class )/);return next<0?app.slice(start):app.slice(start,start+1+next)}
const start=app.indexOf('  function shiftAllWeeks('),end=app.indexOf('\n  function insertBlankWeekAfter',start)
const handler=app.slice(start,end)
const sourceWeeks=['2026-09-28','2026-10-05','2026-10-12'].map((weekStart,index)=>({weekStart,weekNumber:40+index,title:'Vecka '+(40+index),lessons:[{topics:[{name:'ABC'[index],pages:['45–48'],links:[{url:'https://example.org/a.pdf'}]}]}]}))
const original=JSON.stringify(sourceWeeks)
const shifted=new Function('plan',extract('toIsoDate')+'\n'+extract('addWeeks')+'\n'+extract('calendarWeekNumber')+'\nlet result; const displayWeeks=p=>p.weeksData;const setPlan=fn=>{result=fn(plan)};const setStatus=()=>{};'+handler+';shiftAllWeeks(1,43);return result;')({weeksData:sourceWeeks})
assert.deepEqual(shifted.weeksData.map(w=>w.weekStart),['2026-10-12','2026-10-19','2026-10-26'])
assert.deepEqual(shifted.weeksData.map(w=>w.weekNumber),[42,43,44])
assert.deepEqual(shifted.weeksData.map(w=>w.lessons),sourceWeeks.map(w=>w.lessons))
assert.equal(JSON.stringify(sourceWeeks),original)
assert.deepEqual(teacherWeekSections(shifted.weeksData,'2026-10-25T12:00:00Z').flatMap(g=>g.current).map(i=>i.week.weekNumber),[43,44])
console.log('PASS: current week first, multi-year chronological order, chapter history once, renumbering before/after anchor with content preserved')
