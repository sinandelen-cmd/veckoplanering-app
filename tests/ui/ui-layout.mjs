// Layouttest för lärarvy, klassvy, elevvy och utskrift med FIKTIV Supabase-klient. Körning: npm run test:ui:layout
// Realistiska långa moment i vecka 46 och 47 (fast datum i vecka 46). Kontrollerar vid 1024, 1366 och 1920 px:
//  - vecka 46 och 47 visas bredvid varandra i tvåveckorsläget
//  - hela momenttexten syns (ingen intern rullning eller klippt text) i lärarvyn, klassvyn och elevvyn
//  - momentet är det bredaste fältet, och vid 1024 px ligger Sida och Uppgift under momentet
//  - tomma Sida- och Uppgift-rutor är små och elevvyn visar inga redigeringsknappar eller platshållare
//  - inga knappar eller textrutor överlappar varandra
//  - utskriften behåller sina kolumner och har inga klippta eller tomma rutor
import { scrollThroughPlan } from './scroll-through.mjs'
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

const FIXED = new Date('2026-11-11T10:00:00') // vecka 46: då visas vecka 46 och 47 bredvid varandra
const monday = new Date(FIXED); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const REAL = {
  9: { chapter: 'Ekvationer och samband', lessons: [
    { name: 'Lektion 1', topics: [{ name: 'Lösa ekvationer med en obekant: lika-tecknet, addition och subtraktion, och kontroll av svaret genom att sätta in det i ursprungsekvationen. Eleverna arbetar i par med balansmodellen.', pages: ['s. 40–42'], assignments: ['Uppgift 1–10 i boken', 'Extra: 11–12 för snabba elever'], links: [] }] },
    { name: 'Lektion 2', topics: [{ name: 'Multiplikation och division i ekvationer: 4x = 20 och x/3 = 5. Repetera tabellerna och förklara varför vi dividerar båda leden.', pages: ['s. 43'], assignments: ['Uppgift 13–16'], links: [] }] },
    { name: 'Lektion 3', topics: [{ name: 'Kort test om enkla ekvationer (15 min)', pages: [], assignments: ['Förbered tre frågor'], links: [] }] },
  ] },
  10: { chapter: 'Ekvationer och samband', lessons: [
    { name: 'Lektion 1', topics: [{ name: 'Parenteser i ekvationer: utveckla parenteser med hjälp av distributiva lagen, samla termer på samma sida och lös ekvationer med bråktal. Diskutera när en ekvation saknar lösning eller har oändligt många.', pages: ['s. 48–50'], assignments: ['Uppgift 1–8', 'Uppgift 9 (utmaning)', 'Uppgift 10: skriv en egen ekvation och lös den'], links: [] }] },
    { name: 'Lektion 2', topics: [{ name: 'Ekvationer i verkliga situationer: ställa upp en ekvation utifrån en text, lösa problemet och tolka svaret i sammanhanget.', pages: ['s. 51'], assignments: ['Problemlösning 1–4'], links: [] }] },
    { name: 'Lektion 3', topics: [{ name: 'Repetition inför prov', pages: [], assignments: [], links: [] }] },
  ] },
}
const weeksData = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 9))
  const real = REAL[i]
  return { ...w, weekStart: iso(d), keepVisibleExtra: true, chapter: real?.chapter ?? (i < 9 ? 'Tal' : 'Geometri'), pages: [],
    lessons: real ? real.lessons : w.lessons?.map(l => ({ ...l, topics: [{ name: 'Ekvation och variabel', pages: ['s. 5'], assignments: ['Uppgift 2'], links: [] }] })) }
})
const planRow = {
  id: 'layout', user_id: '00000000-0000-4000-8000-000000000001', title: 'Layouttest', subject: 'Matematik', school_year: 'Testår', weeks: 21, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z',
  content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Layouttest', subject: 'Matematik', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, classGroups: [{ name: '8A', days: ['Måndag', 'Onsdag'], startDate: '2026-01-01' }, { name: '8B', days: ['Tisdag', 'Torsdag'], startDate: '2026-01-01' }] }),
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0].slice(0, 300)) } }

async function openTeacher(width, height) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.clock.setFixedTime(FIXED)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [planRow] }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  const tap = t => page.getByText(t, { exact: false }).first().evaluate(e => e.click())
  await tap('Mina planeringar')
  await page.getByText('Övriga planeringar').first().evaluate(e => e.click()).catch(() => {})
  await tap('Matematik').catch(() => {})
  await tap('Layouttest')
  await page.waitForSelector('.week-card', { timeout: 20000 })
  await page.waitForTimeout(400)
  return { page, errors }
}
// Mäter lektionskorten i lärarvyn eller klassvyn. Visibla kort, klippta textrutor, momentets andel och överlapp.
const measureLessons = page => page.evaluate(() => {
  const vis = e => e.getBoundingClientRect().width > 0
  const grids = [...document.querySelectorAll('#lararvy .lesson .topic-grid')].filter(g => vis(g) && !g.closest('.teacher-print-host'))
  const clipped = [...document.querySelectorAll('#lararvy .lesson .topic-grid textarea, #lararvy .lesson .topic-grid .topic-name-display, #lararvy .lesson .topic-grid .topic-cell span')].filter(e => vis(e) && !e.closest('.teacher-print-host') && e.scrollHeight - e.clientHeight > 2).length
  const shares = grids.filter(g => g.querySelector(':scope > .topic-name')).map(g => g.querySelector(':scope > .topic-name').getBoundingClientRect().width / g.getBoundingClientRect().width)
  const emptyCells = [...document.querySelectorAll('#lararvy .lesson .topic-grid textarea:placeholder-shown')].filter(e => vis(e) && !e.closest('.teacher-print-host')).map(e => e.getBoundingClientRect().height)
  const els = [...document.querySelectorAll('#lararvy .lesson .topic-grid button, #lararvy .lesson .topic-grid textarea, #lararvy .lesson .topic-grid input')].filter(e => vis(e) && !e.closest('.teacher-print-host'))
  const rects = els.map(e => e.getBoundingClientRect())
  let overlaps = 0
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps++ }
  return { grids: grids.length, clipped, minShare: shares.length ? Math.min(...shares) : null, maxEmptyCell: emptyCells.length ? Math.max(...emptyCells) : null, overlaps }
})

for (const [w, h] of [[1024, 768], [1366, 900], [1920, 1000]]) {
  const t = await openTeacher(w, h)
  await scrollThroughPlan(t.page)
  await check(`${w} px: vecka 46 och 47 visas bredvid varandra i tvåveckorsläget`, async () => {
    const cards = await t.page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { wk: e.closest('[data-week]')?.getAttribute('data-week'), x: r.left, y: r.top, w: r.width } }))
    assert.deepEqual(cards.map(c => c.wk), ['46', '47'], 'veckor: ' + cards.map(c => c.wk).join(','))
    assert.ok(cards[1].x >= cards[0].x + cards[0].w - 2 && Math.abs(cards[0].y - cards[1].y) < 3, 'korten ligger inte bredvid varandra')
  })
  await check(`${w} px: hela momenttexten syns i lärarvyn (ingen klippt text eller intern rullning)`, async () => {
    const m = await measureLessons(t.page)
    assert.ok(m.grids >= 6, 'för få lektionskort mättes: ' + m.grids)
    assert.equal(m.clipped, 0, 'klippta textrutor: ' + m.clipped)
  })
  await check(`${w} px: momentet är det bredaste fältet, och vid smal skärm ligger det över hela raden`, async () => {
    const m = await measureLessons(t.page)
    const min = w >= 1201 ? 0.55 : 0.9
    assert.ok(m.minShare >= min, 'lägsta andel moment: ' + m.minShare?.toFixed(2) + ' (krav ' + min + ')')
  })
  await check(`${w} px: tomma Sida- och Uppgift-rutor är små`, async () => {
    const m = await measureLessons(t.page)
    if (m.maxEmptyCell !== null) assert.ok(m.maxEmptyCell <= 56, 'tom ruta för hög: ' + m.maxEmptyCell + ' px (en textrad med marginal)')
  })
  await check(`${w} px: inga knappar eller textrutor överlappar i lektionskorten`, async () => {
    const m = await measureLessons(t.page)
    assert.equal(m.overlaps, 0, 'överlappande element: ' + m.overlaps)
  })
  await check(`${w} px: klassvyn 8A visar hela texten utan klippning`, async () => {
    await t.page.getByText('8A', { exact: true }).first().evaluate(e => e.click())
    await t.page.waitForTimeout(600)
    const m = await measureLessons(t.page)
    assert.ok(m.grids >= 2, 'klassvyn har inga lektioner: ' + m.grids)
    assert.equal(m.clipped, 0, 'klippt text i klassvyn: ' + m.clipped)
  })
  await check(`${w} px: inga sidfel`, async () => {
    assert.deepEqual(t.errors, [], 'fel: ' + t.errors.join(' | '))
  })
  await t.page.close()
}

// Elevvyn: samma planering som publicerad vy i en testsida.
const eleven = await browser.newPage({ viewport: { width: 1366, height: 900 } })
await eleven.route(/^https?:\/\/(?!localhost)/, r => r.abort())
const elevErrors = []; eleven.on('pageerror', e => elevErrors.push(e.message))
await eleven.goto(base + '/tests/ui/student-harness.html', { waitUntil: 'networkidle' })
await eleven.waitForTimeout(800)
const elevMeasure = async (width) => {
  await eleven.setViewportSize({ width, height: 900 })
  await eleven.waitForTimeout(300)
  return eleven.evaluate(() => {
    const vis = e => e.getBoundingClientRect().width > 0
    const controls = [...document.querySelectorAll('button, input:not([type=checkbox]), textarea, select')].filter(vis).map(e => e.getAttribute('aria-label') || e.textContent.trim())
    const clipped = [...document.querySelectorAll('.student-screen-card .topic-cell span, .student-screen-card .topic-name-display')].filter(e => vis(e) && e.scrollHeight - e.clientHeight > 2).length
    const dagEjVald = document.body.innerText.includes('Dag ej vald')
    const grid = [...document.querySelectorAll('.student-screen-card .topic-grid')].find(vis)
    const moment = grid?.querySelector(':scope > .topic-name')
    const share = moment && grid ? moment.getBoundingClientRect().width / grid.getBoundingClientRect().width : null
    const emptyCells = [...document.querySelectorAll('.student-screen-card .topic-cell')].filter(c => !c.textContent.trim()).length
    return { controls, clipped, dagEjVald, share, emptyCells, cards: document.querySelectorAll('.student-screen-card').length }
  })
}
for (const w of [1024, 1366, 1920]) {
  await check(`${w} px: elevvyn har inga redigeringsknappar, papperskorgar eller plusknappar`, async () => {
    const m = await elevMeasure(w)
    assert.ok(m.cards >= 2, 'elevvyn visar inga veckor')
    const allowed = m.controls.every(c => /skriv ut|kopiera|elevlänk/i.test(c) || c === 'active')
    assert.ok(allowed, 'oväntade kontroller i elevvyn: ' + m.controls.join(', '))
  })
  await check(`${w} px: elevvyn kapar ingen text och visar ingen tom ruta eller "Dag ej vald"`, async () => {
    const m = await elevMeasure(w)
    assert.equal(m.clipped, 0, 'klippt text i elevvyn: ' + m.clipped)
    assert.equal(m.emptyCells, 0, 'tomma rutor i elevvyn: ' + m.emptyCells)
    assert.equal(m.dagEjVald, false, '"Dag ej vald" syns för elever')
  })
  await check(`${w} px: elevvyn: momentet får mest utrymme`, async () => {
    const m = await elevMeasure(w)
    if (m.share !== null) assert.ok(m.share >= (w >= 1201 ? 0.55 : 0.9), 'andel moment i elevvyn: ' + m.share?.toFixed(2))
  })
}
await check('elevvyn: inga sidfel', async () => assert.deepEqual(elevErrors, [], 'fel: ' + elevErrors.join(' | ')))
await eleven.close()

// Utskrift: samma kolumner som tidigare, inga klippta rutor eller tomma rutor.
const print = await openTeacher(1366, 900)
await check('utskrift: kolumnerna är oförändrade och inget klipps', async () => {
  await print.page.locator('button[aria-label="Skriv ut"]').first().click()
  await print.page.waitForSelector('.teacher-print-host .student-print-page', { state: 'attached', timeout: 60000 })
  await print.page.waitForTimeout(1000)
  const info = await print.page.evaluate(() => {
    const pages = [...document.querySelectorAll('.teacher-print-host .student-print-page')]
    const clipped = [...document.querySelectorAll('.teacher-print-host .student-print-page .topic-name-display, .teacher-print-host .student-print-page .topic-cell span')].filter(e => e.scrollHeight - e.clientHeight > 2).length
    const empties = [...document.querySelectorAll('.teacher-print-host .student-print-page .topic-cell')].filter(c => !c.textContent.trim()).length
    const cols = [...document.querySelectorAll('.teacher-print-host .student-print-page .topic-grid')].slice(0, 2).map(g => getComputedStyle(g).gridTemplateColumns)
    return { pages: pages.length, clipped, empties, cols }
  })
  assert.ok(info.pages > 0, 'inga utskriftssidor')
  assert.equal(info.clipped, 0, 'klippta rutor i utskriften: ' + info.clipped)
  assert.equal(info.empties, 0, 'tomma rutor i utskriften: ' + info.empties)
  assert.deepEqual(info.cols, ['266.438px 204.969px 204.969px', '266.438px 204.969px 204.969px'], 'kolumnerna ändrades: ' + JSON.stringify(info.cols))
})
await check('utskrift och lärarvy: inga sidfel', async () => assert.deepEqual(print.errors, [], 'fel: ' + print.errors.join(' | ')))
await print.page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT LAYOUTTEST MISSLYCKADES' : 'ALLA LAYOUTTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
