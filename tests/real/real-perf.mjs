// Mäter laddning och klassbyte i en RIKTIG lokal Supabase-stack med fiktiva konton och data.
// Körning: npm run test:real-perf. Samma krav som test:real-ui (REAL_APP_URL, REAL_SUPABASE_*, REAL_TEST_USERS).
// Mäter svarstid från klick till att den valda klassen är aktiv i webbläsaren, inte bara byggstorlek.
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

const SUBJECT = 'PERF Matematik'
const COURSE = 'PERF kurs'
const CLASSES = Array.from({ length: Number(process.env.PERF_CLASSES || 4) }, (_, i) => (7 + Math.floor(i / 4)) + 'ABCD'[i % 4])
const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const longText = 'Fiktiv lektionstext som är lång nog att ge verklig layoutbelastning i webbläsaren. '.repeat(Number(process.env.PERF_TEXT || 1))
const weeksData = SCENARIOS['alla-21']().map((w, i) => { const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10)); return { ...w, weekStart: iso(d), keepVisibleExtra: false, content: longText, lessons: w.lessons.map(l => ({ ...l, topics: l.topics.map(t => ({ ...t, name: t.name + ' ' + longText })) })) } })
const coursePlan = {
  kind: 'arsplanering-v2', title: COURSE, subject: SUBJECT, course: COURSE, schoolForm: 'Gymnasieskola', schoolYear: 'Testår',
  entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData,
  classGroups: CLASSES.map((name, i) => ({ name, days: process.env.PERF_HEAVY ? ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'] : (i % 2 ? ['Tisdag', 'Torsdag'] : ['Måndag', 'Tisdag', 'Onsdag']), startDate: '2026-08-01', momentsPerDay: {} })),
}

const aId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === users.A.email).id
await admin.from('veckoplanering').delete().like('title', 'PERF%')
await admin.from('veckoplanering').insert([
  { user_id: aId, title: 'PERF ämne', published: false, content: JSON.stringify({ kind: 'amne-v1', schoolForm: 'Gymnasieskola', subject: SUBJECT, archived: false }) },
  { user_id: aId, title: COURSE, subject: SUBJECT, school_year: 'Testår', content: JSON.stringify(coursePlan), weeks: weeksData.length, published: false },
]).then(({ error }) => assert.equal(error, null, error?.message))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())

const results = {}
try {
  // PERF_CPU=6 stryper processorn 6 gånger, ungefär som en skollaptop. Mäts före första laddning.
  const cpuRate = Number(process.env.PERF_CPU || 1)
  // PERF_NET=slow ger 400 ms latens och cirka 1,6 Mbit/s nedladdning, ungefär som mobilt 3G/4G i dåligt läge.
  const cdp = (cpuRate > 1 || process.env.PERF_NET) ? await ctx.newCDPSession(page) : null
  if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  if (process.env.PERF_NET === 'slow') await cdp.send('Network.enable').then(() => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 }))
  results.cpu_stryp = cpuRate
  results.natprofil = process.env.PERF_NET || 'normal'
  const firstLoad = Date.now()
  await page.goto(appUrl + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 })
  results.forsta_laddning_ms = Date.now() - firstLoad
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)
  const loginStart = Date.now()
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card, .library-crumbs', { timeout: 30000 })
  results.inloggning_ms = Date.now() - loginStart

  const folder = async name => { await page.locator('button.library-folder:visible', { hasText: name }).first().evaluate(e => e.click()); await page.waitForTimeout(300) }
  const openStart = Date.now()
  await folder('Gymnasiet'); await folder(SUBJECT)
  await page.locator('button.library-course-open:visible', { hasText: '' }).first().evaluate(e => e.click())
  await page.waitForSelector('.class-mini-chip', { timeout: 60000 })
  results.oppna_kurs_ms = Date.now() - openStart

  const switchTo = async label => {
    const t = Date.now()
    await page.locator('.class-mini-chip', { hasText: label }).first().evaluate(e => e.click())
    await page.waitForFunction(l => [...document.querySelectorAll('.class-mini-chip.active')].some(c => c.textContent.includes(l)), label, { timeout: 60000 })
    return Date.now() - t
  }
  const times = []
  // Antal nätverksanrop under klassbyten. Noll betyder att latens mot Supabase inte påverkar klassvalet.
  let requestsDuringSwitch = 0
  const countRequest = req => { if (!req.url().startsWith(appUrl)) requestsDuringSwitch += 1 }
  page.on('request', countRequest)
  for (let round = 0; round < 3; round++) {
    for (const c of [...CLASSES, 'Grundplanering']) times.push({ klass: c, ms: await switchTo(c) })
  }
  page.off('request', countRequest)
  results.natverksanrop_under_klassbyten = requestsDuringSwitch
  results.klassbyte = times
  const sorted = times.map(t => t.ms).sort((a, b) => a - b)
  results.klassbyte_median_ms = sorted[Math.floor(sorted.length / 2)]
  results.klassbyte_max_ms = sorted[sorted.length - 1]

  await switchTo('7A')
  const schemaStart = Date.now()
  await page.locator('.class-edit-schedule-action').first().evaluate(e => e.click())
  await page.waitForSelector('.class-mini-panel', { timeout: 60000 })
  results.oppna_schema_ms = Date.now() - schemaStart
  // Tyngsta klassvyerna: jämförelsen över alla klasser och veckor, och de enskilda ändringarna.
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

  // Elevvyn: publicerad planering, anonym webbläsare, en sidladdning per klass (?klass=).
  if (process.env.PERF_ELEV) {
    const { error: pubError } = await admin.from('veckoplanering').insert({ user_id: aId, title: 'PERF elevvy', subject: SUBJECT, school_year: 'Testår', published: true, public_slug: 'perf-elev', published_content: JSON.stringify(coursePlan), content: JSON.stringify(coursePlan), weeks: weeksData.length })
    assert.equal(pubError, null, pubError?.message)
    const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const sp = await anonCtx.newPage()
    sp.on('pageerror', e => errors.push('elev: ' + e.message))
    if (cpuRate > 1) { const cdp = await anonCtx.newCDPSession(sp); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate }) }
    results.elev = []
    for (const k of ['', ...CLASSES.slice(0, 3)]) {
      const t = Date.now()
      await sp.goto(appUrl + '/elev/perf-elev' + (k ? '?klass=' + encodeURIComponent(k) : ''), { waitUntil: 'domcontentloaded' })
      await sp.waitForFunction(() => !document.body.innerText.includes('Hämtar det som eleverna ser') && document.body.innerText.length > 200, null, { timeout: 60000 })
      results.elev.push({ klass: k || 'grundplanering', ms: Date.now() - t })
    }
    results.elev_median_ms = results.elev.map(r => r.ms).sort((a, b) => a - b)[1]
    await anonCtx.close()
  }
  results.sidfel = errors
} finally {
  await browser.close()
  await admin.from('veckoplanering').delete().like('title', 'PERF%')
}
console.log(JSON.stringify(results, null, 2))
assert.equal(errors.length, 0, 'sidfel: ' + errors.join(' | '))
assert.ok(results.klassbyte_max_ms < 2000, 'långsammaste klassbyte ' + results.klassbyte_max_ms + ' ms')
console.log('PERF OK')
