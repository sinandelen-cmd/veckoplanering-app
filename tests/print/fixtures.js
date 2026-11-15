// Fiktiv testdata. Inga riktiga planeringar, klasser eller konton används.
const WEEK_44 = '2026-10-26'
const addDays = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
// Varje moment har en unik markör utan bindestreck (pdftotext tar bort bindestreck vid radbrytning).
const lesson = (weekNumber, dayIndex, lessonIndex, topics, words) => ({
  name: 'Lektion ' + (lessonIndex + 1),
  day: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'][dayIndex],
  topics: Array.from({ length: topics }, (_, t) => ({
    name: `Moment ${weekNumber}.${dayIndex}.${lessonIndex}.${t} markor${weekNumber}d${dayIndex}l${lessonIndex}t${t}: ${'ord '.repeat(words)}`,
    pages: [`s. ${20 + t}`], assignments: [`Uppgift ${t + 1}: ${'text '.repeat(words)}`], links: [],
  })),
})
const week = (weekStart, weekNumber, lessonsPerDay, topics, words) => ({
  weekStart, weekNumber, title: `Vecka ${weekNumber} fiktiv`, chapter: 'Kapitel A', content: '', pages: [], assignments: [], links: [], keepVisibleExtra: true,
  lessons: Array.from({ length: 5 * lessonsPerDay }, (_, i) => lesson(weekNumber, Math.floor(i / lessonsPerDay), i % lessonsPerDay, topics, words)),
})
export const SCENARIOS = {
  'vecka44-lång': () => [week(WEEK_44, 44, 3, 4, 26), week(addDays(WEEK_44, 7), 45, 1, 1, 6), week(addDays(WEEK_44, -7), 43, 1, 2, 8)],
  'vecka44-tung': () => [week(WEEK_44, 44, 5, 8, 120), week(addDays(WEEK_44, 7), 45, 1, 1, 6)],
  normal: () => [week(WEEK_44, 44, 1, 1, 4), week(addDays(WEEK_44, 7), 45, 1, 2, 6)],
  // Klassvy: samma veckor som 'vecka44-lång', men klassen har lektioner måndag–onsdag (3 per vecka).
  'klassvy-lång': () => SCENARIOS['vecka44-lång'](),
}
export const CLASS_SCENARIOS = ['klassvy-lång']
export function buildFixturePlan(scenario) {
  const build = SCENARIOS[scenario] || SCENARIOS.normal
  const classGroups = CLASS_SCENARIOS.includes(scenario) ? [{ name: '7A', days: ['Måndag', 'Tisdag', 'Onsdag'], startDate: '2026-08-01', momentsPerDay: {} }] : []
  return { title: 'Fiktiv testplanering', subject: 'Testämne', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData: build(), classGroups }
}
