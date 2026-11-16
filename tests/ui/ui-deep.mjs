// Fördjupat UI-test med FIKTIV Supabase-klient. Körning: npm run test:ui:deep
// Täcker: öppna/stäng-val i ihopfällbara detaljer, upprepade klassbyten, 21 tunga veckor,
// scrollning, klickbarhet och svarstider. Inga externa anrop, inga riktiga konton eller data.
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'
import { SCENARIOS } from '../print/fixtures.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'

// 21 veckor relativt dagens datum: vecka 44-motsvarigheten ligger nära nuet, övriga runt omkring.
const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const base21 = SCENARIOS['alla-21']()
const weeksData = base21.map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10))
  return { ...w, weekStart: iso(d), keepVisibleExtra: false, pages: i === 10 ? ['s. 5'] : (w.pages || []) }
})
const plan = {
  kind: 'arsplanering-v2', title: 'Fiktiv tung planering', subject: 'Testämne', schoolYear: 'Testår', entryType: 'lektion',
  studentColumns: 1, studentRows: 1, weeksData, classGroups: [
    { name: '7A', days: ['Måndag', 'Tisdag', 'Onsdag'], startDate: '2026-08-01', momentsPerDay: {} },
    { name: '7B', days: ['Tisdag', 'Torsdag'], startDate: '2026-08-01', momentsPerDay: {} },
  ],
}
const row = { id: 'plan-deep', user_id: '00000000-0000-4000-8000-000000000001', title: 'Fiktiv tung planering', subject: 'Testämne', school_year: 'Testår', content: JSON.stringify(plan), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z', class_name: null, start_date: null, week_start: null }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []; const external = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()) })
page.on('request', r => { if (!r.url().startsWith(base)) external.push(r.url()) })
await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [row] }))

const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]) } }
const ms = async fn => { const t = Date.now(); await fn(); return Date.now() - t }

await page.goto(base + '/', { waitUntil: 'networkidle' })
const openPlanMs = await ms(async () => {
  await page.getByText('Mina planeringar').first().click()
  await page.getByText('Övriga planeringar').first().click().catch(() => {})
  await page.getByText('Testämne', { exact: false }).first().click().catch(() => {})
  await page.getByText('Fiktiv tung planering').first().click()
  await page.waitForSelector('.week-card', { timeout: 20000 })
})
console.log('öppna planering:', openPlanMs, 'ms')

await check('öppna/stäng-val i ihopfällbar detalj består efter omrendering', async () => {
  const details = page.locator('details.legacy-week-details').first()
  if (await details.count() === 0) throw new Error('ingen detalj i DOM')
  const initial = await details.evaluate(d => d.open)
  await details.locator('summary').first().click()
  const afterClick = await details.evaluate(d => d.open)
  assert.notEqual(afterClick, initial, 'klick ska växla läget')
  // Omrendering: skriv i en textruta som ligger i samma vecka (utlöser state-uppdatering).
  await page.locator('input.week-title').first().fill('Ny rubrik för omrendering')
  await page.waitForTimeout(300)
  assert.equal(await details.evaluate(d => d.open), afterClick, 'användarens val ska bestå efter omrendering')
})

await check('detalj som startar öppen (vecka med sidor) kan stängas och stängningen består', async () => {
  const all = page.locator('details.legacy-week-details')
  const n = await all.count()
  let target = null
  for (let i = 0; i < n; i++) { if (await all.nth(i).evaluate(d => d.open)) { target = all.nth(i); break } }
  if (!target) throw new Error('ingen detalj startar öppen i fixturen')
  await target.locator('summary').first().click()
  assert.equal(await target.evaluate(d => d.open), false, 'klick ska stänga')
  await page.locator('input.week-title').first().fill('Omrendering två')
  await page.waitForTimeout(300)
  assert.equal(await target.evaluate(d => d.open), false, 'stängningen ska bestå efter omrendering')
})

await check('Visa alla veckor: två kolumner och alla 21 veckor visar sitt innehåll', async () => {
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click()
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.week-card')].map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), h: Math.round(r.height), lessons: e.querySelectorAll('.lesson').length } }).filter(c => c.h > 0)
    return { cards: cards.length, columns: new Set(cards.map(c => c.x)).size, empty: cards.filter(c => c.lessons === 0).length, placeholders: document.querySelectorAll('.teacher-week-lazy-placeholder').length }
  })
  assert.equal(m.cards, 21, 'alla 21 veckor ska finnas')
  assert.equal(m.columns, 2, 'exakt två kolumner')
  assert.equal(m.empty, 0, 'inga tomma veckor')
  assert.equal(m.placeholders, 0, 'inga kvarvarande placeholders')
  // Vanlig sidscrollning: sidan ska gå att scrolla och den inre rutan får inte ha egen scroll.
  const innerOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('.teacher-months-all-weeks')).overflowY)
  assert.notEqual(innerOverflow, 'auto', 'inre scrollruta i Visa alla veckor')
  const y0 = await page.evaluate(() => window.scrollY)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(100) }
  const y1 = await page.evaluate(() => window.scrollY)
  assert.ok(y1 > y0 + 800, 'sidan ska scrolla: ' + (y1 - y0) + ' px')
})

await check('klassbyte fungerar upprepade gånger och Grundplanering går att återgå till', async () => {
  const times = []
  for (let i = 0; i < 6; i++) {
    const name = i % 3 === 0 ? /^7A/ : i % 3 === 1 ? /^7B/ : /Grundplanering/
    const t = Date.now()
    await page.getByRole('button', { name }).first().click()
    await page.waitForTimeout(150)
    times.push(Date.now() - t)
  }
  const worst = Math.max(...times)
  console.log('   klassbyten ms:', times.join(', '))
  assert.ok(worst < 2000, 'långsammaste byte ' + worst + ' ms')
  // Efter flera byten ska Grundplanering fortfarande vara klickbar och visa veckor.
  await page.getByRole('button', { name: /Grundplanering/ }).first().click()
  await page.waitForSelector('.week-card', { timeout: 5000 })
  assert.ok(await page.locator('.week-card').count() > 0, 'Grundplanering visar inga veckor efter klassbyten')
})

await check('21 tunga veckor: scrollning fungerar och knappar är klickbara', async () => {
  await page.locator('button', { hasText: 'Dölj alla veckor' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  const y0 = await page.evaluate(() => window.scrollY)
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(60) }
  const y1 = await page.evaluate(() => window.scrollY)
  assert.ok(y1 > y0 + 500, 'scrollning rörde sig för lite: ' + (y1 - y0) + ' px')
  const scrollMs = await ms(async () => { await page.evaluate(() => window.scrollTo(0, 0)) })
  assert.ok(scrollMs < 500, 'scroll-to-top tog ' + scrollMs + ' ms')
  // Klicka på en synlig veckoknapp och kontrollera att appen svarar.
  const weekButton = page.locator('button', { hasText: /^Vecka \d+$/ }).first()
  if (await weekButton.count()) {
    await weekButton.click(); await page.waitForTimeout(300)
    // Veckoknappen öppnar en helskärmsvy. Stäng den som en användare: Escape, annars knappen med ✕.
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    const closeBtn = page.locator('button', { hasText: '✕' }).first()
    if (await closeBtn.count() && await closeBtn.isVisible()) { await closeBtn.click(); await page.waitForTimeout(200) }
  }
  assert.ok(await page.locator('.week-card').count() > 0, 'veckor saknas efter klick')
})

await check('21 veckor: tidsmätning av planering och klassvy', async () => {
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
  const t = await ms(async () => { await page.getByRole('button', { name: /^7A/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(100) })
  console.log('   klassvy 21 veckor ms:', t)
  assert.ok(t < 3000, 'klassvy tog ' + t + ' ms')
})

await check('lärarens utskriftsknapp skriver ut elevvyns A4-sidor (en vecka per sida)', async () => {
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++ } })
  await page.locator('button:visible', { hasText: '🖨' }).first().click()
  await page.waitForFunction(() => window.__printCalls > 0, null, { timeout: 15000 })
  const pages = await page.evaluate(() => document.querySelectorAll('.teacher-print-host .student-print-page').length)
  // Utskriften följer elevvyns synlighet (passerade och dolda veckor skrivs inte ut),
  // så antalet sidor ska vara minst en per synlig vecka i Grundplanering.
  const visibleWeeks = await page.evaluate(() => new Set([...document.querySelectorAll('.teacher-print-host [data-print-week]')].map(e => e.getAttribute('data-print-week'))).size)
  assert.ok(pages >= 1 && pages >= visibleWeeks, 'utskriftssidor: ' + pages + ', veckor: ' + visibleWeeks)
  const banners = await page.evaluate(() => document.querySelectorAll('.teacher-print-host .account-validity-notice').length)
  assert.equal(banners, 0, 'kontobanner ska inte finnas i utskriften')
})

await check('inga sidfel, inga React-varningar och inga externa anrop', async () => {
  assert.deepEqual(errors, [], 'konsol: ' + errors.slice(0, 2).join(' / ').slice(0, 300))
  assert.deepEqual(external, [], 'externa anrop: ' + external.slice(0, 2).join(' '))
})

await browser.close(); await server.close()
const allOk = results.every(Boolean)
console.log(allOk ? 'ALLA FÖRDJUPADE UI-TESTER GODKÄNDA (fiktiv klient)' : 'NÅGOT FÖRDJUPAT UI-TEST MISSLYCKADES')
process.exit(allOk ? 0 : 1)
