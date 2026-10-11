import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function sparaPlanering() {')
const end = source.indexOf('  function borjaRedigera(', start)
assert.ok(start >= 0 && end > start)

const finishes = []
let inserts = 0
const activeUserIdRef = { current: 'userA' }
const savingDraftRef = { current: null }
const ctx = vm.createContext({
  titel: 'Matematik', vecka: '2026-10-05', innehall: { Måndag: 'Lektion' }, detaljer: {},
  session: { user: { id: 'userA' } }, activeUserIdRef, savingDraftRef,
  draftVersionRef: { current: 0 }, hasWeeklyContent: () => true,
  supabase: { from: () => ({ insert: () => ({ select: () => {
    inserts += 1
    return new Promise(resolve => finishes.push(resolve))
  } }) }) },
  setStatus: () => {}, setTitel: () => {}, setInnehall: () => {}, setDetaljer: () => {},
  tommaDagar: () => ({}), tommaDetaljer: () => ({}), hamtaPlaneringar: async () => {},
})
const save = vm.runInContext(`${source.slice(start, end)}\nsparaPlanering`, ctx)

const first = save()
const duplicate = save()
assert.equal(inserts, 1, 'Två snabba klick ska endast skicka ett INSERT-anrop')
await duplicate

// Kontobyte under pågående sparning: ny användare får spara sitt eget utkast.
activeUserIdRef.current = 'userB'
ctx.session = { user: { id: 'userB' } }
ctx.draftVersionRef.current += 1
const secondUser = save()
assert.equal(inserts, 2, 'Ny användare ska inte blockeras av tidigare användares sparning')

// Det gamla svaret får inte låsa upp den nya användarens pågående sparning.
finishes[0]({ data: [{ id: 'rowA' }], error: null })
await first
const duplicateB = save()
assert.equal(inserts, 2, 'Gammalt svar får inte möjliggöra dubbelsparning för ny användare')
await duplicateB

finishes[1]({ data: [{ id: 'rowB' }], error: null })
await secondUser
const laterSave = save()
assert.equal(inserts, 3, 'Efter avslutad sparning ska nästa sparning vara möjlig')
finishes[2]({ data: [{ id: 'rowB2' }], error: null })
await laterSave

// Även ett kastat fel måste släppa spärren så att användaren kan försöka igen.
let attempts = 0
ctx.supabase = { from: () => ({ insert: () => {
  attempts += 1
  if (attempts === 1) throw new Error('Nätverksfel')
  return { select: async () => ({ data: [{ id: 'retry' }], error: null }) }
} }) }
await save()
await save()
assert.equal(attempts, 2, 'Ett kastat fel får inte blockera nästa sparförsök')
console.log('Weekly double-submit, account isolation and retry after failure: OK')
