export const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']
export const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre']
export const iso = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-')
export const monday = value => {
  const date = new Date((value || iso(new Date())) + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return new Date()
  date.setDate(date.getDate() - ((date.getDay()+6)%7))
  return date
}
export const nextDate = (start, offset) => { const d = new Date(start); d.setDate(d.getDate()+offset); return d }
export const describe = lesson => (lesson?.topics || []).map(topic => {
  const parts = [topic.name, topic.pagesLabel, topic.assignmentsLabel, ...(topic.pages || []), ...(topic.assignments || [])]
  return parts.filter(Boolean).join(' · ')
}).filter(Boolean).join('; ') || lesson?.name || 'Lektion utan innehåll'

export function buildClassSchedule(plan, group) {
  const days = Array.isArray(group.days) ? group.days : []
  const extraSlots = Array.isArray(group.extraSlots) ? group.extraSlots : []
  const cancelled = new Set(Array.isArray(group.cancelledDates) ? group.cancelledDates : [])
  const closures = Array.isArray(group.schoolClosures) ? group.schoolClosures : []
  const firstDate = group.startDate || plan.startDate || ''
  let lessonNumber = 0
  // Varje klass använder innehållet från rätt grundvecka.
  // Klassens lektionsinnehåll ska kunna fortsätta över veckogränser.
  return (plan.weeksData || []).flatMap(week => {
    if (!week?.weekStart || week.hidden) return []
    const source = Array.isArray(week.lessons) ? week.lessons : []
    const mondayDate = monday(week.weekStart)
    const slots = []
    for (let offset = 0; offset < 5; offset++) {
      const date = nextDate(mondayDate, offset)
      const dateKey = iso(date)
      const day = DAYS[offset]
      if ((firstDate && dateKey < firstDate) || cancelled.has(dateKey)) continue
      const closure = closures.find(event => dateKey >= event.startDate && dateKey <= (event.endDate || event.startDate))
      if (closure && closure.type !== 'Halvdag') continue
      const scheduledCount = days.filter(d => d === day).length + extraSlots.filter(slot => slot.date === dateKey).length
      const count = closure?.type === 'Halvdag' ? Math.max(0,scheduledCount - Math.max(1,Number(closure.cancelledLessons)||1)) : scheduledCount
      for (let n = 0; n < count; n++) slots.push({date:dateKey,day,slot:n+1,time:group.lessonTimes?.[day]?.[n] || ''})
    }
    return slots.map((slot, index) => {
      const lesson = source[index] || {name:'Lektion '+(index+1),topics:[]}
      lessonNumber++
      return {...slot,lesson:group.overrides?.[String(lessonNumber-1)]?.lesson || lesson,weekNumber:week.weekNumber,weekTitle:week.title,weekStart:week.weekStart,index,lessonNumber,override:group.overrides?.[String(lessonNumber-1)] || null}
    })
  })
}

