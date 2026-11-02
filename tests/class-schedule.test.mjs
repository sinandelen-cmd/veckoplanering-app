import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClassSchedule } from '../src/classScheduleUtils.js'

const week = (date = '2026-11-02', extra = {}) => ({ weekStart: date, weekNumber: 45, title: 'Vecka 45', lessons: [{ name: 'Matte 1' }, { name: 'Matte 2' }], ...extra })
const plan = (weeksData = [week()]) => ({ startDate: '2026-11-02', weeksData })
const group = (extra = {}) => ({ days: ['Måndag', 'Onsdag'], startDate: '2026-11-02', ...extra })

test('1. empty days and extra slots give no lessons', () => assert.deepEqual(buildClassSchedule(plan(), group({ days: [] })), []))
test('2. normal two-day schedule creates two lessons', () => assert.equal(buildClassSchedule(plan(), group()).length, 2))
test('3. extra slot adds a lesson', () => assert.equal(buildClassSchedule(plan(), group({ extraSlots: [{ date: '2026-11-02' }] })).length, 3))
test('4. duplicate lesson days retain two slots', () => assert.equal(buildClassSchedule(plan(), group({ days: ['Måndag', 'Måndag'] })).length, 2))
test('5. cancelled date removes that lesson', () => assert.equal(buildClassSchedule(plan(), group({ cancelledDates: ['2026-11-02'] })).length, 1))
test('6. full-day closure removes that lesson', () => assert.equal(buildClassSchedule(plan(), group({ schoolClosures: [{ startDate: '2026-11-02', endDate: '2026-11-02', type: 'Studiedag' }] })).length, 1))
test('7. half-day closure reduces scheduled lessons', () => assert.equal(buildClassSchedule(plan(), group({ days: ['Måndag', 'Måndag'], schoolClosures: [{ startDate: '2026-11-02', type: 'Halvdag', cancelledLessons: 1 }] })).length, 1))
test('8. hidden weeks excluded by default', () => assert.equal(buildClassSchedule(plan([week('2026-11-02', { hidden: true })]), group()).length, 0))
test('9. hidden weeks included on request', () => assert.equal(buildClassSchedule(plan([week('2026-11-02', { hidden: true })]), group(), { includeHiddenWeeks: true }).length, 2))
test('10. lessons numbered continuously across weeks', () => assert.deepEqual(buildClassSchedule(plan([week(), week('2026-11-09')]), group()).map(item => item.lessonNumber), [1, 2, 3, 4]))

test('11. no regular days and one extra slot creates one lesson', () => assert.equal(buildClassSchedule(plan(), group({ days: [], extraSlots: [{ date: '2026-11-02' }] })).length, 1))
test('12. cancelled extra slot is excluded', () => assert.equal(buildClassSchedule(plan(), group({ days: [], extraSlots: [{ date: '2026-11-02' }], cancelledDates: ['2026-11-02'] })).length, 0))
test('13. extra slot on another date is not counted on Monday', () => assert.deepEqual(buildClassSchedule(plan(), group({ days: [], extraSlots: [{ date: '2026-11-04' }] })).map(item => item.date), ['2026-11-04']))
test('14. start date excludes earlier weekday lessons', () => assert.deepEqual(buildClassSchedule(plan(), group({ startDate: '2026-11-04' })).map(item => item.date), ['2026-11-04']))
test('15. explicit override replaces only matching lesson', () => {
  const output = buildClassSchedule(plan(), group({ overrides: { '0': { lesson: { name: 'Ersatt lektion' } } } }))
  assert.equal(output[0].lesson.name, 'Ersatt lektion')
  assert.equal(output[1].lesson.name, 'Matte 2')
})
test('16. source plan remains unchanged after schedule generation', () => {
  const input = plan()
  const before = JSON.stringify(input)
  buildClassSchedule(input, group())
  assert.equal(JSON.stringify(input), before)
})
