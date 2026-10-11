import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function save(publish) {')
const end = source.indexOf('  async function unpublish(row) {', start)
assert.ok(start !== -1 && end > start, 'Kunde inte hitta årsplaneringens sparfunktion')

async function scenario({ editDuringSave }) {
  const originalPlan = { title: 'Matematik', subject: 'Matematik', startDate: '2026-08-17', weeks: 1,
    weeksData: [{ weekNumber: 1, weekStart: '2026-08-17', title: 'Vecka 1', content: 'Originaltext' }] }
  let currentPlan = originalPlan
  const latestPlanRef = { current: originalPlan }
  let completeInsert
  let selectedId = null
  let status = ''
  const supabase = {
    from: () => ({ insert: () => ({ select: () => ({ single: () => new Promise(resolve => { completeInsert = resolve }) }) }) }),
  }
  const context = vm.createContext({
    plan: originalPlan, selectedId, weeks: originalPlan.weeksData, latestPlanRef,
    session: { user: { id: 'test-user' } }, supabase,
    setPlan: updater => { currentPlan = typeof updater === 'function' ? updater(currentPlan) : updater },
    setSelectedId: value => { selectedId = value }, setBusy: () => {}, setStatus: value => { status = value },
    loadPlans: async () => true, buildSlug: () => 'slug', sanitizeForStudents: () => ({}),
    publicationFields: () => ({ published: false }),
    window: { location: { origin: 'https://example.test' } }, Date,
  })
  const save = vm.runInContext(`${source.slice(start, end)}\nsave`, context)
  const saving = save(false)
  assert.equal(typeof completeInsert, 'function', 'Sparningen ska vänta på databasen')
  if (editDuringSave) {
    currentPlan = { ...currentPlan, title: 'Ändrad medan databasen svarar' }
    latestPlanRef.current = currentPlan
  }
  completeInsert({ data: { id: 'saved-id' }, error: null })
  await saving
  assert.equal(selectedId, 'saved-id')
  if (editDuringSave) {
    assert.equal(currentPlan.title, 'Ändrad medan databasen svarar', 'Sparsvaret får inte skriva över nya, osparade redigeringar')
    assert.match(status, /ännu inte sparade/, 'Statusen ska skilja sparad version från osparade ändringar')
  } else {
    assert.equal(currentPlan.kind, 'arsplanering-v2', 'Utan nya redigeringar ska sparad metadata läsas in')
    assert.equal(status, 'Utkast sparat.')
  }
}
await scenario({ editDuringSave: true })
await scenario({ editDuringSave: false })
assert.match(source, /<button className="secondary" disabled=\{busy\} onClick=\{\(\) => loadPlan\(row\)\}/,
  'Man ska inte kunna byta planering under sparning')
console.log('Annual async save preserves new edits and normal save behavior: OK')
