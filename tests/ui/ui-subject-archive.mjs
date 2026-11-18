// Ämnesarkivering med FIKTIV Supabase-klient. Körning: npm run test:ui:subject-archive
// Två planeringar i samma ämne: "Arkivera ämne" flyttar båda till arkivet, och "Återställ ämne" i arkivet flyttar tillbaka dem.
// Inga externa anrop, inga riktiga konton eller data.
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

const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const weeksData = SCENARIOS['alla-21']().map((w, i) => { const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10)); return { ...w, weekStart: iso(d), keepVisibleExtra: true } })
const planRow = (id, title, archived) => {
  const plan = { kind: 'arsplanering-v2', title, subject: 'Testämne', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, archived }
  return { id, user_id: '00000000-0000-4000-8000-000000000001', title, subject: 'Testämne', school_year: 'Testår', content: JSON.stringify(plan), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 6).join(' | ').slice(0, 900)) } }

const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
let dialogMessage = ''
page.on('dialog', d => { dialogMessage = d.message(); d.accept() })
await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [planRow('ka', 'Veckotest Ämne A', false), planRow('kb', 'Veckotest Ämne B', false)] }))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.getByText('Mina planeringar').first().click()
await page.getByText('Övriga planeringar').first().click().catch(() => {})
await page.getByText('Testämne', { exact: false }).first().click()
await page.waitForTimeout(400)

// Öppnar ämnet Testämne. Gruppen "Övriga planeringar" fälls bara ut om den inte redan är öppen.
async function openSubject() {
  const subject = page.locator('button:visible', { hasText: 'Testämne' }).first()
  if (!(await subject.count())) await page.locator('button:visible', { hasText: 'Övriga planeringar' }).first().click()
  await page.locator('button:visible', { hasText: 'Testämne' }).first().click()
}
const archiveBtn = () => page.locator('button:visible', { hasText: /^(Arkivera|Återställ) ämne$/ }).first()
await check('ämnesmappen visar knappen "Arkivera ämne"', async () => {
  assert.equal((await archiveBtn().innerText()).trim(), 'Arkivera ämne')
})
await check('i aktiva vyn finns ingen "Radera ämne", men "Ny kurs" och "Ta bort ämne" finns', async () => {
  assert.equal(await page.locator('button:visible', { hasText: 'Radera ämne' }).count(), 0, '"Radera ämne" syns i den aktiva vyn')
  assert.ok(await page.locator('button:visible', { hasText: 'Ny kurs' }).count() > 0, '"Ny kurs" saknas')
  assert.ok(await page.locator('button:visible', { hasText: 'Ta bort ämne' }).count() > 0, '"Ta bort ämne" saknas')
})
await check('Arkivera ämne flyttar båda kurserna till arkivet', async () => {
  await archiveBtn().click()
  await page.waitForTimeout(800)
  assert.match(dialogMessage, /Arkivera 2 kurser i "Testämne"/, 'bekräftelsen saknas: ' + dialogMessage)
  const active = await page.locator('button:visible', { hasText: 'Veckotest Ämne' }).count()
  assert.equal(active, 0, 'kurserna syns fortfarande i den aktiva listan')
})
await check('i arkivvyn visas bara "Återställ ämne" och "Radera ämne", utan överlapp', async () => {
  await page.locator('button:visible', { hasText: '🗃 Arkiv' }).first().click()
  await page.waitForTimeout(300)
  await openSubject()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('button:visible', { hasText: 'Ny kurs' }).count(), 0, '"Ny kurs" syns i arkivet')
  assert.equal(await page.locator('button:visible', { hasText: 'Ta bort ämne' }).count(), 0, '"Ta bort ämne" syns i arkivet')
  const boxes = await page.locator('button:visible', { hasText: /ämne$/ }).evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })))
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    const overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2
    assert.ok(!overlap, 'knapparna överlappar varandra')
  }
  // Gå tillbaka till arkivets första vy så att följande steg startar från samma läge.
  await archiveBtn().waitFor()
})
await check('i arkivet visas kurserna och knappen byter till "Återställ ämne"', async () => {
  await page.locator('button:visible', { hasText: '🗃 Arkiv' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(400)
  await openSubject()
  await page.waitForTimeout(400)
  assert.equal((await archiveBtn().innerText()).trim(), 'Återställ ämne', 'knappen i arkivet: ' + (await archiveBtn().innerText()))
})
await check('Återställ ämne flyttar tillbaka båda kurserna till den aktiva listan', async () => {
  await archiveBtn().click()
  await page.waitForTimeout(800)
  assert.match(dialogMessage, /Återställ 2 kurser i "Testämne"/, 'bekräftelsen saknas: ' + dialogMessage)
  await page.locator('button:visible', { hasText: '📂 Visa aktiva' }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  await page.getByText('Övriga planeringar').first().click().catch(() => {})
  await openSubject()
  assert.equal((await page.locator('button:visible', { hasText: 'Veckotest Ämne' }).count()) >= 2, true, 'kurserna är inte tillbaka i den aktiva listan')
})
await check('i arkivet kan ämnet raderas permanent, och kurserna är borta', async () => {
  await archiveBtn().click(); await page.waitForTimeout(800)
  await page.locator('button:visible', { hasText: '🗃 Arkiv' }).first().click()
  await page.waitForTimeout(400)
  await openSubject()
  await page.waitForTimeout(400)
  const del = page.locator('button:visible', { hasText: 'Radera ämne' }).first()
  assert.equal(await del.count(), 1, 'knappen "Radera ämne" saknas i arkivet')
  dialogMessage = ''
  await del.click()
  await page.waitForTimeout(800)
  assert.match(dialogMessage, /Radera 2 kurser i "Testämne" permanent/, 'bekräftelsen saknas: ' + dialogMessage)
  assert.equal(await page.locator('button:visible', { hasText: 'Veckotest Ämne' }).count(), 0, 'kurserna syns fortfarande i arkivet')
  await page.locator('button:visible', { hasText: '📂 Visa aktiva' }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  assert.equal(await page.locator('button:visible', { hasText: 'Veckotest Ämne' }).count(), 0, 'kurserna syns i den aktiva listan')
})
await check('inga sidfel', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT ÄMNESTEST MISSLYCKADES' : 'ALLA ÄMNESTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
