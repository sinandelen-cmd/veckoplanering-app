// Kontrollerar att äldre planeringar syns, går att öppna och inte skrivs över. Riktig lokal Supabase-stack, fiktiva data.
// Körning: npm run test:real-legacy (samma krav som test:real-ui).
import fs from 'node:fs'
import crypto from 'node:crypto'
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

const aId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === users.A.email).id
const legacyRows = [
  { user_id: aId, title: 'LEGACY veckoplan', subject: 'Veckostudie', published: false, week_start: '2026-08-17',
    content: JSON.stringify({ kind: 'veckoplanering-v1', dagar: { 'Måndag': 'Läsning s. 12', 'Tisdag': 'Övning 3' } }) },
  { user_id: aId, title: 'LEGACY ogiltig', subject: 'Trasig', published: false, content: 'inte json {' },
  { user_id: aId, title: 'LEGACY utan skolform', subject: 'Gammalt ämne', published: false,
    content: JSON.stringify({ kind: 'arsplanering-v2', title: 'LEGACY utan skolform', subject: 'Gammalt ämne', course: 'Gammalt ämne 1', weeksData: [{ weekNumber: 1, weekStart: '2026-08-17', title: 'Vecka 1', content: 'Innehåll' }] }) },
]
await admin.from('veckoplanering').delete().like('title', 'LEGACY%')
const { error: insertError } = await admin.from('veckoplanering').insert(legacyRows)
assert.equal(insertError, null, insertError?.message)
const fingerprint = async () => {
  const { data, error } = await admin.from('veckoplanering').select('id,title,content,updated_at').like('title', 'LEGACY%').order('id')
  assert.equal(error, null, error?.message)
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
}
const before = await fingerprint()

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())
const results = {}
try {
  await page.goto(appUrl + '/', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card', { timeout: 30000 })
  await page.waitForTimeout(400)

  const folder = async name => { await page.locator('button.library-folder:visible', { hasText: name }).first().evaluate(e => e.click()); await page.waitForTimeout(400) }
  const toRoot = async () => { const c = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }); if (await c.count()) { await c.first().evaluate(e => e.click()); await page.waitForTimeout(400) } }

  // Övriga planeringar: äldre veckoplanering och ogiltig JSON.
  await folder('Övriga planeringar')
  results.ovriga_mappar = await page.locator('button.library-folder:visible').allInnerTexts()
  results.ovriga_veckostudie = results.ovriga_mappar.some(t => t.includes('Veckostudie'))
  results.ovriga_trasig = results.ovriga_mappar.some(t => t.includes('Trasig'))
  assert.ok(results.ovriga_veckostudie && results.ovriga_trasig, 'äldre rader syns inte under Övriga planeringar')
  await folder('Veckostudie')
  results.kurs_veckostudie = await page.locator('button.library-course-open:visible', { hasText: 'LEGACY veckoplan' }).count()
  assert.equal(results.kurs_veckostudie, 1, 'äldre veckoplanering syns inte under sitt ämne')
  await toRoot(); await folder('Övriga planeringar'); await folder('Trasig')
  results.kurs_trasig = await page.locator('button.library-course-open:visible', { hasText: 'LEGACY ogiltig' }).count()
  assert.equal(results.kurs_trasig, 1, 'planering med ogiltig JSON syns inte')

  // Planering utan skolform men med kursnamn klassas som gymnasie-kurs, enligt befintlig regel. Den ska synas där.
  await toRoot(); await folder('Gymnasiet')
  results.gymnasiet_gammalt_amne = await page.locator('button.library-folder:visible', { hasText: 'Gammalt ämne' }).count()
  assert.equal(results.gymnasiet_gammalt_amne, 1, 'planering utan skolform syns inte under Gymnasiet')

  // Öppna den äldre veckoplaneringen.
  await toRoot(); await folder('Övriga planeringar'); await folder('Veckostudie')
  await page.locator('button.library-course-open:visible', { hasText: 'LEGACY veckoplan' }).first().evaluate(e => e.click())
  await page.waitForTimeout(800)
  results.oppnad_ar_veckoplanering = await page.getByText('Läsning s. 12').count() > 0

  // Att öppna och lämna en äldre planering ska inte ändra data.
  results.oforandrad_efter_oppning = (await fingerprint()) === before
  results.sidfel = errors
} finally {
  await browser.close()
  await admin.from('veckoplanering').delete().like('title', 'LEGACY%')
}
console.log(JSON.stringify(results, null, 2))
assert.equal(errors.length, 0, 'sidfel: ' + errors.join(' | '))
assert.equal(results.oforandrad_efter_oppning, true, 'en äldre rad ändrades av att den öppnades')
assert.equal(results.oppnad_ar_veckoplanering, true, 'den äldre veckoplaneringen visas inte när den öppnas')
console.log('LEGACY OK')
