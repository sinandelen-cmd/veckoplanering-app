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
// Persistens för testerna: med 'fake-persist' = 'on' sparas skrivningar i webbläsarens lagring, så att de finns kvar efter omladdning.
// Det är fortfarande fiktiva data i testläget. Ingen nätverksanslutning och inga produktionsnycklar.
const persistOn = () => Boolean(globalThis.localStorage && localStorage.getItem('fake-persist') === 'on')
try { const saved = persistOn() && localStorage.getItem('fake-db'); if (saved) Object.assign(store, JSON.parse(saved)) } catch { /* ogiltig sparad databas ignoreras */ }
const persist = () => { if (persistOn()) try { localStorage.setItem('fake-db', JSON.stringify(store)) } catch { /* lagringen är full eller blockerad */ } }

// Fiktiv fillagring för bifogat material. Filerna finns i testlagringen ('fake-files' när persistens är på),
// så att de finns kvar efter omladdning. Inga filer lämnar webbläsaren.
const files = {}
try { const saved = persistOn() && localStorage.getItem('fake-files'); if (saved) Object.assign(files, JSON.parse(saved)) } catch { /* ogiltig sparad fil ignoreras */ }
const persistFiles = () => { if (persistOn()) try { localStorage.setItem('fake-files', JSON.stringify(files)) } catch { /* lagringen är full eller blockerad */ } }
const readAsDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
// Loggar över uppladdningar och borttagningar, så att testerna kan kontrollera att inget laddas upp i onödan.
const fakeLog = { uploads: [], removals: [] }
// Filer vars namn innehåller [fel] misslyckas vid uppladdning. Används för att testa avbruten uppladdning.
const fakeBucket = {
  upload: async (path, file) => {
    if (file.name.includes('[fel]')) return { data: null, error: { message: 'Fiktiv klient: uppladdningen misslyckades' } }
    try { files[path] = { name: file.name, type: file.type, dataUrl: await readAsDataUrl(file) }; fakeLog.uploads.push(file.name); persistFiles(); return { data: { path }, error: null } }
    catch (error) { return { data: null, error: { message: error.message } } }
  },
  // Länken är en blob-adress från samma webbläsare, så att den går att öppna i ett nytt fönster.
  createSignedUrl: async path => {
    if (!files[path]) return { data: null, error: { message: 'Filen finns inte i testlagringen' } }
    const bytes = await (await fetch(files[path].dataUrl)).arrayBuffer()
    const type = (files[path].type || '').startsWith('text/') ? files[path].type + ';charset=utf-8' : (files[path].type || '')
    const blob = new Blob([bytes], { type })
    return { data: { signedUrl: URL.createObjectURL(blob) }, error: null }
  },
  remove: async paths => {
    // Sökvägar med "radera-fel" kan inte raderas. Används för att testa att misslyckad radering visas för användaren.
    if (paths.some(path => path.includes('radera-fel'))) return { data: null, error: { message: 'Fiktiv klient: radering misslyckades' } }
    paths.forEach(path => { delete files[path]; fakeLog.removals.push(path) }); persistFiles(); return { data: paths.map(path => ({ name: path })), error: null }
  },
}

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
      persist()
      return this.shape(created)
    }
    if (this.op === 'update') { matched.forEach(r => Object.assign(r, this.payload, { updated_at: new Date().toISOString() })); persist(); return this.shape(matched) }
    if (this.op === 'delete') { const ids = new Set(matched); store[this.table] = rows.filter(r => !ids.has(r)); persist(); return this.shape(matched) }
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
  storage: { from: () => fakeBucket },
  auth: {
    getSession: () => Promise.resolve({ data: { session: session() }, error: null }),
    onAuthStateChange: cb => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
    signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: inloggning simuleras inte' } }),
    signUp: () => Promise.resolve({ data: null, error: { message: 'Fiktiv klient: registrering simuleras inte' } }),
    signOut: () => { localStorage.removeItem('fake-session'); listeners.forEach(cb => cb('SIGNED_OUT', null)); return Promise.resolve({ error: null }) },
  },
}
// Testhjälp: lägg in fiktiva rader före start.
export const __fake = { store, files, fakeLog, FAKE_TEACHER_ID }
if (typeof window !== 'undefined') window.__fake = __fake
