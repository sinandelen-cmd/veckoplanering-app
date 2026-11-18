// Förslag om uppdelning av en lektions text i separata moment. Används av importförhandsgranskningen.
// Ingen uppdelning sker här: funktionerna ger bara förslag och tillämpar det användaren har valt.

// Tydliga moment i en lektions text: rader som börjar med "1." / "2)" eller "Moment 2:" / "Delmoment 3 -".
// Ger null om det finns färre än två sådana rader. Texten före första momentet läggs i första delen, så inget kapas.
export const MOMENT_START = /^(?:\d{1,2}[.)]\s+|(?:del)?moment\s*\d*\s*[:.)\-–]\s*)/i
export function momentSplitSuggestion(text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
  const starts = lines.map((line, i) => (MOMENT_START.test(line) ? i : -1)).filter(i => i >= 0)
  if (starts.length < 2 || starts.length > 12) return null
  return starts.map((start, k) => ({
    title: lines[start].replace(MOMENT_START, '').trim().slice(0, 90) || `Moment ${k + 1}`,
    body: lines.slice(k === 0 ? 0 : start, k + 1 < starts.length ? starts[k + 1] : lines.length).join('\n'),
  }))
}
export function withMomentSuggestions(units) {
  return units.map(unit => ({ ...unit, momentParts: momentSplitSuggestion(unit.details) }))
}
// Byter ut de enheter som användaren har godkänt att dela upp. Övriga enheter behålls oförändrade.
export function expandUnits(units, decisions = {}) {
  return units.flatMap((unit, k) => {
    if (decisions[k] !== 'split' || !unit.momentParts) return [unit]
    return unit.momentParts.map((part, n) => ({
      ...unit,
      topic: part.title,
      details: part.body,
      originalText: n === 0 ? [unit.topic, unit.details].filter(Boolean).join('\n') : undefined,
    }))
  })
}

