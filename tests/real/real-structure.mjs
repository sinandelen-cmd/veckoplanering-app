// Kontrollerar den önskade strukturen i en RIKTIG lokal Supabase-stack:
// Mina planeringar → Gymnasiet → ämne → "Lägg till kurs" (flera kurser) → sök → namnbyte → omladdning → annan dator.
// Fiktiva data med prefixet STRUCT. Rör inga andra rader. Körning: npm run test:real-structure.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

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

const SUBJECT = 'STRUCT Engelska'
const COURSE1 = 'STRUCT Engelska nivå 1'
const COURSE2 = 'STRUCT Engelska nivå 2'
const RENAMED = 'STRUCT Engelska nivå 1 justerad'
const aId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === users.A.email).id
const rows = async () => (await admin.from('veckoplanering').select('id,title,subject,content').eq('user_id', aId).like('title', 'STRUCT%')).data || []
const parsed = r => JSON.parse(r.content)
await admin.from('veckoplanering').delete().like('title', 'STRUCT%')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = {}
const errors = []
const login = async page => {
  await page.goto(appUrl + '/', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card', { timeout: 30000 })
  await page.waitForTimeout(400)
}
const newPage = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { if (d.type() === 'prompt') d.accept(RENAMED); else d.accept() }); return p }
const folder = async (page, name) => { await page.locator('button.library-folder:visible', { hasText: name }).first().evaluate(e => e.click()); await page.waitForTimeout(350) }
const toRoot = async page => { const c = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }); if (await c.count()) { await c.first().evaluate(e => e.click()); await page.waitForTimeout(350) } }
const courseNames = async page => page.locator('.library-course-open:visible').allInnerTexts()

try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await newPage(ctx)
  await login(page)

  // 1. Två huvudgrenar under Mina planeringar.
  const roots = await page.locator('button.library-folder:visible').allInnerTexts()
  results.huvudgrenar = roots.map(t => t.split('\n')[0].replace(/^📁\s*/, ''))
  assert.ok(roots.some(t => t.includes('Grundskola')) && roots.some(t => t.includes('Gymnasiet')), 'Grundskola och Gymnasiet saknas som huvudgrenar')

  // 2. Nytt ämne under Gymnasiet.
  await folder(page, 'Gymnasiet')
  await page.locator('button', { hasText: 'Nytt ämne' }).first().evaluate(e => e.click())
  await page.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await page.locator('.library-subject-form select').selectOption('Gymnasiet')
  await page.locator('.library-subject-form input').fill(SUBJECT)
  await page.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await page.waitForTimeout(1200)
  const subjRow = (await rows()).find(r => parsed(r).kind === 'amne-v1' && parsed(r).subject === SUBJECT)
  assert.ok(subjRow, 'ämnet skapades inte')
  assert.equal(parsed(subjRow).schoolForm, 'Gymnasiet', 'ämnet hamnade under fel skolform')

  // 3. Två kurser under samma ämne, med "Lägg till kurs".
  for (const name of [COURSE1, COURSE2]) {
    await toRoot(page); await folder(page, 'Gymnasiet'); await folder(page, SUBJECT)
    await page.locator('button', { hasText: 'Lägg till kurs' }).first().evaluate(e => e.click())
    await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
    const dialog = page.locator('[aria-label="Skapa ny kurs"]')
    await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill(name)
    await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
    await page.waitForTimeout(1500)
  }
  const courses = (await rows()).filter(r => parsed(r).kind === 'arsplanering-v2')
  results.kurser_i_databasen = courses.map(r => ({ titel: r.title, amne: parsed(r).subject, skolform: parsed(r).schoolForm, veckor: parsed(r).weeksData?.length }))
  assert.equal(courses.length, 2, 'två kurser skapades inte')
  for (const c of courses) {
    // Kurser sparas med plan-formulärets skolform (Gymnasieskola). Biblioteket placerar dem under Gymnasiet.
    assert.match(parsed(c).schoolForm, /gymnas/i, 'kursen har fel skolform')
    assert.equal(parsed(c).weeksData.length, 21, 'kursen har inte 21 veckor')
  }

  // 4. Sök: bara den kurs som matchar visas.
  await toRoot(page); await folder(page, 'Gymnasiet'); await folder(page, SUBJECT)
  assert.equal((await courseNames(page)).length, 2, 'båda kurserna visas inte under ämnet')
  await page.locator('.library-search input').fill('nivå 2')
  await page.waitForTimeout(300)
  results.sokning_nivå_2 = await courseNames(page)
  assert.equal(results.sokning_nivå_2.length, 1, 'sökningen filtrerar inte kurserna')
  assert.ok(results.sokning_nivå_2[0].includes('nivå 2'))
  await page.locator('.library-search input').fill('')

  // 5. Namnbyte av kurs 1. Veckorna ska finnas kvar.
  await page.locator('.library-course-row', { hasText: COURSE1 }).first().locator('button', { hasText: 'Byt namn' }).evaluate(e => e.click())
  await page.waitForTimeout(900)
  const renamed = (await rows()).find(r => r.title === RENAMED)
  assert.ok(renamed, 'namnbytet gjordes inte')
  assert.equal(parsed(renamed).weeksData.length, 21, 'namnbytet förlorade veckor')
  await page.waitForTimeout(300)
  assert.ok((await courseNames(page)).some(t => t.includes('justerad')), 'det nya namnet syns inte i biblioteket')

  // 6. Omladdning och inloggning från en annan dator (ny kontext utan lokal lagring).
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.library-card', { timeout: 30000 })
  await folder(page, 'Gymnasiet'); await folder(page, SUBJECT)
  results.efter_omladdning = (await courseNames(page)).map(t => t.replace(/\s+/g, ' ').trim())
  assert.equal(results.efter_omladdning.length, 2)
  const otherCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const other = await newPage(otherCtx)
  await login(other)
  await folder(other, 'Gymnasiet'); await folder(other, SUBJECT)
  results.annan_dator = (await courseNames(other)).map(t => t.replace(/\s+/g, ' ').trim())
  assert.equal(results.annan_dator.length, 2, 'annan dator ser inte båda kurserna')
  await otherCtx.close()
  results.sidfel = errors
  await ctx.close()
} finally {
  await browser.close()
  await admin.from('veckoplanering').delete().like('title', 'STRUCT%')
}
console.log(JSON.stringify(results, null, 2))
assert.equal(errors.length, 0, 'sidfel: ' + errors.join(' | '))
console.log('STRUCTURE OK')
