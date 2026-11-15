// A4-anpassning för elevutskriften.
// Veckor mäts i en dold container med exakt samma utskriftsregler som används vid utskrift.
// Regler: 1) ingen text kapas eller döljs, 2) text krymps högst till 50 %,
// 3) om en vecka inte ryms även i 50 % visas en varning, och den fortsätter på nästa sida.

export const A4_CONTENT_MM = 297 - 2 * 9 // @page-marginal 9 mm
export const PRINT_SAFETY_MM = 8
export const PRINT_GAP_MM = 4
export const MIN_PRINT_SCALE = 0.5

const RULE_ID = 'a4-measure-rules'
const MEASURE_CLASS = 'a4-measure'
const mmToPx = mm => (mm * 96) / 25.4

// Splittar en selektorlista på kommatecken utanför parenteser, t.ex. :is(a, b).
function splitSelectors(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = '' }
    else current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// Kopierar utskriftsreglerna till en stilmall som bara gäller inne i mätcontainern.
// Samma CSS används då för mätning och för utskrift, så att höjderna stämmer.
export function installMeasureRules() {
  if (typeof document === 'undefined' || document.getElementById(RULE_ID)) return
  const lines = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of Array.from(rules)) {
      // CSSMediaRule (4) med utskriftsvillkor. Bara vanliga stilregler kopieras, inte @page.
      if (rule.type !== 4 || !/print/i.test(rule.media?.mediaText || '')) continue
      for (const inner of Array.from(rule.cssRules)) {
        if (inner.type !== 1) continue
        const selectors = splitSelectors(inner.selectorText).map(selector => `.${MEASURE_CLASS} ${selector}`)
        lines.push(`${selectors.join(', ')} { ${inner.style.cssText} }`)
      }
    }
  }
  const style = document.createElement('style')
  style.id = RULE_ID
  style.textContent = lines.join('\n')
  document.head.appendChild(style)
}

// Höjd i px för varje vecka. Nyckeln är veckans startdatum.
export function measureWeekHeights(container) {
  const heights = new Map()
  container.querySelectorAll('[data-print-week]').forEach(element => {
    heights.set(element.getAttribute('data-print-week'), element.getBoundingClientRect().height)
  })
  return heights
}

// Grupperar veckor till A4-sidor utifrån uppmätta höjder.
// Returnerar null om mätningen inte gick att göra (t.ex. dold flik), då används en uppskattning.
export function planPrintGroups(weeks, heights) {
  const measured = weeks.map(week => heights.get(week.weekStart))
  if (!measured.length || measured.every(value => !value)) return null
  const available = mmToPx(A4_CONTENT_MM - PRINT_SAFETY_MM)
  const gap = mmToPx(PRINT_GAP_MM)
  const groups = []
  const scales = {}
  const notices = []
  weeks.forEach((week, index) => {
    const height = measured[index] || available
    const key = week.weekStart
    if (height > available) {
      // Veckan får egen sida. Ryms den i minst 50 % krymps den till det. Annars skrivs den ut i
      // full textstorlek över flera sidor (krympning under 50 % är inte tillåten), med varning.
      const fitScale = available / height
      const fits = fitScale >= MIN_PRINT_SCALE
      const scale = fits ? fitScale : 1
      scales[key] = scale
      groups.push({ weeks: [week], height: Infinity, flow: !fits })
      notices.push({ weekStart: key, scale, fits })
      return
    }
    const last = groups[groups.length - 1]
    if (last && last.height + gap + height <= available) {
      last.weeks.push(week)
      last.height += gap + height
    } else {
      groups.push({ weeks: [week], height, flow: false })
    }
    scales[key] = 1
  })
  return { groups: groups.map(({ weeks: groupWeeks, flow }) => ({ weeks: groupWeeks, flow })), scales, notices }
}
