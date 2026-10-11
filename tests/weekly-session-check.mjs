import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('function hasWeeklyContent(')
const end = source.indexOf('function isWeeklyRow(', start)
assert.ok(start > 0 && end > start, 'Hjälpfunktionerna för veckoplanering saknas')
const context = vm.createContext({ dagar: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'] })
vm.runInContext(source.slice(start, end), context)
const hasWeeklyContent = vm.runInContext('hasWeeklyContent', context)
const isCurrentWeeklyRequest = vm.runInContext('isCurrentWeeklyRequest', context)
assert.equal(hasWeeklyContent({ Måndag: '' }, { Måndag: { delmoment: ' Bråk ' } }), true)
assert.equal(hasWeeklyContent({ Måndag: '' }, { Måndag: { uppgiftsnummer: '12' } }), true)
assert.equal(hasWeeklyContent({ Måndag: '' }, { Måndag: { sidnummer: '10' } }), true)
assert.equal(hasWeeklyContent({ Måndag: ' Läxa ' }, {}), true)
assert.equal(hasWeeklyContent({ Måndag: '' }, { Måndag: { delmoment: ' ' } }), false)
assert.equal(hasWeeklyContent({}, {}), false)
assert.equal(isCurrentWeeklyRequest('userA', 'userA', 3, 3), true)
assert.equal(isCurrentWeeklyRequest('userB', 'userA', 3, 3), false)
assert.equal(isCurrentWeeklyRequest('userA', 'userA', 4, 3), false)
assert.equal(isCurrentWeeklyRequest(null, 'userA', 3, 3), false)
assert.match(source, /if \(editorOwnerId !== session\.user\.id\) return/)
for (const setter of ['setTitel', 'setInnehall', 'setDetaljer', 'setRedigerarId', 'setRedigeraTitel', 'setRedigeraInnehall', 'setRedigeraDetaljer']) {
  const effect = source.slice(source.indexOf('const userId = session?.user?.id || null'), source.indexOf('async function hamtaPlaneringar'))
  assert.match(effect, new RegExp(`${setter}\\(`), `${setter} måste återställas vid kontobyte`)
}
console.log('Weekly privacy/session and detail-only checks: OK')
