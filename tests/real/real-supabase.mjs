// Integrationstest mot en RIKTIG Supabase-stack (PostgreSQL, Auth, PostgREST, Storage) med fiktiva konton och data.
// Körning: npm run test:real. Kräver REAL_SUPABASE_URL (måste vara lokal), REAL_SUPABASE_ANON_KEY och REAL_TEST_USERS (JSON-fil).
// Vägrar köra mot något annat än localhost, så att produktion aldrig kan nås härifrån.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url = process.env.REAL_SUPABASE_URL || ''
const anon = process.env.REAL_SUPABASE_ANON_KEY || ''
const usersFile = process.env.REAL_TEST_USERS || ''
if (!/^http:\/\/localhost:\d+$/.test(url)) { console.error('Vägrar: REAL_SUPABASE_URL måste vara lokal (http://localhost:...)'); process.exit(2) }
if (!anon || !usersFile) { console.error('Saknar REAL_SUPABASE_ANON_KEY eller REAL_TEST_USERS'); process.exit(2) }
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))

const results = []
const check = async (name, fn) => { try { await fn(); results.push(true); console.log('PASS ' + name) } catch (e) { results.push(false); console.log('FAIL ' + name + ' :: ' + String(e.message || e).slice(0, 400)) } }
const newClient = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
async function signedIn(key) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email: users[key].email, password: users[key].password })
  if (error) throw new Error('inloggning ' + key + ': ' + error.message)
  return { client, id: data.user.id }
}
const subjectPayload = (userId, school, name, archived = false) => ({
  user_id: userId, title: name, week_start: '2026-08-10', subject: name, school_year: null, class_name: null, start_date: null, weeks: 0,
  content: JSON.stringify({ kind: 'amne-v1', schoolForm: school, subject: name, archived }), published: false, public_slug: null, published_content: null, updated_at: new Date().toISOString(),
})
const coursePayload = (userId, school, subject, course, weeks, extra = {}) => ({
  user_id: userId, title: subject + ' – ' + course, week_start: '2026-08-10', subject, school_year: '2026–2027', class_name: null, start_date: '2026-08-10', weeks: weeks.length,
  content: JSON.stringify({ kind: 'arsplanering-v2', title: subject + ' – ' + course, subject, course, schoolForm: school, schoolYear: '2026–2027', weeksData: weeks, classGroups: [{ name: '7A' }], ...extra }),
  published: false, public_slug: null, published_content: null, updated_at: new Date().toISOString(),
})
const weeks21 = prefix => Array.from({ length: 21 }, (_, i) => ({ weekNumber: ((33 + i - 1) % 52) + 1, weekStart: '2026-08-10', title: 'Vecka ' + (i + 1), chapter: prefix + ' kapitel ' + (i + 1), vocabulary: [prefix + ' begrepp ' + (i + 1)], lessons: [{ id: prefix + i, topics: [{ name: prefix + ' lektion ' + (i + 1) }] }] }))

const A = await signedIn('A')
const B = await signedIn('B')
const C = await signedIn('C') // inte godkänd lärare

// Städar bara fiktiva rader som testet själv har skapat (taggade med TEST-prefix i namnet).
await A.client.from('veckoplanering').delete().like('title', 'TEST%')
await B.client.from('veckoplanering').delete().like('title', 'TEST%')

await check('ämnesrad skapas och syns för ägaren', async () => {
  const { data, error } = await A.client.from('veckoplanering').insert(subjectPayload(A.id, 'Gymnasiet', 'TEST Matematik')).select('id').single()
  assert.equal(error, null, error?.message)
  assert.ok(data.id)
  const { data: rows } = await A.client.from('veckoplanering').select('id,content').eq('id', data.id)
  assert.equal(rows.length, 1)
  assert.equal(JSON.parse(rows[0].content).kind, 'amne-v1')
})

await check('RLS: en annan lärare ser inte ämnet och kan inte ändra eller radera det', async () => {
  const { data: rows } = await B.client.from('veckoplanering').select('id').like('title', 'TEST Matematik')
  assert.equal(rows.length, 0, 'B ser A:s ämne')
  const { data: upd } = await B.client.from('veckoplanering').update({ title: 'hackat' }).like('title', 'TEST Matematik').select('id')
  assert.equal((upd || []).length, 0, 'B kunde ändra A:s ämne')
  const { data: del } = await B.client.from('veckoplanering').delete().like('title', 'TEST Matematik').select('id')
  assert.equal((del || []).length, 0, 'B kunde radera A:s ämne')
})

await check('RLS: lärare som inte är godkänd kan inte skapa planeringar eller ämnen', async () => {
  const { error } = await C.client.from('veckoplanering').insert(subjectPayload(C.id, 'Grundskola', 'TEST Obehörig'))
  assert.ok(error, 'icke godkänd lärare fick skapa en rad')
})

await check('RLS: anonym åtkomst ger inga planeringar', async () => {
  const anonClient = newClient()
  const { data } = await anonClient.from('veckoplanering').select('id').like('title', 'TEST%')
  assert.equal((data || []).length, 0, 'anonym användare såg rader')
})

await check('kurs med 21 veckor, klasser, kapitel och begrepp sparas och läses tillbaka oförändrat', async () => {
  const w = weeks21('Svenska')
  const { data, error } = await A.client.from('veckoplanering').insert(coursePayload(A.id, 'Grundskola', 'TEST Svenska', 'TEST Svenska åk 6', w)).select('id,content').single()
  assert.equal(error, null, error?.message)
  const back = JSON.parse(data.content)
  assert.equal(back.weeksData.length, 21)
  assert.deepEqual(back.weeksData, w)
  assert.deepEqual(back.classGroups, [{ name: '7A' }])
})

await check('arkivering och återställning av ämnet bevarar kursinnehållet exakt', async () => {
  const { data: before } = await A.client.from('veckoplanering').select('id,content').like('title', 'TEST Svenska%')
  const stripped = c => { const o = JSON.parse(c); delete o.archived; return o }
  const snapshot = before.map(r => [r.id, stripped(r.content)])
  for (const r of before) {
    const o = JSON.parse(r.content); o.archived = true
    const { error } = await A.client.from('veckoplanering').update({ content: JSON.stringify(o) }).eq('id', r.id)
    assert.equal(error, null)
  }
  for (const r of before) {
    const { data: cur } = await A.client.from('veckoplanering').select('content').eq('id', r.id).single()
    const o = JSON.parse(cur.content); o.archived = false
    const { error } = await A.client.from('veckoplanering').update({ content: JSON.stringify(o) }).eq('id', r.id)
    assert.equal(error, null)
  }
  const { data: after } = await A.client.from('veckoplanering').select('id,content').like('title', 'TEST Svenska%')
  assert.deepEqual(after.map(r => [r.id, stripped(r.content)]).sort(), snapshot.sort(), 'innehållet ändrades vid arkivering och återställning')
})

await check('permanent radering av ett arkiverat ämne tar bort bara ämnets rader', async () => {
  const { data: other } = await B.client.from('veckoplanering').insert(coursePayload(B.id, 'Gymnasiet', 'TEST Biologi', 'TEST Biologi 1', weeks21('Bio'))).select('id').single()
  const { data: target } = await A.client.from('veckoplanering').select('id').like('title', 'TEST Svenska%')
  const { error } = await A.client.from('veckoplanering').delete().in('id', target.map(r => r.id))
  assert.equal(error, null)
  const { data: left } = await A.client.from('veckoplanering').select('id').like('title', 'TEST Svenska%')
  assert.equal(left.length, 0, 'raderingen tog inte bort alla rader i ämnet')
  const { data: bioStill } = await B.client.from('veckoplanering').select('id').eq('id', other.id)
  assert.equal(bioStill.length, 1, 'B:s planering påverkades av A:s radering')
  const { data: matStill } = await A.client.from('veckoplanering').select('id').like('title', 'TEST Matematik')
  assert.equal(matStill.length, 1, 'ämnet Matematik påverkades av raderingen av Svenska')
})

// Samma ämne i olika skrivsätt. Varje variant ska stoppas av det unika indexet.
const rawPayload = (content, title) => ({ user_id: A.id, title, week_start: '2026-08-10', content, subject: 'TEST Bio', school_year: null, class_name: null, start_date: null, weeks: 0, published: false, public_slug: null, published_content: null })
const variants = {
  'omvänd nyckelordning': '{"schoolForm":"Gymnasiet","subject":"TEST Bio","kind":"amne-v1"}',
  'mellanslag och radbrytningar i JSON': '{ "kind" : "amne-v1",\n  "schoolForm": "Gymnasiet",\n  "subject": "TEST Bio" }',
  'annat skolformsnamn': '{"kind":"amne-v1","schoolForm":"Gymnasieskola","subject":"TEST Bio"}',
  'versaler och extra mellanslag i namnet': '{"kind":"amne-v1","schoolForm":"gymnasiet","subject":"  test   bio "}',
  'stor bokstav i kind': '{"kind":"AMNE-V1","schoolForm":"Gymnasiet","subject":"TEST Bio"}',
  'unicode-escape i kind': '{"kind":"\\u0061mne-v1","schoolForm":"Gymnasiet","subject":"TEST Bio"}',
}
await A.client.from('veckoplanering').delete().like('title', 'TEST Bio%')
await A.client.from('veckoplanering').insert(subjectPayload(A.id, 'Gymnasiet', 'TEST Bio')).select('id').single()
for (const [label, content] of Object.entries(variants)) {
  await check('unikt index stoppar: ' + label, async () => {
    const { error } = await A.client.from('veckoplanering').insert(rawPayload(content, 'TEST Bio dubblett')).select('id').single()
    assert.equal(error?.code, '23505', 'varianten släpptes in: ' + label + ' ' + (error?.code || 'ingen felkod'))
  })
}
await A.client.from('veckoplanering').delete().like('title', 'TEST Bio%')

// Två samtidiga skrivningar med olika formatering: exakt en ska lyckas.
await check('samtidiga skrivningar med olika JSON-formatering: exakt en lyckas', async () => {
  const [x, y] = await Promise.all([
    A.client.from('veckoplanering').insert(rawPayload('{"kind":"amne-v1","schoolForm":"Grundskola","subject":"TEST Samtidig"}', 'TEST Samtidig 1')).select('id').single(),
    A.client.from('veckoplanering').insert(rawPayload('{ "schoolForm": "Grundskola", "subject": " test samtidig", "kind": "amne-v1" }', 'TEST Samtidig 2')).select('id').single(),
  ])
  const errors = [x.error, y.error].filter(Boolean)
  assert.equal(errors.length, 1, 'fel antal lyckade skrivningar: ' + (2 - errors.length))
  assert.equal(errors[0].code, '23505')
  await A.client.from('veckoplanering').delete().like('title', 'TEST Samtidig%')
})

// Ogiltig JSON i en vanlig planering släpps in. Indexet tolkar bara JSON via amne_json_text, som returnerar NULL vid fel.
await check('unikt index: ogiltig JSON i en vanlig planering släpps in (påverkar inte planeringar)', async () => {
  const svc = createClient(url, process.env.REAL_SUPABASE_SERVICE_KEY || '', { auth: { persistSession: false } })
  const { error } = await svc.from('veckoplanering').insert({ user_id: A.id, title: 'TEST Ogiltig', week_start: '2026-08-10', content: 'inte json', subject: 'x', weeks: 0 })
  assert.equal(error, null, error?.message)
  await svc.from('veckoplanering').delete().like('title', 'TEST Ogiltig%')
})

// Planeringar påverkas inte av indexet: två kurser med samma ämne och namn ska kunna sparas.
await check('indexet gäller bara ämnesrader: två kurser med samma ämne och namn kan sparas', async () => {
  const w = weeks21('Dubbel')
  const [x, y] = await Promise.all([
    A.client.from('veckoplanering').insert(coursePayload(A.id, 'Gymnasiet', 'TEST Dubbel', 'TEST Dubbel 1', w)).select('id').single(),
    A.client.from('veckoplanering').insert(coursePayload(A.id, 'Gymnasiet', 'TEST Dubbel', 'TEST Dubbel 1', w)).select('id').single(),
  ])
  assert.equal(x.error, null, x.error?.message); assert.equal(y.error, null, y.error?.message)
  await A.client.from('veckoplanering').delete().like('title', 'TEST Dubbel%')
})

// Storage: privat bucket, åtkomst bara för ägaren.
const fixtures = { 'planering.txt': { type: 'text/plain', body: 'Fiktiv text: bråk och procent.' }, 'planering.pdf': { type: 'application/pdf', file: 'tests/ui/fixtures/planering.pdf' }, 'planering.docx': { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file: 'tests/ui/fixtures/planering.docx' } }
const bytesOf = spec => spec.file ? fs.readFileSync(spec.file) : Buffer.from(spec.body)
const paths = {}
for (const [name, spec] of Object.entries(fixtures)) {
  await check('uppladdning av ' + name + ' till egen mapp', async () => {
    const path = A.id + '/TEST-' + Date.now() + '-' + name
    const { error } = await A.client.storage.from('planning-materials').upload(path, bytesOf(spec), { contentType: spec.type, upsert: false })
    assert.equal(error, null, error?.message)
    paths[name] = path
  })
  await check('nedladdning av ' + name + ' av ägaren ger samma innehåll', async () => {
    const { data, error } = await A.client.storage.from('planning-materials').createSignedUrl(paths[name], 60)
    assert.equal(error, null, error?.message)
    const got = Buffer.from(await (await fetch(data.signedUrl)).arrayBuffer())
    assert.ok(got.equals(bytesOf(spec)), 'filen skiljer sig')
  })
}

await check('Excel-fil (xlsx) laddas upp och hämtas', async () => {
  const XLSX = (await import('xlsx')).default
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kapitel', 'Delmoment'], ['Algebra', 'Ekvationer']]), 'Kapitel')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const path = A.id + '/TEST-' + Date.now() + '-kapitel.xlsx'
  const { error } = await A.client.storage.from('planning-materials').upload(path, buf, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false })
  assert.equal(error, null, error?.message)
  const { data } = await A.client.storage.from('planning-materials').createSignedUrl(path, 60)
  assert.ok(Buffer.from(await (await fetch(data.signedUrl)).arrayBuffer()).equals(buf))
})

await check('B kan inte läsa A:s fil, varken med signerad länk eller direkt', async () => {
  const { data, error } = await B.client.storage.from('planning-materials').createSignedUrl(paths['planering.txt'], 60)
  assert.ok(error || !data?.signedUrl || (await fetch(data.signedUrl)).status !== 200, 'B fick åtkomst till A:s fil')
  const { data: list } = await B.client.storage.from('planning-materials').list(A.id)
  assert.equal((list || []).length, 0, 'B ser A:s filer i listan')
})

await check('B kan inte ladda upp i A:s mapp', async () => {
  const { error } = await B.client.storage.from('planning-materials').upload(A.id + '/TEST-intrång.txt', Buffer.from('x'), { contentType: 'text/plain' })
  assert.ok(error, 'B fick skriva i A:s mapp')
})

await check('anonym användare kan inte läsa filer i bucketen', async () => {
  const anonClient = newClient()
  const { data, error } = await anonClient.storage.from('planning-materials').createSignedUrl(paths['planering.txt'], 60)
  const ok = !error && data?.signedUrl && (await fetch(data.signedUrl)).status === 200
  assert.ok(!ok, 'anonym användare fick åtkomst')
})

// Bucket-metadata läses med tjänstenyckeln. Vanliga användare ska inte kunna läsa den.
await check('bucketen är privat och har MIME-begränsning, och vanliga användare kan inte läsa metadata', async () => {
  const service = process.env.REAL_SUPABASE_SERVICE_KEY || ''
  if (!service) throw new Error('REAL_SUPABASE_SERVICE_KEY saknas')
  const svc = createClient(url, service, { auth: { persistSession: false } })
  const { data, error } = await svc.storage.getBucket('planning-materials')
  assert.equal(error, null, error?.message)
  assert.equal(data.public, false)
  assert.ok((data.allowed_mime_types || []).includes('application/pdf'))
  const { data: asUser } = await A.client.storage.getBucket('planning-materials')
  assert.equal(asUser, null, 'vanlig användare kan läsa bucket-metadata')
})

await check('ägaren kan radera sina filer, och B kan inte radera dem', async () => {
  const { data: bDel } = await B.client.storage.from('planning-materials').remove([paths['planering.txt']])
  assert.equal((bDel || []).length, 0, 'B raderade A:s fil')
  const { error } = await A.client.storage.from('planning-materials').remove([paths['planering.txt'], paths['planering.pdf'], paths['planering.docx']])
  assert.equal(error, null, error?.message)
})

// Rensning av fiktiva testdata.
await A.client.from('veckoplanering').delete().like('title', 'TEST%')
await B.client.from('veckoplanering').delete().like('title', 'TEST%')

await check('inga produktionsdata berörs (URL är lokal)', async () => assert.match(url, /^http:\/\/localhost:/))
const failed = results.filter(r => !r).length
console.log(failed ? 'NÅGOT REALTEST MISSLYCKADES' : 'ALLA REALTESTER GODKÄNDA (' + results.length + ')')
process.exit(failed ? 1 : 0)
