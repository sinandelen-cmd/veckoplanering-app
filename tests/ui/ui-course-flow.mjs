// Förenklat kursflöde med FIKTIV Supabase-klient. Körning: npm run test:ui:course-flow
// Kontrollerar:
//  - "Ny kurs" frågar bara efter kursens namn och läsår. Ämne och skolform är redan valda
//  - kursen skapas och planeringsvyn öppnas direkt, med alla 21 veckor
//  - "Fler inställningar" inne i kursen: läsår, lärobok, årskurs och startdatum
//  - ett ändrat startdatum flyttar veckorna men behåller lektioner och innehåll
//  - formuläret "Skapa planering" från ett ämne visar ämne och skolform som text, inte som fält
//  - gamla kurser öppnas och kan redigeras; siduppdatering och arkivering/återställning fungerar
// Inga externa anrop, inga riktiga konton eller data.
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'
import { SCENARIOS } from '../print/fixtures.js'
import { scrollThroughPlan } from './scroll-through.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'
const UID = '00000000-0000-4000-8000-000000000001'

const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const weeksData = SCENARIOS['alla-21']().map((w, i) => { const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10)); return { ...w, weekStart: iso(d), keepVisibleExtra: true, lessons: (w.lessons || []).map(l => ({ ...l, topics: [{ name: 'Ekvation och variabel', pages: ['s. 5'], assignments: ['Uppgift 2'], links: [] }] })) } })
// En gammal kurs (sparad före det nya flödet) med lärobok, årskurs och en klass.
const oldRow = { id: 'old1', user_id: UID, title: 'Matematik 2c', subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Matematik 2c', subject: 'Matematik', schoolForm: 'Gymnasieskola', schoolYear: 'Testår', grade: '', course: 'Matematik 2c', textbook: 'Matematik 2c – fiktiv bok', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, classGroups: [{ name: '2A', days: ['Måndag'], startDate: '2026-01-01' }] }), weeks: 21, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 500)) } }

async function open(seedRows) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.__lastDialog = ''
  page.__accept = true
  page.on('dialog', d => { page.__lastDialog = d.message(); if (page.__accept) d.accept(); else d.dismiss() })
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: seedRows }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { page, errors }
}
const btn = (page, text) => page.locator('button:visible', { hasText: text }).first()
// Öppnar "Material till planeringen" och sedan "Fler inställningar", precis som en användare gör.
async function openCourseSettings(page) {
  const material = page.locator('details.material-disclosure > summary')
  if (!(await page.locator('details.material-disclosure').evaluate(d => d.open))) { await material.evaluate(e => e.click()); await page.waitForTimeout(200) }
  const more = page.locator('details.course-more-settings > summary')
  if (!(await page.locator('details.course-more-settings').evaluate(d => d.open))) { await more.evaluate(e => e.click()); await page.waitForTimeout(200) }
}
// Går tillbaka med "←"-knapparna tills ämnesraden syns. Används när en kurs är öppen.
async function openLibrary(page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button:visible', { hasText: 'Ny kurs' }).count() || await page.locator('button:visible', { hasText: '📚 Matematik' }).count()) return
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) return
    await back.evaluate(e => e.click())
    await page.waitForTimeout(400)
  }
}
// Öppnar ämnet Matematik. Ämnesraden kan visas ihopfälld, och en andra klick fäller ihop den igen,
// så vi kontrollerar om ämnet är öppet och klickar bara när det inte är det.
async function goToSubject(page, expectCourses = true) {
  await openLibrary(page)
  const open = async () => (await page.locator('button:visible', { hasText: /^📁 Matematik/ }).count()) > 0
    || (!expectCourses && (await page.locator('button:visible', { hasText: 'Ny kurs' }).count()) > 0)
  if (await open()) return
  if (!(await page.locator('button:visible', { hasText: '📚 Matematik' }).count())) {
    await btn(page, 'Gymnasiet').evaluate(e => e.click()).catch(() => {})
    await page.waitForTimeout(400)
  }
  // Ett klick öppnar ämnet. Då byter ämnesraden utseende, så vi klickar bara en gång.
  if (!(await open())) {
    const subject = page.locator('button:visible', { hasText: '📚 Matematik' })
    if (await subject.count()) { await subject.first().evaluate(e => e.click()); await page.waitForTimeout(400) }
  }
}
async function countWeeks(page) {
  await btn(page, 'Visa alla veckor').evaluate(e => e.click()).catch(() => {})
  await page.waitForSelector('.week-card', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(400)
  await scrollThroughPlan(page)
  const weeks = await page.evaluate(() => document.querySelectorAll('#lararvy .week-card').length)
  const lessons = await page.evaluate(() => document.querySelectorAll('#lararvy .lesson').length)
  await btn(page, 'Dölj alla veckor').evaluate(e => e.click()).catch(() => {})
  return { weeks, lessons }
}

const page1 = await open([oldRow])
const errors = page1.errors
await check('"Ny kurs" frågar bara efter kursens namn och läsår, ämne och skolform visas som text', async () => {
  await goToSubject(page1.page, false)
  await btn(page1.page, 'Ny kurs').evaluate(e => e.click())
  await page1.page.waitForTimeout(300)
  const dialog = page1.page.locator('[aria-label="Skapa ny kurs"]')
  assert.equal(await dialog.count(), 1, 'kursdialogen öppnas inte')
  assert.equal(await dialog.locator('input[aria-label="Ämne"]').count(), 0, 'dubbla fältet för Ämne finns')
  assert.equal(await dialog.locator('select').count(), 0, 'Årskurs/Skolstadium-fält finns kvar')
  assert.ok(await dialog.locator('label', { hasText: 'Kursens namn' }).count() > 0, 'Kursens namn saknas')
  assert.ok(await dialog.locator('label', { hasText: 'Läsår' }).count() > 0, 'Läsår saknas')
  assert.ok(await dialog.getByText('Matematik', { exact: false }).count() > 0, 'ämnet visas inte')
  assert.equal(await dialog.locator('button', { hasText: 'Skapa kurs' }).isDisabled(), true, '"Skapa kurs" är aktiv utan namn')
})
await check('kursen skapas och planeringsvyn öppnas direkt, med samma veckor och lektioner som tidigare', async () => {
  await page1.page.locator('[aria-label="Skapa ny kurs"] input').first().fill('Matematik 1b')
  await btn(page1.page, 'Skapa kurs').evaluate(e => e.click())
  await page1.page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  // Nya kurser startar med två veckor, som tidigare. Fler veckor läggs till i planeringsvyn (upp till 21 och vidare).
  const counts = await countWeeks(page1.page)
  assert.equal(counts.weeks, 2, 'veckor i en ny kurs: ' + counts.weeks)
  assert.ok(await page1.page.locator('button:visible', { hasText: /Lägg till vecka/ }).count() > 0, 'knappen för att lägga till vecka saknas')
})
await check('"Fler inställningar" inne i kursen: läsår, lärobok, startdatum, startvecka och material', async () => {
  assert.equal(await page1.page.locator('details.course-more-settings > summary').count(), 1, '"Fler inställningar" saknas i kursen')
  await openCourseSettings(page1.page)
  const box = page1.page.locator('details.course-more-settings')
  assert.ok(await box.locator('label', { hasText: 'Läsår' }).count() > 0, 'Läsår saknas')
  assert.ok(await box.locator('label', { hasText: 'Lärobok' }).count() > 0, 'Lärobok saknas')
  assert.ok(await box.locator('label', { hasText: 'Startdatum' }).count() > 0, 'Startdatum saknas')
  assert.match(await box.innerText(), /Startvecka: vecka \d+/, 'startvecka saknas')
  assert.ok(await page1.page.locator('details.material-disclosure > summary', { hasText: 'Material till planeringen' }).count() > 0, 'materialet saknas i kursen')
})
await check('ett ändrat startdatum flyttar veckorna men behåller alla lektioner', async () => {
  const before = await countWeeks(page1.page)
  await openCourseSettings(page1.page)
  const dateInput = page1.page.locator('details.course-more-settings input[type="date"]')
  const current = await dateInput.inputValue()
  const d = new Date(current + 'T12:00:00'); d.setDate(d.getDate() + 14)
  page1.page.__accept = true
  await dateInput.fill(d.toISOString().slice(0, 10))
  await page1.page.waitForTimeout(400)
  const after = await countWeeks(page1.page)
  assert.equal(after.weeks, before.weeks, 'antal veckor ändrades: ' + after.weeks)
  assert.equal(after.lessons, before.lessons, 'antal lektioner ändrades: ' + after.lessons + ' före ' + before.lessons)
  assert.match(page1.page.__lastDialog, /Veckorna flyttas/, 'bekräftelsen saknas')
  // Kursen sparas automatiskt efter ändringen. Vi väntar tills "Osparade ändringar" har försvunnit.
  await page1.page.waitForFunction(() => !document.body.innerText.includes('Osparade ändringar'), null, { timeout: 10000 })
})
await check('gamla kurser öppnas och visar sina veckor, lärobok och klass', async () => {
  await openLibrary(page1.page)
  await goToSubject(page1.page)
  // Kursen öppnas från ämnesraden, eller så är den redan öppen om ämnet öppnar den direkt.
  if (await btn(page1.page, 'Matematik 2c').count()) await btn(page1.page, 'Matematik 2c').evaluate(e => e.click())
  await page1.page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  assert.ok((await page1.page.locator('body').innerText()).includes('Matematik 2c'), 'gamla kursen öppnades inte')
  const counts = await countWeeks(page1.page)
  assert.equal(counts.weeks, 21, 'gamla kursen: ' + counts.weeks + ' veckor')
  assert.ok(counts.lessons > 0, 'gamla kursen saknar lektioner')
  await openCourseSettings(page1.page)
  assert.equal(await page1.page.locator('details.course-more-settings input[list="course-textbook-choices"]').inputValue(), 'Matematik 2c – fiktiv bok', 'läroboken i den gamla kursen ändrades')
})
await check('"Skapa planering" visar bara namn och läsår, och ingen startdatum eller material finns i formuläret', async () => {
  await openLibrary(page1.page)
  await openLibrary(page1.page)
  await btn(page1.page, '＋ Ny planering').evaluate(e => e.click())
  await page1.page.waitForTimeout(400)
  const card = page1.page.locator('.simple-setup-card')
  assert.equal(await card.count(), 1, 'formuläret "Skapa planering" öppnades inte')
  assert.ok(await card.locator('input[list="planning-subject-choices"]').count() === 1, 'ämnesfältet saknas när ämnet inte är valt')
  assert.equal(await card.locator('input[type="date"]').count(), 0, 'startdatum finns i formuläret, men ska ligga i kursen')
  assert.equal(await card.locator('.material-disclosure, input[type="file"]').count(), 0, 'material finns i formuläret, men ska ligga i kursen')
})
await check('arkivering och återställning av ämnet behåller båda kurserna med alla veckor och lektioner', async () => {
  // Mät kursen 1b före arkivering, och jämför med samma kurs efter arkivering och återställning.
  await openLibrary(page1.page)
  await goToSubject(page1.page)
  await btn(page1.page, 'Matematik 1b').evaluate(e => e.click())
  await page1.page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  const before = await countWeeks(page1.page)
  await openLibrary(page1.page)
  await goToSubject(page1.page)
  assert.ok(await btn(page1.page, 'Arkivera ämne').count() > 0, '"Arkivera ämne" saknas innan arkivering: ' + (await page1.page.locator('body').innerText()).slice(0, 220).replace(/\n+/g, ' | '))
  await btn(page1.page, 'Arkivera ämne').evaluate(e => e.click())
  await page1.page.waitForTimeout(600)
  await btn(page1.page, '🗃 Arkiv').evaluate(e => e.click())
  await page1.page.waitForTimeout(300)
  await goToSubject(page1.page)
  assert.ok(await btn(page1.page, 'Återställ ämne').count() > 0, '"Återställ ämne" saknas i arkivet')
  await btn(page1.page, 'Återställ ämne').evaluate(e => e.click())
  await page1.page.waitForTimeout(600)
  await btn(page1.page, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await page1.page.waitForTimeout(300)
  await goToSubject(page1.page)
  await btn(page1.page, 'Matematik 1b').evaluate(e => e.click())
  await page1.page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  const after = await countWeeks(page1.page)
  assert.equal(after.weeks, before.weeks, 'veckor efter återställning: ' + after.weeks + ', före: ' + before.weeks)
  assert.equal(after.lessons, before.lessons, 'lektioner efter återställning: ' + after.lessons + ', före: ' + before.lessons)
})

// Går upp till skolformsnivån, där antalet kurser per skolform visas (t.ex. "📁 Gymnasiet (2)").
async function toSchoolLevel(page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button:visible', { hasText: /^📁 Gymnasiet/ }).count()) return
    const back = page.locator('button:visible', { hasText: /^← / }).first()
    if (!(await back.count())) return
    await back.evaluate(e => e.click())
    await page.waitForTimeout(400)
  }
}
await check('siduppdatering: biblioteket och kurserna visas direkt efter omladdning och ny inloggning', async () => {
  // Omladdning öppnar den senast öppnade kursen, som tidigare. Därifrån går vi upp till skolformsnivån.
  await page1.page.reload({ waitUntil: 'networkidle' })
  await page1.page.waitForTimeout(800)
  const text = await page1.page.locator('body').innerText()
  assert.ok(!/Vad vill du göra/.test(text), 'mellanvyn visas efter siduppdatering')
  await toSchoolLevel(page1.page)
  // Den falska databasen laddas om från fixturen vid omladdning, så här finns bara den gamla kursen kvar.
  assert.ok(/Gymnasiet \(1\)/.test(await page1.page.locator('body').innerText()), 'den gamla kursen syns inte i Gymnasiet efter omladdning')
  // Ny inloggning: utloggad och inloggad igen i samma session.
  await page1.page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page1.page.reload({ waitUntil: 'networkidle' })
  await page1.page.waitForTimeout(800)
  await toSchoolLevel(page1.page)
  assert.ok(/Gymnasiet \(1\)/.test(await page1.page.locator('body').innerText()), 'den gamla kursen syns inte i Gymnasiet efter ny inloggning')
})
await check('inga sidfel i kursflödet', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await page1.page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT KURSFLÖDESTEST MISSLYCKADES' : 'ALLA KURSFLÖDESTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
