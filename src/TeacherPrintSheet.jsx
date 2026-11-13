// Separat utskriftsvy för lärarens Grundplanering i liggande A4.
// Renderas bara under utskrift, direkt under body. Ingen knapp, navigering eller modal ingår, och den vanliga vyn påverkas inte.
function lessonFields(lesson) {
  const topics = Array.isArray(lesson?.topics) ? lesson.topics : []
  return topics.map((topic, index) => ({
    key: index,
    moment: String(topic?.name || '').trim(),
    sida: [...(Array.isArray(topic?.pages) ? topic.pages : []), String(topic?.description || '').trim()].filter(Boolean).join('\n'),
    uppgift: (Array.isArray(topic?.assignments) ? topic.assignments : []).filter(Boolean).join('\n'),
  }))
}

export default function TeacherPrintSheet({ title, weeks }) {
  const visible = (weeks || []).filter(week => week && !week.hidden).slice().sort((a, b) => String(a.weekStart || '').localeCompare(String(b.weekStart || '')))
  const rows = []
  for (let i = 0; i < visible.length; i += 3) rows.push(visible.slice(i, i + 3))
  return (
    <div className="teacher-print-sheet-root" aria-hidden="true">
      <div className="tps-sheet">
        <header className="tps-header"><h1>{title}</h1></header>
        {rows.map((row, rowIndex) => (
          <div className="tps-row" key={rowIndex}>
            {row.map(week => {
              const number = week.printWeekNumber ?? week.weekNumber
              const lessons = Array.isArray(week.lessons) ? week.lessons : []
              return (
                <section className="tps-week" key={week.weekStart || week.weekNumber}>
                  <div className="tps-week-heading"><strong>Vecka {number}</strong><span>{week.weekStart || ''}</span></div>
                  {week.chapter && <div className="tps-chapter">{String(week.chapter).trim()}</div>}
                  {lessons.map((lesson, li) => (
                    <div className="tps-lesson" key={li}>
                      <div className="tps-lesson-name">{lesson?.name || `Lektion ${li + 1}`}</div>
                      {lessonFields(lesson).map(field => (
                        <div className="tps-field" key={field.key}>
                          {field.moment && <div className="tps-moment"><b>Moment</b> {field.moment}</div>}
                          {field.sida && <div className="tps-sida"><b>Sida</b> {field.sida}</div>}
                          {field.uppgift && <div className="tps-uppgift"><b>Uppgift</b> {field.uppgift}</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
