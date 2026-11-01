import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UpdateNotices({ userId }) {
  const [notices, setNotices] = useState([])
  const [seen, setSeen] = useState([])
  async function refresh() {
    if (!userId) return
    const [messages, receipts] = await Promise.all([
      supabase.from('app_update_notices').select('id,version,description,created_at,test_recipient_id').order('created_at', { ascending: false }).limit(20),
      supabase.from('app_update_acknowledgements').select('notice_id').eq('user_id', userId)
    ])
    if (messages.error || receipts.error) {
      setStatus('Kunde inte läsa uppdateringar. Försök igen senare.')
      return
    }
    setNotices(messages.data || [])
    setSeen((receipts.data || []).map(item => item.notice_id))
  }

  useEffect(() => {
    if (!userId) return
    // Läraren får notisen även när administratören skickar efter inloggning.
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const interval = window.setInterval(() => { void refresh() }, 60000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [userId])

  async function acknowledge(notice) {
    setStatus('')
    const { error } = await supabase.from('app_update_acknowledgements').upsert({
      notice_id: notice.id, user_id: userId
    }, { onConflict: 'notice_id,user_id', ignoreDuplicates: true })
    if (error) { setStatus('Kunde inte bekräfta uppdateringen: ' + error.message); return }
    // Programversionen är redan publicerad. Ladda om utan att skriva över data.
    window.location.reload()
  }

  const unread = notices.filter(item => !seen.includes(item.id))
  if (unread.length === 0 && !status) return null
  return <section className="card app-update-notices" aria-label="Programuppdateringar">
    {unread.length > 0 && <div role="region" aria-label="Nya uppdateringar">
      <h2>🔔 Ny uppdatering finns</h2>
      {unread.map(notice => <div key={notice.id} className="app-update-item">
        <strong>{notice.test_recipient_id ? 'TEST · ' : ''}{notice.version}</strong>
        {notice.description && <p>{notice.description}</p>}
        <p className="muted">Dina planeringar, klasser och lektioner behålls.</p>
        <button type="button" className="primary" onClick={() => acknowledge(notice)}>Bekräfta och ladda om</button>
      </div>)}
    </div>}
    {status && <p role="status">{status}</p>}
  </section>
}
