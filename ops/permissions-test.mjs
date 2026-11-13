import { execSync } from 'node:child_process'

const env = execSync('npx supabase status -o env', { cwd: 'C:/vp/localsupabase' }).toString()
const get = k => env.split('\n').find(l => l.startsWith(k + '=')).split('"')[1]
const URL = get('API_URL'), ANON = get('ANON_KEY')
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' – ' + extra : '')) }

const login = async (email, password) => (await (await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token
const tokA = await login('testlarare-a@example.test', 'Testlarare-A-lokal-2026')
const tokB = await login('testlarare-b@example.test', 'Testlarare-B-lokal-2026')
const H = t => ({ apikey: ANON, Authorization: 'Bearer ' + t, 'content-type': 'application/json' })
const idB = '42f3835c-3fa2-4844-89a6-4dd83aabf682'
const idA = '63757d51-a6c2-4ee3-8a57-368dc3ec08ee'

// B skapar en privat planering som A inte ska kunna se eller ändra
const ins = await fetch(URL + '/rest/v1/veckoplanering?select=id', { method: 'POST', headers: { ...H(tokB), Prefer: 'return=representation' }, body: JSON.stringify({ user_id: idB, title: 'PERMTEST-B-privat', content: JSON.stringify({ kind: 'arsplanering-v2', title: 'PERMTEST-B-privat', weeksData: [{ weekStart: '2026-11-02', weekNumber: 45, lessons: [] }], versions: [{ at: new Date().toISOString(), weeksData: [] }], published: false }), published: false, subject: 'Test' }) })
const insRows = await ins.json()
const rowId = Array.isArray(insRows) && insRows[0] ? insRows[0].id : null
check('B can create own private plan', !!rowId, rowId ? rowId.slice(0, 8) : JSON.stringify(insRows).slice(0, 120))

const readA = await (await fetch(URL + '/rest/v1/veckoplanering?select=id,content&id=eq.' + rowId, { headers: H(tokA) })).json()
check('A cannot read B plan by id (expect 0 rows)', Array.isArray(readA) && readA.length === 0, 'rows=' + (Array.isArray(readA) ? readA.length : JSON.stringify(readA).slice(0, 80)))
const listA = await (await fetch(URL + '/rest/v1/veckoplanering?select=id&user_id=eq.' + idB, { headers: H(tokA) })).json()
check('A cannot list B plans (expect 0 rows)', Array.isArray(listA) && listA.length === 0, 'rows=' + (Array.isArray(listA) ? listA.length : '?'))

const pubA = await fetch(URL + '/rest/v1/veckoplanering?id=eq.' + rowId, { method: 'PATCH', headers: { ...H(tokA), Prefer: 'return=representation' }, body: JSON.stringify({ published: true, public_slug: 'stulen-' + Date.now() }) })
const pubRows = await pubA.json()
check('A cannot publish B plan (expect 0 rows changed)', Array.isArray(pubRows) && pubRows.length === 0, 'rows=' + (Array.isArray(pubRows) ? pubRows.length : '?'))
const contentA = await fetch(URL + '/rest/v1/veckoplanering?id=eq.' + rowId, { method: 'PATCH', headers: { ...H(tokA), Prefer: 'return=representation' }, body: JSON.stringify({ content: '{"hacked":true}' }) })
const contentRows = await contentA.json()
check('A cannot edit B content (expect 0 rows changed)', Array.isArray(contentRows) && contentRows.length === 0)
const delA = await fetch(URL + '/rest/v1/veckoplanering?id=eq.' + rowId, { method: 'DELETE', headers: { ...H(tokA), Prefer: 'return=representation' } })
const delRows = await delA.json()
check('A cannot delete B plan (expect 0 rows)', Array.isArray(delRows) && delRows.length === 0)
const forgeA = await fetch(URL + '/rest/v1/veckoplanering?select=id', { method: 'POST', headers: { ...H(tokA), Prefer: 'return=representation' }, body: JSON.stringify({ user_id: idB, title: 'forged', content: '{}', published: true }) })
check('A cannot insert a plan for B (expect error)', !forgeA.ok, 'status=' + forgeA.status)
const readAnon = await (await fetch(URL + '/rest/v1/veckoplanering?select=id,content&id=eq.' + rowId, { headers: { apikey: ANON } })).json()
check('anonymous cannot read plans (expect 0 rows)', Array.isArray(readAnon) && readAnon.length === 0)
const readOwnB = await (await fetch(URL + '/rest/v1/veckoplanering?select=id,published&id=eq.' + rowId, { headers: H(tokB) })).json()
check('B still sees own plan unpublished (expect published false)', Array.isArray(readOwnB) && readOwnB.length === 1 && readOwnB[0].published === false)

// Städa upp B:s testplan
await fetch(URL + '/rest/v1/veckoplanering?id=eq.' + rowId, { method: 'DELETE', headers: H(tokB) })
const left = await (await fetch(URL + '/rest/v1/veckoplanering?select=id&id=eq.' + rowId, { headers: H(tokB) })).json()
check('test plan of B removed again (cleanup)', Array.isArray(left) && left.length === 0)
console.log(`RESULT ${results.filter(Boolean).length}/${results.length} passed`)
void idA
