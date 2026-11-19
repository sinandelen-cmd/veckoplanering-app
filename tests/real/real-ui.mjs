// Browsertest mot en RIKTIG lokal Supabase-stack (Auth, PostgreSQL, Storage) med fiktiva konton och data.
// Körning: npm run test:real-ui. Kräver REAL_APP_URL (lokal testbygge), REAL_SUPABASE_URL (lokal), REAL_SUPABASE_ANON_KEY,
// REAL_SUPABASE_SERVICE_KEY och REAL_TEST_USERS. Vägrar köra mot något annat än localhost.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

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

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + String(e.message || e).split('\n').slice(0, 3).join(' | ').slice(0, 500)) } }

const idOf = async key => { const { data } = await admin.auth.admin.listUsers(); return data.users.find(u => u.email === users[key].email).id }
const rowsOf = async (title = 'TEST') => (await admin.from('veckoplanering').select('id,user_id,title,content').like('title', title + '%')).data || []
const contentOf = r => JSON.parse(r.content)
const txt = (name, body) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) })

async function newPage(ctx) {
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  page.on('dialog', d => { page.lastDialog = d.message(); d.accept() })
  return page
}
async function login(page, key) {
  await page.goto(appUrl + '/', { waitUntil: 'networkidle' })
  if (await page.locator('.library-card').count()) return
  await page.locator('input[type="email"]').fill(users[key].email)
  await page.locator('input[type="password"]').fill(users[key].password)
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card, .library-crumbs', { timeout: 30000 })
  await page.waitForTimeout(500)
}
const btn = (page, text) => page.locator('button:visible', { hasText: text }).first()
async function goRoot(page) { const c = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }); if (await c.count()) { await c.first().evaluate(e => e.click()); await page.waitForTimeout(400) } }
async function subjectLevel(page, school, subject) {
  await goRoot(page)
  await page.locator('button.library-folder:visible', { hasText: school }).first().evaluate(e => e.click()); await page.waitForTimeout(400)
  await page.locator('button.library-folder:visible', { hasText: subject }).first().evaluate(e => e.click()); await page.waitForTimeout(400)
}
async function cleanup() {
  await admin.from('veckoplanering').delete().like('title', 'TEST%')
  for (const key of ['A', 'B']) {
    const uid = await idOf(key)
    const { data: files } = await admin.storage.from('planning-materials').list(uid, { limit: 200 })
    if (files?.length) await admin.storage.from('planning-materials').remove(files.map(f => uid + '/' + f.name))
  }
}
await cleanup()
const A_ID = await idOf('A')
const B_ID = await idOf('B')
// Gamla fiktiva planeringar i äldre format. Prefixet är inte TEST, så att rensningen inte tar bort dem.
const legacy = [
  { user_id: A_ID, title: 'ÄLDRE Fiktiv Matematik 2c', subject: 'Matematik', school_year: '2025–2026', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'ÄLDRE Fiktiv Matematik 2c', subject: 'Matematik', course: 'Matematik 2c', schoolForm: 'Gymnasieskola', schoolYear: '2025–2026', textbook: 'fiktiv bok', weeksData: [{ weekNumber: 1, weekStart: '2025-08-11', chapter: 'Gammalt kapitel', content: 'Gammal text', lessons: [{ name: 'Lektion 1', topics: [{ name: 'Gammal lektion' }] }] }] }), weeks: 1, published: false, public_slug: null, published_content: null },
  { user_id: B_ID, title: 'ÄLDRE Fiktiv Svenska 6', subject: 'Svenska', school_year: '2025–2026', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'ÄLDRE Fiktiv Svenska 6', subject: 'Svenska', course: 'Svenska 6', schoolForm: 'Grundskola', grade: '6', classGroups: [{ name: '6A' }], weeksData: [] }), weeks: 0, published: false, public_slug: null, published_content: null },
]
const { data: legacyRows, error: legacyError } = await admin.from('veckoplanering').insert(legacy).select('id,content')
assert.equal(legacyError, null, legacyError?.message)
const legacyBefore = Object.fromEntries(legacyRows.map(r => [r.id, r.content]))

// 1. Skapa ämne och kurs med fil och inklistrad text, mot riktig databas och Storage.
const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const pageA = await newPage(ctxA)
await check('inloggning med riktiga konton och skapande av ämnet TEST Matematik', async () => {
  await login(pageA, 'A')
  await goRoot(pageA)
  await btn(pageA, 'Nytt ämne').evaluate(e => e.click())
  await pageA.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await pageA.locator('.library-subject-form select').selectOption('Gymnasiet')
  await pageA.locator('.library-subject-form input').fill('TEST Matematik')
  await pageA.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await pageA.waitForTimeout(1200)
  const subj = (await rowsOf()).find(r => contentOf(r).kind === 'amne-v1' && contentOf(r).subject === 'TEST Matematik')
  assert.ok(subj, 'ämnet finns inte i riktig databas')
  assert.equal(subj.user_id, A_ID, 'ämnet tillhör fel konto')
})

const weekText = Array.from({ length: 1 }, () => 'Fiktiv planering: vecka 1 om nämnare.').join('')
await check('kurs i ämnet med fil, PDF och inklistrad text sparas med 21 veckor i riktig databas', async () => {
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await btn(pageA, 'Ny kurs').evaluate(e => e.click())
  await pageA.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
  const dialog = pageA.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('TEST Matematik 1b')
  await dialog.locator('input[type="file"]').setInputFiles([txt('planering.txt', 'Fiktiv text: bråk och procent.'), { name: 'planering.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync('tests/ui/fixtures/planering.pdf') }])
  await pageA.waitForFunction(() => document.querySelectorAll('[aria-label="Skapa ny kurs"] .material-list li').length === 2, null, { timeout: 30000 })
  await dialog.locator('.material-paste textarea').fill(weekText)
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await pageA.waitForSelector('#lararvy .week-card', { timeout: 30000 })
  await pageA.waitForTimeout(1200)
  const course = (await rowsOf()).find(r => contentOf(r).course === 'TEST Matematik 1b')
  assert.ok(course, 'kursen sparades inte')
  const c = contentOf(course)
  assert.equal(c.weeksData.length, 21, 'kursen har inte 21 veckor')
  assert.deepEqual(c.materials.map(m => m.name).sort(), ['planering.pdf', 'planering.txt'], 'material sparades inte')
  for (const m of c.materials) {
    const { data, error } = await admin.storage.from('planning-materials').download(m.path)
    assert.equal(error, null, 'filen finns inte i riktig Storage: ' + m.name)
    assert.ok(data.size > 0, 'tom fil i Storage: ' + m.name)
  }
  assert.ok(c.pastedMaterial.includes('nämnare'), 'inklistrad text sparades inte')
})

await check('förhandsgranskning av inklistrad planering och "Använd import" skriver veckorna i riktig databas', async () => {
  await pageA.waitForSelector('.import-preview', { timeout: 15000 })
  assert.match(await pageA.locator('.import-preview').innerText(), /Inget har ändrats ännu/)
  await btn(pageA, 'Använd import').evaluate(e => e.click())
  await pageA.waitForTimeout(800)
  await btn(pageA, 'Spara ändringar').evaluate(e => e.click()).catch(() => {})
  await pageA.waitForTimeout(2200)
  await pageA.waitForFunction(() => !/Osparade ändringar/.test(document.body.innerText), null, { timeout: 15000 })
  const c = contentOf((await rowsOf()).find(r => contentOf(r).course === 'TEST Matematik 1b'))
  assert.equal(c.weeksData.length, 21, 'antalet veckor ändrades: ' + c.weeksData.length)
  assert.ok(c.weeksData.some(w => JSON.stringify(w).includes('nämnare')), 'importen skrev inte veckorna')
  assert.ok(c.pastedMaterial.includes('nämnare'), 'originaltexten försvann')
})

await check('omladdning: ämne, kurs, material och öppning av fil fungerar', async () => {
  await pageA.reload({ waitUntil: 'networkidle' }); await pageA.waitForTimeout(800)
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await pageA.locator('.library-course-open:visible', { hasText: 'TEST Matematik 1b' }).first().evaluate(e => e.click())
  await pageA.waitForSelector('#lararvy .week-card', { timeout: 30000 })
  await pageA.locator('details.material-disclosure > summary').evaluate(e => { if (!e.parentElement.open) e.click() })
  await pageA.waitForTimeout(300)
  assert.equal(await pageA.locator('details.material-disclosure .material-list li').count(), 2, 'materialet finns inte efter omladdning')
  const popupPromise = ctxA.waitForEvent('page')
  await pageA.locator('details.material-disclosure .material-list li', { hasText: 'planering.txt' }).locator('button', { hasText: 'Öppna' }).evaluate(e => e.click())
  const popup = await popupPromise
  await popup.waitForURL(u => u.toString().includes('/storage/v1/object/sign/planning-materials/'), { timeout: 20000 })
  assert.match(popup.url(), /object\/sign\/planning-materials\//, 'signerad länk saknas')
  await popup.close()
})

await check('annan dator: ny webbläsarkontext utan lokal lagring visar samma ämne och kurs', async () => {
  const ctxB1 = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const other = await newPage(ctxB1)
  await login(other, 'A')
  await subjectLevel(other, 'Gymnasiet', 'TEST Matematik')
  assert.ok(await other.locator('.library-course-open:visible', { hasText: 'TEST Matematik 1b' }).count() === 1, 'kursen syns inte på annan dator')
  assert.equal(await other.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('arsplanering-subject-folders'))), false, 'annan dator använde lokal lagring')
  await ctxB1.close()
})

await check('förhandsgranskning av en kurs följer inte med till en annan kurs i riktig databas', async () => {
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await btn(pageA, 'Ny kurs').evaluate(e => e.click())
  await pageA.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
  const dialog = pageA.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('TEST Matematik 2c')
  await dialog.locator('.material-paste textarea').fill('Fiktiv planering: vecka 2 om geometri.')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await pageA.waitForSelector('.import-preview', { timeout: 20000 })
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await pageA.locator('.library-course-open:visible', { hasText: 'TEST Matematik 1b' }).first().evaluate(e => e.click())
  await pageA.waitForSelector('#lararvy .week-card', { timeout: 30000 })
  await pageA.waitForTimeout(500)
  assert.equal(await pageA.locator('.import-preview').count(), 0, 'förhandsgranskningen följde med till en annan kurs')
  const course1 = contentOf((await rowsOf()).find(r => contentOf(r).course === 'TEST Matematik 1b'))
  assert.ok(!JSON.stringify(course1.weeksData).includes('geometri'), 'texten från den andra kursen hamnade i 1b')
})

await check('arkivera, återställ: alla 21 veckor och innehållet är oförändrat i riktig databas', async () => {
  const before = contentOf((await rowsOf()).find(r => contentOf(r).course === 'TEST Matematik 1b'))
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await btn(pageA, 'Arkivera ämne').evaluate(e => e.click()); await pageA.waitForTimeout(1200)
  await btn(pageA, '🗃 Arkiv').evaluate(e => e.click()); await pageA.waitForTimeout(400)
  await pageA.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await pageA.waitForTimeout(400)
  await pageA.locator('button.library-folder:visible', { hasText: 'TEST Matematik' }).first().evaluate(e => e.click()); await pageA.waitForTimeout(400)
  await btn(pageA, 'Återställ ämne').evaluate(e => e.click()); await pageA.waitForTimeout(1200)
  await btn(pageA, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  const after = contentOf((await rowsOf()).find(r => contentOf(r).course === 'TEST Matematik 1b'))
  const strip = o => { const x = { ...o }; delete x.archived; return x }
  assert.deepEqual(strip(after), strip(before), 'kursinnehållet ändrades vid arkivering och återställning')
})

// B-användaren har en egen planering som inte får påverkas.
const ctxBuser = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const pageBuser = await newPage(ctxBuser)
await check('annan lärare (B) skapar egen planering och ser inte A:s ämnen eller filer', async () => {
  await login(pageBuser, 'B')
  await goRoot(pageBuser)
  await btn(pageBuser, 'Nytt ämne').evaluate(e => e.click())
  await pageBuser.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await pageBuser.locator('.library-subject-form select').selectOption('Grundskola')
  await pageBuser.locator('.library-subject-form input').fill('TEST Svenska')
  await pageBuser.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await pageBuser.waitForTimeout(1200)
  await goRoot(pageBuser)
  await pageBuser.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await pageBuser.waitForTimeout(400)
  assert.equal(await pageBuser.locator('button.library-folder:visible', { hasText: 'TEST Matematik' }).count(), 0, 'B ser A:s ämne')
  const bRows = await rowsOf()
  assert.ok(bRows.some(r => contentOf(r).subject === 'TEST Svenska' && r.user_id === B_ID), 'B:s ämne sparades inte')
})

// Migrering från localStorage med två samtidiga flikar för samma konto.
await check('migrering från localStorage med två samtidiga flikar skapar inga dubbletter', async () => {
  const ctxM = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const seedFolders = JSON.stringify({ [A_ID]: { Gymnasiet: ['TEST Gammal', 'test gammal'], Grundskola: ['TEST Bild'] } })
  await ctxM.addInitScript(f => { if (localStorage.getItem('arsplanering-subject-folders') === null) localStorage.setItem('arsplanering-subject-folders', f) }, seedFolders)
  const p1 = await newPage(ctxM)
  await login(p1, 'A')
  // Fyra flikar laddas samtidigt. Alla försöker migrera de lokala mapparna.
  const extra = await Promise.all([1, 2, 3].map(() => newPage(ctxM)))
  await Promise.all([p1.reload({ waitUntil: 'networkidle' }), ...extra.map(pg => pg.goto(appUrl + '/', { waitUntil: 'networkidle' }))])
  await p1.waitForTimeout(3000)
  const p2 = extra[0]
  const rowsNow = (await rowsOf()).filter(r => contentOf(r).kind === 'amne-v1')
  const keys = rowsNow.map(r => { const d = contentOf(r); return (d.schoolForm + '|' + d.subject).toLowerCase() })
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  assert.deepEqual(dupes, [], 'dubbletter efter samtidig migrering: ' + dupes.join(', '))
  assert.equal(keys.filter(k => k === 'gymnasiet|test gammal').length, 1, 'ämnet TEST Gammal saknas eller finns flera gånger')
  assert.equal(await p1.evaluate(uid => JSON.parse(localStorage.getItem('arsplanering-subject-folders') || '{}')[uid], A_ID), undefined, 'lokala mappar kvar')
  await ctxM.close()
})

// Permanent radering av ett arkiverat ämne med två kurser, utan påverkan på andra.
await check('permanent radering från arkivet tar bort bara ämnets kurser och filer, och inget annat', async () => {
  await btn(pageA, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await subjectLevel(pageA, 'Gymnasiet', 'TEST Matematik')
  await btn(pageA, 'Arkivera ämne').evaluate(e => e.click()); await pageA.waitForTimeout(1200)
  await btn(pageA, '🗃 Arkiv').evaluate(e => e.click()); await pageA.waitForTimeout(400)
  await pageA.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await pageA.waitForTimeout(400)
  await pageA.locator('button.library-folder:visible', { hasText: 'TEST Matematik' }).first().evaluate(e => e.click()); await pageA.waitForTimeout(400)
  const materialPaths = (await rowsOf()).filter(r => contentOf(r).course === 'TEST Matematik 1b').flatMap(r => contentOf(r).materials.map(m => m.path))
  pageA.lastDialog = ''
  await btn(pageA, 'Radera ämne permanent').evaluate(e => e.click()); await pageA.waitForTimeout(1500)
  assert.match(pageA.lastDialog, /TEST Matematik 1b/, 'bekräftelsen listar inte kursen')
  assert.match(pageA.lastDialog, /21 veckor/, 'bekräftelsen saknar veckor')
  const left = await rowsOf()
  assert.ok(!left.some(r => contentOf(r).course === 'TEST Matematik 1b'), 'kursen finns kvar')
  assert.ok(!left.some(r => contentOf(r).subject === 'TEST Matematik'), 'ämnesraden finns kvar')
  assert.ok(left.some(r => contentOf(r).subject === 'TEST Svenska' && r.user_id === B_ID), 'B:s ämne påverkades')
  for (const path of materialPaths) {
    const { data } = await admin.storage.from('planning-materials').download(path)
    assert.equal(data, null, 'filen ligger kvar i Storage efter radering: ' + path)
  }
})

await check('gamla planeringar är oförändrade efter alla körningar (innehåll och antal)', async () => {
  const { data: now } = await admin.from('veckoplanering').select('id,content').in('id', Object.keys(legacyBefore))
  assert.equal(now.length, Object.keys(legacyBefore).length, 'gamla planeringar har försvunnit')
  for (const r of now) assert.equal(r.content, legacyBefore[r.id], 'innehållet i en gammal planering ändrades')
  const { data: allRows } = await admin.from('veckoplanering').select('id').like('title', 'ÄLDRE%')
  assert.equal(allRows.length, legacyRows.length, 'fler eller färre gamla rader')
  await admin.from('veckoplanering').delete().in('id', legacyRows.map(r => r.id))
})

await check('inga sidfel i webbläsaren', async () => assert.deepEqual([...pageA.errors, ...pageBuser.errors], [], 'fel: ' + [...pageA.errors, ...pageBuser.errors].join(' | ')))
await cleanup()
await ctxA.close(); await ctxBuser.close()
await browser.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT BROWSERTEST MOT RIKTIG SUPABASE MISSLYCKADES' : 'ALLA BROWSERTESTER MOT RIKTIG SUPABASE GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
