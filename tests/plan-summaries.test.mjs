import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { isFullPlanRow, assertWritableFullRow, planSummaryContent } from '../src/planSummaries.js'
test('summaries remove weeks but keep metadata', () => {
 const source = JSON.stringify({kind:'arsplanering-v2',archived:true,grade:'8',weeksData:[{weekNumber:1}]})
 const summary = JSON.parse(planSummaryContent(source))
 assert.equal(summary.weeksData,undefined)
 assert.equal(summary.archived,true)
 assert.equal(summary.grade,'8')
})
test('legacy content stays intact', () => assert.equal(planSummaryContent('not json'),'not json'))
test('v1 content stays intact', () => {
 const source = '{"kind":"arsplanering-v1","weeksData":[]}'
 assert.equal(planSummaryContent(source),source)
})
test('full row requires explicit marker', () => {
 assert.equal(isFullPlanRow({is_summary:true}),false)
 assert.equal(isFullPlanRow({is_summary:false}),true)
})
test('summary cannot be written', () => {
 assert.throws(() => assertWritableFullRow({is_summary:true},{kind:'arsplanering-v2',weeksData:[]}))
})
test('v2 requires weeksData', () => {
 assert.throws(() => assertWritableFullRow({is_summary:false},{kind:'arsplanering-v2'}))
 assert.doesNotThrow(() => assertWritableFullRow({is_summary:false},{kind:'arsplanering-v2',weeksData:[]}))
})

test('rename fetches full content and guards writes', () => {
 const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
 const rename = app.slice(app.indexOf('async function renamePlan('),app.indexOf('async function deletePlan('))
 assert.match(rename,/await ensureFullPlanRow\(row\)/)
 assert.match(rename,/assertWritableFullRow\(full, stored\)/)
 assert.doesNotMatch(rename,/parseContent\(row\.content\)/)
})
test('tree and library do not open summary directly', () => {
 const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
 assert.match(app,/onOpenPlan=\{openPlanRow\}/)
 assert.doesNotMatch(app,/onOpenPlan=\{loadPlan\}/)
 assert.doesNotMatch(app,/onClick=\{\(\) => loadPlan\(row\)\}/)
 assert.doesNotMatch(app,/onClick=\{\(\)=>loadPlan\(row\)\}/)
})
