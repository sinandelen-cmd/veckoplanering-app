import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { loadFunctions } from './helpers/extract-functions.mjs'

const appUrl = new URL('../src/App.jsx', import.meta.url)
const source = fs.readFileSync(appUrl, 'utf8')
const start = source.indexOf('  async function save(publish, automatic = false) {')
const end = source.indexOf('\n  useEffect(', start)
assert.ok(start !== -1 && end > start, 'Kunde inte hitta årsplaneringens sparfunktion')
const saveSource = source.slice(start, end)
const helpers = await loadFunctions(appUrl, ['validSchoolClosure', 'resourceInfo', 'sanitizeForStudents', 'buildSlug', 'publicationFields', 'planTheme', 'PLAN_THEMES'])

async function scenario({ editDuringSave }) {
  const originalPlan = { title: 'Matematik', subject: 'Matematik', startDate: '2026-08-17', weeks: 1,
    weeksData: [{ weekNumber: 1, weekStart: '2026-08-17', title: 'Vecka 1', content: 'Originaltext' }] }
  let currentPlan = originalPlan
  const latestPlanRef = { current: originalPlan }
  let completeInsert
  let selectedId = null
  let status = ''
  // Bifogat material laddas upp först när planeringen sparas. Här finns inget material att ladda upp.
  let uploadCalls = 0
  const uploadPendingMaterials = async list => { uploadCalls += 1; return { materials: list || [], created: [] } }
  const supabase = {
    from: () => ({ insert: () => ({ select: () => ({ single: () => new Promise(resolve => { completeInsert = resolve }) }) }) }),
  }
  const context = vm.createContext({
    Date, Intl, DEFAULT_WEEKS: 1, WEEKDAYS: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'],
    plan: originalPlan, weeks: originalPlan.weeksData, latestPlanRef,
    session: { user: { id: 'test-user' } }, supabase,
    uploadPendingMaterials, deleteStoredFiles: async () => {}, pendingRemovals: [], setPendingRemovals: () => {},
    busy: false, simpleSetup: false, isDirty: false, teacherTab: 'arsplan',
    get selectedId() { return selectedId }, set selectedId(value) { selectedId = value },
    setSelectedId: value => { selectedId = value },
    setPlan: updater => { currentPlan = typeof updater === 'function' ? updater(currentPlan) : updater },
    setBusy: () => {}, setStatus: value => { status = value },
    setSimpleSetup: () => {}, setTeacherTab: () => {}, setCalendarOpen: () => {},
    setSavedRevision: () => {}, savedPlanRef: { current: '' },
    loadPlans: async () => true,
    window: { location: { origin: 'https://example.test' }, confirm: () => true, sessionStorage: { setItem() {} } },
  })
  vm.runInContext(helpers, context)
  const save = vm.runInContext(`${saveSource}\nsave`, context)
  const saving = save(false)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(uploadCalls, 1, 'Bifogat material ska hanteras innan planeringen skrivs till databasen')
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
    assert.equal(status, 'Planeringen är sparad.')
  }
}
await scenario({ editDuringSave: true })
await scenario({ editDuringSave: false })
assert.match(source, /className="library-course-open" disabled=\{busy\} onClick=\{\(\) => loadPlan\(item\.row\)\}/,
  'Man ska inte kunna byta planering under sparning')
console.log('Annual async save preserves new edits and normal save behavior: OK')
