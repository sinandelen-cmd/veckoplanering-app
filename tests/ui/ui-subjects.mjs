// Ämnen, kurser och mappstruktur i Mina planeringar med FIKTIV Supabase-klient och testlagring.
// Körning: npm run test:ui:subjects
// Ingen produktionsdata, inga riktiga konton, inga externa anrop.
// Kontrollerar:
//  - huvudmappen Mina planeringar > Grundskola/Gymnasiet > ämne > kurs, med klickbar sökväg
//  - "Nytt ämne" har bara skolform och ämnesnamn och skapar inga kurser
//  - ämnet syns direkt och finns kvar efter omladdning och ny inloggning
//  - "Ny kurs" i ämnet har kursnamn och läsår, skapar 21 veckor och visas under rätt ämne
//  - gamla kurser och ämnesmappar från lokal lagring fungerar efter migreringen
//  - arkivera, återställa och radera permanent från arkivet, utan påverkan på andra ämnen
//  - inga knappar, mappar eller texter överlappar vid 1024, 1366 och 1920 px
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import config from './vite.ui.config.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = await createServer(config)
await server.listen()
const base = 'http://localhost:5220'
const UID = '00000000-0000-4000-8000-000000000001'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + e.message.split('\n').slice(0, 4).join(' | ').slice(0, 600)) } }

const legacyCourse = { id: 'old1', user_id: UID, title: 'Matematik 2c', subject: 'Matematik', school_year: 'Testår', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'Matematik 2c', subject: 'Matematik', schoolForm: 'Gymnasieskola', schoolYear: 'Testår', grade: '', course: 'Matematik 2c', textbook: 'fiktiv bok', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData: [] }), weeks: 0, published: false, public_slug: null, created_at: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T08:00:00Z' }

const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let dialogMode = 'accept'
let lastDialog = ''
page.on('dialog', d => { lastDialog = d.message(); if (dialogMode === 'accept') d.accept(); else d.dismiss() })
await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort())
let seed = { veckoplanering: [legacyCourse] }
await ctx.addInitScript(s => { localStorage.setItem('fake-session', 'on'); localStorage.setItem('fake-persist', 'on'); localStorage.setItem('fake-seed', s) }, JSON.stringify(seed))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const vis = (sel, text) => page.locator(sel + ':visible', text ? { hasText: text } : {})
const btn = (text) => page.locator('button:visible', { hasText: text }).first()
const rows = () => page.evaluate(() => window.__fake.store.veckoplanering)
const subjectRowsDb = async () => (await rows()).filter(r => JSON.parse(r.content || '{}').kind === 'amne-v1')
const planRowsDb = async () => (await rows()).filter(r => JSON.parse(r.content || '{}').kind === 'arsplanering-v2')
async function goRoot() {
  const crumb = page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' })
  if (await crumb.count()) { await crumb.first().evaluate(e => e.click()); await page.waitForTimeout(300); return }
  if (await page.locator('.library-card').count() === 0) await page.locator('button:visible', { hasText: 'Mina planeringar' }).first().evaluate(e => e.click()).catch(() => {})
  await page.waitForTimeout(300)
}
async function schoolLevel(school) {
  await goRoot()
  await page.locator('button.library-folder:visible', { hasText: school }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
}
async function subjectLevel(school, subject) {
  await schoolLevel(school)
  await page.locator('button.library-folder:visible', { hasText: subject }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
}
async function createSubject(school, name) {
  await goRoot()
  await btn('Nytt ämne').evaluate(e => e.click())
  await page.waitForSelector('.library-subject-form form', { timeout: 15000 })
  await page.locator('.library-subject-form select').selectOption(school)
  await page.locator('.library-subject-form input').fill(name)
  await page.locator('.library-subject-form button[type="submit"]').evaluate(e => e.click())
  await page.waitForTimeout(600)
}
async function createCourse(school, subject, name, startYear = null) {
  await subjectLevel(school, subject)
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill(name)
  if (startYear) { await dialog.locator('input[aria-label="Läsårets startår"]').fill(String(startYear)); await page.waitForTimeout(150) }
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  await page.waitForTimeout(400)
}
const crumbs = async () => (await page.locator('.library-crumbs').innerText()).replace(/\s*\/\s*/g, ' / ').trim()
async function reloginAndReload() {
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600)
  await page.evaluate(() => { localStorage.removeItem('fake-session'); localStorage.setItem('fake-session', 'on') })
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
}

await check('huvudmappen Mina planeringar visar Grundskola och Gymnasiet, och ingen "Ny planering" finns', async () => {
  await page.waitForSelector('.library-card', { timeout: 15000 })
  assert.match(await page.locator('.library-title').first().innerText(), /Mina planeringar/)
  assert.equal(await page.locator('button:visible', { hasText: 'Ny planering' }).count(), 0, 'den gamla knappen "Ny planering" finns kvar')
  const folders = await page.locator('button.library-folder').allInnerTexts()
  assert.ok(folders.some(t => /Grundskola/.test(t)) && folders.some(t => /Gymnasiet/.test(t)), 'skolformerna saknas: ' + folders.join(' | '))
  assert.match(await crumbs(), /^Mina planeringar$/, 'sökvägen i roten: ' + await crumbs())
})

await check('den gamla kursen visas under Gymnasiet > Matematik, och ämnet får en ämnesrad i databasen', async () => {
  await subjectLevel('Gymnasiet', 'Matematik')
  assert.ok(await vis('.library-course-open', 'Matematik 2c').count() === 1, 'gamla kursen Matematik 2c syns inte under Matematik')
  assert.ok((await subjectRowsDb()).some(r => JSON.parse(r.content).subject === 'Matematik'), 'ämnet har ingen ämnesrad')
  assert.equal((await planRowsDb()).find(r => r.id === 'old1').content, legacyCourse.content, 'den gamla kursen ändrades')
})

await check('"Nytt ämne" har bara skolform och ämnesnamn, och skapar inga kurser', async () => {
  await goRoot()
  await btn('Nytt ämne').evaluate(e => e.click())
  await page.waitForSelector('.library-subject-form form', { timeout: 15000 })
  const form = page.locator('.library-subject-form')
  assert.equal(await form.locator('select').count(), 1, 'skolform saknas')
  assert.equal(await form.locator('input').count(), 1, 'formuläret ska bara ha ämnesnamn')
  assert.equal(await form.locator('input[type="file"], input[type="date"], textarea').count(), 0, 'material eller startdatum finns i formuläret')
  const plansBefore = (await planRowsDb()).length
  await createSubject('Grundskola', 'Svenska')
  assert.equal((await planRowsDb()).length, plansBefore, 'en kurs skapades när ämnet skapades')
  await schoolLevel('Grundskola')
  assert.ok(await vis('button.library-folder', 'Svenska').count() === 1, 'det nya ämnet syns inte direkt under Grundskola')
})

await check('ämnet finns kvar efter omladdning och ny inloggning', async () => {
  await reloginAndReload()
  await schoolLevel('Grundskola')
  assert.ok(await vis('button.library-folder', 'Svenska').count() === 1, 'Svenska försvann efter omladdning')
  assert.ok((await subjectRowsDb()).some(r => JSON.parse(r.content).subject === 'Svenska'), 'ämnet finns inte i databasen')
})

await check('"Ny kurs" i ämnet: kursnamn och läsår, 21 veckor, och kursen visas under rätt ämne', async () => {
  await subjectLevel('Gymnasiet', 'Matematik')
  await btn('Ny kurs').evaluate(e => e.click())
  await page.waitForSelector('[aria-label="Skapa ny kurs"]', { timeout: 10000 })
  const dialog = page.locator('[aria-label="Skapa ny kurs"]')
  assert.equal(await dialog.locator('input[type="date"]').count(), 0, 'startdatum finns i kursdialogen')
  assert.equal(await dialog.locator('select').count(), 0, 'onödiga val finns i kursdialogen')
  await dialog.locator('label', { hasText: 'Kursens namn' }).locator('input').fill('Matematik 1b')
  await dialog.locator('button', { hasText: 'Skapa kurs' }).evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  const row = (await planRowsDb()).find(r => JSON.parse(r.content).course === 'Matematik 1b')
  assert.ok(row, 'kursen sparades inte')
  assert.equal(JSON.parse(row.content).weeksData.length, 21, 'kursen har inte 21 veckor')
  assert.match(await crumbs(), /Mina planeringar \/ Gymnasiet \/ Matematik \/ Matematik 1b/, 'sökvägen: ' + await crumbs())
})

await check('sökvägen går att klicka sig tillbaka längs, och kursen syns under ämnet', async () => {
  await page.locator('.library-crumbs .crumb-link', { hasText: 'Matematik' }).first().evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.ok(await vis('.library-course-open', 'Matematik 1b').count() === 1, 'kursen syns inte under Matematik')
  await page.locator('.library-crumbs .crumb-link', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.ok(await vis('button.library-folder', 'Matematik').count() === 1, 'ämnet syns inte under Gymnasiet')
  await page.locator('.library-crumbs .crumb-link', { hasText: 'Mina planeringar' }).first().evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.match(await crumbs(), /^Mina planeringar$/)
})

await check('Grundskola: ämne och kurs med läsår ger rätt sökväg', async () => {
  await createSubject('Grundskola', 'Matematik')
  await createCourse('Grundskola', 'Matematik', 'Matematik åk 8', 2026)
  assert.match(await crumbs(), /Mina planeringar \/ Grundskola \/ Matematik \/ Matematik åk 8/, 'sökvägen: ' + await crumbs())
  const row = (await planRowsDb()).find(r => JSON.parse(r.content).course === 'Matematik åk 8')
  assert.equal(JSON.parse(row.content).schoolYear, '2026–2027', 'läsåret sparades inte')
})

await check('efter omladdning och ny inloggning visas båda ämnena och kurserna', async () => {
  await reloginAndReload()
  await subjectLevel('Grundskola', 'Matematik')
  assert.ok(await vis('.library-course-open', 'Matematik åk 8').count() === 1, 'Matematik åk 8 saknas efter omladdning')
  await subjectLevel('Gymnasiet', 'Matematik')
  assert.ok(await vis('.library-course-open', 'Matematik 1b').count() === 1 && await vis('.library-course-open', 'Matematik 2c').count() === 1, 'kurserna saknas efter omladdning')
  await btn('Matematik 1b').evaluate(e => e.click())
  await page.waitForSelector('#lararvy .week-card', { timeout: 20000 })
  assert.equal((await page.locator('#lararvy .week-card').count()) > 0, true, 'kursen går inte att öppna')
})

await check('en kurs med bara sitt namn och ingen sökväg: gamla kursen öppnas', async () => {
  await subjectLevel('Gymnasiet', 'Matematik')
  await btn('Matematik 2c').evaluate(e => e.click())
  await page.waitForSelector('#lararvy', { timeout: 20000 })
  await page.waitForTimeout(300)
  assert.match(await crumbs(), /Mina planeringar \/ Gymnasiet \/ Matematik \/ Matematik 2c/, 'sökvägen för den gamla kursen: ' + await crumbs())
})

await check('ämnesmappar från lokal lagring migreras till databasen och tas inte bort lokalt', async () => {
  await page.evaluate(uid => {
    localStorage.setItem('arsplanering-subject-folders', JSON.stringify({ [uid]: { Gymnasiet: ['Svenska'], Grundskola: [] } }))
    localStorage.setItem('arsplanering-archived-subject-folders', JSON.stringify({ [uid]: { Gymnasiet: [], Grundskola: [] } }))
  }, UID)
  await reloginAndReload()
  await schoolLevel('Gymnasiet')
  assert.ok(await vis('button.library-folder', 'Svenska').count() === 1, 'den lokala ämnesmappen syns inte i Gymnasiet')
  assert.ok((await subjectRowsDb()).some(r => JSON.parse(r.content).subject === 'Svenska' && JSON.parse(r.content).schoolForm === 'Gymnasiet'), 'ämnesmappen migrerades inte till databasen')
  assert.ok(await page.evaluate(() => Boolean(localStorage.getItem('arsplanering-subject-folders-migrerade'))), 'säkerhetskopian saknas')
})

await check('arkivera ämnet med två kurser, se det i arkivet, återställ det', async () => {
  await subjectLevel('Gymnasiet', 'Matematik')
  await btn('Arkivera ämne').evaluate(e => e.click())
  await page.waitForTimeout(600)
  await schoolLevel('Gymnasiet')
  assert.equal(await vis('button.library-folder', 'Matematik').count(), 0, 'arkiverat ämne syns i den aktiva listan')
  await btn('🗃 Arkiv').evaluate(e => e.click())
  await page.waitForTimeout(400)
  await page.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
  assert.ok(await vis('button.library-folder', 'Matematik').count() === 1, 'arkiverat ämne syns inte i arkivet')
  await page.locator('button.library-folder:visible', { hasText: 'Matematik' }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
  assert.ok(await vis('.library-course-open', 'Matematik 1b').count() === 1 && await vis('.library-course-open', 'Matematik 2c').count() === 1, 'arkivet visar inte alla kurser i ämnet')
  assert.equal(await page.locator('button:visible', { hasText: 'Radera ämne permanent' }).count() > 0, true, 'radera saknas i arkivet')
  await btn('Återställ ämne').evaluate(e => e.click())
  await page.waitForTimeout(600)
  await btn('📂 Visa aktiva').evaluate(e => e.click())
  await page.waitForTimeout(400)
  await subjectLevel('Gymnasiet', 'Matematik')
  assert.ok(await vis('.library-course-open', 'Matematik 1b').count() === 1, 'återställt ämne visar inte kurserna')
})

await check('i den aktiva listan finns ingen permanent radering', async () => {
  assert.equal(await page.locator('button:visible', { hasText: 'Radera ämne permanent' }).count(), 0, 'permanent radering syns i den aktiva listan')
})

await check('permanent radering från arkivet visar kurser, veckor, lektioner och klasser, och påverkar inte andra ämnen', async () => {
  await subjectLevel('Gymnasiet', 'Matematik')
  await btn('Arkivera ämne').evaluate(e => e.click())
  await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click())
  await page.waitForTimeout(400)
  await page.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Matematik' }).first().evaluate(e => e.click())
  await page.waitForTimeout(300)
  dialogMode = 'dismiss'; lastDialog = ''
  await btn('Radera ämne permanent').evaluate(e => e.click())
  await page.waitForTimeout(400)
  assert.ok(lastDialog, 'ingen bekräftelse visades')
  const text = lastDialog
  dialogMode = 'accept'
  assert.match(text, /Matematik 1b/, 'bekräftelsen saknar kursen Matematik 1b')
  assert.match(text, /Matematik 2c/, 'bekräftelsen saknar kursen Matematik 2c')
  assert.match(text, /21 veckor/, 'bekräftelsen saknar veckor')
  assert.match(text, /lektioner/, 'bekräftelsen saknar lektioner')
  assert.match(text, /Andra ämnen/, 'bekräftelsen säger inte att andra ämnen påverkas inte')
  const before = (await planRowsDb()).length
  await btn('Radera ämne permanent').evaluate(e => e.click())
  await page.waitForTimeout(800)
  const after = await planRowsDb()
  assert.ok(!after.some(r => /Matematik (1b|2c)/.test(JSON.parse(r.content).course || '')), 'kurserna finns kvar')
  assert.equal(after.length, before - 2, 'fel antal kurser raderades')
  assert.equal(await page.evaluate(() => (JSON.parse(localStorage.getItem('fake-db') || '{}').veckoplanering || []).filter(r => { const d = JSON.parse(r.content || '{}'); return d.kind === 'amne-v1' && d.subject === 'Matematik' && d.schoolForm === 'Gymnasiet' }).length), 0, 'ämnesraden för Gymnasiet finns kvar')
  assert.ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('fake-db') || '{}').veckoplanering || []).some(r => JSON.parse(r.content || '{}').subject === 'Svenska' || JSON.parse(r.content || '{}').course === 'Matematik åk 8')), 'andra ämnen påverkades')
  await btn('📂 Visa aktiva').evaluate(e => e.click())
  await page.waitForTimeout(300)
  await schoolLevel('Grundskola')
  assert.ok(await vis('button.library-folder', 'Svenska').count() === 1, 'Svenska påverkades av raderingen')
})

await check('ett tomt ämne arkiveras, syns bara i arkivet och raderas permanent med bekräftelse', async () => {
  await createSubject('Gymnasiet', 'Biologi')
  await subjectLevel('Gymnasiet', 'Biologi')
  assert.equal(await page.locator('.library-course-open').count(), 0, 'ett nytt ämne ska inte ha några kurser')
  assert.match(await page.locator('.library-list').innerText(), /Inga kurser ännu/)
  await btn('Arkivera ämne').evaluate(e => e.click())
  await page.waitForTimeout(600)
  await schoolLevel('Gymnasiet')
  assert.equal(await vis('button.library-folder', 'Biologi').count(), 0, 'arkiverat tomt ämne syns i den aktiva listan')
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Gymnasiet' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  assert.equal(await vis('button.library-folder', 'Biologi').count(), 1, 'tomt ämne syns inte i arkivet')
  await page.locator('button.library-folder:visible', { hasText: 'Biologi' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  assert.equal(await page.locator('button:visible', { hasText: 'Ny kurs' }).count(), 0, '"Ny kurs" ska inte finnas i arkivet')
  dialogMode = 'dismiss'; lastDialog = ''
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(400)
  dialogMode = 'accept'
  assert.match(lastDialog, /inga kurser/, 'bekräftelsen säger inte att ämnet saknar kurser: ' + lastDialog)
  assert.equal((await subjectRowsDb()).some(r => JSON.parse(r.content).subject === 'Biologi'), true, 'ämnet raderades trots avbrott')
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(600)
  assert.equal((await subjectRowsDb()).some(r => JSON.parse(r.content).subject === 'Biologi'), false, 'det tomma ämnet raderades inte')
  // Tillbaka till den aktiva listan, så att nästa test börjar där användaren normalt står.
  await btn('📂 Visa aktiva').evaluate(e => e.click()); await page.waitForTimeout(300)
})

await check('avbruten permanent radering ändrar ingenting: kurserna finns kvar i arkivet', async () => {
  await createSubject('Grundskola', 'Kemi')
  await createCourse('Grundskola', 'Kemi', 'Kemi åk 7', 2026)
  const before = (await planRowsDb()).filter(r => JSON.parse(r.content).subject === 'Kemi').length
  await subjectLevel('Grundskola', 'Kemi')
  await btn('Arkivera ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Kemi' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  dialogMode = 'dismiss'; lastDialog = ''
  await btn('Radera ämne permanent').evaluate(e => e.click()); await page.waitForTimeout(400)
  dialogMode = 'accept'
  assert.ok(lastDialog, 'ingen bekräftelse visades')
  assert.equal((await planRowsDb()).filter(r => JSON.parse(r.content).subject === 'Kemi').length, before, 'kurser raderades trots avbrott')
  await btn('📂 Visa aktiva').evaluate(e => e.click()); await page.waitForTimeout(300)
})

await check('arkivera och återställ ämnet behåller alla 21 veckor och lektionerna i kursen', async () => {
  const weeksBefore = JSON.stringify((await planRowsDb()).find(r => JSON.parse(r.content).course === 'Matematik åk 8'))
  const data = (await planRowsDb()).find(r => JSON.parse(r.content).course === 'Matematik åk 8')
  const lessonsBefore = JSON.parse(data.content).weeksData.reduce((n, w) => n + (w.lessons?.length || 0), 0)
  await subjectLevel('Grundskola', 'Matematik')
  await btn('Arkivera ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('🗃 Arkiv').evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Grundskola' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await page.locator('button.library-folder:visible', { hasText: 'Matematik' }).first().evaluate(e => e.click()); await page.waitForTimeout(300)
  await btn('Återställ ämne').evaluate(e => e.click()); await page.waitForTimeout(600)
  await btn('📂 Visa aktiva').evaluate(e => e.click()); await page.waitForTimeout(300)
  const after = (await planRowsDb()).find(r => JSON.parse(r.content).course === 'Matematik åk 8')
  const parsed = JSON.parse(after.content)
  assert.equal(parsed.weeksData.length, 21, 'veckor efter återställning: ' + parsed.weeksData.length)
  assert.equal(parsed.weeksData.reduce((n, w) => n + (w.lessons?.length || 0), 0), lessonsBefore, 'lektionerna ändrades')
  assert.ok(weeksBefore.length > 0)
})

// Överlappning i de tre bredderna. Varje synligt element i biblioteket får inte överlappa ett annat (utom sina egna barn).
for (const width of [1024, 1366, 1920]) {
  await check(`${width} px: inga knappar, mappar eller texter överlappar i biblioteket`, async () => {
    await page.setViewportSize({ width, height: 900 })
    await subjectLevel('Grundskola', 'Matematik')
    await page.waitForTimeout(300)
    const overlaps = await page.evaluate(() => {
      const root = document.querySelector('#mina-arsplaneringar')
      if (!root) return ['biblioteket saknas']
      const items = [...root.querySelectorAll('button, h2, p, small, label, input, select, .library-crumbs span')].filter(el => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
      })
      const rect = el => el.getBoundingClientRect()
      const out = []
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j]
        if (a.contains(b) || b.contains(a)) continue
        const ra = rect(a), rb = rect(b)
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (x > 2 && y > 2) out.push((a.textContent || a.tagName).trim().slice(0, 30) + ' × ' + (b.textContent || b.tagName).trim().slice(0, 30))
      }
      return out
    })
    assert.deepEqual(overlaps, [], 'överlappande element')
    const widthOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    assert.equal(widthOverflow, false, 'sidan är bredare än fönstret')
  })
}
await page.setViewportSize({ width: 1366, height: 900 })

await check('inga sidfel', async () => assert.deepEqual(errors, [], 'fel: ' + errors.join(' | ')))
await page.close()
await browser.close()
await server.close()
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT ÄMNESTEST MISSLYCKADES' : 'ALLA ÄMNESTEST GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
