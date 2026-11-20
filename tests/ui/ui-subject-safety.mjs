// Säkerhetskontroller för ämnen med FIKTIV Supabase-klient och testlagring. Körning: npm run test:ui:subject-safety
// Ingen produktionsdata, inga riktiga planeringar, inga externa anrop.
// Kontrollerar:
//  - migreringen från lokal lagring skapar inga dubbletter och tar inte bort gamla ämnen
//  - ämnen och kurser finns kvar efter omladdning, och på en annan dator (ny kontext med samma databas, utan lokal lagring)
//  - ett raderat ämne återkommer inte efter omladdning
//  - återställning av ett ämne bevarar kurser, klasser, kapitel, begrepp, lektioner och 21 veckor
//  - permanent radering påverkar inga andra ämnen eller kurser
//  - en förhandsgranskning av inklistrad planering tillämpas aldrig på en annan kurs
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'
const UID = '00000000-0000-4000-8000-000000000001'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 600)) } }

const weeks = (prefix) => Array.from({ length: 21 }, (_, i) => ({
  weekNumber: ((33 + i - 1) % 52) + 1, weekStart: '2026-08-10', title: 'Vecka ' + (i + 1), hidden: false,
  chapter: prefix + ' kapitel ' + (i + 1), vocabulary: [prefix + ' begrepp ' + (i + 1)],
  lessons: [{ id: prefix + 'L' + i, topics: [{ name: prefix + ' lektion ' + (i + 1) }] }],
}))
const row = (id, title, subject, schoolYear, data) => ({
  id, user_id: UID, title, subject, school_year: schoolYear,
  content: JSON.stringify({ kind: 'arsplanering-v2', title, subject, schoolYear, grade: '', textbook: '', entryType: 'lektion', studentColumns: 1, studentRows: 1, ...data }),
  weeks: (data.weeksData || []).length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z',
})
const seed = {
  veckoplanering: [
    row('old1', 'Matematik 2c', 'Matematik', 'Testår', { course: 'Matematik 2c', schoolForm: 'Gymnasieskola', textbook: 'fiktiv bok', weeksData: [] }),
    row('gy-sv', 'Svenska 1', 'Svenska', 'Testår', { course: 'Svenska 1', schoolForm: 'Gymnasieskola', weeksData: [] }),
    row('g-sv-a', 'Svenska åk 6', 'Svenska', 'Testår', { course: 'Svenska åk 6', schoolForm: 'Grundskola', grade: '6', classGroups: [{ name: '7A', pupils: 21 }], weeksData: weeks('A') }),
    row('g-sv-b', 'Svenska åk 6 B', 'Svenska', 'Testår', { course: 'Svenska åk 6 B', schoolForm: 'Grundskola', grade: '6', classGroups: [{ name: '7B' }], weeksData: weeks('B') }),
  ],
}
// Lokala mappar från en tidigare version. "matematik" med gement m och "Matematik" från kursen är samma ämne.
const legacyFolders = { [UID]: { Gymnasiet: ['matematik', 'Svenska'], Grundskola: ['Bild'] } }

const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let dialogMode = 'accept'
let lastDialog = ''
page.on('dialog', d => { lastDialog = d.message(); if (dialogMode === 'accept') d.accept(); else d.dismiss() })
await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await ctx.addInitScript(([s, folders]) => {
  localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', s)
  if (localStorage.getItem('arsplanering-subject-folders') === null) localStorage.setItem('arsplanering-subject-folders', folders)
}, [JSON.stringify(seed), JSON.stringify(legacyFolders)])
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const btn = text => page.locator('button:visible', { hasText: text }).first()
const dbRows = () => page.evaluate(() => window.__fake.store.veckoplanering.map(r => ({ ...r })))
const subjectRows = async () => (await dbRows()).filter(r => JSON.parse(r.content).kind === 'amne-v1')
const courseRows = async () => (await dbRows()).filter(r => JSON.parse(r.content).kind === 'arsplanering-v2')
const norm = v => String(v || '').trim().toLocaleLowerCase('sv')
async function goRoot() {
  const crumb = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' })
  if (await crumb.count()) { await crumb.first().evaluate(e => e.click()); await page.waitForTimeout(300) }
}
async function subjectLevel(school, subject) {
  await goRoot()
  await page.locator('button.library-folder:visible', { hasText: school }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: subject }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
}
async function reloadSame() {
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
}
// Ett innehåll utan arkivflaggan, för jämförelse före och efter arkivering och återställning.
const withoutArchive = obj => { const copy = JSON.parse(JSON.stringify(obj)); delete copy.archived; return copy }

let beforeOther = null
let beforeRestore = null
let dbAfterMigration = null

await check('migrering: inga dubbletter, inga förlorade ämnen, och lokala mappar tas bort efter säkerhetskopia', async () => {
  await page.waitForTimeout(800)
  const subs = await subjectRows()
  const keys = subs.map(r => { const d = JSON.parse(r.content); return norm(d.schoolForm) + '|' + norm(d.subject) })
  assert.equal(new Set(keys).size, keys.length, 'dubbletter: ' + keys.join(', '))
  const expected = ['gymnasiet|matematik', 'gymnasiet|svenska', 'grundskola|svenska', 'grundskola|bild'].sort()
  assert.deepEqual([...keys].sort(), expected, 'fel ämnen i databasen: ' + keys.join(', '))
  assert.equal((await courseRows()).length, 4, 'kurser ändrades vid migreringen')
  const local = await page.evaluate(uid => JSON.parse(localStorage.getItem('arsplanering-subject-folders') || '{}')[uid], UID)
  assert.equal(local, undefined, 'lokala mappar finns kvar som källa')
  const backup = await page.evaluate(uid => JSON.parse(localStorage.getItem('arsplanering-subject-folders-migrerade') || '{}')[uid], UID)
  assert.deepEqual(backup?.folders?.Grundskola, ['Bild'], 'säkerhetskopian saknas')
  dbAfterMigration = await dbRows()
})

await check('omladdning ger samma ämnen och kurser, inga nya dubbletter', async () => {
  await reloadSame()
  await reloadSame()
  const keys = (await subjectRows()).map(r => { const d = JSON.parse(r.content); return norm(d.schoolForm) + '|' + norm(d.subject) })
  assert.equal(keys.length, 4, 'antal ämnesrader efter omladdning: ' + keys.length)
  assert.equal(new Set(keys).size, 4, 'dubbletter efter omladdning')
})

await check('ett ämne som raderas permanent återkommer inte efter omladdning', async () => {
  await subjectLevel('Grundskola', 'Bild')
  await btn('Arkivera ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Bild' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(600)
  assert.equal((await subjectRows()).some(r => JSON.parse(r.content).subject === 'Bild'), false, 'Bild raderades inte')
  await btn('📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await reloadSame()
  await reloadSame()
  assert.equal((await subjectRows()).some(r => JSON.parse(r.content).subject === 'Bild'), false, 'Bild återkom efter omladdning')
  await goRoot()
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  assert.equal(await page.locator('button.library-folder:visible', { hasText: 'Bild' }).count(), 0, 'Bild syns i listan')
})

await check('återställning av ämnet bevarar kurser, klasser, kapitel, begrepp, lektioner och 21 veckor', async () => {
  const coursesOf = async () => (await courseRows()).filter(r => JSON.parse(r.content).subject === 'Svenska' && JSON.parse(r.content).schoolForm === 'Grundskola')
  beforeRestore = Object.fromEntries((await coursesOf()).map(r => [r.id, withoutArchive(JSON.parse(r.content))]))
  assert.equal(Object.keys(beforeRestore).length, 2, 'fel antal kurser före arkivering')
  for (const c of Object.values(beforeRestore)) assert.equal(c.weeksData.length, 21, 'kursen har inte 21 veckor')
  await subjectLevel('Grundskola', 'Svenska')
  await btn('Arkivera ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Svenska' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await btn('Återställ ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  const after = Object.fromEntries((await coursesOf()).map(r => [r.id, withoutArchive(JSON.parse(r.content))]))
  assert.deepEqual(after, beforeRestore, 'innehållet i kurserna ändrades vid arkivering och återställning')
  assert.ok(after['g-sv-a'].classGroups[0].name === '7A', 'klassen är borta')
})

await check('permanent radering av ett arkiverat ämne med två kurser påverkar inga andra ämnen eller kurser', async () => {
  const others = async () => (await dbRows()).filter(r => !(JSON.parse(r.content).subject === 'Svenska' && JSON.parse(r.content).schoolForm === 'Grundskola')).map(r => [r.id, r.content])
  beforeOther = await others()
  await subjectLevel('Grundskola', 'Svenska')
  await btn('Arkivera ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Svenska' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  dialogMode = 'dismiss'; lastDialog = ''
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(400)
  dialogMode = 'accept'
  assert.match(lastDialog, /A kapitel|Svenska åk 6/, 'bekräftelsen listar inte kurserna')
  assert.match(lastDialog, /21 veckor/, 'bekräftelsen saknar veckor')
  assert.match(lastDialog, /klasser: 7A/, 'bekräftelsen saknar klasserna')
  assert.match(lastDialog, /Andra ämnen/, 'bekräftelsen säger inte att andra ämnen påverkas inte')
  assert.ok((await dbRows()).some(r => JSON.parse(r.content).course === 'Svenska åk 6'), 'avbruten radering tog bort kurser')
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(800)
  assert.equal((await courseRows()).some(r => JSON.parse(r.content).schoolForm === 'Grundskola' && JSON.parse(r.content).subject === 'Svenska'), false, 'kurserna i ämnet finns kvar')
  const afterOther = await others()
  assert.deepEqual(afterOther, beforeOther, 'andra ämnen eller kurser påverkades av raderingen')
})

await check('förhandsgranskning av inklistrad planering tillämpas aldrig på en annan kurs', async () => {
  // Föregående test lämnar arkivet öppet. Vi går tillbaka till den aktiva listan först.
  if (await page.locator('button:visible', { hasText: '📂 Visa aktiva' }).count()) await btn('📂 Visa aktiva').evaluate(e => e.click())
  await subjectLevel('Gymnasiet', 'Matematik')
  await btn('＋ Ny kurs').evaluate(e => e.click())
  await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 9x')
  await dialog.locator('.material-paste textarea').fill('Fiktiv planering: vecka 1 om nämnare.')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForSelector('.import-preview', { timeout: 10000 })
  assert.equal(await page.locator('.import-preview').count(), 1, 'förhandsgranskningen visas inte för den nya kursen')
  // Öppna en annan kurs. Förhandsgranskningen får inte följa med dit.
  await subjectLevel('Gymnasiet', 'Matematik')
  await page.locator('.library-course-open:visible', { hasText: 'Matematik 2c' }).first().evaluate(e => e.click())
  await page.waitForSelector('#lararvy', { timeout: 20000 })
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.import-preview').count(), 0, 'förhandsgranskningen följde med till en annan kurs')
  const before = JSON.stringify((await courseRows()).find(r => r.id === 'old1'))
  assert.equal(before.includes('nämnare'), false, 'texten från den andra kursen lades i den gamla kursen')
})

// Annan dator: samma konto och databas, men ingen lokal lagring (ny webbläsarkontext).
await check('annan dator: ämnen och kurser syns efter inloggning, utan lokal lagring', async () => {
  const dbSnapshot = await page.evaluate(() => localStorage.getItem('fake-db'))
  assert.ok(dbSnapshot, 'ingen databas att flytta')
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const pageB = await ctxB.newPage()
  const errorsB = []
  pageB.on('pageerror', e => errorsB.push(e.message))
  pageB.on('dialog', d => d.accept())
  await ctxB.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await ctxB.addInitScript(db => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-db', db) }, dbSnapshot)
  await pageB.goto(base + '/', { waitUntil: 'networkidle' })
  await pageB.waitForTimeout(800)
  await pageB.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await pageB.waitForTimeout(300)
  assert.ok(await pageB.locator('button.library-folder:visible', { hasText: 'Matematik' }).count() >= 1, 'ämnet Matematik syns inte på den andra datorn')
  await pageB.locator('button.library-folder:visible', { hasText: 'Matematik' }).first().evaluate(e => e.click()); await pageB.waitForTimeout(300)
  assert.ok(await pageB.locator('.library-course-open:visible', { hasText: 'Matematik 2c' }).count() === 1, 'kursen Matematik 2c syns inte på den andra datorn')
  assert.equal(await pageB.evaluate(uid => JSON.parse(localStorage.getItem('arsplanering-subject-folders') || '{}')[uid], UID), undefined, 'testet använde lokal lagring')
  assert.deepEqual(errorsB, [], 'fel: ' + errorsB.join(' | '))
  await ctxB.close()
})

await check('filer som inte kan raderas visas för användaren, och kursen är borttagen', async () => {
  if (await page.locator('button:visible', { hasText: '📂 Visa aktiva' }).count()) await btn('📂 Visa aktiva').evaluate(e => e.click())
  await goRoot()
  await btn('Nytt ämne').evaluate(e => e.click())
  await page.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await page.locator('.library-subject-form select').selectOption('Gymnasiet')
  await page.locator('.library-subject-form input').fill('Fysik')
  await page.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await page.waitForTimeout(800)
  const dialog = await (async () => { await subjectLevel('Gymnasiet', 'Fysik'); await btn('Ny kurs').evaluate(e => e.click()); await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 }); return page.locator('[aria-label="Skapa ny kurs"]') })()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Fysik 1')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'radera-fel.txt', mimeType: 'text/plain', buffer: Buffer.from('Fiktiv fil som inte kan raderas') })
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  const path = (await courseRows()).find(r => JSON.parse(r.content).course === 'Fysik 1').content
  const stored = JSON.parse(path).materials[0].path
  await subjectLevel('Gymnasiet', 'Fysik')
  await btn('Arkivera').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Fysik' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('.library-course-actions button', { hasText: 'Radera' }).first().evaluate(e => e.click()); await page.waitForTimeout(800)
  const status = await page.locator('.status').first().innerText()
  assert.match(status, /kunde inte raderas från lagringen/, 'användaren får ingen varning: ' + status)
  assert.equal((await courseRows()).some(r => JSON.parse(r.content).course === 'Fysik 1'), false, 'kursraden finns kvar trots lyckad radering')
  assert.equal(await page.evaluate(p => Boolean(window.__fake.files[p]), stored), true, 'filen försvann trots att radering misslyckades')
})

await check('inga sidfel', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await ctx.close()
await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT SÄKERHETSTEST MISSLYCKADES' : 'ALLA SÄKERHETSTESTER GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
