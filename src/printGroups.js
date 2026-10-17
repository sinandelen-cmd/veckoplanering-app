// Sidgruppering för elevutskrift. Uppskattar innehållsmängd, inte fysisk A4-höjd.
export function groupStudentWeeksForPrint(studentWeeks) {
  const groups = []
  for (const week of studentWeeks) {
    const lessons = Array.isArray(week.lessons) ? week.lessons.filter(Boolean) : []
    const textLength = [week.title, week.chapter, week.content,
      ...(week.pages || []), ...(week.assignments || []), ...(week.links || []),
      ...lessons.flatMap(lesson => [lesson.name, lesson.day,
        ...(Array.isArray(lesson.topics) ? lesson.topics.filter(Boolean) : []).flatMap(topic =>
          [topic.name, ...(topic.pages || []), ...(topic.assignments || []), ...(topic.links || [])])])]
      .filter(Boolean).map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ').length
    const contentBlocks = lessons.length + lessons.reduce((sum, lesson) =>
      sum + (Array.isArray(lesson.topics) ? lesson.topics.filter(Boolean).length : 0), 0)
    const weight = textLength > 1100 || contentBlocks > 16 ? 4 :
      textLength > 500 || contentBlocks > 8 ? 2 : 1
    const last = groups[groups.length - 1]
    if (!last || last.weight + weight > 4 || last.weeks.length >= 4) groups.push({ weeks: [week], weight })
    else { last.weeks.push(week); last.weight += weight }
  }
  return groups
}
