// Material vid skapande och redigering av planering med FIKTIV Supabase-klient och testlagring.
// Körning: npm run test:ui:course-material
// Ingen produktionsdata, inga riktiga konton, inga externa anrop.
// Bifogade filer laddas upp först när planeringen sparas. Testerna kontrollerar:
//  - "Skapa planering" och "Ny kurs" sparar bifogad fil och inklistrad text med kursen
//  - en kurs kan skapas utan bilagor
//  - inklistrad text används för att skapa veckor, och originaltexten finns kvar
//  - avbrutet formulär, navigering bort och siduppdatering laddar inte upp något
//  - misslyckad uppladdning vid sparning sparar ingen planering och lämnar inga filer kvar
//  - samma fil laddas inte upp flera gånger, och sparat material laddas inte upp igen
//  - borttagning av sparat material raderar filen först när planeringen sparas
//  - befintliga planeringar och deras material påverkas inte
//  - uppladdade filer kan öppnas efter omladdning och ny inloggning
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
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 500)) } }

const FILE_NAME = 'kapitel-1.txt'
const FILE_TEXT = 'Fiktivt kapitel 1: bråk och procent.'
const PASTED_A = 'Fiktiv inklistrad text för Matematik 1a: uppgift om ekvationer.'
const PASTED_B = 'Fiktiv inklistrad text för Matematik 2b.'
const FILE_B = 'kurs-2b.txt'
const txt = (name, text = FILE_TEXT) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
const b64 = text => Buffer.from(text).toString('base64')

// Konto A: ny, tom testdatabas. Körs i en följd som bygger på varandra.
const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await ctxA.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())
await ctxA.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await ctxA.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [] }))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const btn = (text, scope = page) => scope.locator('button:visible', { hasText: text }).first()
const fakeUploads = name => page.evaluate(n => window.__fake.fakeLog.uploads.filter(x => x === n).length, name)
const fakeRemovals = path => page.evaluate(p => window.__fake.fakeLog.removals.includes(p), path)
const storedNames = () => page.evaluate(() => Object.values(window.__fake.files).map(f => f.name))
const storedPathExists = path => page.evaluate(p => Boolean(window.__fake.files[p]), path)
const rowsTitled = title => page.evaluate(t => window.__fake.store.veckoplanering.filter(r => r.title === t).length, title)
const rowContent = title => page.evaluate(t => { const row = window.__fake.store.veckoplanering.find(r => r.title === t); return row ? JSON.parse(row.content) : null }, title)

async function openLibrary() {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button:visible', { hasText: 'Ny kurs' }).count() || await page.locator('button:visible', { hasText: '📚 Matematik' }).count()) return
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) return
    await back.evaluate(e => e.click()); await page.waitForTimeout(400)
  }
}
async function goToSubject(subject = 'Matematik', expectCourses = true) {
  await openLibrary()
  const ready = async () => (await page.locator('button:visible', { hasText: new RegExp('^📁 ' + subject) }).count()) > 0
    || (!expectCourses && (await page.locator('button:visible', { hasText: 'Ny kurs' }).count()) > 0)
  if (await ready()) return
  if (!(await page.locator('button:visible', { hasText: '📚 ' + subject }).count())) { await btn('Gymnasiet').evaluate(e => e.click()).catch(() => {}); await page.waitForTimeout(400) }
  if (!(await ready())) { await page.locator('button:visible', { hasText: '📚 ' + subject }).first().evaluate(e => e.click()); await page.waitForTimeout(400) }
}
async function openCourse(course, subject = 'Matematik') {
  await openLibrary()
  await goToSubject(subject)
  await btn(course).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(300)
}
async function openNewForm() {
  await openLibrary()
  await btn('Ny planering').evaluate(e => e.click())
  await page.waitForSelector('.simple-setup-card form', { timeout: 15000 })
  return page.locator('.simple-setup-card')
}
async function fillForm(card, title, school, subject) {
  await card.locator('label', { hasText: 'Kursens namn' }).locator('input').fill(title)
  await card.locator('select').selectOption(school)
  await card.locator('input[list="planning-subject-choices"]').fill(subject)
}
// Lämnar formuläret utan att klicka Avbryt, via en navigeringsknapp i appen.
async function leaveForm() {
  for (const label of ['Mina planeringar', 'Bibliotek', '← ']) {
    if (await page.locator('button:visible', { hasText: label }).count()) {
      await page.locator('button:visible', { hasText: label }).first().evaluate(e => e.click())
      await page.waitForTimeout(500)
      return
    }
  }
  throw new Error('ingen navigeringsknapp hittades')
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
// Öppnar ett bifogat material i nytt fönster och läser dess innehåll.
async function readMaterialFile(name) {
  await expandMaterial()
  const popupPromise = ctxA.waitForEvent('page')
  await page.locator('details.material-disclosure .material-list li', { hasText: name }).locator('button', { hasText: 'Öppna' }).evaluate(e => e.click())
  const popup = await popupPromise
  await popup.waitForURL(/^blob:/, { timeout: 15000 })
  await popup.waitForLoadState('load').catch(() => {})
  const text = await popup.evaluate(() => document.body.innerText)
  if (!text.includes(FILE_TEXT)) console.log('  DEBUG popup', name, JSON.stringify(text.slice(0, 200)), popup.url().slice(0, 40))
  await popup.close()
  assert.equal(page.url().startsWith(base), true, 'appen navigerade bort från sidan')
  return text
}
async function reloginAndReload() {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
}

// 1. Skapa planering: filen och texten sparas med kursen. Inget laddas upp innan sparningen.
await check('Skapa planering: bifogad fil och inklistrad text sparas med den nya kursen', async () => {
  const card = await openNewForm()
  await fillForm(card, 'Matematik 1a', 'Gymnasiet', 'Matematik')
  await card.locator('.material-attach input[type="file"]').setInputFiles(txt(FILE_NAME))
  await page.waitForSelector('.simple-setup-card .material-list li', { timeout: 15000 })
  assert.equal(await fakeUploads(FILE_NAME), 0, 'filen laddades upp redan innan planeringen sparades')
  await card.locator('.material-paste textarea').fill(PASTED_A)
  await card.locator('button[type="submit"]').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [FILE_NAME], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_A, 'inklistrad text sparades inte med kursen')
  assert.equal(await fakeUploads(FILE_NAME), 1, 'filen laddades inte upp exakt en gång')
  assert.ok((await storedNames()).includes(FILE_NAME), 'filen finns inte i lagringen')
})

// 2. Ny kurs i ämnet: samma möjlighet i dialogen.
await check('Ny kurs i ämnet: bifogad fil och inklistrad text sparas med kursen', async () => {
  await openLibrary()
  await goToSubject('Matematik', false)
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForTimeout(300)
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  assert.equal(await dialog.locator('input[type="file"]').count(), 1, 'filuppladdningen saknas i kursdialogen')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 2b')
  await dialog.locator('input[type="file"]').setInputFiles(txt(FILE_B))
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  assert.equal(await fakeUploads(FILE_B), 0, 'filen i kursdialogen laddades upp före sparning')
  await dialog.locator('.material-paste textarea').fill(PASTED_B)
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [FILE_B], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text sparades inte med kursen')
})

// 3. Kurs utan bilagor.
await check('en kurs kan skapas utan att något bifogas', async () => {
  await openLibrary()
  await goToSubject('Matematik', false)
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForTimeout(300)
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 3c')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await expandMaterial()
  assert.deepEqual(await courseMaterialNames(), [], 'en kurs utan bilagor ska inte ha något material')
  assert.equal(await pastedValue(), '', 'en kurs utan text ska ha tomt textfält')
})

// 4. Inklistrad text: importen skapar veckor och originaltexten finns kvar.
await check('inklistrad text används för att skapa veckor, och originaltexten finns kvar', async () => {
  await openCourse('Matematik 1a')
  await expandMaterial()
  await btn('Skapa veckor av inklistrad text', page.locator('details.material-disclosure')).evaluate(e => e.click())
  await page.waitForTimeout(500)
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann vid förhandsgranskningen')
  await btn('Använd import').evaluate(e => e.click())
  await page.waitForTimeout(500)
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann när veckor skapades')
  assert.match(await page.locator('#lararvy').innerText(), /ekvationer/, 'importen skapade inga veckor med texten')
})

// 5. Avbruten: Avbryt laddar inte upp något och lämnar inget kvar.
await check('avbrutet formulär laddar inte upp något', async () => {
  const card = await openNewForm()
  await card.locator('.material-attach input[type="file"]').setInputFiles(txt('ej-sparad.txt'))
  await page.waitForSelector('.simple-setup-card .material-list li', { timeout: 15000 })
  await card.locator('button', { hasText: 'Avbryt' }).evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.equal(await fakeUploads('ej-sparad.txt'), 0, 'den avbrutna filen laddades upp')
  assert.ok(!(await storedNames()).includes('ej-sparad.txt'), 'den avbrutna filen ligger i lagringen')
  const card2 = await openNewForm()
  assert.equal(await card2.locator('.material-list li').count(), 0, 'avbrutna filer ligger kvar i ett nytt formulär')
  await card2.locator('button', { hasText: 'Avbryt' }).evaluate(e => e.click())
  await page.waitForTimeout(300)
})

// 6. Navigering bort utan att spara.
await check('navigering bort från formuläret utan att spara laddar inte upp något', async () => {
  const card = await openNewForm()
  await card.locator('.material-attach input[type="file"]').setInputFiles(txt('lamnad.txt'))
  await page.waitForSelector('.simple-setup-card .material-list li', { timeout: 15000 })
  await leaveForm()
  assert.equal(await page.locator('.simple-setup-card:visible').count(), 0, 'formuläret är kvar efter navigering')
  assert.equal(await fakeUploads('lamnad.txt'), 0, 'filen laddades upp utan att planeringen sparades')
  assert.ok(!(await storedNames()).includes('lamnad.txt'), 'filen ligger kvar i lagringen')
  const card2 = await openNewForm()
  assert.equal(await card2.locator('.material-list li').count(), 0, 'filen ligger kvar i ett nytt formulär')
  await card2.locator('button', { hasText: 'Avbryt' }).evaluate(e => e.click())
  await page.waitForTimeout(300)
})

// 7. Siduppdatering före sparning.
await check('siduppdatering före sparning laddar inte upp något', async () => {
  const card = await openNewForm()
  await card.locator('.material-attach input[type="file"]').setInputFiles(txt('omladdad.txt'))
  await page.waitForSelector('.simple-setup-card .material-list li', { timeout: 15000 })
  await reloginAndReload()
  assert.equal(await fakeUploads('omladdad.txt'), 0, 'filen laddades upp före sparning')
  assert.ok(!(await storedNames()).includes('omladdad.txt'), 'filen ligger i lagringen efter siduppdatering')
})

// 8. Misslyckad uppladdning vid sparning.
await check('misslyckad uppladdning vid sparning sparar ingen planering och lämnar inga filer kvar', async () => {
  const card = await openNewForm()
  await fillForm(card, 'Matematik 4d', 'Gymnasiet', 'Matematik')
  await card.locator('.material-attach input[type="file"]').setInputFiles([txt('ok-fil.txt'), txt('[fel] rapport.txt')])
  await page.waitForFunction(() => document.querySelectorAll('.simple-setup-card .material-list li').length === 2, null, { timeout: 15000 })
  const rowsBefore = await rowsTitled('Matematik 4d')
  await card.locator('button[type="submit"]').evaluate(e => e.click())
  await page.waitForFunction(() => /Kunde inte spara/.test(document.body.innerText), null, { timeout: 15000 })
  assert.equal(await rowsTitled('Matematik 4d'), rowsBefore, 'en planering sparades trots att uppladdningen misslyckades')
  assert.ok(!(await storedNames()).includes('ok-fil.txt'), 'den lyckade filen från det misslyckade försöket ligger kvar')
  // Ta bort den misslyckade filen och spara igen. Den lyckade filen laddas upp en gång till i det nya försöket.
  await card.locator('.material-list li', { hasText: '[fel]' }).locator('button', { hasText: 'Ta bort' }).evaluate(e => e.click())
  await card.locator('button[type="submit"]').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  assert.equal(await rowsTitled('Matematik 4d'), rowsBefore + 1, 'planeringen sparades inte vid nytt försök')
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
  assert.equal(await readMaterialFile(FILE_NAME).then(t => t.includes(FILE_TEXT)), true, 'filen kunde inte öppnas efter ny inloggning')
  await openCourse('Matematik 4d')
  assert.equal(await readMaterialFile('enda.txt').then(t => t.includes(FILE_TEXT)), true, 'enda.txt kunde inte öppnas efter ny inloggning')
  await openCourse('Matematik 2b')
  assert.equal(await readMaterialFile(FILE_B).then(t => t.includes(FILE_TEXT)), true, 'kurs-2b.txt kunde inte öppnas efter ny inloggning')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text försvann efter ny inloggning')
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
const pageBRows = title => pageB.evaluate(t => window.__fake.store.veckoplanering.find(r => r.title === t), title)
const pageBContent = async title => JSON.parse((await pageBRows(title)).content)
const pageBFileExists = path => pageB.evaluate(p => Boolean(window.__fake.files[p]), path)
const pageBRemoved = path => pageB.evaluate(p => window.__fake.fakeLog.removals.includes(p), path)
const pageBBtn = (text, scope = pageB) => scope.locator('button:visible', { hasText: text }).first()

async function openCourseB(course, subject) {
  for (let i = 0; i < 4; i++) {
    if (await pageB.locator('button:visible', { hasText: '📚 ' + subject }).count() || await pageB.locator('button:visible', { hasText: course }).count()) break
    const back = pageB.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) break
    await back.evaluate(e => e.click()); await pageB.waitForTimeout(400)
  }
  if (!(await pageB.locator('button:visible', { hasText: course }).count())) {
    if (!(await pageB.locator('button:visible', { hasText: '📚 ' + subject }).count())) { await pageBBtn('Gymnasiet').evaluate(e => e.click()).catch(() => {}); await pageB.waitForTimeout(400) }
    await pageB.locator('button:visible', { hasText: '📚 ' + subject }).first().evaluate(e => e.click()); await pageB.waitForTimeout(400)
  }
  // Ett ämne med bara en kurs öppnas direkt, utan att kursknappen visas först.
  if (await pageBBtn(course).count()) await pageBBtn(course).evaluate(e => e.click())
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
  assert.deepEqual(await materialListB(), ['gammal.txt'], 'materialet försvann vid vanlig sparning')
  assert.equal(await pageBFileExists(`${UID}/gammal.txt`), true, 'filen raderades vid vanlig sparning')
  assert.equal((await pageBContent('Matematik 5e')).pastedMaterial, 'Befintlig text ändrad.', 'texten sparades inte')
  // Svenska 5e ska vara orörd.
  assert.equal(await pageBFileExists(`${UID}/svenska.txt`), true, 'filen i den andra planeringen påverkades')
  assert.equal((await pageBContent('Svenska 5e')).materials.length, 1, 'materialet i den andra planeringen påverkades')
})

await check('borttagning i en planering raderar bara den filen, och bara efter sparning', async () => {
  await pageB.locator('details.material-disclosure .material-list li', { hasText: 'gammal.txt' }).locator('button', { hasText: 'Ta bort' }).evaluate(e => e.click())
  await pageB.waitForTimeout(200)
  assert.equal(await pageBRemoved(`${UID}/gammal.txt`), false, 'filen raderades innan planeringen sparades')
  await pageB.waitForTimeout(2200)
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
