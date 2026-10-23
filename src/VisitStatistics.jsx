import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { statisticsPeriod, countVisits } from './statisticsPeriods'

// Statistik visas endast för inloggad ägare. Databasens RLS måste också
// begränsa åtkomsten; enbart filtrering i klienten räcker inte.
export default function VisitStatistics({ ownerId, title = 'Elevstatistik' }) {
  const [period, setPeriod] = useState('month')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ownerId) return undefined
    let cancelled = false
    const { start, end } = statisticsPeriod(period)
    supabase.from('planning_visit_events')
      .select('visited_at, plan_id')
      .eq('teacher_id', ownerId)
      .eq('kind', 'student')
      .gte('visited_at', start)
      .lt('visited_at', end)
      .order('visited_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        setEvents(data || [])
        setError(queryError ? 'Statistiken är inte aktiverad ännu.' : '')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [ownerId, period])
  return <section className="card" aria-label={title}>
    <h2>{title}</h2>
    <p>Antal besök på dina publicerade elevvyer. Ett besök är inte samma sak som en unik elev.</p>
    <label>Period <select value={period} onChange={event => { setLoading(true); setPeriod(event.target.value) }}>
      <option value="week">Vecka</option>
      <option value="month">Månad</option>
      <option value="term">Termin</option>
      <option value="year">År</option>
    </select></label>
    {loading ? <p>Hämtar statistik …</p> : error ? <p role="status">{error}</p> : <>
      <p><strong>{countVisits(events.map(() => ({ visits: 1 })))}</strong> besök under vald period</p>
      <p>{events.length === 0 ? 'Inga registrerade besök under perioden.' : 'Besök registreras från det att statistiken aktiveras.'}</p>
    </>}
  </section>
}
