// FIKTIV Supabase-klient för lokala UI-tester. Ersätter bara src/supabase.js under testkörningen.
// Ingen nätverksanslutning, inga nycklar, ingen koppling till någon riktig databas.
// Saknar RLS och RPC-funktioner: de är verifierade separat (se docs/testdatabas.md).
const FAKE_TEACHER_ID = '00000000-0000-4000-8000-000000000001'
const store = { veckoplanering: [], teacher_access: [{ user_id: '00000000-0000-4000-8000-000000000001', status: 'approved', timer_period: null, expires_at: '2099-12-31T00:00:00Z', extension_requested: false }], planning_visit_events: [] }
const session = () => (globalThis.localStorage && localStorage.getItem('fake-session') === 'on')
  ? { user: { id: FAKE_TEACHER_ID, email: 'larare@test.invalid' }, access_token: 'fake' } : null
const listeners = []
// Fiktiva rader kan läggas in via localStorage 'fake-seed' (endast i testläget).
try { const seed = globalThis.localStorage && localStorage.getItem('fake-seed'); if (seed) Object.assign(store, JSON.parse(seed)) } catch { /* ogiltig seed ignoreras */ }

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.payload = null; this.orders = []; this.wantSingle = null; this.limitN = null }
  select() { if (this.op === 'select') this.op = 'select'; return this }
  eq(col, val) { this.filters.push(r => r[col] === val); return this }
  neq(col, val) { this.filters.push(r => r[col] !== val); return this }
  gte(col, val) { this.filters.push(r => r[col] >= val); return this }
  lt(col, val) { this.filters.push(r => r[col] < val); return this }
  in(col, vals) { this.filters.push(r => vals.includes(r[col])); return this }
  order(col, opts = {}) { this.orders.push([col, opts.ascending !== false]); return this }
  limit(n) { this.limitN = n; return this }
  insert(v) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; return this }
  update(v) { this.op = 'update'; this.payload = v; return this }
  delete() { this.op = 'delete'; return this }
  single() { this.wantSingle = 'one'; return this }
  maybeSingle() { this.wantSingle = 'maybe'; return this }
  execute() {
    const rows = store[this.table] || (store[this.table] = [])
    const matched = rows.filter(r => this.filters.every(f => f(r)))
    if (this.op === 'insert') {
      const created = this.payload.map(p => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }))
      rows.push(...created)
      return this.shape(created)
    }
    if (this.op === 'update') { matched.forEach(r => Object.assign(r, this.payload, { updated_at: new Date().toISOString() })); return this.shape(matched) }
    if (this.op === 'delete') { const ids = new Set(matched); store[this.table] = rows.filter(r => !ids.has(r)); return this.shape(matched) }
    let out = [...matched]
    for (const [col, asc] of this.orders.reverse()) out.sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1))
    if (this.limitN) out = out.slice(0, this.limitN)
    return this.shape(out)
  }
  shape(rows) {
    if (this.wantSingle === 'one') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'Förväntade en rad, fick ' + rows.length } }
    if (this.wantSingle === 'maybe') return { data: rows[0] || null, error: null }
    return { data: rows, error: null }
  }
  then(resolve, reject) { try { return Promise.resolve(this.execute()).then(resolve, reject) } catch (e) { return Promise.reject(e).then(resolve, reject) } }
}

export const supabase = {
  from: table => new Query(table),
  rpc: name => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: RPC ' + name + ' finns inte lokalt' } }),
  functions: { invoke: name => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: funktion ' + name + ' finns inte lokalt' } }) },
  storage: { from: () => ({
    upload: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: lagring är inte tillgänglig' } }),
    createSignedUrl: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: lagring är inte tillgänglig' } }),
    remove: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: lagring är inte tillgänglig' } }),
  }) },
  auth: {
    getSession: () => Promise.resolve({ data: { session: session() }, error: null }),
    onAuthStateChange: cb => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
    signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: inloggning simuleras inte' } }),
    signUp: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: registrering simuleras inte' } }),
    signOut: () => { localStorage.removeItem('fake-session'); listeners.forEach(cb => cb('SIGNED_OUT', null)); return Promise.resolve({ error: null }) },
  },
}
// Testhjälp: lägg in fiktiva rader före start.
export const __fake = { store, FAKE_TEACHER_ID }
if (typeof window !== 'undefined') window.__fake = __fake
