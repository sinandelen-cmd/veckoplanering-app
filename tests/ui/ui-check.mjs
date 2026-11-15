// UI-test av lärarvyn med FIKTIV Supabase-klient (tests/ui/fake-supabase.js). Körning: npm run test:ui
// Inga nätverksanrop till externa värdar är tillåtna. Ingen riktig databas eller riktigt konto används.
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'
import { buildFixturePlan } from '../print/fixtures.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'

// Fiktiv planering med veckor relativt dagens datum (passerade veckor döljs av appen).
const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const plan0 = buildFixturePlan('klassvy-lång')
const weeksData = plan0.weeksData.map((w, i) => { const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 1)); return { ...w, weekStart: iso(d), keepVisibleExtra: false } })
const plan = { kind: 'arsplanering-v2', ...plan0, weeksData }
const row = { id: 'plan-1', user_id: '00000000-0000-4000-8000-000000000001', title: 'Fiktiv testplanering', subject: 'Testämne', school_year: 'Testår', content: JSON.stringify(plan), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z', class_name: null, start_date: null, week_start: null }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []; const external = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', r => { if (!r.url().startsWith(base)) external.push(r.url()) })
await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [row] }))

const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]) } }

await page.goto(base + '/', { waitUntil: 'networkidle' })
await check('startsida visar fiktiv lärare och planeringar', async () => {
  await page.getByText('Mina planeringar').first().waitFor({ timeout: 10000 })
})
await page.getByText('Mina planeringar').first().click()
await page.getByText('Övriga planeringar').first().click().catch(() => {})
await page.getByText('Testämne', { exact: false }).first().click().catch(() => {})
await page.getByText('Fiktiv testplanering').first().click()
await page.waitForSelector('.week-card', { timeout: 10000 })

await check('Grundplanering (översikt): två veckor sida vid sida', async () => {
  await page.locator('button', { hasText: 'Dölj alla veckor' }).first().click()
  await page.waitForTimeout(500)
  const cards = await page.$$eval('.week-card', els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) } }).filter(c => c.w > 0))
  assert.equal(cards.length, 2, 'två veckokort förväntas')
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 5, 'korten ska ligga på samma rad')
  assert.ok(cards[1].x > cards[0].x + cards[0].w, 'andra veckan ska ligga till höger om den första')
})

await check('Moment, Sida och Uppgift ligger på samma rad i en lektion', async () => {
  const aligned = await page.evaluate(() => [...document.querySelectorAll('.topic-grid')].every(grid => {
    const tops = [...grid.children].map(cell => Math.round(cell.getBoundingClientRect().top))
    return tops.length < 2 || tops.every(top => Math.abs(top - tops[0]) <= 3)
  }))
  assert.ok(aligned)
})

await check('Klassvy: två veckor sida vid sida, korrekta veckodagar, snabbt klassbyte', async () => {
  const t0 = Date.now()
  await page.getByRole('button', { name: /^7A/ }).first().click()
  await page.waitForSelector('text=Nuvarande vecka', { timeout: 5000 })
  const switchMs = Date.now() - t0
  assert.ok(switchMs < 2000, 'klassbyte tog ' + switchMs + ' ms')
  const leftLabel = await page.getByText('Nuvarande vecka').first().boundingBox()
  const firstWeek = await page.getByText(/^Vecka \d+$/).first().boundingBox()
  assert.ok(leftLabel && firstWeek && leftLabel.x > firstWeek.x + 300, 'klassvyn ska visa två veckor sida vid sida')
  const days = await page.evaluate(() => [...document.querySelectorAll('.lesson-heading')].map(h => h.textContent || '').join(' | '))
  for (const forbidden of ['Torsdag', 'Fredag']) assert.ok(!days.includes(forbidden), 'klassen har inga ' + forbidden)
  for (const day of ['Måndag', 'Tisdag', 'Onsdag']) assert.ok(days.includes(day), 'klassen ska ha ' + day)
})

await check('Utloggning returnerar till inloggningsvyn', async () => {
  await page.getByRole('button', { name: /Logga ut/ }).first().click()
  await page.waitForTimeout(800)
  const stillLoggedIn = await page.getByText('Mina planeringar').count()
  assert.equal(stillLoggedIn, 0, 'lärarvyn ska inte vara synlig efter utloggning')
})

await check('inga sidfel och inga externa anrop under UI-testet', async () => {
  assert.deepEqual(errors, [], 'konsolfel: ' + errors.slice(0, 2).join(' / '))
  assert.deepEqual(external, [], 'externa anrop: ' + external.slice(0, 2).join(' '))
})

await browser.close()
await server.close()
const allOk = results.every(Boolean)
console.log(allOk ? 'ALLA UI-TESTER GODKÄNDA (fiktiv klient)' : 'NÅGOT UI-TEST MISSLYCKADES')
process.exit(allOk ? 0 : 1)
