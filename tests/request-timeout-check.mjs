// Kontroll av tidsgräns för Supabase-anrop (src/requestTimeout.js). Körs i npm test.
import assert from 'node:assert/strict'
import { createTimeoutFetch } from '../src/requestTimeout.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// 1. Ett anrop som aldrig svarar avbryts efter tidsgränsen med ett begripligt meddelande.
{
  let seenSignal = null
  const hangingFetch = (url, init) => { seenSignal = init.signal; return new Promise(() => {}) }
  const timeoutFetch = createTimeoutFetch(50, hangingFetch)
  const started = Date.now()
  await assert.rejects(timeoutFetch('https://example.test/rest/v1/veckoplanering'), error => {
    assert.match(error.message, /svarade inte inom/)
    return true
  })
  assert.ok(Date.now() - started < 1000, 'avbrottet kom för sent')
  assert.equal(seenSignal.aborted, true, 'signalen till fetch avbröts inte')
}

// 2. Lagringsuppladdningar undantas: de får inte avbrytas av den korta gränsen.
{
  const slowStorage = (url, init) => new Promise(resolve => setTimeout(() => resolve({ ok: true, url, signalAborted: init.signal?.aborted ?? false }), 120))
  const timeoutFetch = createTimeoutFetch(20, slowStorage)
  const response = await timeoutFetch('https://example.test/storage/v1/object/planning-materials/a.pdf', { method: 'POST' })
  assert.equal(response.ok, true)
  assert.equal(response.signalAborted, false, 'lagringsanrop fick en tidsgräns')
}

// 3. Ett snabbt svar går igenom, och tidsgränsen rensas (ingen senare avbrytning).
{
  let seenSignal = null
  const quickFetch = (url, init) => { seenSignal = init.signal; return Promise.resolve({ ok: true, status: 200 }) }
  const timeoutFetch = createTimeoutFetch(30, quickFetch)
  const response = await timeoutFetch('https://example.test/rest/v1/veckoplanering')
  assert.equal(response.status, 200)
  await sleep(60)
  assert.equal(seenSignal.aborted, false, 'tidsgränsen rensades inte efter svar')
}

// 4. Anroparens egen avbrytning gäller fortfarande, och felet är anroparens.
{
  let seenSignal = null
  const hangingFetch = (url, init) => { seenSignal = init.signal; return new Promise(() => {}) }
  const timeoutFetch = createTimeoutFetch(5000, hangingFetch)
  const callerController = new AbortController()
  const pending = timeoutFetch('https://example.test/rest/v1/veckoplanering', { signal: callerController.signal })
  callerController.abort()
  await assert.rejects(pending, error => !/svarade inte inom/.test(error.message))
  assert.equal(seenSignal.aborted, true)
}

// 5. Nätverksfel som inte beror på tidsgränsen skickas vidare oförändrade.
{
  const failingFetch = () => Promise.reject(new TypeError('Failed to fetch'))
  const timeoutFetch = createTimeoutFetch(5000, failingFetch)
  await assert.rejects(timeoutFetch('https://example.test/rest/v1/veckoplanering'), error => error instanceof TypeError && error.message === 'Failed to fetch')
}

console.log('Tidsgräns för Supabase-anrop: OK')
