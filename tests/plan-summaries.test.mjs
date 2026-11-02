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
