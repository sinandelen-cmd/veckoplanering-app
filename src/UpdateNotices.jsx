import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UpdateNotices({ userId, isAdmin = false, approvedTeachers = [] }) {
  const [notices, setNotices] = useState([])
  const [seen, setSeen] = useState([])
  const [version, setVersion] = useState('Senaste uppdateringen')
  const [description, setDescription] = useState('En ny version av årsplaneringen är publicerad. Bekräfta uppdateringen och ladda om för att använda den.')
  const [sendMode, setSendMode] = useState('selected')
  const [selectedIds, setSelectedIds] = useState([])
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const selectable = approvedTeachers.filter(item => item.user_id && item.user_id !== userId && item.status !== 'blocked')
  const selectedValid = selectable.filter(item => selectedIds.includes(item.user_id))

  async function refresh() {
    if (!userId) return
    const [messages, receipts] = await Promise.all([
      supabase.from('app_update_notices').select('id,version,description,created_at,test_recipient_id').order('created_at', { ascending: false }).limit(30),
      supabase.from('app_update_acknowledgements').select('notice_id').eq('user_id', userId)
    ])
    if (messages.error || receipts.error) {
      setStatus('Kunde inte läsa uppdateringar. Försök igen senare.')
      return
    }
    const received = messages.data || []
    setNotices(received)
    setSeen((receipts.data || []).map(item => item.notice_id))
  }

  useEffect(() => {
    if (!userId) return
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const interval = window.setInterval(() => { void refresh() }, 60000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [userId])

  async function sendUpdate(event) {
    event.preventDefault()
    const chosen = sendMode === 'all' ? selectable : selectedValid
    if (!isAdmin || !version.trim() || !chosen.length || sending) return
    const label = sendMode === 'all' ? 'alla ' + chosen.length + ' godkända lärare' : chosen.map(item => item.email || item.name || 'lärare').join(', ')
    if (!window.confirm('Skicka information om uppdateringen till ' + label + '?')) return
    setSending(true)
    setStatus('')
    const { error } = await supabase.from('app_update_notices').insert({
      version: version.trim(),
      description: description.trim(),
      created_by: userId,
      test_recipient_id: null,
      recipient_ids: sendMode === 'all' ? null : chosen.map(item => item.user_id)
    })
    if (error) setStatus('Kunde inte skicka uppdateringen: ' + error.message)
    else {
      setStatus('Uppdateringsnotisen skickades till ' + label + '.')
      setSelectedIds([])
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
    window.location.reload()
  }

  const unread = notices.filter(item => !seen.includes(item.id))
  if (!isAdmin && unread.length === 0 && !status) return null
  return <section className="card app-update-notices" aria-label="Programuppdateringar">
    {isAdmin && <form onSubmit={sendUpdate} className="admin-update-send">
      <h2>📣 Skicka senaste programuppdateringen</h2>
      <p className="muted">Programversionen ska först vara publicerad. Här skickar du en notis till valda lärare eller alla godkända lärare. Ingen planering ändras.</p>
      <label>Versionsnamn
        <input required maxLength={80} value={version} onChange={event => setVersion(event.target.value)} placeholder="T.ex. Version 1.4" />
      </label>
      <label>Vad är nytt?
        <textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Beskriv senaste uppdateringen" />
      </label>
      <fieldset className="admin-update-recipients">
        <legend>Välj mottagare</legend>
        <label><input type="radio" name="update-recipient-mode" checked={sendMode === 'selected'} onChange={() => setSendMode('selected')} /> Valda konton</label>
        <label><input type="radio" name="update-recipient-mode" checked={sendMode === 'all'} onChange={() => setSendMode('all')} /> Alla godkända konton ({selectable.length})</label>
        {sendMode === 'selected' && <div className="admin-update-teacher-list">
          {selectable.length === 0 && <p>Inga godkända mottagare finns.</p>}
          {selectable.map(item => <label key={item.user_id} className="admin-update-teacher-row">
            <input type="checkbox" checked={selectedIds.includes(item.user_id)} onChange={event => setSelectedIds(previous => event.target.checked ? [...new Set([...previous, item.user_id])] : previous.filter(id => id !== item.user_id))} />
            <span>{item.email || item.name || 'Lärare'}</span>
          </label>)}
        </div>}
      </fieldset>
      <button type="submit" className="primary" disabled={sending || !version.trim() || (sendMode === 'all' ? !selectable.length : !selectedValid.length)}>
        {sending ? 'Skickar…' : sendMode === 'all' ? 'Skicka till alla godkända' : 'Skicka till valda (' + selectedValid.length + ')'}
      </button>
    </form>}
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
