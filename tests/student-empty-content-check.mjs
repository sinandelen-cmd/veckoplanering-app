import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const extract = name => {
  const start = source.indexOf('function ' + name + '(')
  assert.notEqual(start, -1, 'Missing component/helper: ' + name)
  const next = source.slice(start + 1).search(/\n(?:function |export default )/)
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next)
}
const functions = ['resourceInfo', 'hasDisplayValue', 'hasStudentTopicContent', 'hasStudentLessonContent', 'hasStudentWeekContent', 'WeekDetails', 'LessonDetails', 'toIsoDate', 'mondayOf', 'addWeeks', 'StudentView'].map(extract).join('\n')
const fixture = `import assert from 'node:assert/strict'
import React, {useState,useEffect} from 'react'
import ClassSchedules, {buildClassSchedule} from '../src/ClassSchedules.jsx'
import { renderToStaticMarkup } from 'react-dom/server'
const WEEKDAYS = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
const DAY_COLORS = ['#fff']
const lessonDayDate = () => '12 okt. 2026'
const flushSync = fn => fn()
const calendarWeekNumber = () => 42
const groupStudentWeeksForPrint = weeks => [{weeks}]
const studentWeekPageLabel = () => ''
const planThemeStyle = () => ({})
const chapterTone = () => 1
const studentWeekStyle = () => ({})
const weekMonthLabel = () => ''
const studentWeekDateRange = () => ''
const studentMonthInfo = () => null
const ImportantDatesForWeek = () => null
globalThis.window = {location:{search:''}}
${functions}

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))
const topic = (extra = {}) => ({name:'',pages:[],assignments:[],links:[],...extra})
const lesson = (extra = {}) => ({name:'Lektion 1',day:'Måndag',topics:[],...extra})
const week = lessons => ({weekStart:'2026-10-12',lessons,pages:[],assignments:[],links:[]})
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value) } return value }
const blank = topic({classMomentPlaceholder:true,pages:['  ',''],assignments:['\\t'],links:['javascript:alert(1)','']})
const filled = topic({name:'Bråk och decimalform'})
const data = deepFreeze(week([lesson({topics:[blank,filled]})]))
const before = JSON.stringify(data)
const readOnly = render(LessonDetails,{week:data})
assert.match(readOnly,/Bråk och decimalform/)
assert.equal((readOnly.match(/class="topic"/g)||[]).length,1)
assert.match(readOnly,/>Sida</)
assert.match(readOnly,/>Uppgift</)
assert.match(readOnly,/>—</)
assert.doesNotMatch(readOnly,/topic-links|>Moment</)
assert.equal(JSON.stringify(data),before,'Rendering must not mutate teacher data')
assert.equal(render(LessonDetails,{week:week([lesson({topics:[blank]})])}),'')

const pageOnly = render(LessonDetails,{week:week([lesson({topics:[topic({pages:['12–15']})]})])})
assert.match(pageOnly,/12–15/)
assert.match(pageOnly,/>Sida</)
assert.match(pageOnly,/>Uppgift</)
assert.match(pageOnly,/data-detail-count="2"/)
const assignmentOnly = render(LessonDetails,{week:week([lesson({topics:[topic({assignments:['1–8']})]})])})
assert.match(assignmentOnly,/1–8/)
assert.match(assignmentOnly,/>Sida</)
assert.match(assignmentOnly,/>Uppgift</)
const both = render(LessonDetails,{week:week([lesson({topics:[topic({pages:['0'],assignments:['Visa din lösning']})]})])})
assert.match(both,/>0</)
assert.match(both,/Visa din lösning/)
assert.match(both,/data-detail-count="2"/)
const linkOnly = render(LessonDetails,{week:week([lesson({topics:[topic({links:[{url:'https://example.org/material.pdf',label:'Läs materialet'}]})]})])})
assert.match(linkOnly,/Läs materialet/)
assert.ok(linkOnly.includes('https://example.org/material.pdf'))
assert.match(linkOnly,/>Sida</)
assert.match(linkOnly,/>Uppgift</)
assert.equal(render(LessonDetails,{week:week([lesson({topics:[topic({hidePages:true,pages:['12']})]})])}),'')

const assessmentOnly = render(LessonDetails,{week:week([lesson({assessment:{type:'Prov',title:'Kapitelprov',description:'Ta med penna'}})])})
assert.match(assessmentOnly,/Kapitelprov/)
assert.match(assessmentOnly,/Ta med penna/)
const originalOrder = render(LessonDetails,{week:week([lesson({topics:[blank]}),lesson({name:'Lektion 2',day:'Tisdag',topics:[filled]})])})
assert.doesNotMatch(originalOrder,/>Lektion 1</)
assert.match(originalOrder,/>Lektion 2</)
const edit = render(LessonDetails,{week:data,onChange:()=>{}})
assert.equal((edit.match(/class="topic"/g)||[]).length,2,'Teacher keeps empty editable moments')
assert.match(edit,/>Sida</)
assert.match(edit,/>Uppgift</)
assert.match(edit,/Lägg till lektion/)
assert.match(edit,/Momentets namn/)

const weekPages = render(WeekDetails,{week:{pages:['','  ','42'],assignments:[''],links:[]}})
assert.match(weekPages,/>42</)
assert.match(weekPages,/>Sidor</)
assert.doesNotMatch(weekPages,/>Uppgifter</)
assert.match(weekPages,/data-single-column="true"/)
const weekAssignments = render(WeekDetails,{week:{pages:[],assignments:['Lämna in'],links:[]}})
assert.doesNotMatch(weekAssignments,/>Sidor</)
assert.match(weekAssignments,/week-detail-column assignments/)
assert.match(weekAssignments,/Lämna in/)
const weekEdit = render(WeekDetails,{week:{pages:[],assignments:[],links:[]},onChange:()=>{}})
assert.match(weekEdit,/>Sidor</)
assert.match(weekEdit,/>Uppgifter</)
assert.match(weekEdit,/Lägg till länk/)

assert.equal(hasStudentWeekContent(week([lesson({topics:[blank]})])),false)
assert.equal(hasStudentWeekContent(week([lesson({topics:[filled]})])),true)
assert.equal(hasStudentWeekContent(week([lesson({assessment:{type:'Prov'}})])),true)
assert.equal(hasStudentWeekContent({content:'  ',pages:[''],assignments:[],links:[]}),false)
assert.equal(hasStudentWeekContent({content:'Information till klassen'}),true)
assert.equal(hasStudentWeekContent({pages:['0']}),true)
assert.equal(hasStudentWeekContent({links:['https://example.org/film']}),true)

const schedulePlan = {title:'Syntetisk plan',startDate:'2026-10-12',entryType:'lektion',weeksData:[{weekStart:'2026-10-12',weekNumber:42,lessons:Array.from({length:5},(_,i)=>({name:'Lektion '+(i+1),topics:[topic({name:'Innehåll '+(i+1)})]}))}],classGroups:[{name:'8A',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag']},{name:'8E',days:['Måndag','Tisdag','Onsdag','Torsdag','Fredag'],momentsPerDay:{Måndag:4,Tisdag:1,Onsdag:2,Torsdag:4,Fredag:1}}]}
const classView = render(StudentView,{plan:schedulePlan,preview:true,initialClass:'8E',hideSelector:true})
const classLessons = [...classView.matchAll(/<section class="lesson">([\\s\\S]*?)<\\/section>/g)].map(match=>match[1])
assert.equal(classLessons.length,2,'Five real moments fit into Monday and Tuesday')
assert.equal((classLessons[0].match(/class="topic"/g)||[]).length,4)
assert.equal((classLessons[1].match(/class="topic"/g)||[]).length,1)
assert.match(classLessons[0],/Innehåll 4/)
assert.match(classLessons[1],/Innehåll 5/)
const slowView = render(StudentView,{plan:{...schedulePlan,classGroups:[{name:'Slow',days:['Måndag']}]},preview:true,initialClass:'Slow',hideSelector:true})
assert.equal((slowView.match(/class="topic"/g)||[]).length,5,'Delayed moments beyond the source week stay visible')
assert.match(slowView,/student-week-2026-11-09/)
const selectedE = render(ClassSchedules,{plan:schedulePlan,onChange:()=>{},selectedClassName:'8E',onSelectClass:()=>{}})
assert.match(selectedE, /class-mini-chip active" aria-pressed="true"[^>]*>8E</)
assert.doesNotMatch(selectedE, /class-mini-chip active" aria-pressed="true"[^>]*>8A</)
const selectedA = render(ClassSchedules,{plan:schedulePlan,onChange:()=>{},selectedClassName:'8A',onSelectClass:()=>{}})
assert.match(selectedA, /class-mini-chip active" aria-pressed="true"[^>]*>8A</)
console.log('PASS: actual StudentView moment allocation, delayed-week visibility and controlled teacher class selection')

console.log('PASS: actual lesson/week renderers, visible page/assignment fields, filled data, assessment-only lessons, links, editor controls and immutable teacher data')
`
const directory = fs.mkdtempSync(path.join(process.cwd(), '.student-readonly-test-'))
try {
  const entry = path.join(directory,'fixture.jsx')
  fs.writeFileSync(entry,fixture)
  const config = path.join(directory,'vite.config.mjs')
  fs.writeFileSync(config,'export default '+JSON.stringify({logLevel:'warn',build:{ssr:entry,outDir:path.join(directory,'dist'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'fixture.mjs'}}}}))
  const require = createRequire(import.meta.url)
  const cli = path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js')
  const built = spawnSync(process.execPath,[cli,'build','--config',config],{stdio:'inherit'})
  assert.equal(built.status,0,'Regression fixture must compile')
  const run = spawnSync(process.execPath,[path.join(directory,'dist','fixture.mjs')],{stdio:'inherit'})
  assert.equal(run.status,0,'Student renderer regressions must pass')
} finally {
  fs.rmSync(directory,{recursive:true,force:true})
}
