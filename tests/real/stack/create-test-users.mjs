// Skapar tre FIKTIVA konton i den lokala stacken (två godkända lärare och en som inte är godkänd).
// Lösenorden slumpas och skrivs till en fil utanför repot.
// Användning: REAL_SUPABASE_ANON_KEY=... REAL_SUPABASE_URL=http://localhost:8000 node tests/real/stack/create-test-users.mjs /sökväg/test-users.json
import crypto from 'node:crypto'
import fs from 'node:fs'
const url = process.env.REAL_SUPABASE_URL || ''
const anon = process.env.REAL_SUPABASE_ANON_KEY || ''
const out = process.argv[2]
if (!/^http:\/\/localhost:\d+$/.test(url) || !anon || !out || out.startsWith(process.cwd())) { console.error('Kräver lokal URL, anon-nyckel och en fil utanför repot.'); process.exit(2) }
const users = {}
for (const [key, email] of [['A', 'larare-a@test.invalid'], ['B', 'larare-b@test.invalid'], ['C', 'ej-godkand@test.invalid']]) {
  const password = crypto.randomBytes(18).toString('base64url')
  const res = await fetch(url + '/auth/v1/signup', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!res.ok) { console.error('signup misslyckades för ' + key + ': ' + res.status); process.exit(1) }
  users[key] = { email, password }
}
fs.writeFileSync(out, JSON.stringify(users, null, 2), { mode: 0o600 })
console.log('testkonton skrivna till ' + out + ' (A och B godkänns med SQL, se README)')
