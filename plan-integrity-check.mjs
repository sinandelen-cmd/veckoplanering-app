import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const annual = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const weekly = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')

function segment(source, start, end) {
  const a = source.indexOf(start)
  const b = source.indexOf(end, a + start.length)
  assert.ok(a >= 0 && b > a, `Kan inte hitta kodsegment: ${start}`)
  return source.slice(a, b)
}

const dateFns = segment(annual, 'function toIsoDate(', 'function normalizeLines(')
const context = vm.createContext({ DEFAULT_WEEKS: 40 })
vm.runInContext(dateFns, context)
const plan = {
  startDate: '2026-08-17', weeks: 3,
  weeksData: [
    { weekNumber: 1, weekStart: '2026-08-17', title: 'Eget tema', content: 'Kapitel 1', items: [{ text: 'Sidan 12' }] },
    { weekNumber: 2, weekStart: '2026-08-24', title: 'Vecka 2', content: 'Kapitel 2', items: [] },
    { weekNumber: 3, weekStart: '2026-08-31', title: 'Vecka 3', content: 'Kapitel 3', items: [] },
  ],
}
const result = vm.runInContext('reconcileWeeks', context)(plan, '2026-08-24', 4)
assert.equal(result.length, 4)
assert.equal(result[0].content, 'Kapitel 1')
assert.equal(result[0].title, 'Eget tema')
assert.equal(result[0].items[0].text, 'Sidan 12')
assert.equal(result[0].weekStart, '2026-08-24')
assert.equal(result[1].content, 'Kapitel 2')
assert.equal(result[1].weekStart, '2026-08-31')
assert.equal(result[2].content, 'Kapitel 3')
assert.equal(result[3].content, '')
assert.equal(result[3].weekNumber, 4)

const annualKinds = vm.createContext({})
vm.runInContext(segment(annual, 'function parseContent(', 'function planFromRow('), annualKinds)
const weeklyKinds = vm.createContext({})
vm.runInContext(segment(weekly, 'function isWeeklyRow(', 'function WeeklyApp('), weeklyKinds)
for (const kind of ['arsplanering-v1', 'arsplanering-v2']) {
  const row = { content: JSON.stringify({ kind }) }
  assert.equal(vm.runInContext('isAnnualRow', annualKinds)(row), true)
  assert.equal(vm.runInContext('isWeeklyRow', weeklyKinds)(row), false)
}
for (const row of [
  { content: JSON.stringify({ kind: 'veckoplanering-v1', dagar: {} }) },
  { content: JSON.stringify({ dagar: {} }) },
  { content: 'Äldre veckotext' },
]) {
  assert.equal(vm.runInContext('isAnnualRow', annualKinds)(row), false)
  assert.equal(vm.runInContext('isWeeklyRow', weeklyKinds)(row), true)
}
assert.equal((weekly.match(/kind: 'veckoplanering-v1'/g) || []).length, 2)
assert.match(annual, /Det finns innehåll i veckor som tas bort/)
// Inklistrad text får inte skriva över befintliga veckor vid varje tangenttryckning.
assert.match(annual, /value=\{pasteText\}/)
assert.match(annual, /onClick=\{distributePastedText\}/)
assert.doesNotMatch(annual, /onChange=\{e => setPlan\(\{ \.\.\.plan, weeksData: distributeText/)
const replaceCtx = vm.createContext({ window: { confirm: () => false } })
vm.runInContext(segment(annual, 'function hasWeekWork(', 'function normalizeLines('), replaceCtx)
const hasWeekWork = vm.runInContext('hasWeekWork', replaceCtx)
const hasPlanWork = vm.runInContext('hasPlanWork', replaceCtx)
const confirmReplacingWeeks = vm.runInContext('confirmReplacingWeeks', replaceCtx)
assert.equal(hasWeekWork({ title: 'Vecka 1', content: '', items: [] }, 0), false)
assert.equal(hasWeekWork({ title: 'Vecka 1', content: 'Lektion 1', items: [] }, 0), true)
assert.equal(hasPlanWork({ title: 'Svenska', weeksData: [] }), true)
assert.equal(confirmReplacingWeeks({ weeksData: [{ content: 'Sparat', title: 'Vecka 1' }] }), false)
assert.equal(confirmReplacingWeeks({ weeksData: [{ content: '', title: 'Vecka 1' }] }), true)
replaceCtx.window.confirm = () => true
assert.equal(confirmReplacingWeeks({ weeksData: [{ content: 'Sparat', title: 'Vecka 1' }] }), true)
console.log('Plan integrity checks: OK')
