// Automatisk versionskontroll.
// Varje bygge får ett unikt BUILD_ID som skrivs in i JavaScript-filerna och i version.json.
// Om servern har ett nyare ID laddas sidan om automatiskt, men bara när det inte finns osparat arbete.
// Ingen manuell notis, ingen bekräftelseknapp.

export const BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

const CHECK_INTERVAL_MS = 60_000
const RELOAD_GUARD_KEY = 'arsplanering-auto-update-target'
const VERSION_URL = '/version.json'

// Varje del av appen (årsplanering, veckoplanering) anger själv om det finns osparat arbete.
const unsavedSources = new Map()
let pendingBuildId = null
let started = false

export function setUnsavedWork(source, hasWork) {
  if (hasWork) unsavedSources.set(source, true)
  else unsavedSources.delete(source)
  if (!hasWork) applyPendingUpdate()
}

export function hasUnsavedWork() {
  return unsavedSources.size > 0
}

function readGuard() {
  try { return sessionStorage.getItem(RELOAD_GUARD_KEY) } catch { return null }
}

function writeGuard(value) {
  try {
    if (value) sessionStorage.setItem(RELOAD_GUARD_KEY, value)
    else sessionStorage.removeItem(RELOAD_GUARD_KEY)
  } catch { /* privat läge eller blockerad lagring: fortsätt utan skydd */ }
}

function applyPendingUpdate() {
  if (!pendingBuildId || hasUnsavedWork()) return
  // Skydd mot loop: om just denna version redan laddats i fliken och servern ändå visar ett annat ID, försök inte igen.
  if (readGuard() === pendingBuildId) {
    console.warn('Ny version finns men sidan laddades redan om för den. Övriga kontroller fortsätter.')
    return
  }
  writeGuard(pendingBuildId)
  window.location.reload()
}

export async function checkForNewVersion() {
  if (BUILD_ID === 'dev') return
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    const remoteId = typeof data?.buildId === 'string' ? data.buildId : ''
    if (!remoteId) return
    if (remoteId === BUILD_ID) {
      // Vi kör den senaste versionen. Rensa skyddet så att framtida uppdateringar fungerar.
      pendingBuildId = null
      writeGuard(null)
      return
    }
    pendingBuildId = remoteId
    applyPendingUpdate()
  } catch {
    // Nätverksfel: nästa kontroll försöker igen.
  }
}

export function startAutoUpdate() {
  if (started || BUILD_ID === 'dev' || typeof window === 'undefined') return
  started = true
  void checkForNewVersion()
  window.setInterval(() => { void checkForNewVersion() }, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForNewVersion()
  })
  window.addEventListener('focus', () => { void checkForNewVersion() })
}
