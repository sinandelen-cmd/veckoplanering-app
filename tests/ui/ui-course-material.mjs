// Material vid skapande av planering och kurs med FIKTIV Supabase-klient och testpersistens (fake-persist).
// Körning: npm run test:ui:course-material
// Ingen produktionsdata, inga riktiga konton, inga externa anrop.
// Kontrollerar:
//  - "Skapa planering" kan bifoga fil och klistra in text, som sparas med den nya kursen
//  - "Ny kurs" i ämnet kan bifoga fil och klistra in text, som sparas med kursen
//  - en kurs kan skapas utan bifogade filer
//  - materialet finns kvar i kursens materialsektion efter omladdning och ny inloggning
//  - inklistrad text används för att skapa veckor via befintlig import, och originaltexten finns kvar
//  - avbrutna formulär rensar bifogade filer som inte sparats
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

const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())
await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [] }))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const btn = (text, scope = page) => scope.locator('button:visible', { hasText: text }).first()
const txt = { buffer: Buffer.from(FILE_TEXT), mimeType: 'text/plain', name: FILE_NAME }

async function openLibrary() {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button:visible', { hasText: 'Ny kurs' }).count() || await page.locator('button:visible', { hasText: '📚 Matematik' }).count()) return
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) return
    await back.evaluate(e => e.click()); await page.waitForTimeout(400)
  }
}
async function goToSubject(expectCourses = true) {
  await openLibrary()
  const ready = async () => (await page.locator('button:visible', { hasText: /^📁 Matematik/ }).count()) > 0
    || (!expectCourses && (await page.locator('button:visible', { hasText: 'Ny kurs' }).count()) > 0)
  if (await ready()) return
  if (!(await page.locator('button:visible', { hasText: '📚 Matematik' }).count())) { await btn('Gymnasiet').evaluate(e => e.click()).catch(() => {}); await page.waitForTimeout(400) }
  if (!(await ready())) { await page.locator('button:visible', { hasText: '📚 Matematik' }).first().evaluate(e => e.click()); await page.waitForTimeout(400) }
}
// Öppnar materialdelen i en kurs (den fällbara sektionen ovanför veckorna).
async function openMaterial() {
  await page.locator('details.material-disclosure > summary').evaluate(e => { if (!e.parentElement.open) e.click() })
  await page.waitForTimeout(200)
}
const materialNames = () => page.locator('details.material-disclosure .material-list li strong').allInnerTexts()
const pastedValue = () => page.locator('details.material-disclosure .material-paste textarea').inputValue()
const storedFileNames = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fake-files') || '{}')).map(f => f.name))

// 1. Skapa planering: bifogad fil och inklistrad text sparas med kursen.
await check('Skapa planering: bifogad fil och inklistrad text sparas med den nya kursen', async () => {
  await btn('Ny planering').evaluate(e => e.click())
  await page.waitForSelector('.simple-setup-card form', { timeout: 15000 })
  const card = page.locator('.simple-setup-card')
  await card.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 1a')
  await card.locator('select').selectOption('Gymnasiet')
  await card.locator('input[list="planning-subject-choices"]').fill('Matematik')
  await card.locator('.material-attach input[type="file"]').setInputFiles(txt)
  await page.waitForSelector('.simple-setup-card .material-list li', { timeout: 15000 })
  await card.locator('.material-paste textarea').fill(PASTED_A)
  await card.locator('button[type="submit"]').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  assert.deepEqual(await materialNames(), [FILE_NAME], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_A, 'inklistrad text sparades inte med kursen')
  assert.ok((await storedFileNames()).includes(FILE_NAME), 'filen finns inte i lagringen')
})

// 2. Ny kurs i ämnet: samma möjlighet i dialogen.
await check('Ny kurs i ämnet: bifogad fil och inklistrad text sparas med kursen', async () => {
  await openLibrary()
  await goToSubject(false)
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForTimeout(300)
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  assert.equal(await dialog.locator('input[type="file"]').count(), 1, 'filuppladdningen saknas i kursdialogen')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 2b')
  await dialog.locator('input[type="file"]').setInputFiles({ ...txt, name: FILE_B })
  await page.waitForSelector('[aria-label="Skapa ny kurs"] .material-list li', { timeout: 15000 })
  await dialog.locator('.material-paste textarea').fill(PASTED_B)
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  assert.deepEqual(await materialNames(), [FILE_B], 'filen finns inte i kursens materialsektion')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text sparades inte med kursen')
})

// 3. Kurs utan bilagor.
await check('en kurs kan skapas utan att något bifogas', async () => {
  await openLibrary()
  await goToSubject(false)
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForTimeout(300)
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 3c')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  assert.deepEqual(await materialNames(), [], 'en kurs utan bilagor ska inte ha något material')
  assert.equal(await pastedValue(), '', 'en kurs utan text ska ha tomt textfält')
})

// 4. Inklistrad text: importen skapar veckor och originaltexten finns kvar.
await check('inklistrad text finns kvar när veckor skapats av den', async () => {
  await openLibrary()
  await goToSubject()
  await btn('Matematik 1a').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  await btn('Skapa veckor av inklistrad text', page.locator('details.material-disclosure')).evaluate(e => e.click())
  await page.waitForTimeout(500)
  // Förhandsgranskningen visas. Först när den används skrivs veckorna över.
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann vid förhandsgranskningen')
  await btn('Använd import').evaluate(e => e.click())
  await page.waitForTimeout(500)
  assert.equal(await pastedValue(), PASTED_A, 'originaltexten försvann när veckor skapades')
  assert.match(await page.locator('#lararvy').innerText(), /ekvationer/, 'importen skapade inga veckor med texten')
})

// 5. Avbryt: bifogade filer som inte sparats rensas.
await check('avbrutet formulär rensar bifogade filer som inte sparats', async () => {
  const before = (await storedFileNames()).length
  await openLibrary()
  await btn('Ny planering').evaluate(e => e.click())
  await page.waitForSelector('.simple-setup-card form', { timeout: 15000 })
  await page.locator('.simple-setup-card .material-attach input[type="file"]').setInputFiles({ ...txt, name: 'ej-sparad.txt' })
  await page.waitForFunction(n => JSON.parse(localStorage.getItem('fake-files') || '{}') && Object.keys(JSON.parse(localStorage.getItem('fake-files') || '{}')).length > n, before, { timeout: 15000 })
  await page.locator('.simple-setup-card').locator('button', { hasText: 'Avbryt' }).evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.ok(!(await storedFileNames()).includes('ej-sparad.txt'), 'den avbrutna filen ligger kvar i lagringen')
})

// 6. Omladdning och ny inloggning: materialet ska finnas kvar.
await check('material och inklistrad text finns kvar efter omladdning och ny inloggning', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await openLibrary()
  await goToSubject()
  await btn('Matematik 1a').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  assert.deepEqual(await materialNames(), [FILE_NAME], 'filen för Matematik 1a försvann')
  assert.equal(await pastedValue(), PASTED_A, 'inklistrad text för Matematik 1a försvann')
  await openLibrary()
  await goToSubject()
  await btn('Matematik 2b').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await openMaterial()
  assert.deepEqual(await materialNames(), [FILE_B], 'filen för Matematik 2b försvann')
  assert.equal(await pastedValue(), PASTED_B, 'inklistrad text för Matematik 2b försvann')
  const dbRows = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-db') || '{}').veckoplanering || [])
  assert.ok(dbRows.some(r => /Matematik 1a/.test(r.title)) && dbRows.some(r => /Matematik 2b/.test(r.title)), 'kurserna finns inte i testdatabasen')
})

await check('inga sidfel', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await page.close()
await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT MATERIALTEST MISSLYCKADES' : 'ALLA MATERIALTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
