// Veckotest med FIKTIV Supabase-klient. Körning: npm run test:ui:weeks
// Täcker det som användaren ser på riktiga planeringar:
//  - veckorna i tvåveckorsläget ligger alltid i kalenderordning, även om planen är sparad i annan ordning
//  - två A4-papper ligger bredvid varandra med samma vertikala start, även över kapitelgränser
//  - en plan som slutar vid vecka 47 visar ett tydligt platshållarpapper, inte en tom grå yta
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
// Index 10 är aktuell vecka (vecka 47 i testet), index 11 nästa vecka. Kapitelgränsen ligger mellan dem.
const allWeeks = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 10))
  return { ...w, weekStart: iso(d), keepVisibleExtra: false, chapter: i < 11 ? 'Tal' : 'Geometri', pages: [] }
})

function planRow(id, weeksData) {
  const plan = { kind: 'arsplanering-v2', title: 'Veckotest ' + id, subject: 'Testämne', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData }
  return { id, user_id: '00000000-0000-4000-8000-000000000001', title: 'Veckotest ' + id, subject: 'Testämne', school_year: 'Testår', content: JSON.stringify(plan), weeks: weeksData.length, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z', class_name: null, start_date: null, week_start: null }
}

// Plan A: sparad i omvänd ordning (inte kronologisk), alla 21 veckor.
const reversedRow = planRow('omvand', [...allWeeks].reverse())
// Plan C: vecka 48 finns, men lades till sist i den sparade listan (som när en vecka infogas i slutet).
const appendedRow = planRow('tillagd', [...allWeeks.filter((_, i) => i !== 11), allWeeks[11]])
// Plan B: slutar vid aktuell vecka (ingen vecka 48 i planen).
const endsAtCurrentRow = planRow('slutar', allWeeks.slice(0, 11))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]) } }

async function openPlan(title, rows) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort())
  await page.addInitScript(seed => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-seed', seed) }, JSON.stringify({ veckoplanering: rows }))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.getByText('Mina planeringar').first().click()
  await page.getByText('Övriga planeringar').first().click().catch(() => {})
  await page.getByText('Testämne', { exact: false }).first().click().catch(() => {})
  await page.getByText(title).first().click()
  await page.waitForSelector('.week-card', { timeout: 20000 })
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 1500 }).catch(() => {})
  await page.waitForTimeout(400)
  return { page, errors }
}

// Synliga kort i ordning: vecka, x, y (dokumentkoordinat), bredd, höjd.
const visibleCards = page => page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { wk: e.closest('[data-week]')?.getAttribute('data-week'), x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height } }))

const planA = await openPlan('Veckotest omvand', [reversedRow, endsAtCurrentRow])
await check('omvänd sparad ordning: tvåveckorsläget visar vecka 47 och 48, inte grannarna i listan', async () => {
  const cards = await visibleCards(planA.page)
  assert.deepEqual(cards.map(c => c.wk), ['47', '48'], 'visade veckor: ' + cards.map(c => c.wk).join(','))
})
await check('två A4-kort ligger på samma rad, bredvid varandra (omvänd ordning)', async () => {
  const cards = await visibleCards(planA.page)
  assert.equal(cards.length, 2, 'två kort krävs, fick ' + cards.length)
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 3, 'samma vertikala startposition: ' + cards[0].y + ' / ' + cards[1].y)
  assert.ok(cards[1].x >= cards[0].x + cards[0].w - 2, 'andra kortet ligger inte till höger om det första')
})
await check('högerpil visar nästa två veckor och bevarar två kort bredvid varandra', async () => {
  await planA.page.locator('button[aria-label="Nästa vecka"]').first().click(); await planA.page.waitForTimeout(300)
  const cards = await visibleCards(planA.page)
  assert.deepEqual(cards.map(c => c.wk), ['49', '50'], 'efter högerpil: ' + cards.map(c => c.wk).join(','))
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 3 && cards[1].x > cards[0].x, 'kort 49/50 ligger inte bredvid varandra')
})
await planA.page.close()

const planC = await openPlan('Veckotest tillagd', [appendedRow])
await check('vecka 48 sist i sparad lista: vecka 47 och 48 visas bredvid varandra', async () => {
  const cards = await visibleCards(planC.page)
  assert.deepEqual(cards.map(c => c.wk), ['47', '48'], 'visade veckor: ' + cards.map(c => c.wk).join(','))
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 3 && cards[1].x >= cards[0].x + cards[0].w - 2, 'kort 47 och 48 ligger inte bredvid varandra')
  assert.equal(await planC.page.locator('.paper-missing-week').count(), 0, 'platshållare får inte visas när vecka 48 finns')
})
await planC.page.close()

const planB = await openPlan('Veckotest slutar', [endsAtCurrentRow])
await check('plan som slutar vid vecka 47: ett kort och ett tydligt platshållarpapper, ingen tom grå yta', async () => {
  const cards = await visibleCards(planB.page)
  assert.equal(cards.length, 1, 'ett kort förväntas, fick ' + cards.length)
  const placeholder = await planB.page.locator('.paper-missing-week').first().boundingBox()
  assert.ok(placeholder, 'platshållaren saknas')
  assert.ok(placeholder.x >= cards[0].x + cards[0].w - 2, 'platshållaren ligger inte bredvid kortet')
  assert.ok(Math.abs(placeholder.y - cards[0].y) < 6, 'platshållaren ligger inte på samma rad')
  const text = await planB.page.locator('.paper-missing-week').first().innerText()
  assert.ok(text.includes('finns inte i planeringen'), 'texten saknas: ' + text.slice(0, 80))
})
await check('platshållaren skapar ingen vecka förrän användaren klickar på knappen', async () => {
  const before = await planB.page.$$eval('.week-card', els => els.length)
  assert.equal(before, 1, 'ingen extra vecka före klick')
  await planB.page.locator('.paper-missing-week button').first().click(); await planB.page.waitForTimeout(400)
  const after = await planB.page.$$eval('.week-card', els => els.length)
  assert.ok(after >= 1, 'veckor försvann')
})
// Kapitelrubrik och begrepp: varje A4-vecka visar sitt eget kapitel, och rubriken fastnar när man scrollar.
const planD = await openPlan('Veckotest omvand', [reversedRow])
await check('två kort i tvåveckorsläget visar var sitt kapitel ovanför veckonumret', async () => {
  const heads = await planD.page.evaluate(() => [...document.querySelectorAll('.week-card.teacher-collapsible-week')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ wk: e.closest('[data-week]')?.getAttribute('data-week'), chapter: e.querySelector('.paper-chapter-head h3')?.textContent || null, headAbove: (() => { const h = e.querySelector('.paper-chapter-head'); const w = e.querySelector('.week-top'); return h && w ? h.getBoundingClientRect().top < w.getBoundingClientRect().top : false })() })))
  assert.equal(heads.length, 2, 'två kort krävs')
  assert.equal(heads[0].chapter, 'Tal', 'vecka 47 ska visa Tal, fick ' + heads[0].chapter)
  assert.equal(heads[1].chapter, 'Geometri', 'vecka 48 ska visa Geometri, fick ' + heads[1].chapter)
  assert.ok(heads.every(h => h.headAbove), 'kapitelhuvudet ska ligga ovanför veckonumret')
})
await planD.page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
await planD.page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21, null, { timeout: 8000 }).catch(() => {})
await planD.page.waitForTimeout(400)
const stickyState = () => planD.page.evaluate(() => {
  const line = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chapter-sticky-top')) || 0
  const sticky = [...document.querySelectorAll('#lararvy .teacher-chapter-section > .teacher-chapter-sticky')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ name: e.closest('[data-chapter]')?.getAttribute('data-chapter'), top: Math.round(e.getBoundingClientRect().top), position: getComputedStyle(e).position }))
  return { line, sticky }
})
await check('kapitelrubriken är sticky i Visa alla veckor', async () => {
  const st = await stickyState()
  assert.ok(st.sticky.length > 0, 'inga kapitelrubriker i Visa alla veckor')
  assert.ok(st.sticky.every(x => x.position === 'sticky'), 'rubriken är inte sticky: ' + JSON.stringify(st.sticky.slice(0, 2)))
})
await check('under scroll nedåt fastnar rätt kapitel under bannern och byts när nästa kapitel kommer', async () => {
  const seen = []
  const maxY = await planD.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  for (let y = 0; y <= maxY; y += 150) {
    await planD.page.evaluate(v => window.scrollTo(0, v), y); await planD.page.waitForTimeout(40)
    const st = await stickyState()
    const atLine = st.sticky.filter(x => Math.abs(x.top - st.line) <= 3).map(x => x.name)
    assert.ok(atLine.length <= 1, 'fler än en rubrik på linjen vid y=' + y + ': ' + atLine.join(','))
    if (atLine.length && seen[seen.length - 1] !== atLine[0]) seen.push(atLine[0])
  }
  assert.ok(seen.includes('Tal') && seen.includes('Geometri'), 'båda kapitlen ska fastna under scroll, fick ' + seen.join(' → '))
})
await check('under scroll uppåt visas tidigare kapitel igen', async () => {
  const maxY2 = await planD.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  await planD.page.evaluate(v => window.scrollTo(0, v), maxY2); await planD.page.waitForTimeout(100)
  const st0 = await stickyState()
  const after = []
  for (let y = maxY2; y >= 0; y -= 150) {
    await planD.page.evaluate(v => window.scrollTo(0, v), y); await planD.page.waitForTimeout(40)
    const st = await stickyState()
    const atLine = st.sticky.filter(x => Math.abs(x.top - st.line) <= 3).map(x => x.name)
    if (atLine.length && after[after.length - 1] !== atLine[0]) after.push(atLine[0])
  }
  assert.ok(after.includes('Tal'), 'Tal ska visas igen när man scrollar upp, fick ' + after.join(' → ') + ' (start: ' + st0.sticky.map(x => x.name).join(',') + ')')
})
await check('samma kapitelrubrik visas inte två gånger i Visa alla veckor', async () => {
  for (const y of [0, 900, 2400, 5200]) {
    await planD.page.evaluate(v => window.scrollTo(0, v), y); await planD.page.waitForTimeout(60)
    const dup = await planD.page.evaluate(() => [...document.querySelectorAll('#lararvy .paper-chapter-head')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0 }).length)
    assert.equal(dup, 0, 'kapitelhuvud på korten syns i Visa alla veckor vid y=' + y + ': ' + dup)
  }
})
await check('kapitelrubriken döljs inte av den övre bannern', async () => {
  await planD.page.evaluate(() => window.scrollTo(0, 800)); await planD.page.waitForTimeout(100)
  const bad = await planD.page.evaluate(() => { const banner = document.querySelector('header.topbar'); const bottom = banner ? banner.getBoundingClientRect().bottom : 0; const h = [...document.querySelectorAll('#lararvy .teacher-chapter-section > .teacher-chapter-sticky')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < bottom - 2 && r.bottom > bottom }); return h.map(e => Math.round(e.getBoundingClientRect().top) + '<' + Math.round(bottom)) })
  assert.deepEqual(bad, [], 'rubrik ligger under bannern: ' + bad.join(','))
})
await planD.page.close()

// Realistisk planering: kapitel 1 över flera veckor, kapitel 2 med andra begrepp, sedan kapitel 3.
// Gränsen mellan kapitel 1 och 2 ligger mitt i tvåveckorsfönstret (mellan vecka 47 och 48).
const CHAPTER_OF = i => (i <= 10 ? 'Algebra och ekvationer' : i <= 14 ? 'Geometri' : 'Statistik')
const FIRST_TERM = { 'Algebra och ekvationer': 'Variabel', 'Geometri': 'Radie', 'Statistik': 'Medelvärde' }
const isoWeekOf = dateStr => { const d = new Date(dateStr + 'T12:00:00'); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7) }
const realisticWeeks = allWeeks.map((w, i) => ({ ...w, keepVisibleExtra: true, chapter: CHAPTER_OF(i), lessons: w.lessons?.map(l => ({ ...l, topics: [{ name: i <= 10 ? 'Ekvation och variabel' : i <= 14 ? 'Area och omkrets' : 'Medelvärde och median', pages: [], assignments: [], links: [] }] })) }))
const planE = await openPlan('Veckotest realistisk', [planRow('realistisk', realisticWeeks)])
await check('kapitelövergång mitt i fönstret: vecka 47 och 48 visar olika kapitel och olika begrepp', async () => {
  const cards = await visibleCards(planE.page)
  const heads = await planE.page.evaluate(() => [...document.querySelectorAll('.week-card.teacher-collapsible-week')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ wk: e.closest('[data-week]')?.getAttribute('data-week'), head: e.querySelector('.paper-chapter-head h3')?.textContent || null, first: e.querySelector('.paper-chapter-head .chapter-vocabulary-term')?.textContent || null })))
  assert.equal(cards.length, 2, 'två kort krävs')
  assert.equal(heads[0].head, 'Algebra och ekvationer', 'vecka 47: ' + heads[0].head)
  assert.equal(heads[1].head, 'Geometri', 'vecka 48: ' + heads[1].head)
  assert.equal(heads[0].first, FIRST_TERM['Algebra och ekvationer'], 'begrepp för vecka 47: ' + heads[0].first)
  assert.equal(heads[1].first, FIRST_TERM['Geometri'], 'begrepp för vecka 48: ' + heads[1].first)
  assert.ok(Math.abs(cards[0].y - cards[1].y) < 3 && cards[1].x >= cards[0].x + cards[0].w - 2, 'korten ligger inte bredvid varandra')
})
await planE.page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
await planE.page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21, null, { timeout: 8000 }).catch(() => {})
await planE.page.waitForTimeout(400)
await check('Visa alla veckor: tre kapitelsektioner med rätt veckor och rätt begrepp i rubriken', async () => {
  const secs = await planE.page.evaluate(() => [...document.querySelectorAll('.teacher-chapter-section')].map(sec => ({ chapter: sec.getAttribute('data-chapter'), weeks: [...sec.querySelectorAll('[data-week]')].map(e => e.getAttribute('data-week')), first: sec.querySelector(':scope > .teacher-chapter-sticky .chapter-vocabulary-term')?.textContent || null })))
  assert.deepEqual(secs.map(x => x.chapter), ['Algebra och ekvationer', 'Geometri', 'Statistik'], 'kapitelordning: ' + secs.map(x => x.chapter).join(' | '))
  assert.equal(secs[0].first, FIRST_TERM['Algebra och ekvationer'], 'rubrik kapitel 1 begrepp: ' + secs[0].first)
  assert.equal(secs[1].first, FIRST_TERM['Geometri'], 'rubrik kapitel 2 begrepp: ' + secs[1].first)
  assert.equal(secs[2].first, FIRST_TERM['Statistik'], 'rubrik kapitel 3 begrepp: ' + secs[2].first)
})
await check('ändring av kapitel på en vecka uppdaterar bara den veckan och dess begrepp', async () => {
  await planE.page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await planE.page.waitForTimeout(400)
  const inputs = planE.page.locator('.week-card.teacher-collapsible-week .paper-chapter-edit input')
  await inputs.nth(1).fill('Sannolikhet')
  await planE.page.waitForTimeout(400)
  const heads = await planE.page.evaluate(() => [...document.querySelectorAll('.week-card.teacher-collapsible-week')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ wk: e.closest('[data-week]')?.getAttribute('data-week'), head: e.querySelector('.paper-chapter-head h3')?.textContent || null, first: e.querySelector('.paper-chapter-head .chapter-vocabulary-term')?.textContent || null })))
  assert.equal(heads[0].head, 'Algebra och ekvationer', 'vecka 47 får inte ändras: ' + heads[0].head)
  assert.equal(heads[1].head, 'Sannolikhet', 'vecka 48 ska visa nytt kapitel: ' + heads[1].head)
  assert.equal(heads[1].first, FIRST_TERM['Statistik'], 'begrepp för nytt kapitel "Sannolikhet" (statistik-mönstret): ' + heads[1].first)

  // Återställ kapitlet så att senare kontroller (utskrift) utgår från ursprunglig data.
  await inputs.nth(1).fill('Geometri'); await planE.page.waitForTimeout(300)
})
await check('utskrift: varje sida visar sitt kapitel och sina begrepp', async () => {
  const printed = await planE.page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++ } ; return true })
  await planE.page.locator('button:visible', { hasText: '🖨' }).first().click().catch(() => {})
  await planE.page.waitForFunction(() => window.__printCalls > 0, null, { timeout: 15000 }).catch(() => {})
  const pages = await planE.page.evaluate(() => [...document.querySelectorAll('.teacher-print-host .student-print-page')].map(p => ({ chapter: p.querySelector('.chapter-heading')?.textContent?.trim() || null, firstTerm: p.querySelector('.chapter-vocabulary-term')?.textContent || null })))
  assert.ok(pages.length > 0, 'inga utskriftssidor')
  for (const p of pages) {
    assert.ok(p.chapter, 'sida utan kapitelrubrik')
    assert.equal(p.firstTerm, FIRST_TERM[p.chapter] ?? p.firstTerm, 'sida "' + p.chapter + '" har fel begrepp: ' + p.firstTerm)
  }
  assert.ok(new Set(pages.map(p => p.chapter)).size >= 2, 'utskriften ska innehålla flera kapitel')
  // Varje sida ska ha det kapitel som gäller för just den veckan (jämförs med veckonumret i sidrubriken).
  const expectedByWeek = Object.fromEntries(realisticWeeks.map(w => [String(isoWeekOf(w.weekStart)), w.chapter]))
  const pageWeeks = await planE.page.evaluate(() => [...document.querySelectorAll('.teacher-print-host .student-print-page')].map(p => [...p.querySelectorAll('h2, h3, strong')].map(h => h.textContent.trim()).find(t => /^Vecka \d+$/.test(t))?.replace('Vecka ', '') || null))
  assert.ok(pageWeeks.filter(Boolean).length >= 15, 'för få utskriftssidor med läsbart veckonummer: ' + pageWeeks.filter(Boolean).length)
  pageWeeks.forEach((wk, i) => { if (wk && expectedByWeek[wk]) assert.equal(pages[i].chapter, expectedByWeek[wk], 'utskriftssida för vecka ' + wk + ' har fel kapitel: ' + pages[i].chapter) })
})
await planE.page.close()

// Inget kapitelfält alls: rubriken ska komma från veckans moment, och begreppen från samma moment.
const MOMENT_OF = i => (i <= 10 ? 'Ekvation och variabel' : i <= 14 ? 'Area och omkrets' : 'Medelvärde och median')
const noChapterWeeks = allWeeks.map((w, i) => ({ ...w, keepVisibleExtra: true, chapter: '', lessons: w.lessons?.map(l => ({ ...l, topics: [{ name: MOMENT_OF(i), pages: [], assignments: [], links: [] }] })) }))
const planF = await openPlan('Veckotest utankapitel', [planRow('utankapitel', noChapterWeeks)])
await check('utan kapitelfält: rubrik och begrepp kommer från veckans moment (två kort, olika moment)', async () => {
  const heads = await planF.page.evaluate(() => [...document.querySelectorAll('.week-card.teacher-collapsible-week')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ head: e.querySelector('.paper-chapter-head h3')?.textContent || null, first: e.querySelector('.paper-chapter-head .chapter-vocabulary-term')?.textContent || null })))
  assert.equal(heads.length, 2, 'två kort krävs')
  assert.equal(heads[0].head, MOMENT_OF(10), 'vecka 47 rubrik: ' + heads[0].head)
  assert.equal(heads[1].head, MOMENT_OF(11), 'vecka 48 rubrik: ' + heads[1].head)
  assert.equal(heads[0].first, 'Variabel', 'vecka 47 begrepp: ' + heads[0].first)
  assert.equal(heads[1].first, 'Radie', 'vecka 48 begrepp: ' + heads[1].first)
})
await planF.page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
await planF.page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21, null, { timeout: 8000 }).catch(() => {})
await planF.page.waitForTimeout(400)
await check('utan kapitelfält: Visa alla veckor grupperar efter moment och rubriken byts vid nästa moment', async () => {
  const secs = await planF.page.evaluate(() => [...document.querySelectorAll('.teacher-chapter-section')].map(sec => ({ name: sec.getAttribute('data-chapter'), weeks: [...sec.querySelectorAll('[data-week]')].length, first: sec.querySelector(':scope > .teacher-chapter-sticky .chapter-vocabulary-term')?.textContent || null })))
  assert.deepEqual(secs.map(x => x.name), [MOMENT_OF(0), MOMENT_OF(11), MOMENT_OF(15)], 'sektioner: ' + secs.map(x => x.name).join(' | '))
  assert.deepEqual(secs.map(x => x.first), ['Variabel', 'Radie', 'Medelvärde'], 'begrepp per sektion: ' + secs.map(x => x.first).join(' | '))
})
await check('utan kapitelfält: utskriften visar veckans moment som rubrik på varje sida', async () => {
  await planF.page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++ } })
  await planF.page.locator('button:visible', { hasText: '🖨' }).first().click().catch(() => {})
  await planF.page.waitForFunction(() => window.__printCalls > 0, null, { timeout: 15000 }).catch(() => {})
  const pages = await planF.page.evaluate(() => [...document.querySelectorAll('.teacher-print-host .student-print-page')].map(p => ({ head: p.querySelector('.chapter-heading')?.textContent?.trim() || null, first: p.querySelector('.chapter-vocabulary-term')?.textContent || null, wk: [...p.querySelectorAll('h2, h3, strong')].map(h => h.textContent.trim()).find(t => /^Vecka \d+$/.test(t)) || null })))
  assert.ok(pages.length >= 15, 'för få utskriftssidor: ' + pages.length)
  const expectedMoment = Object.fromEntries(noChapterWeeks.map(w => [String(isoWeekOf(w.weekStart)), w.lessons[0].topics[0].name]))
  const expectedFirst = { 'Ekvation och variabel': 'Variabel', 'Area och omkrets': 'Radie', 'Medelvärde och median': 'Medelvärde' }
  let checked = 0
  for (const p of pages) {
    if (!p.wk) continue
    const wk = p.wk.replace('Vecka ', '')
    if (!expectedMoment[wk]) continue
    checked++
    assert.equal(p.head, expectedMoment[wk], 'utskriftssida vecka ' + wk + ' har fel rubrik: ' + p.head)
    assert.equal(p.first, expectedFirst[p.head], 'utskriftssida vecka ' + wk + ' har fel begrepp: ' + p.first)
  }
  assert.ok(checked >= 15, 'för få sidor kontrollerades: ' + checked)
})
await planF.page.close()

// Blandat: vissa veckor har kapitelfält, andra saknar det. Den egna veckan vinner, och begreppen blandas inte.
const mixedWeeks = allWeeks.map((w, i) => ({ ...w, keepVisibleExtra: true, chapter: i <= 10 ? 'Algebra och ekvationer' : '', lessons: w.lessons?.map(l => ({ ...l, topics: [{ name: MOMENT_OF(i), pages: [], assignments: [], links: [] }] })) }))
const planG = await openPlan('Veckotest blandad', [planRow('blandad', mixedWeeks)])
await check('blandat: vecka med kapitelfält visar det, vecka utan visar sitt moment och eget begrepp', async () => {
  const heads = await planG.page.evaluate(() => [...document.querySelectorAll('.week-card.teacher-collapsible-week')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ wk: e.closest('[data-week]')?.getAttribute('data-week'), head: e.querySelector('.paper-chapter-head h3')?.textContent || null, first: e.querySelector('.paper-chapter-head .chapter-vocabulary-term')?.textContent || null })))
  assert.equal(heads[0].head, 'Algebra och ekvationer', 'vecka 47 ska visa sitt kapitelfält: ' + heads[0].head)
  assert.equal(heads[0].first, 'Variabel', 'vecka 47 begrepp: ' + heads[0].first)
  assert.equal(heads[1].head, MOMENT_OF(11), 'vecka 48 ska visa sitt moment, inte Algebra: ' + heads[1].head)
  assert.equal(heads[1].first, 'Radie', 'vecka 48 begrepp: ' + heads[1].first)
})
await planG.page.close()

const planH = await openPlan('Veckotest omvand', [reversedRow])
await planH.page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
await planH.page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21, null, { timeout: 8000 }).catch(() => {})
await planH.page.waitForTimeout(300)
await check('staplade fasta rader: navigering, verktygsrad och kapitelrubrik överlappar inte och flikarna går att klicka', async () => {
  await planH.page.evaluate(() => window.scrollTo(0, 3000)); await planH.page.waitForTimeout(250)
  const st = await planH.page.evaluate(() => {
    const n = document.querySelector('nav.planning-unified-navigation')?.getBoundingClientRect()
    const t = document.querySelector('header.topbar')?.getBoundingClientRect()
    const c = document.querySelector('#lararvy .teacher-chapter-section .teacher-chapter-sticky')?.getBoundingClientRect()
    const tab = [...document.querySelectorAll('.planning-header-toolbar button')].find(b => /Grundplanering/.test(b.textContent))
    const tr = tab?.getBoundingClientRect()
    const hit = tab ? document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2) : null
    return { navBottom: n?.bottom ?? null, topbarTop: t?.top ?? null, topbarBottom: t?.bottom ?? null, chapterTop: c?.top ?? null, tabFound: !!tab, tabClickable: !!(tab && hit && (hit === tab || tab.contains(hit))) }
  })
  assert.ok(st.navBottom !== null && st.topbarTop !== null, 'navigering eller verktygsrad saknas')
  assert.ok(st.topbarTop >= st.navBottom - 1, 'verktygsraden ligger bakom navigeringen: ' + st.topbarTop + ' < ' + st.navBottom)
  if (st.chapterTop !== null) assert.ok(st.chapterTop >= st.topbarBottom - 1, 'kapitelrubriken ligger bakom verktygsraden: ' + st.chapterTop + ' < ' + st.topbarBottom)
  assert.ok(st.tabFound && st.tabClickable, 'fliken Grundplanering går inte att klicka (något ligger över den)')
})
await planH.page.close()
await check('inga sidfel under veckotesterna', async () => {
  assert.deepEqual([...planA.errors, ...planB.errors], [], 'sidfel: ' + [...planA.errors, ...planB.errors].slice(0, 2).join(' / '))
})
await planB.page.close()

await browser.close(); await server.close()
const allOk = results.every(Boolean)
console.log(allOk ? 'ALLA VECKOTESTER GODKÄNDA (fiktiv klient)' : 'NÅGOT VECKOTEST MISSLYCKADES')
process.exit(allOk ? 0 : 1)
