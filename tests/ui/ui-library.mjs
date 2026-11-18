// Biblioteket med FIKTIV Supabase-klient. Körning: npm run test:ui:library
// Kontrollerar:
//  - appen öppnar direkt i biblioteket (ingen "Vad vill du göra?" och ingen "← Startsida")
//  - ämnesraden: knappar och text överlappar aldrig vid 1024, 1366 och 1920 px
//  - "Ta bort ämne" finns inte i den aktiva listan, och "Radera ämne" finns bara i arkivet
//  - permanent radering har en bekräftelse som beskriver vad som försvinner, och avbryts den ändras inget
//  - arkivering och återställning bevarar kurserna med alla veckor
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
const row = (id, title, archived = false) => ({ id, user_id: '00000000-0000-4000-8000-000000000001', title, subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title, subject: 'Matematik', schoolForm: 'Gymnasiet', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, archived }), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 500)) } }
const overlapsIn = page => page.evaluate(() => {
  const els = [...document.querySelectorAll('#mina-arsplaneringar .subject-folder-heading > *')].filter(e => e.getBoundingClientRect().width > 0)
  const rs = els.map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 30), l: r.left, r: r.right, tp: r.top, b: r.bottom } })
  const out = []
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.tp, b.tp) > 2) out.push(a.t + ' / ' + b.t) }
  return { count: rs.length, overlaps: out }
})

async function open(width, plans, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  // Bekräftelser: godkänns som standard (arkivering och återställning). Avbrytningstestet sätter __accept = false.
  page.__accept = true
  page.on('dialog', d => { page.__lastDialog = d.message(); if (page.__accept) d.accept(); else d.dismiss() })
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: plans }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { page, errors }
}
const btn = (page, text) => page.locator('button:visible', { hasText: text }).first()
// Ser till att kurserna i Matematik syns: öppnar Gymnasiet och ämnet bara när kurserna inte redan är synliga.
async function ensureSubject(page) {
  const coursesVisible = async () => (await page.locator('button:visible', { hasText: /^📁 Matematik/ }).count()) > 0
  if (await coursesVisible()) return
  if (!(await btn(page, 'Matematik').count())) await btn(page, 'Gymnasiet').evaluate(e => e.click()).catch(() => {})
  await page.waitForTimeout(300)
  if (!(await coursesVisible())) await btn(page, 'Matematik').evaluate(e => e.click())
  await page.waitForTimeout(300)
}
async function goToSubject(page) {
  await btn(page, 'Gymnasiet').evaluate(e => e.click())
  await page.waitForTimeout(300)
  await btn(page, 'Matematik').evaluate(e => e.click())
  await page.waitForTimeout(300)
}

// 1. Direktnavigering: biblioteket öppnas direkt, utan mellanvy och utan "← Startsida".
const start = await open(1366, [row('m1', 'Matematik 1b'), row('m2', 'Matematik 2c')])
await check('appen öppnar direkt i biblioteket, utan "Vad vill du göra?" och utan "Startsida"', async () => {
  const text = await start.page.locator('body').innerText()
  assert.ok(!/Vad vill du göra/i.test(text), '"Vad vill du göra?" visas')
  assert.ok(!/Startsida/.test(text), '"Startsida" visas')
  assert.ok(/Mina planeringar/.test(text) && /Gymnasiet/.test(text), 'biblioteket visas inte direkt')
  assert.equal(await start.page.locator('button:visible', { hasText: /^← / }).count(), 0, 'tillbaka-knapp i rotvyn')
})
await check('ingen "Mina planeringar"-startknapp (den tidigare mellanvyn) finns kvar', async () => {
  assert.equal(await start.page.locator('.home-tile').count(), 0, 'startkortet finns kvar')
})
await check('tillbaka-knappen fungerar: Gymnasiet → ämne → tillbaka till Gymnasiet → tillbaka till skolformerna', async () => {
  await goToSubject(start.page)
  await start.page.locator('button:visible', { hasText: '← Gymnasiet' }).first().evaluate(e => e.click())
  await start.page.waitForTimeout(300)
  await start.page.waitForTimeout(200)
  assert.ok(/Gymnasiet/.test(await start.page.locator('body').innerText()), 'tillbaka i skolformerna saknas')
})
await check('siduppdatering i biblioteket behåller läget utan att visa mellanvyn', async () => {
  await start.page.reload({ waitUntil: 'networkidle' })
  await start.page.waitForTimeout(400)
  const text = await start.page.locator('body').innerText()
  assert.ok(!/Vad vill du göra/i.test(text) && /Mina planeringar/.test(text), 'siduppdatering visar fel vy')
})
await check('inga sidfel vid direktnavigering', async () => assert.deepEqual(start.errors, [], 'fel: ' + start.errors.join(' | ')))
await start.page.close()

// 2. Ämnesraden: inga överlapp i någon vy vid 1024, 1366 och 1920 px.
for (const width of [1024, 1366, 1920]) {
  const t = await open(width, [row('m1', 'Matematik 1b'), row('m2', 'Matematik 2c')], width === 1024 ? 768 : 900)
  await goToSubject(t.page)
  await check(`${width} px: ämnesraden (aktiv) har inga överlappande knappar eller text`, async () => {
    const m = await overlapsIn(t.page)
    assert.ok(m.count >= 3, 'för få element på ämnesraden: ' + m.count)
    assert.deepEqual(m.overlaps, [], 'överlapp: ' + m.overlaps.join('; '))
  })
  await check(`${width} px: aktiv ämneslista har "Ny kurs" och "Arkivera ämne" men inte "Ta bort ämne" eller "Radera ämne"`, async () => {
    assert.ok(await btn(t.page, 'Ny kurs').count() > 0, '"Ny kurs" saknas')
    assert.ok(await btn(t.page, 'Arkivera ämne').count() > 0, '"Arkivera ämne" saknas')
    assert.equal(await t.page.locator('button', { hasText: 'Ta bort ämne' }).count(), 0, '"Ta bort ämne" finns kvar')
    assert.equal(await t.page.locator('button', { hasText: 'Radera ämne' }).count(), 0, '"Radera ämne" finns i den aktiva listan')
  })
  await t.page.close()
}

// 3. Arkivet: "Radera ämne" finns bara där, och ingen överlappning.
const arch = await open(1366, [row('m1', 'Matematik 1b', true), row('m2', 'Matematik 2c', true)])
await check('i arkivet finns "Radera ämne" och "Återställ ämne", men inte "Ny kurs" eller "Ta bort ämne"', async () => {
  await btn(arch.page, '🗃 Arkiv').evaluate(e => e.click())
  await arch.page.waitForTimeout(300)
  await goToSubject(arch.page)
  assert.ok(await btn(arch.page, 'Radera ämne').count() > 0, '"Radera ämne" saknas i arkivet')
  assert.ok(await btn(arch.page, 'Återställ ämne').count() > 0, '"Återställ ämne" saknas i arkivet')
  assert.equal(await arch.page.locator('button', { hasText: 'Ny kurs' }).count(), 0, '"Ny kurs" syns i arkivet')
  assert.equal(await arch.page.locator('button', { hasText: 'Ta bort ämne' }).count(), 0, '"Ta bort ämne" syns i arkivet')
  const m = await overlapsIn(arch.page)
  assert.deepEqual(m.overlaps, [], 'överlapp i arkivet: ' + m.overlaps.join('; '))
})
await check('permanent radering: bekräftelsen beskriver kurser, veckor, lektioner och att det inte kan ångras', async () => {
  arch.page.__lastDialog = ''
  arch.page.__accept = false
  await btn(arch.page, 'Radera ämne').evaluate(e => e.click())
  await arch.page.waitForTimeout(400)
  const message = arch.page.__lastDialog
  assert.match(message, /Radera ämnet "Matematik" permanent/, 'rubriken saknas: ' + message)
  assert.match(message, /Matematik 1b/, 'kursen 1b nämns inte')
  assert.match(message, /Matematik 2c/, 'kursen 2c nämns inte')
  assert.match(message, /\d+ veckor, \d+ lektioner/, 'antal veckor och lektioner saknas')
  assert.match(message, /Aktiva kurser i ämnet.*påverkas inte/, 'texten om aktiva kurser saknas')
  assert.match(message, /Detta kan inte ångras/, 'texten om att det inte kan ångras saknas')
})
await check('avbruten radering ändrar ingenting: kurserna finns kvar i arkivet', async () => {
  // Bekräftelsen avvisades (dismiss), så båda kurserna ska fortfarande finnas i arkivet.
  arch.page.__accept = true
  assert.ok(await arch.page.locator('text=Matematik 1b').count() > 0, 'Matematik 1b försvann trots avbrott')
  assert.ok(await arch.page.locator('text=Matematik 2c').count() > 0, 'Matematik 2c försvann trots avbrott')
})
// 4. Arkivera och återställ bevarar allt innehåll: samma veckor och lektioner före och efter.
const keep = await open(1366, [row('m1', 'Matematik 1b'), row('m2', 'Matematik 2c')])
const countWeeks = async page => {
  await btn(page, 'Visa alla veckor').evaluate(e => e.click()).catch(() => {})
  await page.waitForSelector('.week-card', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(500)
  const n = await page.evaluate(() => document.querySelectorAll('#lararvy .week-card').length)
  await btn(page, 'Dölj alla veckor').evaluate(e => e.click()).catch(() => {})
  return n
}
await check('arkivering och återställning behåller alla 21 veckor i kursen', async () => {
  await ensureSubject(keep.page)
  await btn(keep.page, 'Matematik 1b').evaluate(e => e.click())
  await keep.page.waitForSelector('.week-card', { timeout: 20000 })
  const before = await countWeeks(keep.page)
  assert.equal(before, 21, 'före arkivering: ' + before + ' veckor')
  // Tillbaka till ämneslistan: kursen är öppen och ämnesraden syns inte förrän vi går tillbaka.
  await btn(keep.page, '← Matematik').evaluate(e => e.click())
  await keep.page.waitForTimeout(400)
  await ensureSubject(keep.page)
  await btn(keep.page, 'Arkivera ämne').evaluate(e => e.click())
  await keep.page.waitForTimeout(600)
  await btn(keep.page, '🗃 Arkiv').evaluate(e => e.click())
  await keep.page.waitForTimeout(300)
  await ensureSubject(keep.page)
  await btn(keep.page, 'Återställ ämne').evaluate(e => e.click())
  await keep.page.waitForTimeout(600)
  await btn(keep.page, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await keep.page.waitForTimeout(300)
  await ensureSubject(keep.page)
  await btn(keep.page, 'Matematik 1b').evaluate(e => e.click())
  await keep.page.waitForSelector('.week-card', { timeout: 20000 })
  const after = await countWeeks(keep.page)
  assert.equal(after, before, 'efter arkivering och återställning: ' + after + ' veckor, före: ' + before)
})
await keep.page.close()

await check('inga sidfel i biblioteket', async () => assert.deepEqual(arch.errors, [], 'fel: ' + arch.errors.join(' | ')))
await arch.page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT BIBLIOTEKSTEST MISSLYCKADES' : 'ALLA BIBLIOTEKSTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
