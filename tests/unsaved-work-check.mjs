// Testar skyddet för osparat arbete och loopskyddet i den automatiska versionskontrollen (src/appVersion.js).
// Körs med: node tests/unsaved-work-check.mjs. Inga nätverksanrop eller riktiga konton används: fetch och webbläsarmiljön är stubbar.
import assert from 'node:assert/strict'

globalThis.__APP_BUILD_ID__ = 'build-a'
let reloads = 0
let remoteBuildId = 'build-a'
let fetchMode = 'ok' // 'ok' | 'network' | 'http' | 'invalid'
const storage = new Map()
globalThis.sessionStorage = { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
globalThis.document = { visibilityState: 'visible', addEventListener() {}, getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, styleSheets: [] }
globalThis.window = { location: { reload: () => { reloads++ } }, setInterval() {}, addEventListener() {} }
globalThis.fetch = async () => {
  if (fetchMode === 'network') throw new Error('nätverksfel (simulerat)')
  if (fetchMode === 'http') return { ok: false, json: async () => ({}) }
  if (fetchMode === 'invalid') return { ok: true, json: async () => ({ inget: 'id' }) }
  return { ok: true, json: async () => ({ buildId: remoteBuildId }) }
}

const { setUnsavedWork, hasUnsavedWork, checkForNewVersion, BUILD_ID } = await import('../src/appVersion.js')
const results = []
const check = async (name, fn) => {
  try { await fn(); results.push(true); console.log('PASS ' + name) } catch (error) { results.push(false); console.log('FAIL ' + name + ' :: ' + error.message) }
}

await check('BUILD_ID läses från bygget', async () => assert.equal(BUILD_ID, 'build-a'))
await check('ingen osparad data när sidan startar', async () => assert.equal(hasUnsavedWork(), false))
await check('ny version laddas om direkt när inget är osparat', async () => {
  reloads = 0; remoteBuildId = 'build-b'
  await checkForNewVersion()
  assert.equal(reloads, 1)
})
// Efter omladdningen är sidan på build-b i verkligheten. Stubben simulerar det genom att låtsas att det nya bygget är aktuellt.
await check('osparat arbete i årsplanen blockerar omladdningen', async () => {
  reloads = 0; remoteBuildId = 'build-c'; storage.clear()
  setUnsavedWork('arsplanering', true)
  await checkForNewVersion()
  assert.equal(reloads, 0, 'omladdning får inte ske med osparat arbete')
  assert.equal(hasUnsavedWork(), true)
})
await check('väntande version laddas när osparat arbete sparas', async () => {
  setUnsavedWork('arsplanering', false)
  assert.equal(reloads, 1)
})
await check('osparat arbete i båda delarna: en del sparad räcker inte', async () => {
  reloads = 0; remoteBuildId = 'build-d'; storage.clear()
  setUnsavedWork('arsplanering', true)
  setUnsavedWork('veckoplanering', true)
  await checkForNewVersion()
  setUnsavedWork('arsplanering', false)
  assert.equal(reloads, 0, 'veckoplanering har fortfarande osparat arbete')
  setUnsavedWork('veckoplanering', false)
  assert.equal(reloads, 1)
})
await check('loopskydd: samma version laddas inte om två gånger i samma flik', async () => {
  // Sidan laddades om till build-d men servern serverar fortfarande build-a (cache). Ingen ny omladdning.
  reloads = 0; remoteBuildId = 'build-d'; storage.clear(); storage.set('arsplanering-auto-update-target', 'build-d')
  await checkForNewVersion()
  await checkForNewVersion()
  assert.equal(reloads, 0)
})
await check('samma version som sidan kör: ingen omladdning och skyddet nollställs', async () => {
  reloads = 0; remoteBuildId = 'build-a'
  await checkForNewVersion()
  assert.equal(reloads, 0)
  assert.equal(storage.has('arsplanering-auto-update-target'), false)
})
await check('nätverksfel ger ingen omladdning och inget undantag', async () => {
  reloads = 0; fetchMode = 'network'; remoteBuildId = 'build-e'
  await checkForNewVersion()
  assert.equal(reloads, 0)
  fetchMode = 'ok'
})
await check('HTTP-fel eller ogiltigt version.json ger ingen omladdning', async () => {
  reloads = 0
  fetchMode = 'http'; await checkForNewVersion()
  fetchMode = 'invalid'; await checkForNewVersion()
  fetchMode = 'ok'
  assert.equal(reloads, 0)
})
await check('avmontering av delen (setUnsavedWork false) tar bort skyddet', async () => {
  reloads = 0; remoteBuildId = 'build-f'; storage.clear()
  setUnsavedWork('arsplanering', true)
  await checkForNewVersion()
  setUnsavedWork('arsplanering', false)
  assert.equal(hasUnsavedWork(), false)
  assert.equal(reloads, 1)
})

const allOk = results.every(Boolean)
console.log(allOk ? 'Osparat-arbete och versionskontroll: OK' : 'Osparat-arbete och versionskontroll: MISSLYCKADES')
process.exit(allOk ? 0 : 1)
