import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function sparaPlanering() {')
const end = source.indexOf('  function borjaRedigera(', start)
assert.ok(start !== -1 && end > start, 'Kunde inte hitta veckoplaneringens sparfunktion')

async function scenario({ accountSwitch, editDuringSave = true }) {
  let title = 'Veckans matematik'
  let content = { Måndag: 'Bråk' }
  let details = { Måndag: { delmoment: '' } }
  let status = ''
  let completeInsert
  let refreshes = 0
  const activeUserIdRef = { current: 'userA' }
  const draftVersionRef = { current: 0 }
  const supabase = {
    from: () => ({ insert: () => ({ select: () => new Promise(resolve => { completeInsert = resolve }) }) }),
  }
  const ctx = vm.createContext({
    titel: title, vecka: '2026-10-05', innehall: content, detaljer: details,
    session: { user: { id: 'userA' } }, activeUserIdRef, draftVersionRef, savingDraftRef: { current: null },
    supabase, setStatus: value => { status = value },
    setTitel: value => { title = value },
    setInnehall: value => { content = value },
    setDetaljer: value => { details = value },
    tommaDagar: () => ({ Måndag: '' }), tommaDetaljer: () => ({ Måndag: { delmoment: '' } }),
    hasWeeklyContent: () => true,
    hamtaPlaneringar: async () => { refreshes += 1 },
  })
  const save = vm.runInContext(`${source.slice(start, end)}\nsparaPlanering`, ctx)
  const saving = save()
  assert.equal(typeof completeInsert, 'function')
  if (accountSwitch) {
    activeUserIdRef.current = 'userB'
    draftVersionRef.current += 1
    title = 'Andra användarens utkast'
  } else if (editDuringSave) {
    draftVersionRef.current += 1
    title = 'Ny titel medan sparning pågår'
  }
  completeInsert({ error: null, data: [{ id: 'saved-id' }] })
  await saving
  assert.equal(title, accountSwitch ? 'Andra användarens utkast' : editDuringSave ? 'Ny titel medan sparning pågår' : '',
    'Ett gammalt sparningssvar får inte radera nyare utkast')
  if (accountSwitch) assert.equal(refreshes, 0, 'Gammal användares svar får inte uppdatera ny användares lista')
  else if (editDuringSave) assert.match(status, /inte sparade|inte sparats/i, 'Användaren måste få veta att nya ändringar inte sparats')
  else assert.equal(status, 'Veckoplaneringen är sparad!')
}

await scenario({ accountSwitch: false })
await scenario({ accountSwitch: true })
await scenario({ accountSwitch: false, editDuringSave: false })
for (const expected of ['Veckans måndag', 'Föregående vecka', 'Nästa vecka', 'placeholder="Rubrik"', 'placeholder={`Planering', 'placeholder="Delmoment"', 'placeholder="Uppgiftsnummer"', 'placeholder="Sidnummer"']) {
  assert.ok(source.includes(expected), `Saknat inmatningsfält: ${expected}`)
}
assert.ok((source.match(/markDraftEdited\(\)/g) || []).length >= 10, 'Alla nya planeringsfält och veckonavigeringen måste markera utkastet som ändrat')
console.log('Weekly async save preserves new edits, isolates accounts, and preserves normal save behavior: OK')
