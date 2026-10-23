// Gemensamma perioder för administratörens lärarstatistik och lärarens elevstatistik.
// Alla datum beräknas i lokal tid; ett intervall har inkluderande start och exklusivt slut.
export function statisticsPeriod(period, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDay() || 7
  const midnight = new Date(year, month, now.getDate())
  let start
  let end
  if (period === 'week') {
    start = new Date(year, month, now.getDate() - day + 1)
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  } else if (period === 'month') {
    start = new Date(year, month, 1)
    end = new Date(year, month + 1, 1)
  } else if (period === 'term') {
    // Hösttermin: juli–december, vårtermin: januari–juni.
    const firstMonth = month >= 6 ? 6 : 0
    start = new Date(year, firstMonth, 1)
    end = new Date(year, firstMonth + 6, 1)
  } else if (period === 'year') {
    start = new Date(year, 0, 1)
    end = new Date(year + 1, 0, 1)
  } else {
    throw new Error('Okänd statistikperiod')
  }
  return { start: start.toISOString(), end: end.toISOString(), today: midnight.toISOString() }
}

export function countVisits(events) {
  return events.reduce((total, event) => total + (Number(event.visits) || 0), 0)
}
