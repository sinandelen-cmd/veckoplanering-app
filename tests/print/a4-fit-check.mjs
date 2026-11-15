// Automatiskt test av A4-utskriften för elevvyn. Körs med: node tests/print/a4-fit-check.mjs
// Använder fiktiv testdata (tests/print/fixtures.js). Inga riktiga planeringar, konton eller databaser används.
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { SCENARIOS, CLASS_SCENARIOS, buildFixturePlan } from './fixtures.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = path.resolve(new URL('../../', import.meta.url).pathname)
const server = await createServer({ root, logLevel: 'silent', server: { port: 5191, strictPort: true } })
await server.listen()
const base = 'http://localhost:5191'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch())
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-fit-'))
const results = []
const report = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : '')) }

// Förväntade markörer: varje moment ska finnas exakt en gång i utskriften.
// Klassvyn visar bara lektioner för klassens schemalagda tider (här 3 per vecka).
function expectedMarkers(scenario) {
  const perWeek = CLASS_SCENARIOS.includes(scenario) ? 3 : Infinity
  return SCENARIOS[scenario]().flatMap(week => week.lessons.slice(0, perWeek).flatMap(lesson => lesson.topics.map(topic => topic.name.match(/markor[a-z0-9]+/)[0])))
}

for (const scenario of Object.keys(SCENARIOS)) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await page.route(/^https?:\/\/(?!localhost)/, route => route.abort())
  const klass = CLASS_SCENARIOS.includes(scenario) ? '&klass=7A' : ''
  await page.goto(`${base}/tests/print/harness.html?scenario=${encodeURIComponent(scenario)}${klass}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.student-screen-view .week-card')
  await page.waitForTimeout(400)

  const notices = await page.locator('.print-fit-notice').allInnerTexts()
  const zooms = await page.$$eval('.student-print-pages .student-print-page .student-week-card', els => els.map(el => Number(el.style.zoom || 1)))
  const markers = expectedMarkers(scenario)
  const screenText = (await page.locator('.student-screen-view').innerText()).replace(/\s+/g, '')
  report(`[${scenario}] alla moment visas på skärmen`, markers.every(marker => screenText.includes(marker)))
  report(`[${scenario}] textstorlek minst 50 %`, zooms.every(zoom => zoom >= 0.5), `zoom=${zooms.map(z => z.toFixed(2)).join(', ')}`)

  await page.emulateMedia({ media: 'print' })
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.student-print-page *')]
    .filter(el => /hidden|clip/.test(getComputedStyle(el).overflow) && el.scrollHeight > el.clientHeight + 1).length)
  report(`[${scenario}] inget utskriftselement kapas (overflow)`, clipped === 0, `kapade=${clipped}`)
  const pdfPath = path.join(tmp, scenario.replace(/\W+/g, '_') + '.pdf')
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '9mm', right: '9mm' }, preferCSSPageSize: true })
  const pageCount = Number(execFileSync('pdfinfo', [pdfPath]).toString().match(/Pages:\s+(\d+)/)[1])
  const pdfText = execFileSync('pdftotext', [pdfPath, '-']).toString().replace(/\s+/g, '')
  const missing = markers.filter(marker => !pdfText.includes(marker))
  const duplicated = markers.filter(marker => pdfText.split(marker).length - 1 > 1)
  report(`[${scenario}] alla moment finns i PDF:en`, missing.length === 0, `saknas=${missing.length}`)
  report(`[${scenario}] inga dubbletter i PDF:en (mätcontainern skrivs inte ut)`, duplicated.length === 0, `dubbletter=${duplicated.length}`)
  // Textstorlek mäts bara på utskriftssidorna, inte i mätcontainern.
  const blankPages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter(number => execFileSync('pdftotext', ['-f', String(number), '-l', String(number), pdfPath, '-']).toString().replace(/\s+/g, '') === '')
  report(`[${scenario}] inga tomma sidor i PDF:en`, blankPages.length === 0, `tomma=${blankPages.join(',') || 'inga'}`)
  console.log(`   sidor i PDF=${pageCount}, varningar=${notices.length}`)
  for (const notice of notices) console.log('   > ' + notice.replace(/\n/g, ' '))
  await page.close()
}
// Specifikt krav: när vecka 44 inte ryms ska en tydlig varning visas.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await page.route(/^https?:\/\/(?!localhost)/, route => route.abort())
  await page.goto(`${base}/tests/print/harness.html?scenario=vecka44-tung`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const warning = await page.locator('.print-fit-warning').count()
  report('[vecka44-tung] tydlig varning om veckan inte ryms', warning === 1)
  await page.close()
}
await browser.close()
await server.close()
const allOk = results.every(Boolean)
console.log(allOk ? 'ALLA UTSKRIFTSTESTER GODKÄNDA' : 'NÅGOT UTSKRIFTSTEST MISSLYCKADES')
process.exit(allOk ? 0 : 1)
