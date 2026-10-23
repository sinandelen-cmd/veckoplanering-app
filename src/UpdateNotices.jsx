import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UpdateNotices({ userId, isAdmin }) {
  const [notices, setNotices] = useState([])
  const [seen, setSeen] = useState([])
  const [version, setVersion] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  async function refresh() {
    if (!userId) return
    const [messages, receipts] = await Promise.all([
      supabase.from('app_update_notices').select('id,version,description,created_at').order('created_at', { ascending: false }).limit(20),
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

  async function send(event) {
    event.preventDefault()
    if (!isAdmin || !version.trim() || sending) return
    setSending(true)
    setStatus('')
    const { error } = await supabase.from('app_update_notices').insert({
      version: version.trim(), description: description.trim(), created_by: userId
    })
    if (error) setStatus('Kunde inte skicka uppdateringen: ' + error.message)
    else {
      setStatus('Uppdateringsnotisen har skickats till godkända lärare.')
      setVersion('')
      setDescription('')
      await refresh()
    }
    setSending(false)
  }

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
  return <section className="card app-update-notices" aria-label="Programuppdateringar">
    {isAdmin && <form onSubmit={send}>
      <h2>Skicka uppdatering till kopplade lärare</h2>
      <p className="muted">Skicka en notis när den nya webbversionen är publicerad. Lärarnas sparade planeringar ändras inte.</p>
      <label>Versionsnamn<input required maxLength={80} value={version} onChange={event => setVersion(event.target.value)} placeholder="Exempel: Version 1.3" /></label>
      <label>Vad är nytt?<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Förbättrad layout och schemamatris" /></label>
      <button type="submit" disabled={sending || !version.trim()}>{sending ? 'Skickar…' : 'Skicka uppdatering till godkända lärare'}</button>
    </form>}
    {unread.length > 0 && <div role="region" aria-label="Nya uppdateringar">
      <h2>🔔 Ny uppdatering finns</h2>
      {unread.map(notice => <div key={notice.id} className="app-update-item">
        <strong>{notice.version}</strong>
        {notice.description && <p>{notice.description}</p>}
        <p className="muted">Dina planeringar, klasser och lektioner behålls.</p>
        <button type="button" onClick={() => acknowledge(notice)}>Uppdatera nu</button>
      </div>)}
    </div>}
    {status && <p role="status">{status}</p>}
  </section>
}
