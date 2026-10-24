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
const insert = new Function('displayWeeks','addWeeks','calendarWeekNumber','makeWeeks','plan','window','setPlan','setStatus',actualFunction + '\nreturn insertBlankWeekAfter') 
const week = (date, name) => ({weekStart:date,weekNumber:calendarWeekNumber(date),title:'Vecka '+calendarWeekNumber(date),lessons:[{id:name,topics:[{name}]}]})
let passed=0
function test(name, dates, prompts, expected, lessonsPerWeek=3) {
  let plan={weeksData:dates.map((d,i)=>week(d,'original-'+i)),lessonsPerWeek,weeks:dates.length}
  const before=structuredClone(plan)
  let status=''
  const ask=[...prompts]
  const fn=insert(displayWeeks,addWeeks,calendarWeekNumber,makeWeeks,plan,{prompt:()=>ask.shift()},updater=>{plan=updater(plan)},message=>{status=message})
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
console.log('Actual insertion function: '+passed+' synthetic checks passed (not browser or integration tests)')
