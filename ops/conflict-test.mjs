import { login } from './_h2.mjs'
import { execSync } from 'node:child_process'

const log = (...a) => console.log(...a)
const env = execSync('npx supabase status -o env', { cwd: 'C:/vp/localsupabase' }).toString()
const get = k => env.split('\n').find(l => l.startsWith(k + '=')).split('"')[1]
const URL = get('API_URL'), ANON = get('ANON_KEY')
const tok = (await (await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'testlarare-a@example.test', password: 'Testlarare-A-lokal-2026' }) })).json()).access_token
const dbRow = async () => (await (await fetch(URL + '/rest/v1/veckoplanering?select=title,content,updated_at', { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } })).json()).find(x => String(x.title).includes('Mitt kursnamn 7A'))
const FIELD = '.teacher-months-three .week-card textarea'
const openCourse = async page => {
  await page.locator('button:has-text("📁 Grundskola")').first().click(); await page.waitForTimeout(600)
  await page.locator('button:has-text("📚 Matematik")').first().click(); await page.waitForTimeout(600)
  await page.locator('button:has-text("Mitt kursnamn 7A")').first().click(); await page.waitForTimeout(3000)
}
const editField = async (page, index, text) => {
  const f = page.locator(FIELD).nth(index)
  await f.click(); await f.press('End'); await f.type(' ' + text); await page.waitForTimeout(4500)
}

// Session A öppnar planen först (känd uppdateringstid T0)
const A = await login(4200)
A.page.removeAllListeners('dialog'); A.page.on('dialog', d => d.accept().catch(() => {}))
await A.page.setViewportSize({ width: 1440, height: 900 })
await openCourse(A.page)

// Session B öppnar och sparar en ändring först
const B = await login(4200)
B.page.removeAllListeners('dialog'); B.page.on('dialog', d => d.accept().catch(() => {}))
await B.page.setViewportSize({ width: 1440, height: 900 })
await openCourse(B.page)
const markerB = 'SESSB-' + Date.now().toString(36)
await editField(B.page, 7, markerB)
const afterB = await dbRow()
log('1 session B saved its change (expect true):', String(afterB.content).includes(markerB))

// Session A gör en egen ändring från en gammal version
const markerA = 'SESSA-' + Date.now().toString(36)
await editField(A.page, 8, markerA)
const row = await dbRow()
const conflictVisible = await A.page.locator('.save-conflict-panel').count()
log('2 session A sees conflict panel (expect 1):', conflictVisible)
log('3 newer session B text not overwritten (expect true):', String(row.content).includes(markerB))
log('4 session A text not written to database during conflict (expect false):', String(row.content).includes(markerA))
log('5 conflict message shown (expect true):', (await A.page.locator('.status').allInnerTexts()).some(t => t.includes('Konflikt')))

// Session A väljer att spara sin version; B:s version måste finnas kvar i historiken
await A.page.locator('.save-conflict-panel button:has-text("Spara min version ändå")').click(); await A.page.waitForTimeout(4000)
const after = await dbRow()
const parsed = JSON.parse(after.content)
log('6 after explicit overwrite, A text in database (expect true):', String(after.content).includes(markerA))
log('7 session B text kept in version history (expect true):', (parsed.versions || []).some(v => JSON.stringify(v.weeksData || []).includes(markerB)))
log('8 conflict panel closed (expect 0):', await A.page.locator('.save-conflict-panel').count())

// Session B försöker spara vidare från sin gamla version: ska också konflikta
const markerB2 = 'SESSB2-' + Date.now().toString(36)
await editField(B.page, 9, markerB2)
log('9 stale session B conflicts (expect true):', (await B.page.locator('.save-conflict-panel').count()) === 1)
log('10 session A text still in database (expect true):', String((await dbRow()).content).includes(markerA))

await A.browser.close(); await B.browser.close()
