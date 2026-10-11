import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function sparaPlanering() {')
const end = source.indexOf('  function borjaRedigera(', start)
assert.ok(start >= 0 && end > start)

let title = 'Matematik vecka 41'
let status = ''
let refreshes = 0
const context = vm.createContext({
  titel: title, vecka: '2026-10-05', innehall: { Måndag: 'Bråk' }, detaljer: { Måndag: { delmoment: '' } },
  session: { user: { id: 'test-user' } }, activeUserIdRef: { current: 'test-user' }, draftVersionRef: { current: 0 }, savingDraftRef: { current: null },
  hasWeeklyContent: () => true,
  supabase: { from: () => ({ insert: () => ({ select: async () => ({ data: [], error: null }) }) }) },
  setStatus: value => { status = value }, setTitel: value => { title = value },
  setInnehall: () => {}, setDetaljer: () => {}, hamtaPlaneringar: async () => { refreshes += 1 },
  tommaDagar: () => ({}), tommaDetaljer: () => ({}),
})
await vm.runInContext(`${source.slice(start, end)}\nsparaPlanering`, context)()
assert.doesNotMatch(status, /är sparad!/i, 'Tomt databassvar får inte rapporteras som bekräftad sparning')
assert.match(status, /bekräfta|kontrollera/i, 'Statusen ska beskriva osäkerheten')
assert.equal(title, 'Matematik vecka 41', 'Behåll utkastet när sparningen inte kan bekräftas')
assert.equal(refreshes, 1, 'Uppdatera listan så att en eventuellt sparad rad blir synlig')
console.log('Weekly zero-row save is not falsely reported as successful: OK')
