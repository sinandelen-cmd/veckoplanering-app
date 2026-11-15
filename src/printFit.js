// A4-anpassning för elevutskriften: en vecka per stående A4-sida.
// Veckor mäts i en dold container med samma utskriftsregler som utskriften, och varje lektion mäts separat.
// Regler:
// 1) Ryms veckan på sin sida behålls full textstorlek.
// 2) Ryms den inte men går att krympa till minst 50 % krymps den. Ingen text döljs.
// 3) Annars delas veckan på lektioner över flera A4-sidor i full textstorlek, med veckans rubrik på varje sida.
//    Då visas en tydlig varning på skärmen.

export const A4_CONTENT_MM = 297 - 2 * 9 // @page-marginal 9 mm
export const PRINT_SAFETY_MM = 8
export const LESSON_GAP_MM = 2
export const MIN_PRINT_SCALE = 0.5
const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']

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

// Totalhöjd för varje vecka och höjd för varje lektion (nycklad på lektionens index i veckan).
export function measureWeeks(container) {
  const measurements = new Map()
  container.querySelectorAll('[data-print-week]').forEach(element => {
    const lessons = new Map()
    element.querySelectorAll('section.lesson[data-lesson-index]').forEach(lesson => {
      lessons.set(Number(lesson.getAttribute('data-lesson-index')), lesson.getBoundingClientRect().height)
    })
    // Veckans rubrik utan innehåll: det som återstår på varje del efter den första.
    const minimalHeader = [...element.querySelectorAll('.student-header, .student-week-top, .chapter-heading, .student-week-card > h3')]
      .reduce((sum, node) => sum + node.getBoundingClientRect().height, 0)
    measurements.set(element.getAttribute('data-print-week'), { total: element.getBoundingClientRect().height, lessons, minimalHeader })
  })
  return measurements
}

// Planerar en A4-sida per vecka (eller flera sidor per vecka vid delning).
// Returnerar null om mätningen inte gick att göra (t.ex. dold flik), då används en enkel fallback.
export function planPrintGroups(weeks, measurements) {
  if (!weeks.length || ![...measurements.values()].some(item => item.total > 0)) return null
  const available = mmToPx(A4_CONTENT_MM - PRINT_SAFETY_MM)
  const gap = mmToPx(LESSON_GAP_MM)
  const groups = []
  const scales = {}
  const notices = []
  weeks.forEach(week => {
    const key = week.weekStart
    const measured = measurements.get(key)
    const total = measured?.total || available
    if (total <= available || !measured) {
      scales[key] = 1
      groups.push({ weeks: [week], flow: false })
      return
    }
    const fitScale = available / total
    if (fitScale >= MIN_PRINT_SCALE) {
      scales[key] = fitScale
      groups.push({ weeks: [{ ...week, printScale: fitScale, printBox: total * fitScale }], flow: false })
      notices.push({ weekStart: key, scale: fitScale, fits: true, pages: 1 })
      return
    }
    // Veckan ryms inte på en sida i full textstorlek. Dela på lektioner. Varje del krymps högst till 50 %.
    const lessons = week.lessons || []
    const headerFirst = Math.max(0, total - [...measured.lessons.values()].reduce((sum, value) => sum + value, 0))
    const headerRest = Math.min(headerFirst, measured.minimalHeader || headerFirst)
    const order = lessons
      .map((lesson, index) => ({ index, day: WEEKDAYS.indexOf(lesson?.day || lesson?.name) }))
      .sort((a, b) => ((a.day + 5) % 5) - ((b.day + 5) % 5) || a.index - b.index)
      .map(item => item.index)
    const chunks = []
    let current = []
    let currentHeight = headerFirst
    const limitFor = chunkIndex => (chunkIndex === 0 ? headerFirst : headerRest)
    for (const index of order) {
      const lessonHeight = measured.lessons.get(index) ?? 0
      const addition = lessonHeight + (current.length ? gap : 0)
      if (current.length && currentHeight + addition > available) {
        chunks.push(current)
        current = []
        currentHeight = limitFor(chunks.length)
      }
      current.push(index)
      currentHeight += lessonHeight + (current.length > 1 ? gap : 0)
    }
    if (current.length) chunks.push(current)
    const count = chunks.length
    let anyOversize = false
    chunks.forEach((indices, position) => {
      const chunkHeight = limitFor(position) + indices.reduce((sum, index) => sum + (measured.lessons.get(index) ?? 0), 0) + gap * Math.max(0, indices.length - 1)
      const chunkScale = chunkHeight > available ? available / chunkHeight : 1
      const oversize = chunkScale < MIN_PRINT_SCALE
      if (oversize) anyOversize = true
      // Veckans gemensamma innehåll visas bara på första delen, så att det inte upprepas på varje sida.
      const part = {
        ...week,
        lessons: lessons.filter((_, index) => indices.includes(index)),
        chunkLabel: count > 1 ? `Del ${position + 1} av ${count}` : '',
        printScale: oversize ? 1 : Math.min(1, chunkScale),
        printBox: chunkHeight * Math.min(1, chunkScale),
        ...(position > 0 ? { content: '', pages: [], assignments: [], links: [], items: [] } : {}),
      }
      groups.push({ weeks: [part], flow: oversize })
    })
    scales[key] = 1
    notices.push({ weekStart: key, scale: 1, fits: false, pages: count, oversize: anyOversize })
  })
  return { groups, scales, notices }
}
