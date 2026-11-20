// Avbryter Supabase-anrop (databas, inloggning) som inte svarar. Utan detta kan ett hängande anrop hålla
// "upptagen"-läget igång, så att sparknappar och andra knappar är låsta tills sidan laddas om.
// Lagringsuppladdningar undantas, eftersom stora filer legitimt kan ta längre tid.
const STORAGE_PATH = '/storage/v1/'

export function createTimeoutFetch(timeoutMs, baseFetch = globalThis.fetch) {
  return function timeoutFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : String(input?.url || '')
    if (url.includes(STORAGE_PATH)) return baseFetch(input, init)

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    // Anroparens egen avbrytning ska fortsätta gälla.
    const callerSignal = init.signal
    const onCallerAbort = () => controller.abort()
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
    // Avbrottet ska alltid ge ett svar, även om underliggande fetch inte respekterar signalen.
    const aborted = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason ?? new DOMException('Avbrutet', 'AbortError')), { once: true })
    })
    aborted.catch(() => {})
    return Promise.race([baseFetch(input, { ...init, signal: controller.signal }), aborted])
      .catch(error => {
        if (timedOut) throw new Error(`Servern svarade inte inom ${Math.round(timeoutMs / 1000)} sekunder. Kontrollera anslutningen och försök igen.`)
        throw error
      })
      .finally(() => {
        clearTimeout(timer)
        callerSignal?.removeEventListener('abort', onCallerAbort)
      })
  }
}
