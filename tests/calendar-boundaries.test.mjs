import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { loadFunctions } from './helpers/extract-functions.mjs'

const context = vm.createContext({ Date, Intl })
vm.runInContext(await loadFunctions(new URL('../src/App.jsx', import.meta.url), ['calendarWeekNumber', 'addWeeks', 'mondayOf', 'studentWeekDateRange']), context)
const functions = vm.runInContext('({calendarWeekNumber,addWeeks,mondayOf,studentWeekDateRange})', context)

test('ISO year boundary keeps week 53 and next year week 1 distinct', () => {
  for (const [date, week] of [['2026-12-28',53],['2027-01-01',53],['2027-01-04',1],['2028-01-03',1]]) {
    assert.equal(functions.calendarWeekNumber(date), week)
  }
  assert.equal(functions.addWeeks('2026-12-28',1),'2027-01-04')
  assert.equal(functions.mondayOf('2027-01-03T12:00:00'),'2026-12-28')
  assert.equal(functions.mondayOf('2027-01-04T00:00:00'),'2027-01-04')
})

test('Swedish DST changes preserve calendar dates and Monday boundaries', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Europe/Stockholm'
  try {
    for (const [before, after] of [['2026-03-23','2026-03-30'],['2026-10-19','2026-10-26']]) {
      assert.equal(functions.addWeeks(before,1),after)
      assert.equal(functions.addWeeks(after,-1),before)
    }
    assert.equal(functions.mondayOf('2026-10-25T23:59:59'),'2026-10-19')
    assert.equal(functions.mondayOf('2026-10-26T00:00:00'),'2026-10-26')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Date ranges handle year crossing and invalid input', () => {
  const range = functions.studentWeekDateRange('2026-12-28')
  assert.match(range,/28 dec/)
  assert.match(range,/3 jan/)
  assert.match(range,/2027$/)
  assert.equal(functions.studentWeekDateRange('invalid'),'')
})
