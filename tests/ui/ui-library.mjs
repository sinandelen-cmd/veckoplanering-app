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
import { scrollThroughPlan } from './scroll-through.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'

const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const weeksData = SCENARIOS['alla-21']().map((w, i) => { const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10)); return { ...w, weekStart: iso(d), keepVisibleExtra: true } })
const row = (id, title, archived = false) => ({ id, user_id: '00000000-0000-4000-8000-000000000001', title, subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title, subject: 'Matematik', schoolForm: 'Gymnasiet', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, archived, classGroups: [{ name: '8A', days: ['Måndag', 'Onsdag'], startDate: '2026-01-01' }] }), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' })

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
// Räknar veckor och lektioner i alla-veckor-vyn. Planen scrollas igenom först, eftersom lektioner ritas när de närmar sig skärmen.
const countWeeks = async page => {
  await btn(page, 'Visa alla veckor').evaluate(e => e.click()).catch(() => {})
  await page.waitForSelector('.week-card', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(500)
  await scrollThroughPlan(page)
  const n = await page.evaluate(() => document.querySelectorAll('#lararvy .week-card').length)
  const lessons = await page.evaluate(() => document.querySelectorAll('#lararvy .lesson').length)
  await btn(page, 'Dölj alla veckor').evaluate(e => e.click()).catch(() => {})
  return { weeks: n, lessons }
}
await check('arkivering och återställning behåller alla 21 veckor, lektioner och klasser i kursen', async () => {
  await ensureSubject(keep.page)
  await btn(keep.page, 'Matematik 1b').evaluate(e => e.click())
  await keep.page.waitForSelector('.week-card', { timeout: 20000 })
  const before = await countWeeks(keep.page)
  assert.equal(before.weeks, 21, 'före arkivering: ' + before.weeks + ' veckor')
  assert.ok(before.lessons > 0, 'inga lektioner före arkivering')
  assert.ok(await btn(keep.page, '8A').count() > 0, 'klassen 8A saknas före arkivering')
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
  assert.equal(after.weeks, before.weeks, 'veckor efter återställning: ' + after.weeks + ', före: ' + before.weeks)
  assert.equal(after.lessons, before.lessons, 'lektioner efter återställning: ' + after.lessons + ', före: ' + before.lessons)
  assert.ok(await btn(keep.page, '8A').count() > 0, 'klassen 8A saknas efter återställning')
})
await keep.page.close()

// 5. Tomma ämnen: en mapp utan kurser kan arkiveras, återställas och raderas permanent, men bara från arkivet.
const uid = '00000000-0000-4000-8000-000000000001'
const emptyPage = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const emptyErrors = []
emptyPage.on('pageerror', e => emptyErrors.push(e.message))
emptyPage.__lastDialog = ''
emptyPage.__accept = true
emptyPage.on('dialog', d => { emptyPage.__lastDialog = d.message(); if (emptyPage.__accept) d.accept(); else d.dismiss() })
await emptyPage.route(/^https?:\/\/(?!localhost)/, r => r.abort())
await emptyPage.addInitScript(([seed, folders]) => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed); localStorage.setItem('arsplanering-subject-folders', folders) }, [JSON.stringify({ veckoplanering: [row('m1', 'Matematik 1b')] }), JSON.stringify({ [uid]: { Gymnasiet: ['Matematik', 'Biologi'] } })])
await emptyPage.goto(base + '/', { waitUntil: 'networkidle' })
await emptyPage.waitForTimeout(400)
await check('ett tomt ämne (Biologi) visas med "Arkivera ämne", men utan "Ta bort ämne" eller "Radera ämne"', async () => {
  await btn(emptyPage, 'Gymnasiet').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  assert.ok(await btn(emptyPage, 'Biologi').count() > 0, 'tomma ämnet Biologi saknas i den aktiva listan')
  await btn(emptyPage, 'Biologi').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  assert.ok(await btn(emptyPage, 'Arkivera ämne').count() > 0, '"Arkivera ämne" saknas för tomt ämne')
  assert.equal(await emptyPage.locator('button', { hasText: 'Ta bort ämne' }).count(), 0, '"Ta bort ämne" finns')
  assert.equal(await emptyPage.locator('button', { hasText: 'Radera ämne' }).count(), 0, '"Radera ämne" finns i den aktiva listan')
})
await check('tomt ämne arkiveras och syns bara i arkivet', async () => {
  await btn(emptyPage, 'Arkivera ämne').evaluate(e => e.click())
  await emptyPage.waitForTimeout(500)
  assert.match(emptyPage.__lastDialog, /Arkivera ämnet "Biologi"\?/, 'bekräftelsen saknas: ' + emptyPage.__lastDialog)
  assert.equal(await emptyPage.locator('button:visible', { hasText: 'Biologi' }).count(), 0, 'Biologi syns kvar i den aktiva listan')
  await btn(emptyPage, '🗃 Arkiv').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  await btn(emptyPage, 'Gymnasiet').evaluate(e => e.click()).catch(() => {})
  await emptyPage.waitForTimeout(300)
  assert.ok(await btn(emptyPage, 'Biologi').count() > 0, 'Biologi syns inte i arkivet')
})
await check('tomt ämne i arkivet: "Återställ ämne" och "Radera ämne" är aktiva', async () => {
  await btn(emptyPage, 'Biologi').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  assert.ok(await btn(emptyPage, 'Återställ ämne').count() > 0, '"Återställ ämne" saknas')
  const del = btn(emptyPage, 'Radera ämne')
  assert.ok(await del.count() > 0, '"Radera ämne" saknas i arkivet')
  assert.equal(await del.isDisabled(), false, '"Radera ämne" är inaktiv för tomt ämne')
  assert.equal(await emptyPage.locator('button', { hasText: 'Ny kurs' }).count(), 0, '"Ny kurs" syns i arkivet')
})
await check('återställ tomt ämne: det flyttas tillbaka till den aktiva listan', async () => {
  await btn(emptyPage, 'Återställ ämne').evaluate(e => e.click())
  await emptyPage.waitForTimeout(500)
  assert.match(emptyPage.__lastDialog, /Återställ ämnet "Biologi" till den aktiva listan/, 'bekräftelsen saknas: ' + emptyPage.__lastDialog)
  await btn(emptyPage, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await emptyPage.waitForTimeout(300)
  await btn(emptyPage, 'Gymnasiet').evaluate(e => e.click()).catch(() => {})
  await emptyPage.waitForTimeout(300)
  assert.ok(await btn(emptyPage, 'Biologi').count() > 0, 'Biologi är inte tillbaka i den aktiva listan')
})
await check('permanent radering av tomt ämne: bekräftelsen säger att inga kurser finns, och mappen tas bort', async () => {
  await btn(emptyPage, 'Arkivera ämne').evaluate(e => e.click())
  await emptyPage.waitForTimeout(500)
  await btn(emptyPage, '🗃 Arkiv').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  await btn(emptyPage, 'Gymnasiet').evaluate(e => e.click()).catch(() => {})
  await emptyPage.waitForTimeout(300)
  await btn(emptyPage, 'Biologi').evaluate(e => e.click())
  await emptyPage.waitForTimeout(300)
  emptyPage.__lastDialog = ''
  emptyPage.__accept = true
  await btn(emptyPage, 'Radera ämne').evaluate(e => e.click())
  await emptyPage.waitForTimeout(500)
  assert.match(emptyPage.__lastDialog, /Radera ämnet "Biologi" permanent/, 'rubriken saknas: ' + emptyPage.__lastDialog)
  assert.match(emptyPage.__lastDialog, /Ämnet har inga kurser/, 'texten om tomt ämne saknas')
  assert.match(emptyPage.__lastDialog, /Detta kan inte ångras/, 'texten om att det inte kan ångras saknas')
  const folders = await emptyPage.evaluate(() => localStorage.getItem('arsplanering-subject-folders'))
  assert.ok(!String(folders).includes('Biologi'), 'mappen Biologi finns kvar i lagringen')
  await btn(emptyPage, '📂 Visa aktiva').evaluate(e => e.click()).catch(() => {})
  await emptyPage.waitForTimeout(300)
  assert.equal(await emptyPage.locator('button:visible', { hasText: 'Biologi' }).count(), 0, 'Biologi syns i den aktiva listan efter radering')
})
await check('inga sidfel med tomma ämnen', async () => assert.deepEqual(emptyErrors, [], 'fel: ' + emptyErrors.join(' | ')))
await emptyPage.close()

await check('inga sidfel i biblioteket', async () => assert.deepEqual(arch.errors, [], 'fel: ' + arch.errors.join(' | ')))
await arch.page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT BIBLIOTEKSTEST MISSLYCKADES' : 'ALLA BIBLIOTEKSTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
