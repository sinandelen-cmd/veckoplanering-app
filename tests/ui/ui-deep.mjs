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
  // Kapitel är sammanhängande block i tiden. Gränsen mellan kapitel ligger mellan vecka 47 och 48 (index 10 och 11),
  // så de två veckorna i startläget ligger i olika kapitel (regression för två papper bredvid varandra).
  return { ...w, weekStart: iso(d), keepVisibleExtra: false, chapter: i < 11 ? 'Tal' : 'Geometri', pages: i === 10 ? ['s. 5'] : (w.pages || []) }
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
  // Detaljer som startar öppna finns i Visa alla veckor, så den vyn öppnas först.
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(400)
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

await check('Visa alla veckor: en vecka per rad och alla 21 veckor visar sitt innehåll', async () => {
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click()
  // Veckorna ritas stegvis, så testet väntar på villkoret (max 8 s) i stället för en fast tid.
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21 && [...document.querySelectorAll('.week-card')].every(e => e.querySelectorAll('.lesson').length > 0 || e.getBoundingClientRect().height === 0), null, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(100)
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.week-card')].map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), h: Math.round(r.height), lessons: e.querySelectorAll('.lesson').length } }).filter(c => c.h > 0)
    return { cards: cards.length, columns: new Set(cards.map(c => c.x)).size, empty: cards.filter(c => c.lessons === 0).length, placeholders: document.querySelectorAll('.teacher-week-lazy-placeholder').length }
  })
  assert.equal(m.cards, 21, 'alla 21 veckor ska finnas')
  assert.equal(m.columns, 1, 'exakt en vecka per rad')
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

await check('Grundplanering: två papper, pilar i steg om två veckor, A4-proportion och lektionszoom', async () => {
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(400)
  const geometry = () => page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, wk: e.closest('[data-week]')?.getAttribute('data-week') } }))
  const visibleWeeks = async () => (await geometry()).map(g => g.wk)
  const startGeo = await geometry()
  assert.equal(startGeo.length, 2, 'två veckor i startläget')
  assert.ok(Math.abs(startGeo[0].y - startGeo[1].y) < 5 && startGeo[1].x > startGeo[0].x + startGeo[0].w, 'två papper bredvid varandra')
  assert.ok(startGeo.every(g => g.w <= 800), 'papperet är högst 210 mm (ca 794 px)')
  assert.ok(startGeo.every(g => g.h >= g.w * 297 / 210 - 2), 'papperet är minst A4-proportion (297/210)')
  // Hela veckoordningen från "Visa alla veckor", sedan pilarna i steg om två.
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(600)
  const order = (await geometry()).map(g => g.wk)
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(400)
  const first = await visibleWeeks()
  const idx = order.indexOf(first[0])
  assert.ok(idx >= 0, 'startveckan finns i ordningen')
  await page.locator('button[aria-label="Nästa vecka"]').first().click(); await page.waitForTimeout(300)
  const next = await visibleWeeks()
  assert.equal(order.indexOf(next[0]), idx + 2, 'nästa pil flyttar två veckor: ' + first + ' → ' + next)
  await page.locator('button[aria-label="Föregående vecka"]').first().click(); await page.waitForTimeout(300)
  assert.deepEqual(await visibleWeeks(), first, 'föregående pil går tillbaka till samma två veckor')
  // Lektionszoom: öppna, stäng, samma scrollposition och samma veckor.
  const scroll0 = await page.evaluate(() => window.scrollY)
  await page.locator('.lesson-zoom-open').first().click()
  await page.waitForSelector('.smart-lesson-dialog', { timeout: 3000 })
  await page.locator('.smart-lesson-dialog-header button').first().click(); await page.waitForTimeout(200)
  assert.equal(await page.locator('.smart-lesson-dialog').count(), 0, 'lektionszoomen ska stängas')
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - scroll0) < 2, 'scrollpositionen ska vara samma efter stängning')
  assert.deepEqual(await visibleWeeks(), first, 'samma veckor efter stängning av lektionszoom')
})

await check('Grundplanering: två veckor från olika kapitel ligger bredvid varandra', async () => {
  await page.locator('button:visible', { hasText: 'Dölj alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(400)
  const geo = await page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, chapter: e.closest('[data-chapter]')?.getAttribute('data-chapter') } }))
  assert.equal(geo.length, 2, 'två veckor i startläget, fick ' + geo.length)
  assert.ok(Math.abs(geo[0].y - geo[1].y) < 5, 'andra veckan ligger under den första (y ' + geo[0].y + ' / ' + geo[1].y + ')')
  assert.ok(geo[1].x > geo[0].x + geo[0].w - 2, 'andra veckan ligger inte till höger om den första')
})

await check('kapitelrubriker och begrepp är inte fastklistrade vid scroll', async () => {
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 21, null, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(300)
  // Ingen synlig kapitelyta får vara sticky eller fixed.
  const stuckStyle = await page.evaluate(() => [...document.querySelectorAll('#lararvy .chapter-heading, #lararvy .teacher-chapter-sticky, #lararvy .teacher-chapter-sticky *, #lararvy .teacher-active-chapter-bar, #lararvy .teacher-pinned-chapter-shell, #lararvy .teacher-pinned-chapter-heading')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ cls: String(e.className).slice(0, 40), pos: getComputedStyle(e).position })).filter(p => p.pos === 'sticky' || p.pos === 'fixed'))
  assert.deepEqual(stuckStyle, [], 'fastklistade kapitelelement: ' + JSON.stringify(stuckStyle.slice(0, 3)))
  // Den fasta kapitelraden (som fylls med kapitelnamn och begrepp vid scroll) får inte synas.
  const fixedChapterRow = await page.evaluate(() => [...document.querySelectorAll('#lararvy .teacher-active-chapter-bar, #lararvy .teacher-pinned-chapter-shell')].filter(e => e.getBoundingClientRect().height > 0).length)
  assert.equal(fixedChapterRow, 0, 'en fast kapitelrad syns fortfarande vid scroll: ' + fixedChapterRow)
  // Behavioural: synliga kapitelelement måste flytta sig lika mycket som sidan när man scrollar.
  // Scrolla in i listan först, så att en eventuell fastklistrad rubrik hinner uppdateras.
  await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(300)
  await page.evaluate(() => { window.__chapterEls = [...document.querySelectorAll('#lararvy .chapter-heading, #lararvy .teacher-pinned-chapter-heading, #lararvy .teacher-pinned-chapter-shell, #lararvy .teacher-active-chapter-bar')].filter(e => e.getBoundingClientRect().height > 0) })
  await page.waitForTimeout(150)
  const before = await page.evaluate(() => window.__chapterEls.map(e => e.getBoundingClientRect().top))
  assert.ok(before.length > 0, 'inga synliga kapitelelement att följa')
  await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(150)
  const moves = await page.evaluate(() => window.__chapterEls.map(e => { const r = e.getBoundingClientRect(); return { h: r.height, top: r.top } }))
  moves.forEach((m, i) => {
    if (m.h === 0) return
    const moved = before[i] - m.top
    assert.ok(Math.abs(moved - 400) < 3, 'kapitelelement ' + i + ' rör sig inte med sidan: flyttade ' + Math.round(moved) + ' px av 400')
  })
})

await check('A4-papper har tydlig ram och skugga och innehållet syns', async () => {
  await page.locator('button:visible', { hasText: 'Visa alla veckor' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(300)
  const papers = await page.$$eval('.week-card.teacher-collapsible-week', els => els.filter(e => e.getBoundingClientRect().width > 0).slice(0, 5).map(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { border: cs.borderTopWidth, shadow: cs.boxShadow, bg: cs.backgroundColor, w: r.width, h: r.height, overflow: cs.overflow } }))
  assert.ok(papers.length > 0, 'inga papper')
  for (const p of papers) {
    assert.equal(p.border, '1px', 'ram saknas')
    assert.notEqual(p.shadow, 'none', 'skugga saknas')
    assert.equal(p.bg, 'rgb(255, 255, 255)', 'pappret är inte vitt')
    assert.ok(p.w <= 800, 'papperet är bredare än A4')
    assert.ok(p.h >= p.w * 297 / 210 - 2, 'papperet är lägre än A4-proportionen')
  }
  // Ingen text klipps i lektionerna: fält med långt innehåll får växa.
  const clipped = await page.evaluate(() => [...document.querySelectorAll('textarea.topic-value-input')].filter(t => t.scrollHeight > t.clientHeight + 2).length)
  assert.equal(clipped, 0, 'Sida/Uppgift-fält klipper text: ' + clipped)
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
