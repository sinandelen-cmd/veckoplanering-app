// Kontrollerar att ett Supabase-anrop som aldrig svarar inte låser inloggningen för alltid.
// Kräver ett testbygge med kort tidsgräns: VITE_REQUEST_TIMEOUT_MS=3000 (sätts vid build, se docs/testdatabas.md).
// Körning: REAL_APP_URL=... REAL_SUPABASE_URL=... REAL_TEST_USERS=... npm run test:real-hang
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const appUrl = process.env.REAL_APP_URL || ''
const sbUrl = process.env.REAL_SUPABASE_URL || ''
const usersFile = process.env.REAL_TEST_USERS || ''
for (const u of [appUrl, sbUrl]) if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(u)) { console.error('Vägrar: URL måste vara lokal: ' + u); process.exit(2) }
if (!usersFile) { console.error('Saknar REAL_TEST_USERS'); process.exit(2) }
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await (await browser.newContext()).newPage()
const results = {}
try {
  await page.goto(appUrl + '/', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(users.A.email)
  await page.locator('input[type="password"]').fill(users.A.password)

  // Inloggningsanropet hänger: svaret kommer aldrig.
  let holdPending = true
  await page.route('**/auth/v1/token**', route => { if (holdPending) return; return route.continue() })
  const started = Date.now()
  await page.locator('button.login-submit').click()
  await page.waitForFunction(() => /svarade inte inom/.test(document.body.innerText), null, { timeout: 15000 })
  results.felmeddelande_efter_ms = Date.now() - started
  results.knapp_upplast = await page.locator('button.login-submit').isEnabled()

  // Nätet är tillbaka: ett nytt försök ska gå igenom.
  holdPending = false
  await page.locator('button.login-submit').click()
  await page.waitForSelector('.library-card', { timeout: 30000 })
  results.nytt_forsok_lyckades = true
} finally {
  await browser.close()
}
console.log(JSON.stringify(results, null, 2))
assert.ok(results.felmeddelande_efter_ms < 10000, 'felmeddelandet kom för sent')
assert.equal(results.knapp_upplast, true, 'inloggningsknappen är fortfarande låst')
console.log('HANG OK')
