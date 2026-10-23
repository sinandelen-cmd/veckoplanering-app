import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UpdateNotices({ userId, isAdmin, approvedTeachers = [] }) {
  const [notices, setNotices] = useState([])
  const [seen, setSeen] = useState([])
  const [version, setVersion] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [testMode, setTestMode] = useState(true)
  const [testRecipient, setTestRecipient] = useState('')
  const selectableTeachers = approvedTeachers.filter(item => item.user_id !== userId)

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

  async function send(event) {
    event.preventDefault()
    if (!isAdmin || !version.trim() || sending || (testMode && !selectableTeachers.some(item => item.user_id === testRecipient))) return
    if (!testMode && !window.confirm(`Skicka uppdateringen ${version.trim()} till alla godkända lärare? Deras sparade planeringar påverkas inte.`)) return
    setSending(true)
    setStatus('')
    const { error } = await supabase.from('app_update_notices').insert({
      version: version.trim(), description: description.trim(), created_by: userId,
      test_recipient_id: testMode ? testRecipient : null
    })
    if (error) setStatus('Kunde inte skicka uppdateringen: ' + error.message)
    else {
      setStatus(testMode ? 'Testnotisen skickades endast till valt testkonto.' : 'Uppdateringsnotisen har skickats till godkända lärare.')
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
  if (!isAdmin && unread.length === 0 && !status) return null
  return <section className="card app-update-notices" aria-label="Programuppdateringar">
    {isAdmin && <form onSubmit={send}>
      <h2>📣 Programuppdateringar – administratör</h2>
      <p className="muted">Skicka en notis när den nya webbversionen är publicerad. Lärarnas sparade planeringar ändras inte.</p>
      <label>Versionsnamn<input required maxLength={80} value={version} onChange={event => setVersion(event.target.value)} placeholder="Exempel: Version 1.3" /></label>
      <label>Vad är nytt?<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Förbättrad layout och schemamatris" /></label>
      <fieldset style={{border:'1px solid #d6b98a',borderRadius:10,padding:12}}><legend>Välj utskick</legend>
        <label style={{display:'block',marginBottom:8}}><input type="radio" name="update-send-mode" checked={testMode} onChange={() => setTestMode(true)} /> Testuppdatering – endast en vald lärare</label>
        <label style={{display:'block'}}><input type="radio" name="update-send-mode" checked={!testMode} onChange={() => setTestMode(false)} /> Riktig uppdatering – alla godkända lärare</label>
      </fieldset>
      {testMode && <div style={{padding:12,border:'2px solid #c08436',borderRadius:10}}>
        <strong>Testläge aktivt – ingen annan kollega får notisen.</strong>
        <label>Välj godkänt testkonto
          <select required value={testRecipient} onChange={event => setTestRecipient(event.target.value)}>
            <option value="">Välj lärare via e-post</option>
            {selectableTeachers.map(item => <option key={item.user_id} value={item.user_id}>{item.email || item.name || "Lärare utan e-post"}</option>)}
          </select>
        </label>
      </div>}
      {!testMode && <p role="note"><strong>Varning:</strong> Detta skickar en notis till alla godkända lärare. Du får bekräfta utskicket innan det genomförs.</p>}
      <button type="submit" className="primary" disabled={sending || !version.trim() || (testMode && !selectableTeachers.some(item => item.user_id === testRecipient))}>{sending ? 'Skickar…' : testMode ? 'Skicka testnotis endast till valt konto' : 'Skicka uppdatering till godkända lärare'}</button>
    </form>}
    {unread.length > 0 && <div role="region" aria-label="Nya uppdateringar">
      <h2>🔔 Ny uppdatering finns</h2>
      {unread.map(notice => <div key={notice.id} className="app-update-item">
        <strong>{notice.test_recipient_id ? 'TEST · ' : ''}{notice.version}</strong>
        {notice.description && <p>{notice.description}</p>}
        <p className="muted">Dina planeringar, klasser och lektioner behålls.</p>
        <button type="button" className="primary" onClick={() => acknowledge(notice)}>Uppdatera nu</button>
      </div>)}
    </div>}
    {status && <p role="status">{status}</p>}
  </section>
}
