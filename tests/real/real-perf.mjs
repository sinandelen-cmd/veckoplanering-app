// Mäter HELA öppningsförloppet i en RIKTIG lokal Supabase-stack med fiktiva konton och data:
// inloggning → Mina planeringar → Grundskola → ämne → kurs (årskurs 6) → Grundplanering → klass.
// Därtill: scrollning, sparning under tung data, och gamla planeringar i biblioteket.
// Körning: npm run test:real-perf. Samma krav som test:real-ui (REAL_APP_URL, REAL_SUPABASE_*, REAL_TEST_USERS).
// Miljövariabler: PERF_CPU=6 (CPU-strypning), PERF_NET=slow (400 ms latens, 1,6 Mbit/s),
// PERF_CLASSES=12, PERF_HEAVY=1 (fem lektionsdagar), PERF_TEXT=3 (längre text), PERF_LEGACY=1 (gamla planeringar).
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { SCENARIOS } from '../print/fixtures.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const appUrl = process.env.REAL_APP_URL || ''
const sbUrl = process.env.REAL_SUPABASE_URL || ''
const anon = process.env.REAL_SUPABASE_ANON_KEY || ''
const service = process.env.REAL_SUPABASE_SERVICE_KEY || ''
const usersFile = process.env.REAL_TEST_USERS || ''
for (const u of [appUrl, sbUrl]) if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(u)) { console.error('Vägrar: URL måste vara lokal: ' + u); process.exit(2) }
if (!anon || !service || !usersFile) { console.error('Saknar nycklar eller testkonton'); process.exit(2) }
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
const admin = createClient(sbUrl, service, { auth: { persistSession: false } })

const SCHOOL = 'Grundskola'
const SUBJECT = 'PERF Svenska'
const COURSE = 'PERF Svenska åk 6'
const CLASSES = Array.from({ length: Number(process.env.PERF_CLASSES || 4) }, (_, i) => '6' + 'ABCDEFGHIJKL'[i])
const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const longText = 'Fiktiv lektionstext som är lång nog att ge verklig layoutbelastning i webbläsaren. '.repeat(Number(process.env.PERF_TEXT || 1))
const weeksData = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10))
  return { ...w, weekStart: iso(d), keepVisibleExtra: false, content: longText, lessons: w.lessons.map(l => ({ ...l, topics: l.topics.map(t => ({ ...t, name: t.name + ' ' + longText })) })) }
})
const heavy = Boolean(process.env.PERF_HEAVY)
const coursePlan = {
  kind: 'arsplanering-v2', title: COURSE, subject: SUBJECT, course: COURSE, schoolForm: SCHOOL, grade: '6', schoolYear: 'Testår',
  entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData,
  classGroups: CLASSES.map((name, i) => ({ name, days: heavy ? ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'] : (i % 2 ? ['Tisdag', 'Torsdag'] : ['Måndag', 'Tisdag', 'Onsdag']), startDate: '2026-08-01', momentsPerDay: {} })),
}

const aId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === users.A.email).id
await admin.from('veckoplanering').delete().like('title', 'PERF%')
const seed = [
  { user_id: aId, title: 'PERF ämne', published: false, content: JSON.stringify({ kind: 'amne-v1', schoolForm: SCHOOL, subject: SUBJECT, archived: false }) },
  { user_id: aId, title: COURSE, subject: SUBJECT, school_year: 'Testår', published: false, content: JSON.stringify(coursePlan), weeks: weeksData.length },
]
if (process.env.PERF_LEGACY) {
  // Gamla planeringar i äldre format utan ämnesrad, som finns kvar i många konton.
  for (let i = 0; i < 15; i++) seed.push({ user_id: aId, title: 'PERF gammal ' + i, subject: 'Gammal ' + i, school_year: '2025–2026', published: false, content: JSON.stringify({ kind: 'arsplanering-v2', title: 'PERF gammal ' + i, subject: 'Gammal ' + i, course: 'Gammal ' + i, schoolForm: 'Gymnasieskola', schoolYear: '2025–2026', weeksData: weeksData.slice(0, 10) }) })
}
const { error: seedError } = await admin.from('veckoplanering').insert(seed)
assert.equal(seedError, null, seedError?.message)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())

const results = {}
try {
  // PERF_CPU=6 stryper processorn, PERF_NET=slow ger 400 ms latens och cirka 1,6 Mbit/s nedladdning.
  const cpuRate = Number(process.env.PERF_CPU || 1)
  const cdp = (cpuRate > 1 || process.env.PERF_NET) ? await ctx.newCDPSession(page) : null
  if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  if (process.env.PERF_NET === 'slow') await cdp.send('Network.enable').then(() => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 }))
  results.cpu_stryp = cpuRate
  results.natprofil = process.env.PERF_NET || 'normal'

  // 1. Första laddning till inloggningsformuläret.
  const firstLoad = Date.now()
  await page.goto(appUrl + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 })
  results.forsta_laddning_ms = Date.now() - firstLoad
  await page.waitForLoadState('networkidle')

  // 2. Inloggning.
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)
  const loginStart = Date.now()
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card', { timeout: 60000 })
  results.inloggning_ms = Date.now() - loginStart

  // 3. Hela vägen till klassvyn. Tiden räknas från första mappklicket, inte efter att sidan laddats färdigt.
  const steg = {}
  const folder = async name => { await page.locator('button.library-folder:visible', { hasText: name }).first().evaluate(e => e.click()) }
  const vagStart = Date.now()
  const vagStartPerf = await page.evaluate(() => performance.now())
  // Nätverksanrop under öppningen av kursen: antal, och hur länge de tog sammanlagt.
  const openReqs = []
  const onOpenReq = req => { if (!req.url().startsWith('data:')) openReqs.push({ url: req.url().replace(/\?.*$/, '').replace(sbUrl, '').slice(0, 90), t: Date.now(), method: req.method() }) }
  const onOpenRes = res => { const r = openReqs.find(x => x.url === res.url().replace(/\?.*$/, '').replace(sbUrl, '').slice(0, 90) && !x.done); if (r) { r.done = Date.now() - r.t } }
  page.on('request', onOpenReq); page.on('response', onOpenRes)
  await page.waitForSelector('button.library-folder:visible', { timeout: 60000 })
  const t0 = Date.now()
  await folder(SCHOOL)
  steg.skolform_ms = Date.now() - t0
  const t1 = Date.now()
  await page.waitForSelector('button.library-folder:visible', { hasText: SUBJECT, timeout: 60000 })
  await folder(SUBJECT)
  steg.amne_ms = Date.now() - t1
  const t2 = Date.now()
  await page.locator('button.library-course-open:visible').first().evaluate(e => e.click())
  steg.kurs_klick_ms = Date.now() - t2
  const t3 = Date.now()
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length > 0 && document.querySelectorAll('.class-mini-chip').length > 0, null, { timeout: 90000 })
  steg.veckor_och_klassknappar_ms = Date.now() - t3
  results.steg = steg
  // Nedladdningen av planeringslistan vid inloggning: storlek och tid för anropet mot tabellen veckoplanering.
  results.hamtning_planeringslista = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/rest/v1/veckoplanering')).map(e => ({ kb: Math.round((e.encodedBodySize || e.transferSize || 0) / 1024), ms: Math.round(e.duration), start_ms: Math.round(e.startTime) })))
  results.oppna_kurs_hela_vagen_ms = Date.now() - vagStart
  results.resurser_under_oppning = await page.evaluate(t0 => performance.getEntries().filter(e => e.startTime >= t0 && (e.entryType === 'resource' || e.entryType === 'navigation')).map(e => ({ n: e.name.replace(/\?.*$/, '').slice(-70), start: Math.round(e.startTime - t0), dur: Math.round(e.duration) })).slice(0, 25), vagStartPerf)
  page.off('request', onOpenReq); page.off('response', onOpenRes)
  results.natverk_vid_oppning = openReqs.map(r => ({ url: r.url, method: r.method, ms: r.done ?? null }))
  results.klassknappar = await page.locator('.class-mini-chip').count()

  // 4. Scrollning i grundplaneringen, och att den återställs vid klassbyte.
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }))
  await page.waitForTimeout(150)
  results.scroll_grund_y = await page.evaluate(() => Math.round(window.scrollY))
  results.scroll_fungerar = results.scroll_grund_y > 300

  // 4b. Veckoplaneringen: öppna första veckan i grundplaneringen och mät tills den är öppen, sedan scrolla i den.
  const veckoStart = Date.now()
  const firstWeekToggle = page.locator('.teacher-collapsible-week').first().locator('button').first()
  await firstWeekToggle.evaluate(e => e.click())
  await page.waitForFunction(() => !!document.querySelector('.teacher-collapsible-week.teacher-week-open'), null, { timeout: 60000 })
  results.oppna_vecka_ms = Date.now() - veckoStart
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
  await page.waitForTimeout(150)
  results.scroll_i_vecka_y = await page.evaluate(() => Math.round(window.scrollY))
  results.scroll_i_vecka_fungerar = results.scroll_i_vecka_y > 300
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))

  // 5. Klassbyten. Mäts från klick till att den nya klassen är aktiv.
  const switchTo = async label => {
    const t = Date.now()
    await page.locator('.class-mini-chip', { hasText: label }).first().evaluate(e => e.click())
    await page.waitForFunction(l => [...document.querySelectorAll('.class-mini-chip.active')].some(c => c.textContent.includes(l)), label, { timeout: 60000 })
    return Date.now() - t
  }
  let requestsDuringSwitch = 0
  const countRequest = req => { if (!req.url().startsWith(appUrl)) requestsDuringSwitch += 1 }
  page.on('request', countRequest)
  const times = []
  for (let round = 0; round < 3; round++) {
    for (const c of [...CLASSES, 'Grundplanering']) times.push({ klass: c, ms: await switchTo(c) })
  }
  page.off('request', countRequest)
  results.natverksanrop_under_klassbyten = requestsDuringSwitch
  results.klassbyte_median_ms = times.map(t => t.ms).sort((a, b) => a - b)[Math.floor(times.length / 2)]
  results.klassbyte_max_ms = Math.max(...times.map(t => t.ms))
  results.scroll_efter_klassbyte_y = await page.evaluate(() => Math.round(window.scrollY))
  await switchTo(CLASSES[0])
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  await page.waitForTimeout(150)
  results.scroll_i_klassvy_y = await page.evaluate(() => Math.round(window.scrollY))

  // 6. Schema och tyngre klassvyer.
  const schemaStart = Date.now()
  await page.locator('.class-edit-schedule-action').first().evaluate(e => e.click())
  await page.waitForSelector('.class-mini-panel', { timeout: 60000 })
  results.oppna_schema_ms = Date.now() - schemaStart
  const openPanel = async label => {
    const t = Date.now()
    await page.locator('button.secondary', { hasText: label }).first().evaluate(e => e.click())
    await page.waitForFunction(l => [...document.querySelectorAll('button.secondary')].some(b => b.textContent.includes(l) && b.getAttribute('aria-expanded') === 'true'), label.replace(/^Visa /, ''), { timeout: 60000 })
    return Date.now() - t
  }
  results.jamforelse_ms = await openPanel('Visa klassernas veckor')
  await page.locator('button.secondary', { hasText: 'Dölj klassernas veckor' }).first().evaluate(e => e.click())
  await page.waitForTimeout(200)
  results.enskilda_andringar_ms = await openPanel('Visa enskilda ändringar')
  await page.locator('button.secondary', { hasText: 'Dölj enskilda ändringar' }).first().evaluate(e => e.click()).catch(() => {})

  // 7. Sparning under tung data: knappen ska låsas under sparning och låsas upp när den är klar.
  await switchTo('Grundplanering')
  const saveBtn = page.getByRole('button', { name: 'Spara ändringar', exact: true }).first()
  results.spara_knapp_finns = await saveBtn.count() > 0
  if (results.spara_knapp_finns) {
    const saveStart = Date.now()
    await saveBtn.evaluate(e => e.click())
    const busyDuringSave = await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Sparar...' || x.textContent.trim() === 'Spara ändringar')
      return b && b.disabled
    }, null, { timeout: 5000 }).then(() => true).catch(() => false)
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Sparar...'), null, { timeout: 90000 })
    results.spara_ms = Date.now() - saveStart
    results.knapp_last_under_sparning = busyDuringSave
  }
  results.sidfel = errors
} finally {
  await browser.close()
  await admin.from('veckoplanering').delete().like('title', 'PERF%')
}
console.log(JSON.stringify(results, null, 2))
assert.equal(errors.length, 0, 'sidfel: ' + errors.join(' | '))
assert.equal(results.scroll_fungerar, true, 'scrollning fungerar inte i grundplaneringen')
assert.equal(results.scroll_i_vecka_fungerar, true, 'scrollning fungerar inte i veckoplaneringen')
assert.ok(results.scroll_efter_klassbyte_y < 50, 'scrollen återställs inte vid klassbyte')
assert.ok(results.klassbyte_max_ms < 2000, 'långsammaste klassbyte ' + results.klassbyte_max_ms + ' ms')
console.log('PERF OK')
