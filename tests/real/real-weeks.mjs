// Kontrollerar att veckoinnehållet överlever namnbyte, arkivering och återställning av en kurs.
// Riktig lokal Supabase-stack, fiktiva konton och data. Kontrollerna läser direkt från databasen.
// Körning: npm run test:real-weeks (samma krav som test:real-ui).
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { SCENARIOS } from '../print/fixtures.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const appUrl = process.env.REAL_APP_URL || ''
const sbUrl = process.env.REAL_SUPABASE_URL || ''
const service = process.env.REAL_SUPABASE_SERVICE_KEY || ''
const usersFile = process.env.REAL_TEST_USERS || ''
for (const u of [appUrl, sbUrl]) if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(u)) { console.error('Vägrar: URL måste vara lokal: ' + u); process.exit(2) }
if (!service || !usersFile) { console.error('Saknar nycklar eller testkonton'); process.exit(2) }
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
const admin = createClient(sbUrl, service, { auth: { persistSession: false } })

const SCHOOL = 'Grundskola'
const SUBJECT = 'WEEKS Svenska'
const COURSE = 'WEEKS kurs åk 6'
const RENAMED = 'WEEKS namnbytt kurs'
const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const weeksData = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10))
  return { ...w, weekStart: iso(d), keepVisibleExtra: false, content: 'VECKOVÄRDE ' + i + ' ' + 'innehåll '.repeat(30) }
})
const coursePlan = { kind: 'arsplanering-v2', title: COURSE, subject: SUBJECT, course: COURSE, schoolForm: SCHOOL, grade: '6', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, classGroups: [{ name: '6A', days: ['Måndag', 'Tisdag'], startDate: '2026-08-01', momentsPerDay: {} }] }

const aId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === users.A.email).id
await admin.from('veckoplanering').delete().like('title', 'WEEKS%')
const { error: seedError } = await admin.from('veckoplanering').insert([
  { user_id: aId, title: 'WEEKS ämne', published: false, content: JSON.stringify({ kind: 'amne-v1', schoolForm: SCHOOL, subject: SUBJECT, archived: false }) },
  { user_id: aId, title: COURSE, subject: SUBJECT, school_year: 'Testår', published: false, content: JSON.stringify(coursePlan), weeks: weeksData.length },
])
assert.equal(seedError, null, seedError?.message)

// Ett fingeravtryck av veckorna: antal, markörer och lektionsinnehåll. Ska vara oförändrat efter varje åtgärd.
const weekSnapshot = async () => {
  const { data, error } = await admin.from('veckoplanering').select('title,content').eq('user_id', aId).eq('subject', SUBJECT).neq('title', 'WEEKS ämne').single()
  assert.equal(error, null, error?.message)
  const d = JSON.parse(data.content)
  return {
    titel: data.title,
    veckor: d.weeksData.length,
    markörer: d.weeksData.filter((w, i) => w.content === 'VECKOVÄRDE ' + i + ' ' + 'innehåll '.repeat(30)).length,
    lektioner: d.weeksData.reduce((n, w) => n + (w.lessons || []).reduce((m, l) => m + (l.topics || []).length, 0), 0),
    klasser: (d.classGroups || []).map(g => g.name).join(','),
    arkiverad: Boolean(d.archived),
  }
}
const before = await weekSnapshot()
assert.equal(before.veckor, 21, 'startläget har inte 21 veckor')
assert.equal(before.markörer, 21)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => { if (d.type() === 'prompt') d.accept(RENAMED); else d.accept() })
const results = {}
const folder = async name => { await page.locator('button.library-folder:visible', { hasText: name }).first().evaluate(e => e.click()); await page.waitForTimeout(350) }
const toRoot = async () => { const c = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }); if (await c.count()) { await c.first().evaluate(e => e.click()); await page.waitForTimeout(350) } }
const courseRow = title => page.locator('.library-course-row:visible', { hasText: title }).first()
try {
  await page.goto(appUrl + '/', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card', { timeout: 30000 })
  await folder(SCHOOL); await folder(SUBJECT)

  // Öppna kursen: veckorna ska visas.
  await page.locator('button.library-course-open:visible', { hasText: COURSE }).first().evaluate(e => e.click())
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length > 0, null, { timeout: 60000 })
  results.veckor_visas_vid_oppning = await page.locator('.week-card').count()
  assert.ok(results.veckor_visas_vid_oppning > 0)
  await toRoot(); await folder(SCHOOL); await folder(SUBJECT)

  // 1. Namnbyte.
  await courseRow(COURSE).locator('button', { hasText: 'Byt namn' }).evaluate(e => e.click())
  await page.waitForTimeout(800)
  const afterRename = await weekSnapshot()
  results.efter_namnbyte = afterRename
  assert.equal(afterRename.titel, RENAMED, 'namnbytet gjordes inte')
  assert.equal(afterRename.veckor, 21, 'namnbyte förlorade veckor')
  assert.equal(afterRename.markörer, 21, 'namnbyte ändrade veckoinnehåll')
  assert.equal(afterRename.lektioner, before.lektioner, 'namnbyte ändrade lektioner')

  // 2. Arkivering.
  await page.waitForTimeout(300)
  await courseRow(RENAMED).locator('button', { hasText: 'Arkivera' }).evaluate(e => e.click())
  await page.waitForTimeout(800)
  const afterArchive = await weekSnapshot()
  results.efter_arkivering = afterArchive
  assert.equal(afterArchive.arkiverad, true, 'kursen arkiverades inte')
  assert.equal(afterArchive.veckor, 21, 'arkivering förlorade veckor')
  assert.equal(afterArchive.markörer, 21, 'arkivering ändrade veckoinnehåll')

  // 3. Återställning från arkivet.
  await page.locator('button', { hasText: 'Arkiv' }).first().evaluate(e => e.click()); await page.waitForTimeout(400)
  await folder(SCHOOL); await folder(SUBJECT)
  await courseRow(RENAMED).locator('button', { hasText: 'Återställ' }).evaluate(e => e.click())
  await page.waitForTimeout(800)
  const afterRestore = await weekSnapshot()
  results.efter_aterstallning = afterRestore
  assert.equal(afterRestore.arkiverad, false, 'kursen återställdes inte')
  assert.equal(afterRestore.veckor, 21, 'återställning förlorade veckor')
  assert.equal(afterRestore.markörer, 21, 'återställning ändrade veckoinnehåll')

  // 4. Efter omladdning: öppna kursen igen och kontrollera att veckorna visas från databasen.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.library-card', { timeout: 30000 })
  await folder(SCHOOL); await folder(SUBJECT)
  await page.locator('button.library-course-open:visible', { hasText: RENAMED }).first().evaluate(e => e.click())
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length > 0, null, { timeout: 60000 })
  results.veckor_visas_efter_omladdning = await page.locator('.week-card').count()
  assert.ok(results.veckor_visas_efter_omladdning > 0, 'veckorna visas inte efter omladdning')
  results.sidfel = errors
} finally {
  await browser.close()
  await admin.from('veckoplanering').delete().like('title', 'WEEKS%')
}
console.log(JSON.stringify(results, null, 2))
assert.equal(errors.length, 0, 'sidfel: ' + errors.join(' | '))
console.log('WEEKS OK')
