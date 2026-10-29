import vm from 'node:vm'
import assert from 'node:assert/strict'
import { loadFunctions } from './helpers/extract-functions.mjs'

const context = vm.createContext({ Date, Intl, DEFAULT_WEEKS: 1 }) // samma värde som konstanten i App.jsx
vm.runInContext(await loadFunctions(new URL('../src/App.jsx', import.meta.url), ['sanitizeForStudents', 'reconcileWeeks']), context)
const sanitize = vm.runInContext('sanitizeForStudents', context)

const original = {
  title: 'Matematik', subject: 'Matematik', schoolYear: '2026–2027', className: '8A',
  teacherNotes: 'HEMLIGT', user_id: 'hemligt-id', internalSettings: { password: 'HEMLIGT' },
  weeksData: [
    { weekNumber: 1, weekStart: '2026-08-17', title: 'Bråk', content: 'Sidan 10', teacherNotes: 'HEMLIGT',
      items: [{ text: 'Elevuppgift', teacherNotes: 'HEMLIGT' }], internal: { notes: 'HEMLIGT' } },
    { weekNumber: 2, weekStart: '2026-08-24', title: 'Hemlig vecka', content: 'HEMLIGT', hidden: true },
  ],
}
const result = sanitize(original)
assert.equal(result.title, 'Matematik')
assert.equal(result.subject, 'Matematik')
assert.equal(result.weeksData.length, 1)
assert.equal(result.weeksData[0].content, 'Sidan 10')
assert.equal(result.weeksData[0].title, 'Bråk')
assert.equal(result.weeksData[0].weekStart, '2026-08-17')
assert.equal(result.published, true)
assert.equal(JSON.stringify(result).includes('HEMLIGT'), false)
assert.equal('items' in result.weeksData[0], false)
assert.equal('user_id' in result, false)
assert.equal(original.weeksData.length, 2, 'Originalplaneringen ska inte ändras')
assert.equal(original.weeksData[0].items.length, 1, 'Lärarens uppgifter ska bevaras')
assert.equal(sanitize({ title: 'Tom', weeksData: null }).weeksData.length, 1, 'Tom plan ger en tom vecka, inga dolda veckor läcker')
console.log('Student privacy/allowlist checks: OK')
