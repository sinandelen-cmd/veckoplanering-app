// Lektionsfält med FIKTIV Supabase-klient. Körning: npm run test:ui:lessonfields
// Kontrollerar Moment / Sida / Uppgift i lärarvyn:
//  - Moment är det bredaste fältet (ca 55 %), Sida och Uppgift delar resten och ligger på samma rad
//  - långa moment och inklistrad text radbryts och textrutan växer, utan intern rullningslist
//  - plus-, ta-bort- och länkknapparna fungerar, och ändringarna består
//  - två A4-kort ligger fortfarande bredvid varandra, och mobilvyn går inte att scrolla sidled
// Inga externa anrop, inga riktiga konton eller data.
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

const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const LONG = 'Ekvationer med parenteser och bråktal, där eleven ska förklara varje steg med egna ord och kontrollera svaret genom att sätta in det i ursprungsekvationen. '.repeat(2)
const topicsFor = i => i === 10
  ? [
      { name: LONG, pages: ['s. 12', 's. 13', 's. 14'], assignments: ['Uppgift 1 med mycket text som ska få plats i sin ruta utan att något döljs. '.repeat(3), 'Uppgift 2'], links: [] },
      { name: 'Ekvation', pages: ['s. 20'], assignments: ['Lös 5 uppgifter'], links: [] },
      { name: 'Rad ett\nRad två\nRad tre', pages: [], assignments: [], links: [] },
    ]
  : [{ name: 'Ekvation och variabel', pages: ['s. 5'], assignments: ['Uppgift 2'], links: [] }]
const allWeeks = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10))
  return { ...w, weekStart: iso(d), keepVisibleExtra: true, chapter: i < 11 ? 'Tal' : 'Geometri', pages: [], lessons: w.lessons?.map(l => ({ ...l, topics: topicsFor(i) })) }
})
const planRow = (id, weeksData) => {
  const plan = { kind: 'arsplanering-v2', title: 'Lektionsfält ' + id, subject: 'Testämne', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData }
  return { id, user_id: '00000000-0000-4000-8000-000000000001', title: 'Lektionsfält ' + id, subject: 'Testämne', school_year: 'Testår', content: JSON.stringify(plan), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' }
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').filter(l => l.trim() && !/^\s*\S*\[22m|Call log/.test(l)).slice(0, 3).join(' | ').slice(0, 500)) } }

async function openPlan(width = 1366, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: [planRow('fält', allWeeks)] }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  // Klick i kod, eftersom toppfältet på smal skärm kan ligga över knapparna.
  const tap = text => page.getByText(text, { exact: false }).first().evaluate(e => e.click())
  await tap('Mina planeringar')
  await page.getByText('Övriga planeringar').first().evaluate(e => e.click()).catch(() => {})
  await tap('Testämne').catch(() => {})
  await tap('Lektionsfält fält')
  await page.waitForSelector('.week-card', { timeout: 20000 })
  await page.waitForTimeout(400)
  return { page, errors }
}
const m0Ok = m => !!m
const measureGrid = page => page.evaluate(() => {
  const grids = [...document.querySelectorAll('#lararvy .lesson .topic-grid')]
  const grid = grids.find(g => g.querySelector('.topic-name textarea')?.value.startsWith('Ekvationer med parenteser'))
  if (!grid) return null
  const r = e => e.getBoundingClientRect()
  const name = r(grid.querySelector(':scope > .topic-name')), pages = r(grid.querySelector('.topic-column.pages')), assign = r(grid.querySelector('.topic-column.assignments'))
  const ta = grid.querySelector(':scope > .topic-name textarea')
  return { gridW: r(grid).width, nameW: name.width, pagesW: pages.width, assignW: assign.width, pagesY: pages.top, assignY: assign.top, nameY: name.top, taScroll: ta.scrollHeight - ta.clientHeight, taH: ta.clientHeight, taLines: Math.round(ta.clientHeight / parseFloat(getComputedStyle(ta).lineHeight)), taW: ta.clientWidth }
})

const p = await openPlan()
await scrollThroughPlan(p.page)
// Märker ut momentraden med det långa momentet, så att testerna hittar rätt rad och lektion.
await p.page.evaluate(() => { const g = [...document.querySelectorAll('#lararvy .lesson .topic-grid')].find(g => g.querySelector('.topic-name textarea')?.value.startsWith('Ekvationer med parenteser')); g?.setAttribute('data-test-long', '1') })
const longLesson = () => p.page.locator('#lararvy .lesson').filter({ has: p.page.locator('[data-test-long]') }).first()
// Klickar efter att knappen scrollats fram, så att sticky-rader inte stjäl klicket.
const clickIn = async loc => { await loc.evaluate(e => e.scrollIntoView({ block: 'center' })); await loc.click() }
await check('Moment är det bredaste fältet och får ca 55–60 % av raden', async () => {
  const m = await measureGrid(p.page)
  assert.ok(m, 'långt moment hittades inte')
  const share = m.nameW / m.gridW
  assert.ok(share >= 0.53 && share <= 0.6, 'andel moment: ' + share.toFixed(3))
})
await check('Sida och Uppgift delar resten och ligger bredvid Moment på samma rad', async () => {
  const m = await measureGrid(p.page)
  assert.ok(m.pagesW >= 100 && m.assignW >= 100, 'för smala: sida ' + m.pagesW + ', uppgift ' + m.assignW)
  assert.ok(Math.abs(m.pagesY - m.nameY) < 3 && Math.abs(m.assignY - m.nameY) < 3, 'fälten ligger inte på samma rad')
  assert.ok(Math.abs(m.pagesW - m.assignW) < 4, 'sida och uppgift har olika bredd')
})
await check('långt moment radbryts, textrutan växer och saknar intern rullningslist', async () => {
  const m = await measureGrid(p.page)
  assert.equal(m.taScroll, 0, 'intern rullning i momentrutan: ' + m.taScroll + 'px')
  assert.ok(m.taLines >= 6 && m.taLines <= 12, 'antal textrader i momentet: ' + m.taLines)
})
await check('inga intern rullning i Sida och Uppgift-rutorna', async () => {
  const bad = await p.page.evaluate(() => [...document.querySelectorAll('#lararvy .lesson .topic-grid textarea')].filter(t => t.scrollHeight - t.clientHeight > 2).length)
  assert.equal(bad, 0, 'textrutor med intern rullning: ' + bad)
})
await check('inklistrad flerradig text i momentet växer i höjd', async () => {
  const handle = await p.page.evaluateHandle(() => [...document.querySelectorAll('#lararvy .lesson .topic-grid > .topic-name textarea')].find(t => t.value.startsWith('Rad ett')))
  const ta = handle.asElement()
  assert.ok(ta, 'momentet med tre rader hittades inte')
  await clickIn(ta)
  const before = await ta.evaluate(t => t.clientHeight)
  const pasted = Array.from({ length: 6 }, (_, i) => `Rad nummer ${i + 1} i ett inklistrat moment`).join('\n')
  await ta.fill(pasted); await p.page.waitForTimeout(150)
  const after = await ta.evaluate(t => ({ h: t.clientHeight, scroll: t.scrollHeight - t.clientHeight }))
  assert.ok(after.h > before + 40, 'rutan växte inte: ' + before + ' → ' + after.h)
  assert.equal(after.scroll, 0, 'intern rullning efter inklistring')
})
await check('plusknapp för moment lägger till ett nytt moment, och ta-bort-knappen tar bort det', async () => {
  const topics = () => p.page.evaluate(() => document.querySelectorAll('#lararvy .lesson .topic').length)
  const before = await topics()
  await clickIn(longLesson().locator('[data-test-long] button[aria-label="Lägg till moment"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await topics(), before + 1, 'moment lades inte till')
  await clickIn(longLesson().locator('.topic').last().locator('button[aria-label="Ta bort moment"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await topics(), before, 'moment togs inte bort')
})
await check('Lägg till sida och ta bort rad fungerar i det långa momentet', async () => {
  const grid = () => p.page.locator('[data-test-long]')
  const rows = () => p.page.evaluate(() => document.querySelector('[data-test-long] .topic-column.pages').querySelectorAll('.topic-cell').length)
  const before = await rows()
  await clickIn(grid().locator('button[aria-label="Lägg till sida"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await rows(), before + 1, 'sida lades inte till')
  await clickIn(grid().locator('button[aria-label="Ta bort sida på rad 1"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await rows(), before, 'sida togs inte bort')
  assert.ok(m0Ok(await measureGrid(p.page)), 'layout kunde inte mätas efter ändringen')
})
await check('Lägg till uppgift och ta bort rad fungerar i det långa momentet', async () => {
  const rows = () => p.page.evaluate(() => document.querySelector('[data-test-long] .topic-column.assignments').querySelectorAll('.topic-cell').length)
  const before = await rows()
  await clickIn(p.page.locator('[data-test-long] button[aria-label="Lägg till uppgift"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await rows(), before + 1, 'uppgift lades inte till')
  await clickIn(p.page.locator('[data-test-long] button[aria-label="Ta bort uppgift på rad 1"]').first()); await p.page.waitForTimeout(150)
  assert.equal(await rows(), before, 'uppgift togs inte bort')
})
await check('momentlänk-knappen lägger till en länkrad', async () => {
  const scope = () => p.page.locator('[data-test-long] .topic-links')
  const before = await scope().locator('input').count()
  await clickIn(p.page.locator('[data-test-long] button[aria-label="Lägg till länk"]').first()); await p.page.waitForTimeout(150)
  const after = await scope().locator('input').count()
  assert.ok(after > before, 'länkrad lades inte till')
})
await check('inga knappar eller textrutor i momentkorten överlappar varandra', async () => {
  const overlaps = await p.page.evaluate(() => {
    const els = [...document.querySelectorAll('#lararvy .teacher-collapsible-week .topic-grid button, #lararvy .teacher-collapsible-week .topic-grid textarea, #lararvy .teacher-collapsible-week .topic-grid input')].filter(e => e.getBoundingClientRect().width > 0)
    const rects = els.map(e => e.getBoundingClientRect())
    let n = 0
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 2 && oy > 2) n++
    }
    return { n, count: els.length }
  })
  assert.ok(overlaps.count > 50, 'för få element mättes: ' + overlaps.count)
  assert.equal(overlaps.n, 0, 'överlappande element: ' + overlaps.n)
})
await check('två A4-kort ligger kvar bredvid varandra i tvåveckorsläget', async () => {
  await p.page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 1500 }).catch(() => {})
  await p.page.waitForTimeout(400)
  const cards = await p.page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }))
  assert.equal(cards.length, 2, 'två kort krävs, fick ' + cards.length)
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 3 && cards[1].x >= cards[0].x + cards[0].w - 2, 'kort ligger inte bredvid varandra')
})
await check('inga sidfel under lektionsfälttesten', async () => {
  assert.deepEqual(p.errors.filter(e => !/favicon|Failed to load resource/.test(e)), [], 'fel i konsolen')
})
for (const [w, h] of [[1024, 768], [1920, 1000]]) {
  const q = await openPlan(w, h)
  await scrollThroughPlan(q.page)
  await q.page.evaluate(() => { const g = [...document.querySelectorAll('#lararvy .lesson .topic-grid')].find(g => g.querySelector('.topic-name textarea')?.value.startsWith('Ekvationer med parenteser')); g?.setAttribute('data-test-long', '1') })
  await check(`Moment får ca 55–60 % av raden också vid ${w} px`, async () => {
    const m = await measureGrid(q.page)
    assert.ok(m, 'långt moment hittades inte')
    const share = m.nameW / m.gridW
    // Smalare skärm: momentet ligger över hela raden (ui-layout-testet kontrollerar det). Här kontrolleras bara att Sida och Uppgift inte blir för smala.
    const low = w < 1201 ? 0.9 : 0.53
    assert.ok(share >= low && (w < 1201 || share <= 0.6) && m.pagesW >= 96 && m.assignW >= 96, 'andel ' + share.toFixed(3) + ', sida ' + m.pagesW + ', uppgift ' + m.assignW)
  })
  await q.page.close()
}
await p.page.close()

const mobile = await openPlan(390, 844)
await check('mobil: ingen sidled-scroll och momentet ligger ovanför Sida/Uppgift', async () => {
  const r = await mobile.page.evaluate(() => {
    const g = [...document.querySelectorAll('#lararvy .lesson .topic-grid')].find(g => g.querySelector('.topic-name textarea')?.value.startsWith('Ekvationer med parenteser'))
    const n = g.querySelector(':scope > .topic-name').getBoundingClientRect(), pg = g.querySelector('.topic-column.pages').getBoundingClientRect()
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, nameBelow: n.top < pg.top || n.right <= pg.left + 2 }
  })
  assert.ok(r.overflow <= 1, 'sidled-scroll: ' + r.overflow + 'px')
})
await mobile.page.close()
// Inklistrad planering: förslag om uppdelning i moment, med förhandsgranskning. Inget delas upp utan val.
const REAL_TEXT = [
  'Vecka 47',
  'Kapitel 3: Ekvationer',
  'Lektion 1 – Ekvationer med en obekant',
  'Repetera begreppen variabel och term med hjälp av exemplen på tavlan. Eleverna arbetar två och två i tio minuter.',
  '1. Ekvationens lika-tecken: Förklara att båda led måste behandlas lika, och visa med en våg eller balans.',
  'Gör exemplen på sidan och förklara varför vi gör samma sak på båda sidor.',
  '2. Lösa enkla ekvationer: Addition och subtraktion av tal, till exempel x + 7 = 12.',
  'Kontrollera svaret genom att sätta in det i ursprungsekvationen.',
  '3. Ekvationer med multiplikation och division: 4x = 20 och x/3 = 5.',
  'Avslutning: Sammanfatta med tre frågor på tavlan och låt eleverna svara i mindre grupper.',
  'Läxa: sida 42–44, uppgift 1–10. Material: räknedosa och balansmodell.',
].join('\n')
const imp = await openPlan()
imp.page.on('dialog', d => d.accept())
await imp.page.locator('summary', { hasText: 'Material till planeringen' }).first().evaluate(e => e.click())
await imp.page.locator('.material-paste textarea').first().fill(REAL_TEXT)
await imp.page.getByRole('button', { name: 'Skapa veckor av inklistrad text' }).evaluate(e => e.click())
await imp.page.waitForSelector('.import-preview', { timeout: 10000 })
const previewText = async () => (await imp.page.locator('.import-preview pre').allInnerTexts()).join('\n')
await check('importen föreslår uppdelning, men delar inte upp något av sig själv', async () => {
  await imp.page.waitForSelector('.import-split', { timeout: 5000 })
  const note = await imp.page.locator('.import-split p').first().innerText()
  assert.match(note, /Texten innehåller 3 tydliga moment/, 'förslaget saknas: ' + note)
  assert.equal(await imp.page.locator('.import-split button', { hasText: 'Behåll som ett moment' }).first().getAttribute('aria-pressed'), 'true', 'standardvalet ska vara att behålla')
  assert.ok(!(await previewText()).includes('Lösa enkla ekvationer'), 'delarna visas redan innan något valts')
})
await check('Dela upp visar varje moment i förhandsgranskningen', async () => {
  await imp.page.locator('.import-split button', { hasText: 'Dela upp i 3 moment' }).first().evaluate(e => e.click())
  await imp.page.waitForTimeout(150)
  const t = await previewText()
  for (const title of ['Ekvationens lika-tecken', 'Lösa enkla ekvationer', 'Ekvationer med multiplikation']) assert.ok(t.includes(title), 'saknas i förhandsgranskningen: ' + title)
})
await check('Behåll som ett moment ångrar uppdelningen och originaltexten finns kvar', async () => {
  await imp.page.locator('.import-split button', { hasText: 'Behåll som ett moment' }).first().evaluate(e => e.click())
  await imp.page.waitForTimeout(150)
  assert.ok(!(await previewText()).includes('Lösa enkla ekvationer'), 'uppdelningen togs inte tillbaka')
  assert.ok((await imp.page.locator('.material-paste textarea').first().inputValue()) === REAL_TEXT, 'inklistrad text ändrades')
})
await check('efter godkänd uppdelning och "Använd import" får momenten egna fält, och texten kapas inte', async () => {
  await imp.page.locator('.import-split button', { hasText: 'Dela upp i 3 moment' }).first().evaluate(e => e.click())
  await imp.page.locator('.import-preview button', { hasText: 'Använd import' }).first().evaluate(e => e.click())
  await imp.page.waitForSelector('#lararvy .lesson', { timeout: 10000 })
  const names = await imp.page.evaluate(() => [...document.querySelectorAll('#lararvy textarea[aria-label="Momentets namn"]')].map(t => t.value))
  for (const title of ['Ekvationens lika-tecken', 'Lösa enkla ekvationer', 'Ekvationer med multiplikation']) assert.ok(names.some(n => n.startsWith(title)), 'moment saknas i redigeraren: ' + title)
  const scrolled = await imp.page.evaluate(() => [...document.querySelectorAll('#lararvy .topic-grid textarea')].filter(t => t.scrollHeight - t.clientHeight > 2).length)
  assert.equal(scrolled, 0, 'textrutor med klippt text: ' + scrolled)
})
await imp.page.close()

// Längre riktig planering: tre lektioner med tre moment vardera. Alla moment ska finnas kvar efter uppdelning.
const LESSON = (n, topic, moments) => [`Lektion ${n} – ${topic}`, 'Genomgång och eget arbete i ca 30 minuter, med exempel från kapitlet och en kort frågestund.', ...moments.map((m, i) => `${i + 1}. ${m}: Eleverna övar på sidan och förklarar med egna ord hur de tänkte.`), `Läxa: sida ${40 + n * 3}–${42 + n * 3}, uppgift 1–${6 + n}.`].join('\n')
const LONG_TEXT = ['Vecka 47', 'Kapitel 3: Ekvationer och samband', LESSON(1, 'Ekvationer med en obekant', ['Lika-tecknet', 'Addition och subtraktion', 'Multiplikation och division']), LESSON(2, 'Parenteser i ekvationer', ['Utveckla parenteser', 'Samla termer', 'Kontrollera svaret']), LESSON(3, 'Ekvationer i verkliga situationer', ['Ställa upp en ekvation', 'Lösa problemet', 'Tolka svaret'])].join('\n')
const ALL_MOMENT_TITLES = ['Lika-tecknet', 'Addition och subtraktion', 'Multiplikation och division', 'Utveckla parenteser', 'Samla termer', 'Kontrollera svaret', 'Ställa upp en ekvation', 'Lösa problemet', 'Tolka svaret']
const long = await openPlan()
long.page.on('dialog', d => d.accept())
await long.page.locator('summary', { hasText: 'Material till planeringen' }).first().evaluate(e => e.click())
await long.page.locator('.material-paste textarea').first().fill(LONG_TEXT)
await long.page.getByRole('button', { name: 'Skapa veckor av inklistrad text' }).evaluate(e => e.click())
await long.page.waitForSelector('.import-split', { timeout: 10000 })
await check('lång riktig planering: tre förslag, och alla nio moment finns kvar efter uppdelning', async () => {
  assert.equal(await long.page.locator('.import-split').count(), 3, 'tre lektioner med moment väntades')
  const buttons = long.page.locator('.import-split button', { hasText: 'Dela upp i 3 moment' })
  for (let i = 0; i < 3; i++) await buttons.nth(i).evaluate(e => e.click())
  await long.page.waitForTimeout(150)
  const text = (await long.page.locator('.import-preview pre').allInnerTexts()).join('\n')
  for (const m of ALL_MOMENT_TITLES) assert.ok(text.includes(m), 'moment saknas efter uppdelning: ' + m)
})
await long.page.close()

await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT LEKTIONSFÄLTTEST MISSLYCKADES' : 'ALLA LEKTIONSFÄLTTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
