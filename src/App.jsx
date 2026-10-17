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
const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']

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
    startDate: mondayOf(), startWeek: 1, entryType: 'lektion', lessonsPerWeek: 3, weeks: DEFAULT_WEEKS, weeksData: [],
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
    items: [], lessons: Array.from({ length: plan.entryType === 'dag' ? 5 : Math.max(1, Math.min(8, Number(plan.lessonsPerWeek) || 3)) }, (_, i) => ({ name: plan.entryType === 'dag' ? WEEKDAYS[i] : `Lektion ${i + 1}`, topics: [] })),
  }))
}

// Bevara befintlig veckotext när startdatum eller antal veckor ändras.
function displayWeeks(plan) {
  const source = Array.isArray(plan.weeksData) && plan.weeksData.length ? plan.weeksData : makeWeeks(plan)
  if (plan.entryType !== 'dag') return source
  return source.map(week => {
    if (week.daysCustomized) return week
    const lessons = week.lessons || []
    const isEmptyDefault = lessons.every(lesson =>
      !lesson.topics?.length && (!lesson.name || /^(Lektion \d+|Dag \d+|Måndag|Tisdag|Onsdag|Torsdag|Fredag)$/.test(lesson.name))
    )
    if (!isEmptyDefault) return week
    return { ...week, lessons: WEEKDAYS.map((name, i) => ({ ...(lessons[i] || { topics: [] }), name })) }
  })
}

function reconcileWeeks(plan, startDate, count) {
  const total = Math.max(1, Math.min(52, Number(count) || DEFAULT_WEEKS))
  const previous = Array.isArray(plan.weeksData) && plan.weeksData.length ? plan.weeksData : makeWeeks(plan)
  const fresh = makeWeeks({ ...plan, startDate, weeks: total }, total)
  return fresh.map((week, index) => ({
    ...week,
    ...(previous[index] || {}),
    weekNumber: previous[index]?.weekNumber ?? (Math.max((Number(plan.startWeek) || 1) - 1, ...previous.map(item => Number(item.weekNumber) || 0)) + index - previous.length + 1),
    weekStart: week.weekStart,
  }))
}

// Används före åtgärder som annars kan skriva över redan inmatad planering.
function hasWeekWork(week, index) {
  return Boolean(
    String(week.content || '').trim() ||
    week.daysCustomized || week.items?.length || week.lessons?.some(lesson => lesson.topics?.length || (lesson.name && !/^(?:Lektion \d+|Dag \d+|Måndag|Tisdag|Onsdag|Torsdag|Fredag)$/.test(lesson.name))) ||
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
  const sourceWeeks = Array.isArray(plan?.weeksData) && plan.weeksData.length ? (plan.entryType === 'dag' ? displayWeeks(plan) : plan.weeksData) : makeWeeks(plan)
  return {
    kind: 'arsplanering-v2',
    title: String(plan?.title || ''),
    subject: String(plan?.subject || ''),
    className: String(plan?.className || ''),
    schoolYear: String(plan?.schoolYear || ''),
    published: true,
    entryType: plan?.entryType === 'dag' ? 'dag' : 'lektion',
    weeksData: sourceWeeks
      .filter(week => week && typeof week === 'object' && !week.hidden)
      .sort((a, b) => (Number(a.weekNumber) || 0) - (Number(b.weekNumber) || 0))
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

function chapterTone(chapter) {
  const value = String(chapter || '').trim().toLocaleLowerCase('sv-SE')
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.codePointAt(0)) >>> 0
  return hash % 4
}

function StudentView({ plan, error, preview = false }) {
  const studentWeeks = Array.isArray(plan?.weeksData) ? plan.weeksData : []
  if (error) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>{error}</p></section></main>
  if (!plan) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar planeringen...</p></section></main>
  return <main className="shell student-shell">
    <header className="student-header">
      <div><p className="eyebrow">{preview ? 'FÖRHANDSVISNING' : 'PUBLICERAD ÅRSPLANERING'}</p><h1>{plan.title}</h1><p className="muted">{[plan.subject, plan.className, plan.schoolYear].filter(Boolean).join(' · ')}</p></div>
      <span className="public-badge">{preview ? "Förhandsvisning" : "Publicerad"}</span>
    </header>
    <section className="year-grid">
      {studentWeeks.map((week, index) => <div className="chapter-week-group" key={`${week.weekNumber}-${week.weekStart}`}>
        {week.chapter?.trim() && (index === 0 || week.chapter !== studentWeeks[index - 1]?.chapter) && <h2 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h2>}
        <article className="week-card">
        <div className="week-top"><strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong><span>{formatDate(week.weekStart)}</span></div>
        <h3>{week.title}</h3>
        <div className="week-content">{week.content || (!week.pages?.length && !week.assignments?.length && !week.links?.length && !week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length)) ? 'Ingen planering angiven ännu.' : '')}</div>
        <LessonDetails week={week} entryType={plan.entryType || 'lektion'} />
        <WeekDetails week={week} />
      </article></div>)}
    </section>
  </main>
}


// ISO 8601: kalenderveckan beräknas från datumet, inte från planeringens löpnummer.
function calendarWeekNumber(dateString) {
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
}
const MONTH_PASTELS = ['#f2f7ff','#fff2f8','#f6f2ff','#fffbe8','#fff4ef','#f0faff','#fff8e8','#fff0e9','#f5f2ff','#fff9e9','#f1f4fa','#fff1f6']

function YearCalendar({ weeks, onClose, onUpdateWeek, onSave, isDirty, busy, entryType = 'lektion' }) {
  const [page, setPage] = useState(0)
  const [layout, setLayout] = useState('4x3')
  const layoutOptions = { '3x2': [3, 2], '4x3': [4, 3], '4x4': [4, 4], '4x5': [4, 5] }
  const [columns, rows] = layoutOptions[layout]
  const weeksPerPage = columns * rows
  const changeLayout = next => {
    if (!layoutOptions[next]) return
    setPage(Math.floor(page * weeksPerPage / (layoutOptions[next][0] * layoutOptions[next][1])))
    setLayout(next)
  }
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null)
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(null)
  const orderedWeeks = [...weeks].filter(week => week && /^\d{4}-\d{2}-\d{2}$/.test(week.weekStart || '')).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const pageCount = Math.max(1, Math.ceil(orderedWeeks.length / weeksPerPage))
  const currentPage = Math.min(page, pageCount - 1)
  const pageWeeks = orderedWeeks.slice(currentPage * weeksPerPage, (currentPage + 1) * weeksPerPage)
  const selectedWeek = selectedWeekIndex === null ? null : orderedWeeks[selectedWeekIndex]
  const lessons = Array.isArray(selectedWeek?.lessons) ? selectedWeek.lessons : []
  const editSelectedWeek = changes => { const index = weeks.findIndex(week => week.weekStart === selectedWeek?.weekStart); if (index >= 0) onUpdateWeek?.(index, changes) }
  const back = () => {
    if (selectedLessonIndex !== null) setSelectedLessonIndex(null)
    else setSelectedWeekIndex(null)
  }
  return <section className="calendar-overlay" aria-label="Årsplanering med valbart antal veckor per sida">
    <div className="calendar-top">
      <div><h2>{selectedWeek ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : `Årsöversikt · ${weeksPerPage} veckor per sida`}</h2><p>{selectedWeek ? (selectedWeek.chapter || (/^Vecka\s+\d+$/i.test(selectedWeek.title || '') ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : selectedWeek.title) || 'Din planering') : 'Välj en vecka för att zooma in och se dina dagar eller lektioner.'}</p></div>
      <div className="calendar-zoom-controls">{selectedWeek && <button type="button" className="secondary" onClick={back}>← Tillbaka</button>}<button type="button" className="secondary" onClick={onClose}>✕ Stäng</button></div>
    </div>
    {selectedWeek ? <div className="calendar-week-detail">
      <p><strong>{(/^Vecka\s+\d+$/i.test(selectedWeek.title || '') ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : selectedWeek.title) || `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}`}</strong> · {formatDate(selectedWeek.weekStart)}</p>
      {selectedWeek.content && <p>{selectedWeek.content}</p>}
      <LessonDetails week={selectedWeek} onChange={editSelectedWeek} entryType={entryType} />
      <div className="calendar-edit-actions">
        <button type="button" disabled={busy || !isDirty} onClick={onSave}>{busy ? 'Sparar...' : 'Spara ändringar'}</button>
        {isDirty && <span>Du har osparade ändringar.</span>}
      </div>
      <button type="button" className="secondary" onClick={() => { setSelectedWeekIndex(null); setSelectedLessonIndex(null) }}>← Till översikten</button>
    </div> : <>
      <div className="calendar-layout-selector"><label htmlFor="calendar-layout">Visa veckor</label><select id="calendar-layout" value={layout} onChange={event => changeLayout(event.target.value)}><option value="3x2">3 × 2 (6 veckor)</option><option value="4x3">4 × 3 (12 veckor)</option><option value="4x4">4 × 4 (16 veckor)</option><option value="4x5">4 × 5 (20 veckor)</option></select></div>
      <div className="calendar-pagination" aria-label="Bläddra mellan veckosidor">
        <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Föregående {weeksPerPage} veckor</button>
        <strong>Sida {currentPage + 1} av {pageCount}</strong>
        <button type="button" className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Nästa {weeksPerPage} veckor →</button>
      </div>
      <div className="calendar-week-grid" style={{ "--week-grid-columns": columns }}>{pageWeeks.map((week, index) => {
        const date = new Date(`${week.weekStart}T12:00:00`)
        const month = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(date)
        const topics = (week.lessons || []).flatMap(lesson => (lesson.topics || []).map(topic => topic.name).filter(Boolean))
        return <button type="button" className="calendar-week-tile" key={`${week.weekStart}-${index}`} onClick={() => { setSelectedWeekIndex(currentPage * weeksPerPage + index); setSelectedLessonIndex(null) }} aria-label={`Zooma in vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`}>
          <span className="calendar-tile-month" style={{ backgroundColor: MONTH_PASTELS[date.getMonth()] }}>{month}</span>
          <strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong>
          <span className="calendar-tile-date">{formatDate(week.weekStart)}</span>
          {week.chapter && <span className="calendar-tile-chapter">{week.chapter}</span>}
          <span className="calendar-tile-topics">{topics.slice(0, 3).join(' · ') || week.content || 'Ingen planering inskriven ännu'}</span>
          <span className="calendar-tile-action">Visa veckan →</span>
        </button>
      })}</div>
      <div className="calendar-pagination">
        <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Föregående</button>
        <span>Vecka {(pageWeeks[0] ? calendarWeekNumber(pageWeeks[0].weekStart) : null) ?? '–'}–{(pageWeeks.length ? calendarWeekNumber(pageWeeks[pageWeeks.length - 1].weekStart) : null) ?? '–'} · Sida {currentPage + 1}/{pageCount}</span>
        <button type="button" className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Nästa →</button>
      </div>
    </>}
  </section>
}

function TeacherApp({ session }) {
  const [plan, setPlan] = useState(emptyPlan())
  const [plans, setPlans] = useState([])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const [previewStudents, setPreviewStudents] = useState(() => window.location.hash === '#elevvy')
  useEffect(() => {
    const onNavigation = () => {
      if (window.location.hash === '#elevvy') {
        setPreviewStudents(true)
        window.setTimeout(() => document.getElementById('elevvy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      } else if (window.location.hash === '#lararvy') {
        setPreviewStudents(false)
        document.getElementById('lararvy')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    window.addEventListener('hashchange', onNavigation)
    if (window.location.hash === '#elevvy') onNavigation()
    return () => window.removeEventListener('hashchange', onNavigation)
  }, [])
  const initialPlansLoadedRef = useRef(false)
  const latestPlanRef = useRef(plan)
  useEffect(() => { latestPlanRef.current = plan }, [plan])
  const savedPlanRef = useRef(JSON.stringify(plan))
  const [, setSavedRevision] = useState(0)
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


  const weeks = displayWeeks(plan)

  async function loadPlans() {
    const { data, error } = await supabase.from('veckoplanering')
      .select('id,title,content,week_start,created_at,updated_at,subject,school_year,class_name,start_date,weeks,published,public_slug')
      .eq('user_id', session.user.id).order('created_at', { ascending: false })
    if (error) {
      setStatus(`Kunde inte hämta planeringar: ${error.message}`)
      return false
    }
    const annualPlans = (data || []).filter(isAnnualRow)
    setPlans(annualPlans)
    if (!initialPlansLoadedRef.current) {
      initialPlansLoadedRef.current = true
      try {
        const lastId = window.sessionStorage.getItem(`arsplanering-last-open-${session.user.id}`)
        const lastPlan = annualPlans.find(row => String(row.id) === lastId)
        if (lastPlan) {
          const restored = planFromRow(lastPlan)
          setSelectedId(lastPlan.id)
          savedPlanRef.current = JSON.stringify(restored)
          setSavedRevision(revision => revision + 1)
          setPlan(restored)
          setStatus('Senast öppnade årsplanering har hämtats igen.')
        }
      } catch { /* Lagring kan vara blockerad */ }
    }
    return true
  }

  useEffect(() => { loadPlans() }, [])

  function updateWeek(index, changes) {
    setPlan(p => ({ ...p, weeksData: displayWeeks(p).map((week, i) => i === index ? { ...week, ...changes } : week) }))
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
        try { window.sessionStorage.setItem(`arsplanering-last-open-${session.user.id}`, String(data.id)) } catch { /* Lagring kan vara blockerad */ }
        const refreshed = await loadPlans()
        // Ändringar som gjorts medan nätverksanropet pågick får inte skrivas över.
        savedPlanRef.current = JSON.stringify(payload)
        setSavedRevision(revision => revision + 1)
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
    if (JSON.stringify(plan) !== savedPlanRef.current && !window.confirm('Du har osparade ändringar. Vill du lämna dem utan att spara?')) return
    try { window.sessionStorage.setItem(`arsplanering-last-open-${session.user.id}`, String(row.id)) } catch { /* Lagring kan vara blockerad */ }
    setSelectedId(row.id); savedPlanRef.current = JSON.stringify(planFromRow(row)); setSavedRevision(revision => revision + 1); setPlan(planFromRow(row)); setStatus('Planeringen är öppnad.'); window.scrollTo({ top: 0, behavior: 'smooth' })
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
      if (selectedId === row.id) {
        const fresh = emptyPlan()
        setSelectedId(null)
        setPlan(fresh)
        savedPlanRef.current = JSON.stringify(fresh)
        setSavedRevision(revision => revision + 1)
      }
      try {
        if (window.sessionStorage.getItem(`arsplanering-last-open-${session.user.id}`) === String(row.id)) window.sessionStorage.removeItem(`arsplanering-last-open-${session.user.id}`)
      } catch { /* Lagring kan vara blockerad */ }
      const refreshed = await loadPlans()
      setStatus(refreshed ? 'Planeringen är raderad.' : 'Planeringen raderades, men listan kunde inte uppdateras. Ladda om för att kontrollera.')
    } catch (error) {
      setStatus(`Kunde inte radera: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  return <><Navigation plans={plans} onOpenPlan={loadPlan} selectedId={selectedId} onToggleCalendar={() => setCalendarOpen(open => !open)} calendarOpen={calendarOpen} />{calendarOpen && <YearCalendar weeks={weeks} onClose={() => setCalendarOpen(false)} onUpdateWeek={updateWeek} onSave={() => save(false)} isDirty={isDirty} busy={busy} entryType={plan.entryType} />}<main className="shell" id="lararvy">
    <header className="topbar">
      <div><p className="eyebrow">LÄRARVY</p><h1>{APP_TITLE}</h1><p className="muted">{session.user.email}</p></div>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>Logga ut</button>
    </header>

    <section className="card hero-card">
      <div><p className="eyebrow">PLANERA</p><h2>{selectedId ? "Redigera sparad årsplanering" : "Ny årsplanering – ännu inte sparad"}</h2><p className="muted">{selectedId ? `Öppen planering: ${plan.title || "Utan namn"}. Efter F5 öppnas den automatiskt igen i samma flik. Du kan också hitta den under Mina årsplaneringar.` : "Du arbetar med en ny planering. Välj Spara utkast för att behålla den."}</p></div>
      <div className="button-row"><button className="secondary" disabled={busy} onClick={() => {
        if (JSON.stringify(plan) !== savedPlanRef.current && !window.confirm('Du har osparade ändringar. Vill du lämna dem utan att spara?')) return
        const fresh = emptyPlan(); try { window.sessionStorage.removeItem(`arsplanering-last-open-${session.user.id}`) } catch { /* Lagring kan vara blockerad */ } setPlan(fresh); setSelectedId(null); savedPlanRef.current = JSON.stringify(fresh); setSavedRevision(revision => revision + 1); setStatus('Ny planering klar. Spara utkast när du har fyllt i din planering.')
      }}>Ny planering</button></div>
    </section>

    {(isDirty || busy) && <div className="quick-save-bar" role="region" aria-label="Snabbspara årsplanering">
      <span aria-live="polite">{busy ? "Sparar…" : "Osparade ändringar"}</span>
      <button type="button" className="secondary" disabled={busy} onClick={() => save(false)}>Spara utkast</button>
    </div>}

    <section className="card" aria-live="polite">
      <p><strong>Sparstatus:</strong> {busy ? "Sparar…" : isDirty ? "Osparade ändringar" : selectedId ? "Inga osparade ändringar" : "Ny planering – inte sparad"}</p>
      {status && <p className="status">{status}</p>}
      <p className="muted">Fyll i både Namn och Ämne innan du väljer Spara utkast. Kontrollera att meddelandet ”Utkast sparat.” visas.</p>
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
          if (startWeek === Number(plan.startWeek)) return
          if (startWeek + weeks.length - 1 > 53) {
            setStatus('Första veckans nummer är för högt för antalet veckor. Högsta tillåtna veckonummer är 53.')
            return
          }
          const hasCustomNumbers = weeks.some((week, index) => Number(week.weekNumber) !== (Number(plan.startWeek) || 1) + index)
          if (hasCustomNumbers && !window.confirm('Du har ändrat veckonummer manuellt. Om du byter första veckans nummer skrivs de över. Vill du fortsätta?')) return
          setStatus('')
          setPlan(p => ({ ...p, startWeek, weeksData: (Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)).map((week, index) => ({ ...week, weekNumber: startWeek + index, title: /^Vecka \d+$/.test(week.title || '') ? `Vecka ${startWeek + index}` : week.title })) }))
        }} /></label>
        <label>Planera efter<select value={plan.entryType || 'lektion'} onChange={e => {
          const entryType = e.target.value
          setPlan(p => {
            const currentWeeks = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
            const isSafeToRename = week => !week.daysCustomized && (week.lessons || []).every(lesson =>
              !lesson.topics?.length && (!lesson.name || /^(Lektion \\d+|Dag \\d+|Måndag|Tisdag|Onsdag|Torsdag|Fredag)$/.test(lesson.name))
            )
            const preservedCount = currentWeeks.filter(week => !isSafeToRename(week)).length
            const weeksData = currentWeeks.map(week => {
              if (!isSafeToRename(week)) return week
              return {
                ...week,
                lessons: entryType === 'dag'
                  ? WEEKDAYS.map((name, i) => ({ ...(week.lessons?.[i] || { topics: [] }), name }))
                  : Array.from({ length: Math.max(1, Math.min(8, Number(p.lessonsPerWeek) || 3)) }, (_, i) => ({
                      ...(week.lessons?.[i] || { topics: [] }), name: `Lektion ${i + 1}`
                    }))
              }
            })
            if (preservedCount) setStatus(`Indelningen ändrades i tomma veckor. ${preservedCount} vecka/veckor med egna ändringar behölls oförändrade.`)
            return { ...p, entryType, weeksData }
          })
        }}><option value="lektion">Lektion</option><option value="dag">Dag</option></select></label>
        {plan.entryType !== 'dag' && <label>Lektioner per ny vecka<input type="number" min="1" max="8" value={plan.lessonsPerWeek || 3} onChange={e => setPlan(p => ({ ...p, lessonsPerWeek: Math.max(1, Math.min(8, Number(e.target.value) || 3)) }))} /></label>}
        <label>Antal veckor<input type="number" min="1" max="52" value={plan.weeks} onChange={e => {
          const count = Math.max(1, Math.min(52, Number(e.target.value) || 1))
          if (count === weeks.length) return
          const maxExistingWeek = Math.max(0, ...weeks.map(week => Number(week.weekNumber) || 0))
          if (count > weeks.length && maxExistingWeek + (count - weeks.length) > 53) {
            setStatus('Det finns inte tillräckligt med veckonummer kvar före vecka 53. Minska antalet veckor eller ändra startvecka.')
            return
          }
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
          {week.chapter?.trim() && (displayIndex === 0 || week.chapter !== ordered[displayIndex - 1]?.week.chapter) && <h3 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h3>}
          <article className="week-card" id={`calendar-week-${week.weekNumber}`} style={{ scrollMarginTop: 95 }}>
          <div className="week-top"><strong>Vecka {week.weekNumber}</strong><span>{formatDate(week.weekStart)}</span>
            <button type="button" className="remove-small" disabled={weeks.length <= 1} onClick={() => {
              if (hasWeekWork(week, index) && !window.confirm(`Ta bort vecka ${week.weekNumber} och allt innehåll i veckan?`)) return
              setPlan(p => {
                const current = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
                const remaining = current.filter((_, i) => i !== index)
                return { ...p, weeks: remaining.length, weeksData: remaining, startWeek: Number(remaining[0]?.weekNumber) || p.startWeek }
              })
            }}>× Ta bort vecka</button></div>
          <label className="week-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} /> Visa för elever vid publicering</label>
          <label className="chapter-editor">Kapitel / tema (valfritt)<input value={week.chapter || ''} placeholder="Exempel: Kapitel 5 – Taluppfattning" onChange={e => updateWeek(index, { chapter: e.target.value })} /></label>
          <label className="week-number-editor">Veckonummer<input type="number" min="1" max="53" value={week.weekNumber} onChange={e => {
            const number = Number(e.target.value)
            if (!Number.isInteger(number) || number < 1 || number > 53) return
            if (weeks.some((other, i) => i !== index && Number(other.weekNumber) === number)) {
              setStatus('Veckonumret används redan i den här planeringen.')
              return
            }
            const title = /^Vecka \d+$/.test(week.title || '') ? `Vecka ${number}` : week.title
            updateWeek(index, { weekNumber: number, title })
            setStatus('')
          }} /></label>
          <input className="week-title" value={week.title} onChange={e => updateWeek(index, { title: e.target.value })} />
          <textarea value={week.content} onChange={e => updateWeek(index, { content: e.target.value })} placeholder="Vad ska eleverna arbeta med?" />
          <LessonDetails week={week} entryType={plan.entryType || 'lektion'} onChange={changes => updateWeek(index, changes)} />
          <details className="legacy-week-details" defaultOpen={Boolean(week.pages?.length || week.assignments?.length || week.links?.length)}>
            <summary>Extra veckomaterial (sidor, uppgifter och länkar)</summary>
            <p className="muted">Använd i första hand momenten under varje lektion. Här kan du även lägga material för hela veckan.</p>
            <WeekDetails week={week} onChange={changes => updateWeek(index, changes)} />
          </details>
        </article></div>)}
      </div>
      <div className="button-row week-add-actions">
        <button type="button" className="secondary" disabled={weeks.length >= 52} onClick={() => setPlan(p => {
          const existing = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
          const nextNumber = Math.max(...existing.map(w => Number(w.weekNumber) || 0)) + 1
          if (nextNumber > 53) { setStatus('Det går inte att lägga till fler veckor efter vecka 53.'); return p }
          const latest = [...existing].sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber))[0]
          const newWeek = makeWeeks({ ...p, startWeek: nextNumber, startDate: addWeeks(latest?.weekStart || p.startDate, 1), weeks: 1 }, 1)[0]
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

    {previewStudents && <section className="card preview-panel" id="elevvy"><h2>Förhandsvisning för elever</h2><p className="muted">Detta är endast en förhandsvisning. Inget publiceras.</p><StudentView plan={sanitizeForStudents({ ...plan, weeksData: weeks })} preview /></section>}

    <section className="card" id="mina-arsplaneringar">
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
  </main></>
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

  if (loading) return <><Navigation /><main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar...</p></section></main></>
  if (studentSlug) return <><Navigation /><StudentView plan={studentPlan} error={studentError} /></>
  if (!session) return <><Navigation /><Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} onSubmit={login} status={status} /></>
  return <TeacherApp key={session.user.id} session={session} />
}

export default function App() { return <AnnualApp /> }

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


function LessonDetails({ week, onChange, entryType = 'lektion' }) {
  const lessons = Array.isArray(week?.lessons) ? week.lessons : []
  const editable = typeof onChange === 'function'
  const changeLessons = next => onChange?.({ lessons: next, ...(entryType === 'dag' ? { daysCustomized: true } : {}) })
  const changeLesson = (i, next) => changeLessons(lessons.map((lesson, index) => index === i ? next : lesson))
  return <div className="lessons">
    {lessons.map((lesson, i) => ({ lesson, i })).filter(({ lesson }) => editable || lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || '')))).map(({ lesson, i }) => <section className="lesson" key={i}>
      <div className="lesson-heading">
        {editable ? <input aria-label={entryType === 'dag' ? 'Dagens namn' : 'Lektionens namn'} value={lesson.name || ''} onChange={e => changeLesson(i, { ...lesson, name: e.target.value })} /> : <h4>{lesson.name || (entryType === 'dag' ? (WEEKDAYS[i] || `Dag ${i + 1}`) : `Lektion ${i + 1}`)}</h4>}
        {editable && <button type="button" className="remove-small" onClick={() => { if (!(lesson.topics || []).some(topic => topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm(entryType === 'dag' ? 'Ta bort dagen och allt innehåll i den?' : 'Ta bort lektionen och allt innehåll i den?')) changeLessons(lessons.filter((_, index) => index !== i)) }}>× Ta bort {entryType === 'dag' ? 'dag' : 'lektion'}</button>}
      </div>
      {(lesson.topics || []).map((topic, j) => ({ topic, j })).filter(({ topic }) => editable || topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || ''))).map(({ topic, j }) => {
        const updateTopic = next => changeLesson(i, { ...lesson, topics: (lesson.topics || []).map((item, index) => index === j ? next : item) })
        const pages = Array.isArray(topic.pages) ? topic.pages : []
        const assignments = Array.isArray(topic.assignments) ? topic.assignments : []
        const links = Array.isArray(topic.links) ? topic.links : []
        const lastFilledRow = values => values.reduce((last, value, index) => String(value ?? '').trim() ? index + 1 : last, 0)
        const rows = editable ? Math.max(pages.length, assignments.length) : Math.max(lastFilledRow(pages), lastFilledRow(assignments))
        return <div className="topic" key={j}>
          <div className="topic-grid">
            <div className="topic-name">{editable ? <input aria-label="Momentets namn" placeholder="Exempel: Procent" value={topic.name || ''} onChange={e => updateTopic({ ...topic, name: e.target.value })} /> : <strong>{topic.name || 'Moment'}</strong>}</div>
            {['pages', 'assignments'].map(field => <div className={`topic-column ${field}`} key={field}>
              <h5>{field === 'pages' ? 'Sida' : 'Uppgift'}</h5>
              {Array.from({ length: rows }, (_, row) => <div className="topic-cell" key={row}>
                {editable ? <><input aria-label={`${field === 'pages' ? 'Sida' : 'Uppgift'} rad ${row + 1}`} value={(field === 'pages' ? pages : assignments)[row] || ''} onChange={e => {
                  const next = [...(field === 'pages' ? pages : assignments)]
                  while (next.length <= row) next.push('')
                  next[row] = e.target.value
                  updateTopic({ ...topic, [field]: next })
                }} /><button className="remove-small" type="button" aria-label={`Ta bort ${field === "pages" ? "sida" : "uppgift"} på rad ${row + 1}`} onClick={() => updateTopic({ ...topic, [field]: (field === 'pages' ? pages : assignments).filter((_, index) => index !== row) })}>×</button></> : <span>{(field === 'pages' ? pages : assignments)[row] || ' '}</span>}
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
          {editable && <button type="button" className="remove-small" onClick={() => { if (!(topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm('Ta bort momentet och allt innehåll?')) changeLesson(i, { ...lesson, topics: (lesson.topics || []).filter((_, index) => index !== j) }) }}>× Ta bort moment</button>}
        </div>
      })}
      {editable && <button type="button" className="secondary" onClick={() => changeLesson(i, { ...lesson, topics: [...(lesson.topics || []), { name: '', pages: [], assignments: [], links: [] }] })}>+ Moment</button>}
    </section>)}
    {editable && (entryType !== 'dag' || WEEKDAYS.some(day => !lessons.some(lesson => lesson.name === day))) && <button type="button" className="secondary" onClick={() => {
      if (entryType === 'dag') {
        const missing = WEEKDAYS.find(day => !lessons.some(lesson => lesson.name === day))
        if (!missing) return
        const next = [...lessons, { name: missing, topics: [] }]
        changeLessons(next.sort((a, b) => {
          const aIndex = WEEKDAYS.indexOf(a.name)
          const bIndex = WEEKDAYS.indexOf(b.name)
          return aIndex < 0 || bIndex < 0 ? 0 : aIndex - bIndex
        }))
      } else {
        const used = new Set(lessons.map(lesson => lesson.name))
        let number = 1
        while (used.has(`Lektion ${number}`)) number += 1
        const next = [...lessons, { name: `Lektion ${number}`, topics: [] }]
        changeLessons(next.sort((a, b) => {
          const aNumber = /^Lektion (\d+)$/.exec(a.name || '')
          const bNumber = /^Lektion (\d+)$/.exec(b.name || '')
          return aNumber && bNumber ? Number(aNumber[1]) - Number(bNumber[1]) : 0
        }))
      }
    }}>{entryType === 'dag' ? `+ Lägg tillbaka ${WEEKDAYS.find(day => !lessons.some(lesson => lesson.name === day)) || 'dag'}` : '+ Lägg till lektion'}</button>}
  </div>
}
