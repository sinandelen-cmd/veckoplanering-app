// Material vid skapande av kurs och redigering av planering med FIKTIV Supabase-klient och testlagring.
// Körning: npm run test:ui:course-material
// Ingen produktionsdata, inga riktiga konton, inga externa anrop.
// Bifogade filer laddas upp först när kursen sparas. Testerna kontrollerar:
//  - "Lägg till kurs" i ett ämne sparar bifogad fil och inklistrad text med kursen
//  - en kurs kan skapas utan bilagor
//  - inklistrad text ger en förhandsgranskning, och veckor skrivs först när användaren väljer Använd import
//  - avbruten dialog, navigering bort och siduppdatering laddar inte upp något
//  - misslyckad uppladdning vid sparning skapar ingen kurs och lämnar inga filer kvar
//  - samma fil laddas inte upp flera gånger, och sparat material laddas inte upp igen
//  - borttagning av sparat material raderar filen först när planeringen sparas
//  - befintliga planeringar och deras material påverkas inte
//  - uppladdade filer kan öppnas efter omladdning och ny inloggning
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'
import { scrollThroughPlan } from './scroll-through.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'
const UID = '00000000-0000-4000-8000-000000000001'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 500)) } }

const FILE_NAME = 'kapitel-1.txt'
const FILE_TEXT = 'Fiktivt kapitel 1: bråk och procent.'
const PASTED_A = 'Fiktiv inklistrad text för Matematik 1a: uppgift om ekvationer.'
const PASTED_B = 'Fiktiv inklistrad text för Matematik 2b.'
const FILE_B = 'kurs-2b.txt'
const txt = (name, text = FILE_TEXT) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
const b64 = text => Buffer.from(text).toString('base64')

const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await ctxA.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let dialogMode = 'accept'
let lastDialog = ''
page.on('dialog', d => { lastDialog = d.message(); if (dialogMode === 'accept') d.accept(); else d.dismiss() })
await ctxA.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await ctxA.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [] }))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const btn = (text, scope = page) => scope.locator('button:visible', { hasText: text }).first()
const fakeUploads = name => page.evaluate(n => window.__fake.fakeLog.uploads.filter(x => x === n).length, name)
const fakeRemovals = path => page.evaluate(p => window.__fake.fakeLog.removals.includes(p), path)
const storedNames = () => page.evaluate(() => Object.values(window.__fake.files).map(f => f.name))
const storedPathExists = path => page.evaluate(p => Boolean(window.__fake.files[p]), path)
const rowsTitled = course => page.evaluate(c => window.__fake.store.veckoplanering.filter(r => JSON.parse(r.content || '{}').course === c).length, course)
const rowContent = course => page.evaluate(c => { const row = window.__fake.store.veckoplanering.find(r => JSON.parse(r.content || '{}').course === c); return row ? JSON.parse(row.content) : null }, course)

// Navigering i biblioteket med de nya nivåerna: Mina planeringar > skolform > ämne > kurs.
async function goRoot() {
  const crumb = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' })
  if (await crumb.count()) { await crumb.first().evaluate(e => e.click()); await page.waitForTimeout(300) }
}
async function goSubject(school = 'Gymnasiet', subject = 'Matematik') {
  await goRoot()
  await page.locator('button.library-folder:visible', { hasText: school }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: subject }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
}
async function createSubject(school, name) {
  await goRoot()
  await btn('Nytt ämne').evaluate(e => e.click())
  await page.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await page.locator('.library-subject-form select').selectOption(school)
  await page.locator('.library-subject-form input').fill(name)
  await page.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await page.waitForTimeout(600)
}
async function openCourse(name) {
  await goSubject()
  await page.locator('.library-course-open:visible', { hasText: name }).first().evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(300)
}
async function openCourseDialog() {
  await goSubject()
  await btn('Lägg till kurs').evaluate(e => e.click())
  await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 15000 })
  return page.locator('[aria-label="Skapa ny kurs"]')
}
async function leaveByCrumb() {
  await page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }).first().evaluate(e => e.click())
  await page.waitForTimeout(400)
}
// Kursen sparas automatiskt en kort stund efter ändringen. Testet väntar tills inga osparade ändringar finns kvar.
async function saveCourse() {
  await page.waitForTimeout(2200)
  await page.waitForFunction(() => !/Osparade ändringar/.test(document.body.innerText), null, { timeout: 15000 })
  await page.waitForTimeout(300)
}
async function expandMaterial() {
  await page.locator('details.material-disclosure > summary').evaluate(e => { if (!e.parentElement.open) e.click() })
  await page.waitForTimeout(200)
}
const courseMaterialNames = () => page.locator('details.material-disclosure .material-list li strong').allInnerTexts()
const courseAttach = () => page.locator('details.material-disclosure .material-attach input[type="file"]')
const pastedValue = () => page.locator('details.material-disclosure .material-paste textarea').inputValue()
async function readMaterialFile(name) {
  await expandMaterial()
  const popupPromise = ctxA.waitForEvent('page')
  await page.locator('details.material-disclosure .material-list li', { hasText: name }).locator('button', { hasText: 'Öppna' }).evaluate(e => e.click())
  const popup = await popupPromise
  await popup.waitForURL(/^blob:/, { timeout: 15000 })
  await popup.waitForLoadState('load').catch(() => {})
  const text = await popup.evaluate(() => document.body.innerText)
  await popup.close()
  assert.equal(page.url().startsWith(base), true, 'appen navigerade bort från sidan')
  return text
}
async function reloginAndReload() {
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600)
  await page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
}

await check('ämnet Matematik skapas i Gymnasiet utan kurser eller material', async () => {
  await createSubject('Gymnasiet', 'Matematik')
  assert.equal(await rowsTitled('Matematik 1a'), 0)
  // Efter att ämnet skapats visas ämnet direkt.
  assert.match(await page.locator('.library-title').first().innerText(), /Matematik/, 'ämnesvyn visas inte efter att ämnet skapats')
})

// 1. Lägg till kurs i ämnet: bifogad fil och inklistrad text sparas med kursen. Inget laddas upp innan kursen sparas.
await check('Lägg till kurs: bifogad fil och inklistrad text sparas med kursen', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 1a')
  await dialog.locator('input[type="file"]').setInputFiles(txt(FILE_NAME))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  assert.equal(await fakeUploads(FILE_NAME), 0, 'filen laddades upp innan kursen sparades')
  await dialog.locator('.material-paste textarea').fill(PASTED_A)
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [FILE_NAME], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_A, 'inklistrad text sparades inte med kursen')
  assert.equal(await fakeUploads(FILE_NAME), 1, 'filen laddades inte upp exakt en gång')
  assert.ok((await storedNames()).includes(FILE_NAME), 'filen finns inte i lagringen')
  assert.equal((await rowContent('Matematik 1a')).weeksData.length, 21, 'kursen har inte 21 veckor')
})

await check('Lägg till kurs: en andra kurs med bifogad fil och inklistrad text', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 2b')
  await dialog.locator('input[type="file"]').setInputFiles(txt(FILE_B))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await dialog.locator('.material-paste textarea').fill(PASTED_B)
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [FILE_B], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text sparades inte med kursen')
})

await check('en kurs kan skapas utan att något bifogas', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 3c')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [], 'en kurs utan bilagor ska inte ha något material')
  assert.equal(await pastedValue(), '', 'en kurs utan text ska ha tomt textfält')
})

// 4. Inklistrad text: förhandsgranskning visas, och veckor skrivs först när användaren väljer Använd import.
await check('inklistrad text ger en förhandsgranskning, och originaltexten finns kvar efter import', async () => {
  await openCourse('Matematik 1a')
  await expandMaterial()
  await btn('Skapa veckor av inklistrad text', page.locator('details.material-disclosure')).evaluate(e => e.click())
  await page.waitForSelector('.import-preview', { timeout: 10000 })
  assert.equal(await page.locator('.import-preview').count(), 1, 'fler än en förhandsgranskning visas')
  assert.match(await page.locator('.import-preview').innerText(), /Inget har ändrats ännu/, 'förhandsgranskningen säger inte att inget ändrats')
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann vid förhandsgranskningen')
  await btn('Använd import', page.locator('.import-preview')).evaluate(e => e.click())
  await page.waitForTimeout(500)
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann när veckor skapades')
  // Kursen har 21 veckor och importen fyller den första. Veckorna renderas lazt, så vi går igenom hela planeringen först.
  // Klara veckor visas dolda bakom en knapp. Vi öppnar dem så att importerade moment syns.
  for (const b of await page.locator('button:visible', { hasText: 'klara veckor' }).all()) await b.evaluate(e => e.click()).catch(() => {})
  await page.waitForTimeout(300)
  await scrollThroughPlan(page)
  assert.match(await page.locator('#lararvy').innerText(), /ekvationer/, 'importen skapade inga veckor med texten')
})

// 4b. Import över ifyllda veckor kräver tydlig bekräftelse, och avbryt ändrar inte veckorna.
await check('import över ifyllda veckor frågar vilka veckor som ersätts, och avbryt ändrar ingenting', async () => {
  await openCourse('Matematik 1a')
  const before = JSON.stringify((await rowContent('Matematik 1a')).weeksData)
  await expandMaterial()
  await btn('Skapa veckor av inklistrad text', page.locator('details.material-disclosure')).evaluate(e => e.click())
  await page.waitForSelector('.import-preview', { timeout: 10000 })
  dialogMode = 'dismiss'; lastDialog = ''
  await btn('Använd import', page.locator('.import-preview')).evaluate(e => e.click())
  await page.waitForTimeout(500)
  dialogMode = 'accept'
  assert.match(lastDialog, /ifyllda/, 'bekräftelsen säger inte att ifyllda veckor ersätts: ' + lastDialog)
  assert.match(lastDialog, /vecka \d+/, 'bekräftelsen nämner inte vilka veckor: ' + lastDialog)
  assert.equal(JSON.stringify((await rowContent('Matematik 1a')).weeksData), before, 'veckorna ändrades trots avbrott')
})

// 5. Avbruten dialog: Tillbaka laddar inte upp något.
await check('avbruten kursdialog laddar inte upp något', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('input[type="file"]').setInputFiles(txt('ej-sparad.txt'))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await dialog.locator('button', { hasText: 'Tillbaka' }).evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.equal(await fakeUploads('ej-sparad.txt'), 0, 'den avbrutna filen laddades upp')
  assert.ok(!(await storedNames()).includes('ej-sparad.txt'), 'den avbrutna filen ligger i lagringen')
  const dialog2 = await openCourseDialog()
  assert.equal(await dialog2.locator('.material-list li').count(), 0, 'avbrutna filer ligger kvar i en ny dialog')
  await dialog2.locator('button', { hasText: 'Tillbaka' }).evaluate(e => e.click())
  await page.waitForTimeout(300)
})

// 6. Navigering bort utan att spara.
await check('navigering bort från dialogen utan att spara laddar inte upp något', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('input[type="file"]').setInputFiles(txt('lamnad.txt'))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await leaveByCrumb()
  assert.equal(await page.locator('[aria-label="Skapa ny kurs"]:visible').count(), 0, 'dialogen är kvar efter navigering')
  assert.equal(await fakeUploads('lamnad.txt'), 0, 'filen laddades upp utan att kursen sparades')
  assert.ok(!(await storedNames()).includes('lamnad.txt'), 'filen ligger kvar i lagringen')
})

// 7. Siduppdatering med dialogen öppen.
await check('siduppdatering med dialogen öppen laddar inte upp något', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('input[type="file"]').setInputFiles(txt('omladdad.txt'))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await reloginAndReload()
  assert.equal(await fakeUploads('omladdad.txt'), 0, 'filen laddades upp före sparning')
  assert.ok(!(await storedNames()).includes('omladdad.txt'), 'filen ligger i lagringen efter siduppdatering')
})

// 8. Misslyckad uppladdning vid sparning.
await check('misslyckad uppladdning vid sparning skapar ingen kurs och lämnar inga filer kvar', async () => {
  const dialog = await openCourseDialog()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 4d')
  await dialog.locator('input[type="file"]').setInputFiles([txt('ok-fil.txt'), txt('[fel] rapport.txt')])
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Skapa ny kurs"] .material-list li').length === 2, null, { timeout: 15000 })
  const rowsBefore = await rowsTitled('Matematik 4d')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForFunction(() => /Kunde inte skapa/.test(document.querySelector('[aria-label="Skapa ny kurs"]')?.innerText || ''), null, { timeout: 15000 })
  assert.equal(await rowsTitled('Matematik 4d'), rowsBefore, 'en kurs sparades trots att uppladdningen misslyckades')
  assert.ok(!(await storedNames()).includes('ok-fil.txt'), 'den lyckade filen från det misslyckade försöket ligger kvar')
  await dialog.locator('.material-list li', { hasText: '[fel]' }).locator('button', { hasText: 'Ta bort' }).evaluate(e => e.click())
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  assert.equal(await rowsTitled('Matematik 4d'), rowsBefore + 1, 'kursen sparades inte vid nytt försök')
  assert.equal((await storedNames()).filter(n => n === 'ok-fil.txt').length, 1, 'filen finns inte exakt en gång i lagringen')
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), ['ok-fil.txt'], 'fel material sparades')
})

// 9. Samma fil laddas inte upp flera gånger, och sparat material laddas inte upp igen.
await check('samma fil laddas inte upp flera gånger, och sparat material laddas inte upp igen', async () => {
  await openCourse('Matematik 4d')
  await expandMaterial()
  await courseAttach().setInputFiles(txt('enda.txt'))
  await page.waitForFunction(() => [...document.querySelectorAll('details.material-disclosure .material-list li strong')].some(e => e.textContent === 'enda.txt'), null, { timeout: 15000 })
  await courseAttach().setInputFiles(txt('enda.txt'))
  await page.waitForFunction(() => /är redan bifogad/.test(document.body.innerText), null, { timeout: 15000 })
  await saveCourse()
  assert.equal(await fakeUploads('enda.txt'), 1, 'filen laddades inte upp exakt en gång')
  await page.locator('details.material-disclosure .material-paste textarea').fill('Ny text för Matematik 4d.')
  await saveCourse()
  await saveCourse()
  assert.equal(await fakeUploads('enda.txt'), 1, 'sparat material laddades upp igen')
})

// 10. Borttagning raderar inte filen förrän planeringen sparas.
await check('borttagning av sparat material raderar filen först när planeringen sparas', async () => {
  await openCourse('Matematik 4d')
  const content = await rowContent('Matematik 4d')
  const okMaterial = content.materials.find(m => m.name === 'ok-fil.txt')
  assert.ok(okMaterial?.path, 'materialet ok-fil.txt saknar sökväg i planeringen')
  await expandMaterial()
  await page.locator('details.material-disclosure .material-list li', { hasText: 'ok-fil.txt' }).locator('button', { hasText: 'Ta bort' }).evaluate(e => e.click())
  await page.waitForTimeout(200)
  assert.equal(await fakeRemovals(okMaterial.path), false, 'filen raderades innan planeringen sparades')
  assert.equal(await storedPathExists(okMaterial.path), true, 'filen försvann innan planeringen sparades')
  await saveCourse()
  assert.equal(await fakeRemovals(okMaterial.path), true, 'filen raderades inte efter sparning')
  assert.equal(await storedPathExists(okMaterial.path), false, 'filen finns kvar efter sparning')
  const after = await rowContent('Matematik 4d')
  assert.ok(!after.materials.some(m => m.name === 'ok-fil.txt'), 'materialet finns kvar i planeringen efter sparning')
  assert.ok(after.materials.some(m => m.name === 'enda.txt'), 'annat material i samma planering påverkades')
})

// 11. Öppning efter omladdning och ny inloggning.
await check('uppladdade filer kan öppnas efter omladdning och ny inloggning', async () => {
  await reloginAndReload()
  await openCourse('Matematik 1a')
  assert.equal(await readMaterialFile(FILE_NAME).then(t => t.includes('bråk')), true, 'filen kunde inte öppnas efter ny inloggning')
  await openCourse('Matematik 4d')
  assert.equal(await readMaterialFile('enda.txt').then(t => t.includes('bråk')), true, 'enda.txt kunde inte öppnas efter ny inloggning')
  await openCourse('Matematik 2b')
  assert.equal(await readMaterialFile(FILE_B).then(t => t.includes('bråk')), true, 'kurs-2b.txt kunde inte öppnas efter ny inloggning')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text försvann efter ny inloggning')
})
// 12. PDF, Word och Excel: texten läses ut, förhandsgranskning visas, och filerna öppnas efter ny inloggning.
await check('PDF, Word och Excel läses, ger förhandsgranskning och går att öppna efter ny inloggning', async () => {
  const fs = require('node:fs')
  const XLSX = require('xlsx')
  const pdf = fs.readFileSync(new URL('./fixtures/planering.pdf', import.meta.url))
  const docx = fs.readFileSync(new URL('./fixtures/planering.docx', import.meta.url))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kapitel', 'Delmoment'], ['Algebra', 'Ekvationer'], ['Geometri', 'Vinklar']]), 'Kapitel')
  const xlsx = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const dialog = await openCourseDialog()
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 5f')
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'planering.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'planering.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx },
    { name: 'kapitel.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx },
  ])
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Skapa ny kurs"] .material-list li').length === 3, null, { timeout: 30000 })
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(500)
  const stored = await rowContent('Matematik 5f')
  assert.ok(stored, 'kursen sparades inte')
  const byName = Object.fromEntries(stored.materials.map(m => [m.name, m]))
  assert.match(byName['planering.pdf']?.text || '', /brak/i, 'texten i PDF:en lästes inte: ' + (byName['planering.pdf']?.note || ''))
  assert.match(byName['planering.docx']?.text || '', /procent/i, 'texten i Word-filen lästes inte: ' + (byName['planering.docx']?.note || ''))
  assert.match(byName['kapitel.xlsx']?.text || '', /Ekvationer/, 'texten i Excel-filen lästes inte: ' + (byName['kapitel.xlsx']?.note || ''))
  assert.equal(await fakeUploads('planering.pdf'), 1, 'PDF laddades inte upp exakt en gång')
  // Förhandsgranskning av PDF:en: veckor skrivs först efter att användaren väljer Använd import.
  await expandMaterial()
  const weeksBefore = JSON.stringify((await rowContent('Matematik 5f')).weeksData)
  await page.locator('details.material-disclosure .material-list li', { hasText: 'planering.pdf' }).locator('button', { hasText: 'Skapa veckor av texten' }).evaluate(e => e.click())
  await page.waitForSelector('.import-preview', { timeout: 10000 })
  assert.match(await page.locator('.import-preview').innerText(), /planering\.pdf|Förhandsgranska/, 'ingen förhandsgranskning för PDF')
  await btn('Avbryt', page.locator('.import-preview')).evaluate(e => e.click())
  await page.waitForTimeout(300)
  await saveCourse()
  assert.equal(JSON.stringify((await rowContent('Matematik 5f')).weeksData), weeksBefore, 'veckorna ändrades trots att importen avbröts')
  // Efter ny inloggning går alla tre filer att öppna.
  await reloginAndReload()
  await openCourse('Matematik 5f')
  for (const name of ['planering.pdf', 'planering.docx', 'kapitel.xlsx']) {
    await expandMaterial()
    const popupPromise = ctxA.waitForEvent('page')
    await page.locator('details.material-disclosure .material-list li', { hasText: name }).locator('button', { hasText: 'Öppna' }).evaluate(e => e.click())
    const popup = await popupPromise
    // PDF visas i webbläsaren. Word och Excel visas inte, utan laddas ner, så där kontrollerar vi lagrad storlek i stället.
    await page.waitForTimeout(800)
    if (name.endsWith('.pdf')) assert.match(popup.url(), /^blob:/, name + ' öppnades inte från lagringen: ' + popup.url())
    await popup.close().catch(() => {})
    const stored = await rowContent('Matematik 5f')
    const material = stored.materials.find(m => m.name === name)
    const storedBytes = await page.evaluate(path => { const f = window.__fake.files[path]; return f ? Math.floor((f.dataUrl.split(',')[1] || '').length * 3 / 4) : 0 }, material.path)
    const original = { 'planering.pdf': pdf.length, 'planering.docx': docx.length, 'kapitel.xlsx': xlsx.length }[name]
    assert.ok(Math.abs(storedBytes - original) <= 4, name + ' har fel storlek i lagringen: ' + storedBytes + ' ≠ ' + original)
  }
})
await check('inga sidfel i konto A', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await ctxA.close()

// Konto B: befintliga planeringar med sparat material. Ändringar i en planering får inte påverka den andra.
const seedB = {
  veckoplanering: [
    { id: 'row-mat5', user_id: UID, title: 'Matematik 5e', subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Matematik 5e', subject: 'Matematik', schoolForm: 'Gymnasieskola', schoolYear: 'Testår', grade: '', course: 'Matematik 5e', textbook: '', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData: [], pastedMaterial: 'Befintlig text.', materials: [{ id: 'm-gammal', name: 'gammal.txt', ext: 'txt', size: 12, path: `${UID}/gammal.txt`, text: 'Gammal text', note: '', addedAt: '2026-08-01T00:00:00Z' }] }), weeks: 0, published: false, public_slug: null, created_at: '2026-08-01T08:00:00Z', updated_at: '2026-08-01T08:00:00Z' },
    { id: 'row-sv5', user_id: UID, title: 'Svenska 5e', subject: 'Svenska', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Svenska 5e', subject: 'Svenska', schoolForm: 'Gymnasieskola', schoolYear: 'Testår', grade: '', course: 'Svenska 5e', textbook: '', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData: [], materials: [{ id: 'm-sv', name: 'svenska.txt', ext: 'txt', size: 12, path: `${UID}/svenska.txt`, text: 'Svensk text', note: '', addedAt: '2026-08-01T00:00:00Z' }] }), weeks: 0, published: false, public_slug: null, created_at: '2026-08-01T08:00:00Z', updated_at: '2026-08-01T08:00:00Z' },
  ],
}
const seededFiles = {
  [`${UID}/gammal.txt`]: { name: 'gammal.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,' + b64('Gammal text') },
  [`${UID}/svenska.txt`]: { name: 'svenska.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,' + b64('Svensk text') },
}
const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const pageB = await ctxB.newPage()
const errorsB = []
pageB.on('pageerror', e => errorsB.push(e.message))
pageB.on('dialog', d => d.accept())
await ctxB.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await ctxB.addInitScript(([seed, files]) => {
  localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', seed)
  if (localStorage.getItem('fake-files') === null) localStorage.setItem('fake-files', files)
}, [JSON.stringify(seedB), JSON.stringify(seededFiles)])
await pageB.goto(base + '/', { waitUntil: 'networkidle' })
await pageB.waitForTimeout(400)
const pageBContent = async title => JSON.parse((await pageB.evaluate(t => window.__fake.store.veckoplanering.find(r => r.title === t), title)).content)
const pageBFileExists = path => pageB.evaluate(p => Boolean(window.__fake.files[p]), path)
const pageBRemoved = path => pageB.evaluate(p => window.__fake.fakeLog.removals.includes(p), path)
const pageBBtn = (text, scope = pageB) => scope.locator('button:visible', { hasText: text }).first()
async function openCourseB(course, subject, school = 'Gymnasiet') {
  const crumb = pageB.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' })
  if (await crumb.count()) { await crumb.first().evaluate(e => e.click()); await pageB.waitForTimeout(300) }
  await pageB.locator('button.library-folder:visible', { hasText: school }).first().evaluate(e => e.click()); await pageB.waitForTimeout(300)
  await pageB.locator('button.library-folder:visible', { hasText: subject }).first().evaluate(e => e.click()); await pageB.waitForTimeout(300)
  await pageB.locator('.library-course-open:visible', { hasText: course }).first().evaluate(e => e.click())
  await pageB.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await pageB.waitForTimeout(300)
}
const expandB = async () => { await pageB.locator('details.material-disclosure > summary').evaluate(e => { if (!e.parentElement.open) e.click() }); await pageB.waitForTimeout(200) }
const materialListB = () => pageB.locator('details.material-disclosure .material-list li strong').allInnerTexts()

await check('befintliga planeringar: ändring i en påverkar inte material i en annan', async () => {
  await openCourseB('Matematik 5e', 'Matematik')
  await expandB()
  assert.deepEqual(await materialListB(), ['gammal.txt'], 'det befintliga materialet visas inte')
  await pageB.locator('details.material-disclosure .material-paste textarea').fill('Befintlig text ändrad.')
  await pageB.waitForTimeout(2200)
  await pageB.waitForFunction(() => !/Osparade ändringar/.test(document.body.innerText), null, { timeout: 15000 })
  assert.deepEqual(await materialListB(), ['gammal.txt'], 'materialet försvann vid vanlig sparning')
  assert.equal(await pageBFileExists(`${UID}/gammal.txt`), true, 'filen raderades vid vanlig sparning')
  assert.equal((await pageBContent('Matematik 5e')).pastedMaterial, 'Befintlig text ändrad.', 'texten sparades inte')
  assert.equal(await pageBFileExists(`${UID}/svenska.txt`), true, 'filen i den andra planeringen påverkades')
  assert.equal((await pageBContent('Svenska 5e')).materials.length, 1, 'materialet i den andra planeringen påverkades')
})

await check('borttagning i en planering raderar bara den filen, och bara efter sparning', async () => {
  await pageB.locator('details.material-disclosure .material-list li', { hasText: 'gammal.txt' }).locator('button', { hasText: 'Ta bort' }).evaluate(e => e.click())
  await pageB.waitForTimeout(200)
  assert.equal(await pageBRemoved(`${UID}/gammal.txt`), false, 'filen raderades innan planeringen sparades')
  await pageB.waitForTimeout(2200)
  await pageB.waitForFunction(() => !/Osparade ändringar/.test(document.body.innerText), null, { timeout: 15000 })
  assert.equal(await pageBRemoved(`${UID}/gammal.txt`), true, 'filen raderades inte efter sparning')
  assert.equal((await pageBContent('Matematik 5e')).materials.length, 0, 'materialet finns kvar i planeringen')
  assert.equal(await pageBFileExists(`${UID}/svenska.txt`), true, 'den andra planeringens fil raderades')
})

await check('befintligt material i en annan planering kan öppnas efter omladdning och ny inloggning', async () => {
  await pageB.reload({ waitUntil: 'networkidle' })
  await pageB.waitForTimeout(600)
  await pageB.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await pageB.reload({ waitUntil: 'networkidle' })
  await pageB.waitForTimeout(800)
  await openCourseB('Svenska 5e', 'Svenska')
  await expandB()
  assert.deepEqual(await materialListB(), ['svenska.txt'], 'svenska.txt saknas efter ny inloggning')
  const popupPromise = ctxB.waitForEvent('page')
  await pageB.locator('details.material-disclosure .material-list li', { hasText: 'svenska.txt' }).locator('button', { hasText: 'Öppna' }).evaluate(e => e.click())
  const popup = await popupPromise
  await popup.waitForURL(/^blob:/, { timeout: 15000 })
  await popup.waitForLoadState('load').catch(() => {})
  assert.equal(await popup.evaluate(() => document.body.innerText), 'Svensk text', 'filen har fel innehåll efter ny inloggning')
  await popup.close()
})
await check('inga sidfel i konto B', async () => assert.deepEqual(errorsB, [], 'fel: ' + errorsB.join(' | ')))
await ctxB.close()
await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT MATERIALTEST MISSLYCKADES' : 'ALLA MATERIALTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
