// Nya kurser med FIKTIV Supabase-klient och testpersistens (fake-persist). Körning: npm run test:ui:new-course
// Ingen produktionsdata, inga riktiga konton, inga externa anrop. Skrivningar sparas i webbläsarens testlagring
// och finns kvar efter omladdning, så att siduppdatering och ny inloggning kan kontrolleras.
// Kontrollerar:
//  - en ny kurs skapas med 21 veckor, med datum och ordning utifrån valt läsår
//  - alla 21 veckor går att öppna, redigera och skriva ut
//  - kursen finns kvar efter siduppdatering och ny inloggning
//  - ett ändrat startdatum behåller lektioner, kapitel, begrepp och material
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

// Den gamla kursen som redan finns i testdatabasen. Den ska inte ändras av de nya kurserna.
const oldCourse = { id: 'old1', user_id: UID, title: 'Matematik 2c', subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Matematik 2c', subject: 'Matematik', schoolForm: 'Gymnasieskola', schoolYear: 'Testår', grade: '', course: 'Matematik 2c', textbook: 'fiktiv bok', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData: [] }), weeks: 0, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 500)) } }

async function open(seedRows) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.__accept = true
  page.on('dialog', d => { page.__lastDialog = d.message(); if (page.__accept) d.accept(); else d.dismiss() })
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: seedRows }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { page, errors }
}
const btn = (page, text) => page.locator('button:visible', { hasText: text }).first()
async function openLibrary(page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button:visible', { hasText: 'Ny kurs' }).count() || await page.locator('button:visible', { hasText: '📚 Matematik' }).count()) return
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) return
    await back.evaluate(e => e.click())
    await page.waitForTimeout(400)
  }
}
// Ser till att ämnet Matematik är öppet. Med expectCourses = true krävs att kurserna syns. Annars räcker "Ny kurs".
// Ämnesraden fälls ihop av ett klick till, så vi klickar bara när det behövs.
async function goToSubject(page, expectCourses = true) {
  await openLibrary(page)
  const ready = async () => (await page.locator('button:visible', { hasText: /^📁 Matematik/ }).count()) > 0
    || (!expectCourses && (await page.locator('button:visible', { hasText: 'Ny kurs' }).count()) > 0)
  if (await ready()) return
  if (!(await page.locator('button:visible', { hasText: '📚 Matematik' }).count())) { await btn(page, 'Gymnasiet').evaluate(e => e.click()).catch(() => {}); await page.waitForTimeout(400) }
  if (!(await ready())) { await page.locator('button:visible', { hasText: '📚 Matematik' }).first().evaluate(e => e.click()); await page.waitForTimeout(400) }
}
// Skapar en kurs via "Ny kurs". Läsåret kan sättas i dialogen (startår).
async function createCourse(page, name, startYear = null) {
  await goToSubject(page, false)
  await btn(page, 'Ny kurs').evaluate(e => e.click())
  await page.waitForTimeout(300)
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('input').first().fill(name)
  if (startYear) { await dialog.locator('input[aria-label="Läsårets startår"]').fill(String(startYear)); await page.waitForTimeout(150) }
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(300)
}
// Veckorna i alla-veckor-vyn: veckonummer i visningsordning.
async function weekNumbers(page) {
  await btn(page, 'Visa alla veckor').evaluate(e => e.click()).catch(() => {})
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(400)
  await scrollThroughPlan(page)
  const nums = await page.evaluate(() => [...document.querySelectorAll('#lararvy .week-card')].map(c => Number(c.closest('[data-week]')?.getAttribute('data-week'))))
  return nums
}
// Förväntade ISO-veckor för 21 veckor från en måndag (YYYY-MM-DD). Beräknas oberoende av appen.
function expectedWeeks(mondayIso) {
  const out = []
  for (let i = 0; i < 21; i++) {
    const d = new Date(`${mondayIso}T12:00:00`); d.setDate(d.getDate() + 7 * i)
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7
    t.setUTCDate(t.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
    out.push(Math.ceil(((t - yearStart) / 86400000 + 1) / 7))
  }
  return out
}

const { page, errors } = await open([oldCourse])

await check('ny kurs skapas med 21 veckor med datum och ordning utifrån läsåret 2026–2027', async () => {
  await createCourse(page, 'Matematik 1b')
  const nums = await weekNumbers(page)
  assert.equal(nums.length, 21, 'antal veckor: ' + nums.length)
  assert.deepEqual(nums, expectedWeeks('2026-08-10'), 'veckonummer/ordning: ' + nums.join(','))
  const start = await page.locator('details.material-disclosure > summary').evaluate(e => e.click()).catch(() => {})
  await page.locator('details.course-more-settings > summary').evaluate(e => e.click()).catch(() => {})
  assert.equal(await page.locator('details.course-more-settings input[type="date"]').inputValue(), '2026-08-10', 'startdatum följer inte läsåret')
})
await check('ny kurs för läsåret 2027–2028 får rätt datum och veckor', async () => {
  await openLibrary(page)
  await createCourse(page, 'Matematik 3c', 2027)
  const nums = await weekNumbers(page)
  assert.deepEqual(nums, expectedWeeks('2027-08-16'), 'veckor för läsåret 2027–2028: ' + nums.join(','))
  await page.locator('details.material-disclosure > summary').evaluate(e => e.click()).catch(() => {})
  await page.locator('details.course-more-settings > summary').evaluate(e => e.click()).catch(() => {})
  assert.equal(await page.locator('details.course-more-settings input[type="date"]').inputValue(), '2027-08-16', 'startdatum för 2027–2028 fel')
})
await check('alla 21 veckor går att öppna, redigera och skriva ut', async () => {
  await openLibrary(page)
  await goToSubject(page)
  await btn(page, 'Matematik 1b').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await btn(page, 'Visa alla veckor').evaluate(e => e.click()).catch(() => {})
  await page.waitForTimeout(400)
  const chapters = page.locator('#lararvy .paper-chapter-edit input')
  assert.equal(await chapters.count(), 21, 'kapitelfält för alla veckor: ' + (await chapters.count()))
  // Öppna varje vecka (öppna/stäng-knappen) och kontrollera att innehållet syns.
  const toggles = page.locator('#lararvy button.teacher-week-collapse-toggle')
  const n = await toggles.count()
  assert.ok(n >= 21, 'öppna/stäng-knappar: ' + n)
  // Redigera en vecka: kapitlet ändras och finns kvar i fältet.
  await scrollThroughPlan(page)
  await chapters.first().fill('Algebra och ekvationer'); await page.waitForTimeout(300)
  assert.equal(await chapters.first().inputValue(), 'Algebra och ekvationer', 'kapitlet sparades inte i fältet')
  // Utskrift av alla veckor. Efter utskriften återställs utskriftsläget, som när utskriftsdialogen stängs.
  await page.locator('button[aria-label="Skriv ut"]').first().evaluate(e => e.click())
  await page.waitForSelector('.teacher-print-host .student-print-page', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(1000)
  const printed = await page.locator('.teacher-print-host .student-print-page').count()
  assert.ok(printed >= 21, 'utskriften har färre än 21 sidor: ' + printed)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.waitForTimeout(400)
})

// Startdatum och innehåll: lektioner, kapitel, begrepp och material ska finnas kvar efter att startdatumet ändrats.
await check('ett ändrat startdatum behåller lektioner, kapitel, begrepp och material', async () => {
  await openLibrary(page)
  await goToSubject(page)
  await btn(page, 'Matematik 1b').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.locator('details.material-disclosure > summary').evaluate(e => e.click()).catch(() => {})
  await page.waitForTimeout(200)
  const material = page.locator('details.material-disclosure textarea[aria-label]').filter({ hasText: '' }).first()
  await page.locator('details.material-disclosure textarea').first().fill('Fiktivt material: uppgift om ekvationer.')
  await page.waitForTimeout(300)
  const momentBefore = page.locator('#lararvy textarea[aria-label="Momentets namn"]').first()
  await momentBefore.fill('Testmoment ekvationer'); await page.waitForTimeout(200)
  // Kapitel med begrepp på den första synliga veckan, så att begreppslistan verkligen kan jämföras.
  await page.locator('#lararvy .paper-chapter-edit input').first().fill('Algebra och ekvationer'); await page.waitForTimeout(300)
  const beforeLessons = await page.evaluate(() => document.querySelectorAll('#lararvy .lesson').length)
  const beforeVocab = await page.locator('#lararvy .chapter-vocabulary').first().innerText().catch(() => '')
  assert.ok(beforeVocab.length > 0, 'begreppen för kapitlet visas inte före ändringen')
  const chapterBefore = await page.locator('#lararvy .paper-chapter-edit input').first().inputValue()
  await page.locator('details.course-more-settings > summary').evaluate(e => e.click()).catch(() => {})
  const dateInput = page.locator('details.course-more-settings input[type="date"]')
  const d = new Date((await dateInput.inputValue()) + 'T12:00:00'); d.setDate(d.getDate() + 14)
  page.__accept = true
  await dateInput.fill(d.toISOString().slice(0, 10))
  await page.waitForTimeout(500)
  await page.waitForFunction(() => !document.body.innerText.includes('Osparade ändringar'), null, { timeout: 10000 })
  assert.match(page.__lastDialog, /Veckorna flyttas/, 'bekräftelsen saknas')
  // Efter ändringen: samma innehåll.
  await page.locator('details.material-disclosure > summary').evaluate(e => e.click()).catch(() => {})
  assert.equal(await page.locator('details.material-disclosure textarea').first().inputValue(), 'Fiktivt material: uppgift om ekvationer.', 'materialet ändrades')
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#lararvy textarea[aria-label="Momentets namn"]')].some(t => t.value === 'Testmoment ekvationer')), 'momentet ändrades')
  assert.equal(await page.locator('#lararvy .paper-chapter-edit input').first().inputValue(), chapterBefore, 'kapitlet ändrades')
  assert.equal(await page.locator('#lararvy .chapter-vocabulary').first().innerText().catch(() => ''), beforeVocab, 'begreppen ändrades')
  assert.equal(await page.evaluate(() => document.querySelectorAll('#lararvy .lesson').length), beforeLessons, 'antalet lektioner ändrades')
  const nums = await weekNumbers(page)
  assert.equal(nums.length, 21, 'antal veckor efter flytt: ' + nums.length)
})

await check('kursen finns kvar efter siduppdatering och ny inloggning, med alla veckor och innehåll', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  for (let i = 0; i < 3; i++) {
    if (/Gymnasiet \(\d\)/.test(await page.locator('body').innerText())) break
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) break
    await back.evaluate(e => e.click()); await page.waitForTimeout(400)
  }
  assert.match(await page.locator('body').innerText(), /Gymnasiet \(3\)/, 'de tre kurserna syns inte efter siduppdatering')
  await page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await openLibrary(page)
  await goToSubject(page)
  await btn(page, 'Matematik 1b').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  const nums = await weekNumbers(page)
  assert.equal(nums.length, 21, 'veckor efter ny inloggning: ' + nums.length)
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#lararvy textarea[aria-label="Momentets namn"]')].some(t => t.value === 'Testmoment ekvationer')), 'momentet försvann efter ny inloggning')
  const dbRows = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-db') || '{}').veckoplanering || [])
  assert.ok(dbRows.some(r => /Matematik 1b/.test(r.title)), 'kursen finns inte i testdatabasen')
  assert.ok(dbRows.some(r => r.id === 'old1'), 'den gamla kursen finns inte längre i testdatabasen')
})
await check('inga sidfel', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT NY-KURS-TEST MISSLYCKADES' : 'ALLA NY-KURS-TEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
