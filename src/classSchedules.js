// Gemensamt veckoinnehåll med individuella lektionsdagar för valfritt antal klasser.
// Ren datamodell: inga ändringar i befintliga planeringar krävs.
export const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']

export function normalizeClassSchedules(classes, lessonsPerWeek = 3) {
  const count = Math.max(1, Math.min(8, Number(lessonsPerWeek) || 3))
  if (!Array.isArray(classes)) return []
  const names = new Set()
  return classes.flatMap((item) => {
    const name = String(item?.name || '').trim()
    if (!name || names.has(name.toLocaleLowerCase('sv-SE'))) return []
    names.add(name.toLocaleLowerCase('sv-SE'))
    return [{
      name,
      lessonDays: Array.from({ length: count }, (_, i) =>
        WEEKDAYS.includes(item?.lessonDays?.[i]) ? item.lessonDays[i] : ''),
    }]
  })
}

export function classScheduleForWeek(plan, className, weekIndex) {
  const classes = normalizeClassSchedules(plan?.classSchedules, plan?.lessonsPerWeek)
  const selected = classes.find(item => item.name === className)
  if (!selected) return []
  const week = plan?.weeksData?.[weekIndex]
  return Array.from({ length: selected.lessonDays.length }, (_, index) => ({
    lessonNumber: index + 1,
    day: selected.lessonDays[index],
    // Alla klasser använder samma veckoinnehåll och lektionsordning.
    lesson: week?.lessons?.[index] || null,
  }))
}
