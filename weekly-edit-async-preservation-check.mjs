import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/weekly/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function sparaAndring(id) {')
const end = source.indexOf('  async function raderaPlanering(', start)
assert.ok(start >= 0 && end > start)
assert.ok((source.match(/markEditEdited\(\)/g) || []).length >= 9,
  'Alla redigeringsfält, planbyte, avbryt och kontobyte måste registrera nya redigeringar')

async function scenario({ editDuringSave = false, switchUser = false }) {
  let status = ''
  let editingId = 'planA'
  let refreshes = 0
  let finishUpdate
  const activeUserIdRef = { current: 'userA' }
  const editVersionRef = { current: 0 }
  const context = vm.createContext({
    redigeraTitel: 'Originaltitel', redigeraInnehall: { Måndag: 'Original' },
    redigeraDetaljer: { Måndag: { delmoment: 'Bråk' } },
    session: { user: { id: 'userA' } }, activeUserIdRef, editVersionRef,
    supabase: { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => new Promise(resolve => { finishUpdate = resolve }) }) }) }) }) },
    setStatus: value => { status = value },
    setRedigerarId: value => { editingId = value },
    hamtaPlaneringar: async () => { refreshes += 1 }, Date,
  })
  const save = vm.runInContext(`${source.slice(start, end)}\nsparaAndring`, context)
  const pending = save('planA')
  assert.equal(typeof finishUpdate, 'function')
  if (editDuringSave) editVersionRef.current += 1
  if (switchUser) { activeUserIdRef.current = 'userB'; editVersionRef.current += 1 }
  finishUpdate({ data: [{ id: 'planA' }], error: null })
  await pending
  if (switchUser) {
    assert.equal(editingId, 'planA', 'Gammalt svar får inte stänga den nya användarens redigerare')
    assert.equal(refreshes, 0, 'Gammalt svar får inte hämta planeringar för den nya användaren')
  } else if (editDuringSave) {
    assert.equal(editingId, 'planA', 'Nyare redigering får inte stängas av äldre sparningssvar')
    assert.match(status, /inte sparade|inte sparats/i, 'Varning för osparade ändringar ska visas')
  } else {
    assert.equal(editingId, null, 'Normal sparning ska avsluta redigering')
    assert.equal(refreshes, 1)
  }
}
await scenario({ editDuringSave: true })
await scenario({ switchUser: true })
await scenario({})
console.log('Weekly async edit saves preserve later edits and isolate accounts: OK')
