import { login, labels } from './_h2.mjs'
import { execSync } from 'node:child_process'

const log = (...a) => console.log(...a)
const env = execSync('npx supabase status -o env', { cwd: 'C:/vp/localsupabase' }).toString()
const get = k => env.split('\n').find(l => l.startsWith(k + '=')).split('"')[1]
const URL = get('API_URL'), ANON = get('ANON_KEY')
const tok = (await (await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'testlarare-a@example.test', password: 'Testlarare-A-lokal-2026' }) })).json()).access_token
const dbRow = async () => (await (await fetch(URL + '/rest/v1/veckoplanering?select=id,title,content', { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } })).json()).find(x => String(x.title).includes('Mitt kursnamn 7A'))
{ const r = await dbRow(); const c = JSON.parse(r.content); if (c.archived) { c.archived = false; await fetch(URL + "/rest/v1/veckoplanering?id=eq." + r.id, { method: "PATCH", headers: { apikey: ANON, Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ content: JSON.stringify(c) }) }); log("reset: test course was left archived by an earlier run") } }
const before = await dbRow()
const weeksBefore = JSON.stringify(JSON.parse(before.content).weeksData)

const { browser, page, errors } = await login(4200)
page.removeAllListeners('dialog'); page.on('dialog', d => d.accept().catch(() => {}))
await page.setViewportSize({ width: 1440, height: 900 })
await page.locator('button:has-text("📁 Grundskola")').first().click(); await page.waitForTimeout(600)
await page.locator('button:has-text("📚 Matematik")').first().click(); await page.waitForTimeout(600)
const rowBtn = page.locator('.textbook-plan-row:has-text("Mitt kursnamn 7A")').first()
log('course row present (expect 1):', await rowBtn.count())
await rowBtn.locator('button.course-folder-archive').first().click(); await page.waitForTimeout(2500)
const afterArchive = await dbRow()
log('1 archived flag set in database (expect true):', JSON.parse(afterArchive.content).archived === true)
log('2 content kept on archive (expect true):', JSON.stringify(JSON.parse(afterArchive.content).weeksData) === weeksBefore)
log('3 gone from active list (expect 0):', await page.locator('.textbook-plan-row:has-text("Mitt kursnamn 7A")').count())
await page.getByRole("button", { name: /Arkiv/ }).filter({ hasNotText: "Arkivera" }).first().click(); await page.waitForTimeout(1500)
await page.locator('button:has-text("📁 Grundskola")').first().click().catch(() => {}); await page.waitForTimeout(600)
await page.locator('button:has-text("📚 Matematik")').first().click().catch(() => {}); await page.waitForTimeout(600)
const archivedRow = page.locator('.textbook-plan-row:has-text("Mitt kursnamn 7A")').first()
log('4 visible in archive view (expect 1):', await archivedRow.count())
await archivedRow.locator('button.course-folder-archive').first().click(); await page.waitForTimeout(2500)
const restored = await dbRow()
log('5 restored flag cleared (expect true):', !JSON.parse(restored.content).archived)
log('6 content still identical after restore (expect true):', JSON.stringify(JSON.parse(restored.content).weeksData) === weeksBefore)
await browser.close()
log('ERRORS', errors.length ? errors.slice(0, 2) : 'none')
