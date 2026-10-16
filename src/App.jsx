import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabase'
import './App.css'
import Navigation from './Navigation.jsx'

const APP_TITLE = 'Årsplanering'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
const DEFAULT_WEEKS = 1

function toIsoDate(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mondayOf(value = new Date()) {
  const d = new Date(value)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return toIsoDate(d)
}

function addWeeks(dateString, weeks) {
  const d = new Date(`${dateString}T12:00:00`)
  d.setDate(d.getDate() + Number(weeks) * 7)
  return toIsoDate(d)
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${dateString}T12:00:00`))
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'arsplanering'
}

function emptyPlan() {
  return {
    title: '', subject: '', schoolYear: '', className: '',
    startDate: mondayOf(), startWeek: 1, lessonsPerWeek: 3, weeks: DEFAULT_WEEKS, weeksData: [],
    published: false, publicSlug: '',
  }
}

function makeWeeks(plan, count = plan.weeks) {
  const total = Math.max(1, Math.min(52, Number(count) || DEFAULT_WEEKS))
  return Array.from({ length: total }, (_, index) => ({
    weekNumber: (Number(plan.startWeek) || 1) + index,
    weekStart: addWeeks(plan.startDate, index),
    title: `Vecka ${(Number(plan.startWeek) || 1) + index}`,
    chapter: '',
    content: '',
    pages: [], assignments: [], links: [],
    items: [], lessons: Array.from({ length: Math.max(1, Math.min(8, Number(plan.lessonsPerWeek) || 3)) }, (_, i) => ({ name: `Lektion ${i + 1}`, topics: [] })),
  }))
}

// Bevara befintlig veckotext när startdatum eller antal veckor ändras.
function reconcileWeeks(plan, startDate, count) {
  const total = Math.max(1, Math.min(52, Number(count) || DEFAULT_WEEKS))
  const previous = plan.weeksData.length ? plan.weeksData : makeWeeks(plan)
  const fresh = makeWeeks({ ...plan, startDate, weeks: total }, total)
  return fresh.map((week, index) => ({
    ...week,
    ...(previous[index] || {}),
    weekNumber: (Number(plan.startWeek) || 1) + index,
    weekStart: week.weekStart,
  }))
}

// Används före åtgärder som annars kan skriva över redan inmatad planering.
function hasWeekWork(week, index) {
  return Boolean(
    String(week.content || '').trim() ||
    week.items?.length || week.lessons?.some(lesson => lesson.topics?.length || (lesson.name && !/^Lektion \\d+$/.test(lesson.name))) ||
    (week.title && week.title !== `Vecka ${week.weekNumber || index + 1}`) ||
    String(week.chapter || '').trim() || week.pages?.length || week.assignments?.length || week.links?.length ||
    String(week.teacherNotes || '').trim() || week.hidden
  )
}

function hasPlanWork(plan) {
  return Boolean(
    String(plan.title || '').trim() || String(plan.subject || '').trim() ||
    String(plan.schoolYear || '').trim() || String(plan.className || '').trim() ||
    (plan.weeksData || []).some(hasWeekWork)
  )
}

function confirmReplacingWeeks(plan) {
  return !(plan.weeksData || []).some(hasWeekWork) ||
    window.confirm('Det finns redan innehåll i årsplaneringen. Importen ersätter veckornas innehåll. Vill du fortsätta?')
}

function normalizeLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function distributeText(plan, text) {
  const lines = normalizeLines(text)
  const weeks = makeWeeks(plan)
  if (!lines.length) return weeks
  const perWeek = Math.max(1, Math.ceil(lines.length / weeks.length))
  return weeks.map((week, index) => {
    const chunk = lines.slice(index * perWeek, (index + 1) * perWeek)
    return { ...week, content: chunk.join('\n'), items: chunk.map(text => ({ text })) }
  })
}

async function extractText(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.csv')) return file.text()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    return workbook.SheetNames.map(sheet => `## ${sheet}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])}`).join('\n\n')
  }
  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  }
  if (name.endsWith('.pdf')) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(content.items.map(item => item.str).join(' '))
    }
    return pages.join('\n')
  }
  throw new Error('Filtypen stöds inte. Använd Excel, Word, PDF, CSV eller TXT.')
}

function parseContent(value) {
  try { return JSON.parse(value || '{}') } catch { return null }
}

function isAnnualRow(row) {
  const data = parseContent(row.content)
  return data?.kind === 'arsplanering-v2' || data?.kind === 'arsplanering-v1'
}

function weeklyContentAsText(data, fallback) {
  if (!data || typeof data !== 'object' || !data.dagar) return fallback || ''
  const days = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']
  return days.map(day => {
    const details = data.detaljer?.[day] || {}
    const lines = [data.dagar[day], details.delmoment, details.uppgiftsnummer && `Uppgifter: ${details.uppgiftsnummer}`, details.sidnummer && `Sidor: ${details.sidnummer}`]
      .filter(value => typeof value === 'string' && value.trim())
    return lines.length ? `${day}: ${lines.join(' · ')}` : ''
  }).filter(Boolean).join('\n')
}

function planFromRow(row) {
  let data = {}
  try { data = JSON.parse(row.content || '{}') } catch { data = {} }
  if (data.kind === 'arsplanering-v2' || data.kind === 'arsplanering-v1') {
    return { ...emptyPlan(), ...data, published: typeof row.published === 'boolean' ? row.published : Boolean(data.published) }
  }
  return {
    ...emptyPlan(),
    title: row.title || 'Äldre planering',
    subject: row.subject || '',
    schoolYear: row.school_year || '',
    className: row.class_name || '',
    startDate: row.start_date || row.week_start || mondayOf(),
    weeks: 1,
    weeksData: [{ weekNumber: 1, weekStart: row.week_start || mondayOf(), title: 'Vecka 1', content: weeklyContentAsText(data, row.content), items: [] }],
  }
}


// Elevkopian innehåller bara fält som faktiskt visas för elever.
// En spärrlista för teacherNotes räcker inte: andra interna fält kan tillkomma.
function sanitizeForStudents(plan) {
  const sourceWeeks = Array.isArray(plan?.weeksData) ? plan.weeksData : []
  return {
    kind: 'arsplanering-v2',
    title: String(plan?.title || ''),
    subject: String(plan?.subject || ''),
    className: String(plan?.className || ''),
    schoolYear: String(plan?.schoolYear || ''),
    published: true,
    weeksData: sourceWeeks
      .filter(week => week && typeof week === 'object' && !week.hidden)
      .sort((a, b) => (Number(b.weekNumber) || 0) - (Number(a.weekNumber) || 0))
      .map((week, index) => ({
        weekNumber: Number.isInteger(week.weekNumber) ? week.weekNumber : index + 1,
        weekStart: typeof week.weekStart === 'string' ? week.weekStart : '',
        title: typeof week.title === 'string' ? week.title : '',
        chapter: typeof week.chapter === 'string' ? week.chapter.slice(0, 160) : '',
        lessons: Array.isArray(week.lessons) ? week.lessons.map(lesson => ({ name: String(lesson.name || ''), topics: Array.isArray(lesson.topics) ? lesson.topics.map(topic => ({ name: String(topic.name || ''), pages: Array.isArray(topic.pages) ? topic.pages.map(String) : [], assignments: Array.isArray(topic.assignments) ? topic.assignments.map(String) : [], links: Array.isArray(topic.links) ? topic.links.filter(link => link && resourceInfo(typeof link === 'string' ? link : link.url)).map(link => typeof link === 'string' ? { url: link, label: resourceInfo(link).label } : { url: String(link.url), label: String(link.label || resourceInfo(link.url).label) }) : [] })) : [] })) : [],
        content: typeof week.content === 'string' ? week.content : '',
        pages: Array.isArray(week.pages) ? week.pages.filter(v => typeof v === 'string' && v.trim()).slice(0, 100) : [],
        assignments: Array.isArray(week.assignments) ? week.assignments.filter(v => typeof v === 'string' && v.trim()).slice(0, 100) : [],
        links: Array.isArray(week.links) ? week.links.filter(v => typeof v === 'string' && resourceInfo(v)).slice(0, 100) : [],
      })),
  }
}

function resourceInfo(url) {
  const value = String(url || '').trim()
  try {
    const parsed = new URL(value)
    if (!['https:', 'http:'].includes(parsed.protocol)) return null
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return { label: 'YouTube', icon: '▶', kind: 'youtube' }
    if (/\.(pptx?|ppsx?)(?:$)/i.test(path)) return { label: 'PPTX', icon: 'P', kind: 'pptx' }
    if (/\.(pdf)(?:$)/i.test(path)) return { label: 'PDF', icon: 'PDF', kind: 'pdf' }
    if (/\.(docx?)(?:$)/i.test(path)) return { label: 'Word', icon: 'W', kind: 'word' }
    if (/\.(xlsx?)(?:$)/i.test(path)) return { label: 'Excel', icon: 'X', kind: 'excel' }
    if (host.includes('drive.google.com') || host.includes('onedrive') || host.includes('sharepoint')) return { label: 'Fil', icon: '↗', kind: 'file' }
    return { label: 'Länk', icon: '↗', kind: 'link' }
  } catch { return null }
}

function buildSlug(plan) {
  const suffix = crypto.randomUUID().slice(0, 8)
  return `${slugify(plan.title)}-${slugify(plan.subject || 'amne')}-${slugify(plan.className || 'alla')}-${slugify(plan.schoolYear || 'arsplan')}-${suffix}`
}

// Ett sparat utkast får inte automatiskt avpublicera den version eleverna ser.
// Vid publicering uppdateras elevkopian; vid avpublicering används separat knapp.
function publicationFields(publish, keepPublished, slug, publishedPayload) {
  if (keepPublished) return {}
  return {
    published: publish,
    public_slug: slug || null,
    published_content: publishedPayload ? JSON.stringify(publishedPayload) : null,
  }
}

function Login({ email, password, setEmail, setPassword, onSubmit, status }) {
  return <main className="shell narrow-shell">
    <section className="brand-card">
      <div className="brand-mark">Å</div>
      <p className="eyebrow">LÄRARPORTAL</p>
      <h1>{APP_TITLE}</h1>
      <p className="muted">Planera, importera, klona och publicera.</p>
    </section>
    <form className="card" onSubmit={onSubmit}>
      <h2>Logga in som lärare</h2>
      <label>E-post<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Lösenord<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="primary full" type="submit">Logga in</button>
      {status && <p className="status">{status}</p>}
    </form>
  </main>
}

function StudentView({ plan, error, preview = false }) {
  if (error) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>{error}</p></section></main>
  if (!plan) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar planeringen...</p></section></main>
  return <main className="shell student-shell">
    <header className="student-header">
      <div><p className="eyebrow">{preview ? 'FÖRHANDSVISNING' : 'PUBLICERAD ÅRSPLANERING'}</p><h1>{plan.title}</h1><p className="muted">{[plan.subject, plan.className, plan.schoolYear].filter(Boolean).join(' · ')}</p></div>
      <span className="public-badge">{preview ? "Förhandsvisning" : "Publicerad"}</span>
    </header>
    <section className="year-grid">
      {plan.weeksData.map((week, index) => <div className="chapter-week-group" key={`${week.weekNumber}-${week.weekStart}`}>
        {week.chapter?.trim() && (index === 0 || week.chapter !== plan.weeksData[index - 1]?.chapter) && <h2 className={`chapter-heading chapter-tone-${index % 4}`}>{week.chapter}</h2>}
        <article className="week-card">
        <div className="week-top"><strong>Vecka {week.weekNumber}</strong><span>{formatDate(week.weekStart)}</span></div>
        <h3>{week.title}</h3>
        <div className="week-content">{week.content || (!week.pages?.length && !week.assignments?.length && !week.links?.length && !week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length)) ? 'Ingen planering angiven ännu.' : '')}</div>
        <LessonDetails week={week} />
        <WeekDetails week={week} />
      </article></div>)}
    </section>
  </main>
}

function TeacherApp({ session }) {
  const [plan, setPlan] = useState(emptyPlan())
  const [plans, setPlans] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const [previewStudents, setPreviewStudents] = useState(false)
  const latestPlanRef = useRef(plan)
  useEffect(() => { latestPlanRef.current = plan }, [plan])
  const savedPlanRef = useRef(JSON.stringify(plan))
  const isDirty = JSON.stringify(plan) !== savedPlanRef.current
  useEffect(() => {
    const warnBeforeLeave = event => {
      if (JSON.stringify(latestPlanRef.current) === savedPlanRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [])


  const weeks = plan.weeksData.length ? plan.weeksData : makeWeeks(plan)

  async function loadPlans() {
    const { data, error } = await supabase.from('veckoplanering')
      .select('id,title,content,week_start,created_at,updated_at,subject,school_year,class_name,start_date,weeks,published,public_slug')
      .eq('user_id', session.user.id).order('created_at', { ascending: false })
    if (error) {
      setStatus(`Kunde inte hämta planeringar: ${error.message}`)
      return false
    }
    setPlans((data || []).filter(isAnnualRow))
    return true
  }

  useEffect(() => { loadPlans() }, [])

  function updateWeek(index, changes) {
    setPlan(p => ({ ...p, weeksData: (p.weeksData.length ? p.weeksData : makeWeeks(p)).map((week, i) => i === index ? { ...week, ...changes } : week) }))
  }

  async function save(publish) {
    if (!String(plan.title || '').trim()) return setStatus('Skriv ett namn på årsplaneringen.')
    if (!String(plan.subject || '').trim()) return setStatus('Skriv ämne.')
    setBusy(true)
    setStatus('Sparar...')
    try {
      // Befintliga publiceringsfält ändras aldrig vid sparning av utkast.
      // Databasens status hämtas separat, inte från redigerarens lokala kopia.
      let databasePublished = false
      let databaseSlug = ''
      if (selectedId && !publish) {
        const { data: existing, error: lookupError } = await supabase.from('veckoplanering')
          .select('published,public_slug').eq('id', selectedId).eq('user_id', session.user.id).single()
        if (lookupError) {
          setStatus(`Kunde inte kontrollera publiceringsstatus: ${lookupError.message}`)
          setBusy(false)
          return
        }
        databasePublished = existing.published === true
        databaseSlug = existing.public_slug || ''
      }
      const keepPublished = !publish && databasePublished
      const slug = publish ? (plan.publicSlug || buildSlug(plan)) : (databaseSlug || '')
      const payload = { kind: 'arsplanering-v2', ...plan, weeksData: weeks, published: publish || keepPublished, publicSlug: slug }
      const publishedPayload = publish ? sanitizeForStudents(payload) : null
      const row = {
        user_id: session.user.id,
        title: plan.title,
        week_start: plan.startDate,
        content: JSON.stringify(payload),
        subject: plan.subject,
        school_year: plan.schoolYear,
        class_name: plan.className,
        start_date: plan.startDate,
        weeks: plan.weeks,
        ...(publish || !selectedId ? publicationFields(publish, false, slug, publishedPayload) : {}),
        updated_at: new Date().toISOString(),
      }
      const query = selectedId
        ? supabase.from('veckoplanering').update(row).eq('id', selectedId).eq('user_id', session.user.id).select('id').single()
        : supabase.from('veckoplanering').insert(row).select('id').single()
      const { data, error } = await query
      if (error) setStatus(`Kunde inte spara: ${error.message}`)
      else {
        setSelectedId(data.id)
        const refreshed = await loadPlans()
        // Ändringar som gjorts medan nätverksanropet pågick får inte skrivas över.
        savedPlanRef.current = JSON.stringify(payload)
        const newerEdits = latestPlanRef.current !== plan
        setPlan(current => current === plan ? payload : current)
        const message = !refreshed ? 'Sparad, men listan kunde inte uppdateras. Ladda om för att kontrollera.' : publish
          ? `Publicerad: ${window.location.origin}/elev/${slug}`
          : keepPublished
            ? 'Ändringarna är sparade. Eleverna ser fortfarande den senast publicerade versionen.'
            : 'Utkast sparat.'
        setStatus(newerEdits ? `${message} Nya ändringar i redigeraren är ännu inte sparade.` : message)
      }
    } catch (error) {
      setStatus(`Kunde inte spara: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  async function unpublish(row) {
    if (busy) return
    setBusy(true)
    try {
      // Uppdatera endast publiceringsfält; ändra inte planeringens innehåll.
      const { error } = await supabase.from('veckoplanering').update({
        published: false,
        published_content: null,
        public_slug: null,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('user_id', session.user.id).select('id').single()
      // En uppdatering som träffar noll rader får inte rapporteras som lyckad.
      if (error) throw error
      if (selectedId === row.id) setPlan(p => ({ ...p, published: false, publicSlug: '' }))
      const refreshed = await loadPlans()
      setStatus(refreshed ? 'Planeringen är avpublicerad.' : 'Avpublicerad, men listan kunde inte uppdateras. Ladda om för att kontrollera.')
    } catch (error) {
      setStatus(`Kunde inte avpublicera: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file) {
    if (!file) return
    setBusy(true); setStatus(`Läser ${file.name}...`)
    try {
      const text = await extractText(file)
      const lines = normalizeLines(text)
      const parsed = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
        ? lines.map(line => line.includes('|') ? line : line).join('\n')
        : text
      setPendingImport({ source: file.name, weeksData: distributeText(plan, parsed) })
      setStatus('Importen är klar för förhandsgranskning. Inget har ersatts ännu.')
    } catch (error) { setStatus(error.message || 'Importen misslyckades.') }
    setBusy(false)
  }

  function distributePastedText() {
    if (!pasteText.trim()) return setStatus('Klistra in text innan du fördelar den över veckorna.')
    setPendingImport({ source: 'Inklistrad text', weeksData: distributeText(plan, pasteText) })
    setStatus('Texten är klar för förhandsgranskning. Inget har ersatts ännu.')
  }

  function loadPlan(row) {
    if (busy) return
    if (hasPlanWork(plan) && !window.confirm('Nuvarande planering i redigeraren ersätts. Har du sparat dina ändringar?')) return
    setSelectedId(row.id); savedPlanRef.current = JSON.stringify(planFromRow(row)); setPlan(planFromRow(row)); setStatus('Planeringen är öppnad.'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function clonePlan(row) {
    if (busy) return
    const source = planFromRow(row)
    const title = window.prompt('Namn på kopian:', `${source.title} – kopia`)
    if (!title) return
    const subject = window.prompt('Ämne för kopian:', source.subject || '')
    if (subject === null) return
    const className = window.prompt('Klass/grupp för kopian:', source.className || '')
    if (className === null) return
    const schoolYear = window.prompt('Läsår för kopian:', source.schoolYear || '')
    if (schoolYear === null) return
    setBusy(true)
    try {
      const clone = { ...source, title, subject, className, schoolYear, published: false, publicSlug: '' }
      const { error } = await supabase.from('veckoplanering').insert({
        user_id: session.user.id, title, week_start: clone.startDate, content: JSON.stringify(clone), subject, class_name: className, school_year: schoolYear,
        start_date: clone.startDate, weeks: clone.weeks, published: false, public_slug: null, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      const refreshed = await loadPlans()
      setStatus(refreshed ? 'Planeringen är klonad som utkast.' : 'Kopian sparades, men listan kunde inte uppdateras. Ladda om för att kontrollera.')
    } catch (error) {
      setStatus(`Kunde inte klona: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  async function deletePlan(row) {
    if (busy || !window.confirm(`Radera "${row.title}"?`)) return
    setBusy(true)
    try {
      const { error } = await supabase.from('veckoplanering').delete().eq('id', row.id).eq('user_id', session.user.id).select('id').single()
      if (error) throw error
      if (selectedId === row.id) { setSelectedId(null); setPlan(emptyPlan()) }
      const refreshed = await loadPlans()
      setStatus(refreshed ? 'Planeringen är raderad.' : 'Planeringen raderades, men listan kunde inte uppdateras. Ladda om för att kontrollera.')
    } catch (error) {
      setStatus(`Kunde inte radera: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">LÄRARVY</p><h1>{APP_TITLE}</h1><p className="muted">{session.user.email}</p></div>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>Logga ut</button>
    </header>

    <section className="card hero-card">
      <div><p className="eyebrow">PLANERA</p><h2>Skapa årsplanering</h2><p className="muted">Importera ditt material eller börja tomt. Granska alltid innan publicering.</p></div>
      <button className="secondary" disabled={busy} onClick={() => {
        if (hasPlanWork(plan) && !window.confirm('Nuvarande planering i redigeraren ersätts. Har du sparat dina ändringar?')) return
        setPlan(emptyPlan()); setSelectedId(null); setStatus('Ny planering klar.')
      }}>Ny planering</button>
    </section>

    <section className="card">
      <div className="form-grid">
        <label>Namn<input value={plan.title} onChange={e => setPlan({ ...plan, title: e.target.value })} placeholder="Matematik 2026–2027" /></label>
        <label>Ämne<input value={plan.subject} onChange={e => setPlan({ ...plan, subject: e.target.value })} placeholder="Matematik" /></label>
        <label>Läsår<input value={plan.schoolYear} onChange={e => setPlan({ ...plan, schoolYear: e.target.value })} placeholder="2026–2027" /></label>
        <label>Klass/grupp<input value={plan.className} onChange={e => setPlan({ ...plan, className: e.target.value })} placeholder="8A" /></label>
        <label>Startdatum<input type="date" value={plan.startDate} onChange={e => {
          if (!e.target.value) return
          setPlan(p => {
            const startDate = mondayOf(`${e.target.value}T12:00:00`)
            return { ...p, startDate, weeksData: reconcileWeeks(p, startDate, p.weeks) }
          })
        }} /></label>
        <label>Första veckans nummer<input type="number" min="1" max="53" value={plan.startWeek || 1} onChange={e => {
          const startWeek = Math.max(1, Math.min(53, Number(e.target.value) || 1))
          setPlan(p => ({ ...p, startWeek, weeksData: (p.weeksData.length ? p.weeksData : makeWeeks(p)).map((week, index) => ({ ...week, weekNumber: startWeek + index, title: /^Vecka \\d+$/.test(week.title || '') ? `Vecka ${startWeek + index}` : week.title })) }))
        }} /></label>
        <label>Lektioner per ny vecka<input type="number" min="1" max="8" value={plan.lessonsPerWeek || 3} onChange={e => setPlan(p => ({ ...p, lessonsPerWeek: Math.max(1, Math.min(8, Number(e.target.value) || 3)) }))} /></label>
        <label>Antal veckor<input type="number" min="1" max="52" value={plan.weeks} onChange={e => {
          const count = Math.max(1, Math.min(52, Number(e.target.value) || 1))
          const discarded = weeks.slice(count)
          const hasWork = discarded.some((week, index) => hasWeekWork(week, count + index))
          if (hasWork && !window.confirm('Det finns innehåll i veckor som tas bort. Vill du verkligen radera det innehållet?')) return
          setPlan(p => ({ ...p, weeks: count, weeksData: reconcileWeeks(p, p.startDate, count) }))
        }} /></label>
      </div>
    </section>

    <section className="card import-card">
      <p className="eyebrow">IMPORT</p><h2>Excel, Word, PDF eller text</h2>
      <p className="muted">Ladda upp ett underlag. Texten delas preliminärt över veckorna så att du kan granska och justera.</p>
      <input type="file" accept=".xlsx,.xls,.docx,.pdf,.txt,.csv" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]
        e.target.value = '' // Samma fil kan väljas igen om importen avbryts.
        importFile(file)
      }} />
      <textarea value={pasteText} placeholder="Eller klistra in kursplan, kapitel, uppgifter och sidor här..." onChange={e => setPasteText(e.target.value)} />
      <button type="button" className="secondary" disabled={busy} onClick={distributePastedText}>Fördela inklistrad text över veckorna</button>
      {pendingImport && <div className="import-preview">
        <h3>Förhandsgranska import: {pendingImport.source}</h3>
        <p className="muted">Inget har ersatts. De första fem veckorna visas nedan.</p>
        {pendingImport.weeksData.slice(0, 5).map((week, i) => <div className="import-preview-week" key={i}><strong>Vecka {week.weekNumber}</strong><pre>{week.content || '(Tom vecka)'}</pre></div>)}
        <div className="button-row">
          <button type="button" className="primary" onClick={() => {
            if (!confirmReplacingWeeks(plan)) return
            setPlan(p => ({ ...p, weeksData: pendingImport.weeksData, weeks: pendingImport.weeksData.length }))
            setPendingImport(null)
            setStatus('Importen har lagts i redigeraren. Granska innan du sparar.')
          }}>Använd import</button>
          <button type="button" className="secondary" onClick={() => { setPendingImport(null); setStatus('Importen avbröts.') }}>Avbryt</button>
        </div>
      </div>}
    </section>

    <section className="card">
      <div className="section-heading"><div><p className="eyebrow">GRANSKA</p><h2>Årsplanering</h2></div><span className="count-pill">{weeks.length} veckor</span></div>
      <div className="year-grid">
        {weeks.map((week, index) => ({ week, index })).sort((a, b) => Number(a.week.weekNumber) - Number(b.week.weekNumber)).map(({ week, index }, displayIndex, ordered) => <div className="chapter-week-group" key={`${week.weekNumber}-${index}`}>
          {week.chapter?.trim() && (displayIndex === 0 || week.chapter !== ordered[displayIndex - 1]?.week.chapter) && <h3 className={`chapter-heading chapter-tone-${displayIndex % 4}`}>{week.chapter}</h3>}
          <article className="week-card">
          <div className="week-top"><strong>Vecka {week.weekNumber}</strong><span>{formatDate(week.weekStart)}</span></div>
          <label className="week-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} /> Visa för elever vid publicering</label>
          <label className="chapter-editor">Kapitel / tema (valfritt)<input value={week.chapter || ''} placeholder="Exempel: Kapitel 5 – Taluppfattning" onChange={e => updateWeek(index, { chapter: e.target.value })} /></label>
          <label className="week-number-editor">Veckonummer<input type="number" min="1" max="53" value={week.weekNumber} onChange={e => {
            const number = Number(e.target.value)
            if (!Number.isInteger(number) || number < 1 || number > 53) return
            if (weeks.some((other, i) => i !== index && Number(other.weekNumber) === number)) {
              setStatus('Veckonumret används redan i den här planeringen.')
              return
            }
            const title = /^Vecka \\d+$/.test(week.title || '') ? `Vecka ${number}` : week.title
            updateWeek(index, { weekNumber: number, title })
            setStatus('')
          }} /></label>
          <input className="week-title" value={week.title} onChange={e => updateWeek(index, { title: e.target.value })} />
          <textarea value={week.content} onChange={e => updateWeek(index, { content: e.target.value })} placeholder="Vad ska eleverna arbeta med?" />
          <LessonDetails week={week} onChange={changes => updateWeek(index, changes)} />
          <WeekDetails week={week} onChange={changes => updateWeek(index, changes)} />
        </article></div>)}
      </div>
      <div className="button-row week-add-actions">
        <button type="button" className="secondary" disabled={weeks.length >= 52} onClick={() => setPlan(p => {
          const existing = p.weeksData.length ? p.weeksData : makeWeeks(p)
          const nextNumber = Math.max(...existing.map(w => Number(w.weekNumber) || 0)) + 1
          const lastDate = existing[existing.length - 1]?.weekStart || p.startDate
          const newWeek = makeWeeks({ ...p, startWeek: nextNumber, startDate: addWeeks(lastDate, 1), weeks: 1 }, 1)[0]
          return { ...p, weeks: existing.length + 1, weeksData: [...existing, newWeek] }
        })}>+ Lägg till vecka</button>
      </div>
      <div className="sticky-actions button-row">
        <button type="button" className="secondary" onClick={() => setPreviewStudents(value => !value)}>{previewStudents ? "Dölj elevförhandsvisning" : "Förhandsgranska elevvyn"}</button>
        <button className="secondary" disabled={busy} onClick={() => save(false)}>Spara utkast</button>
        <button className="primary" disabled={busy} onClick={() => save(true)}>Publicera för elever</button>
      </div>
      {isDirty && <p className="unsaved-notice" role="status">Osparade ändringar – välj Spara utkast innan du lämnar sidan.</p>}
      {status && <p className="status">{status}</p>}
    </section>

    {previewStudents && <section className="card preview-panel"><h2>Förhandsvisning för elever</h2><p className="muted">Detta är endast en förhandsvisning. Inget publiceras.</p><StudentView plan={sanitizeForStudents({ ...plan, weeksData: weeks })} preview /></section>}

    <section className="card">
      <div className="section-heading"><div><p className="eyebrow">BIBLIOTEK</p><h2>Mina årsplaneringar</h2></div></div>
      {!plans.length ? <p className="muted">Du har inga sparade årsplaneringar ännu.</p> : <div className="library-list">
        {plans.map(row => <article className="library-item" key={row.id}>
          <div><strong className="library-title">{row.title}</strong><p className="muted">{[row.subject, row.class_name, row.school_year].filter(Boolean).join(' · ')}</p></div>
          <div className="button-row">
            <span className={`status-badge ${row.published ? 'published' : 'draft'}`}>{row.published ? 'Publicerad' : 'Utkast'}</span>
            <button className="secondary" disabled={busy} onClick={() => loadPlan(row)}>Öppna</button>
            <button className="secondary" disabled={busy} onClick={() => clonePlan(row)}>Klona</button>
            {row.published && <button className="secondary" disabled={busy} onClick={() => unpublish(row)}>Avpublicera</button>}
            <button className="danger" disabled={busy} onClick={() => deletePlan(row)}>Radera</button>
          </div>
        </article>)}
      </div>}
    </section>
  </main>
}

function AnnualApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [studentPlan, setStudentPlan] = useState(null)
  const [studentError, setStudentError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  const studentSlug = useMemo(() => {
    const match = window.location.pathname.match(/^\/elev\/([^/]+)\/?$/)
    return match ? decodeURIComponent(match[1]) : null
  }, [])

  useEffect(() => {
    if (studentSlug) {
      supabase.rpc('get_public_annual_plan', { slug_value: studentSlug })
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) setStudentError('Kunde inte hämta den publicerade planeringen.')
          else if (!data) setStudentError('Planeringen finns inte eller är inte publicerad.')
          else {
            try {
              const publicData = JSON.parse(data.published_content || '{}')
              if (!publicData || !Array.isArray(publicData.weeksData)) throw new Error('Ogiltiga veckor')
              setStudentPlan(sanitizeForStudents(publicData))
            } catch { setStudentError('Den publicerade planeringen har ogiltigt format.') }
          }
          setLoading(false)
        })
      return undefined
    }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => listener.subscription.unsubscribe()
  }, [studentSlug])

  async function login(event) {
    event.preventDefault(); setStatus('Loggar in...')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setStatus('Inloggningen misslyckades. Kontrollera e-post och lösenord.')
    else { setPassword(''); setStatus('') }
  }

  if (loading) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar...</p></section></main>
  if (studentSlug) return <StudentView plan={studentPlan} error={studentError} />
  if (!session) return <Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} onSubmit={login} status={status} />
  return <TeacherApp key={session.user.id} session={session} />
}

export default function App() { return <><Navigation /><AnnualApp /></> }

function WeekDetails({ week, onChange }) {
  const pages = Array.isArray(week.pages) ? week.pages : []
  const assignments = Array.isArray(week.assignments) ? week.assignments : []
  const links = Array.isArray(week.links) ? week.links : []
  const editable = typeof onChange === 'function'
  const updateList = (field, value) => onChange({ [field]: value })
  const listEditor = (field, entries, title, placeholder) => <div className="week-detail-column">
    <h4>{title}</h4>
    {entries.map((entry, index) => editable
      ? <div className="week-detail-entry" key={index}><input aria-label={`${title} ${index + 1}`} value={entry} placeholder={placeholder} onChange={e => updateList(field, entries.map((item, i) => i === index ? e.target.value : item))} /><button type="button" className="remove-small" aria-label={`Ta bort ${title.toLowerCase()} ${index + 1}`} onClick={() => updateList(field, entries.filter((_, i) => i !== index))}>×</button></div>
      : <p className="week-detail-text" key={index}>{entry}</p>)}
    {editable && <button type="button" className="add-detail" onClick={() => updateList(field, [...entries, ''])}>+ Lägg till {field === 'pages' ? 'sida' : 'uppgift'}</button>}
  </div>
  return <div className="week-details">
    {(editable || pages.length > 0 || assignments.length > 0) && <div className="week-detail-grid">
      {listEditor('pages', pages, 'Sidor', 'Ex. Sidan 12–15')}
      {listEditor('assignments', assignments, 'Uppgifter', 'Ex. Uppgift 1–8')}
    </div>}
    {(editable || links.length > 0) && <div className="week-links">
      {links.map((url, index) => {
        const info = resourceInfo(url)
        return <div className="week-link-entry" key={index}>
          {editable && <input type="url" aria-label={`Länk ${index + 1}`} placeholder="Klistra in länk till YouTube, PPTX, PDF, fil..." value={url} onChange={e => updateList('links', links.map((item, i) => i === index ? e.target.value : item))} />}
          {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon">{info.icon}</span><span>{info.label}</span></a>}
          {editable && <button type="button" className="remove-small" aria-label={`Ta bort länk ${index + 1}`} onClick={() => updateList('links', links.filter((_, i) => i !== index))}>×</button>}
        </div>
      })}
      {editable && <button type="button" className="add-detail" onClick={() => updateList('links', [...links, ''])}>+ Lägg till länk eller filadress</button>}
    </div>}
  </div>
}


function LessonDetails({ week, onChange }) {
  const lessons = Array.isArray(week.lessons) ? week.lessons : []
  const editable = typeof onChange === 'function'
  const changeLessons = next => onChange?.({ lessons: next })
  const changeLesson = (i, next) => changeLessons(lessons.map((lesson, index) => index === i ? next : lesson))
  return <div className="lessons">
    {lessons.filter(lesson => editable || lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.length)).map((lesson, i) => <section className="lesson" key={i}>
      <div className="lesson-heading">
        {editable ? <input aria-label="Lektionens namn" value={lesson.name || ''} onChange={e => changeLesson(i, { ...lesson, name: e.target.value })} /> : <h4>{lesson.name || `Lektion ${i + 1}`}</h4>}
        {editable && <button type="button" className="remove-small" onClick={() => { if (window.confirm('Ta bort lektionen och allt innehåll i den?')) changeLessons(lessons.filter((_, index) => index !== i)) }}>× Ta bort lektion</button>}
      </div>
      {(lesson.topics || []).map((topic, j) => {
        const updateTopic = next => changeLesson(i, { ...lesson, topics: lesson.topics.map((item, index) => index === j ? next : item) })
        const pages = Array.isArray(topic.pages) ? topic.pages : []
        const assignments = Array.isArray(topic.assignments) ? topic.assignments : []
        const links = Array.isArray(topic.links) ? topic.links : []
        const rows = Math.max(pages.length, assignments.length)
        return <div className="topic" key={j}>
          <div className="topic-grid">
            <div className="topic-name">{editable ? <input aria-label="Momentets namn" placeholder="Exempel: Procent" value={topic.name || ''} onChange={e => updateTopic({ ...topic, name: e.target.value })} /> : <strong>{topic.name}</strong>}</div>
            {['pages', 'assignments'].map(field => <div className={`topic-column ${field}`} key={field}>
              <h5>{field === 'pages' ? 'Sida' : 'Uppgift'}</h5>
              {Array.from({ length: rows }, (_, row) => <div className="topic-cell" key={row}>
                {editable ? <><input aria-label={`${field === 'pages' ? 'Sida' : 'Uppgift'} rad ${row + 1}`} value={(field === 'pages' ? pages : assignments)[row] || ''} onChange={e => {
                  const next = [...(field === 'pages' ? pages : assignments)]
                  while (next.length <= row) next.push('')
                  next[row] = e.target.value
                  updateTopic({ ...topic, [field]: next })
                }} /><button className="remove-small" type="button" aria-label="Ta bort rad" onClick={() => updateTopic({ ...topic, [field]: (field === 'pages' ? pages : assignments).filter((_, index) => index !== row) })}>×</button></> : <span>{(field === 'pages' ? pages : assignments)[row] || ' '}</span>}
              </div>)}
              {editable && <button type="button" className="add-detail" onClick={() => updateTopic({ ...topic, [field]: [...(field === 'pages' ? pages : assignments), ''] })}>+ {field === 'pages' ? 'Sida' : 'Uppgift'}</button>}
            </div>)}
          </div>
          <div className="topic-links">
            {links.map((link, k) => {
              const url = typeof link === 'string' ? link : link.url || ''
              const label = typeof link === 'string' ? resourceInfo(link)?.label || '' : link.label || ''
              const info = resourceInfo(url)
              const changeLink = next => updateTopic({ ...topic, links: links.map((item, index) => index === k ? next : item) })
              return <div className="topic-link" key={k}>
                {editable && <><input aria-label="Länkens namn" placeholder="Namn" value={label} onChange={e => changeLink({ url, label: e.target.value })} /><input aria-label="Länkadress" placeholder="https://..." value={url} onChange={e => changeLink({ url: e.target.value, label })} /></>}
                {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon">{info.icon}</span>{label || info.label}</a>}
                {editable && <button type="button" className="remove-small" onClick={() => updateTopic({ ...topic, links: links.filter((_, index) => index !== k) })}>×</button>}
              </div>
            })}
            {editable && <button type="button" className="add-detail" onClick={() => updateTopic({ ...topic, links: [...links, { label: '', url: '' }] })}>+ Länk</button>}
          </div>
          {editable && <button type="button" className="remove-small" onClick={() => { if (window.confirm('Ta bort momentet?')) changeLesson(i, { ...lesson, topics: lesson.topics.filter((_, index) => index !== j) }) }}>× Ta bort moment</button>}
        </div>
      })}
      {editable && <button type="button" className="secondary" onClick={() => changeLesson(i, { ...lesson, topics: [...(lesson.topics || []), { name: '', pages: [], assignments: [], links: [] }] })}>+ Moment</button>}
    </section>)}
    {editable && <button type="button" className="secondary" onClick={() => changeLessons([...lessons, { name: `Lektion ${lessons.length + 1}`, topics: [] }])}>+ Lägg till lektion</button>}
  </div>
}
