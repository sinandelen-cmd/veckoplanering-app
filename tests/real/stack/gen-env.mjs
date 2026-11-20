// Skapar lokala hemligheter för den lokala teststacken. Skriver till den fil som anges, aldrig i repot.
// Användning: node tests/real/stack/gen-env.mjs /sökväg/utanför/repot/env.local
import crypto from 'node:crypto'
import fs from 'node:fs'
const out = process.argv[2]
if (!out || out.startsWith(process.cwd())) { console.error('Ange en sökväg utanför repot.'); process.exit(2) }
const secret = crypto.randomBytes(40).toString('hex')
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const sign = payload => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload); return h + '.' + p + '.' + crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url') }
const now = Math.floor(Date.now() / 1000), exp = now + 10 * 365 * 24 * 3600
fs.writeFileSync(out, `JWT_SECRET=${secret}\nANON_KEY=${sign({ role: 'anon', iss: 'supabase-local', iat: now, exp })}\nSERVICE_KEY=${sign({ role: 'service_role', iss: 'supabase-local', iat: now, exp })}\nPGPASS=${crypto.randomBytes(16).toString('hex')}\n`, { mode: 0o600 })
console.log('lokala nycklar skrivna till ' + out)
