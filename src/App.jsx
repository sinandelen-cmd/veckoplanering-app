import { groupStudentWeeksForPrint } from './printGroups.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabase'
import './App.css'
import Navigation from './Navigation.jsx'
import { MUNICIPALITIES_BY_COUNTY } from './swedishMunicipalities.js'
import { NATIONAL_EXAMS_2026_27, NATIONAL_EXAM_PERIODS_2026_27 } from './nationalExams.js'

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


function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k + 7) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day, 12)
}

function swedishPublicHolidays(year) {
  const easter = easterSunday(year)
  const relative = (offset, name) => {
    const date = new Date(easter)
    date.setDate(date.getDate() + offset)
    return { date: toIsoDate(date), name }
  }
  const fixed = (month, day, name) => ({ date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, name })
  const weekdayBetween = (month, from, to, weekday, name) => {
    for (let day = from; day <= to; day++) {
      const date = new Date(year, month - 1, day, 12)
      if (date.getDay() === weekday) return { date: toIsoDate(date), name }
    }
    return null
  }
  return [
    fixed(1, 1, 'Nyårsdagen'), fixed(1, 6, 'Trettondedag jul'),
    relative(-2, 'Långfredagen'), relative(0, 'Påskdagen'), relative(1, 'Annandag påsk'),
    fixed(5, 1, 'Första maj'), relative(39, 'Kristi himmelsfärdsdag'), relative(49, 'Pingstdagen'),
    fixed(6, 6, 'Sveriges nationaldag'),
    weekdayBetween(6, 20, 26, 6, 'Midsommardagen'),
    weekdayBetween(10, 31, 11, 6, 'Alla helgons dag') || weekdayBetween(11, 1, 6, 6, 'Alla helgons dag'),
    fixed(12, 25, 'Juldagen'), fixed(12, 26, 'Annandag jul'),
  ].filter(Boolean)
}


function suggestedSchoolClosures(startDate, numberOfWeeks) {
  const starts = Array.from({ length: Math.max(1, Number(numberOfWeeks) || 1) }, (_, i) => addWeeks(startDate, i))
  const first = starts[0], last = addWeeks(starts[starts.length - 1], 1)
  const years = [...new Set([Number(first.slice(0, 4)), Number(last.slice(0, 4)), ...starts.map(date => Number(date.slice(0, 4)))])]
  const suggestions = []
  const add = (name, start, end) => {
    if (start < last && end >= first) suggestions.push({ id: crypto.randomUUID(), suggestionKey: `${name}-${start.slice(0, 4)}`, verified: false, name: name + ' (förslag – kontrollera datum)', startDate: start, endDate: end })
  }
  for (const year of years) {
    // Vecka 44 är en vanlig nationell utgångspunkt för höstlov, inte ett fastställt kommunalt datum.
    const autumn = Array.from({ length: 10 }, (_, i) => { const date = new Date(year, 9, 25 + i, 12); return toIsoDate(date) }).find(date => calendarWeekNumber(date) === 44 && new Date(date + 'T12:00:00').getDay() === 1)
    if (autumn) {
      const friday = new Date(autumn + 'T12:00:00')
      friday.setDate(friday.getDate() + 4)
      add('Höstlov', autumn, toIsoDate(friday))
    }
    // Vinterlovet kan skilja sig mellan skolor. Dessa är endast redigerbara utgångspunkter.
    add('Jullov', `${year}-12-22`, `${year + 1}-01-06`)
    const winterMonday = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(year, 1, 16 + i, 12)
      return toIsoDate(d)
    }).find(date => calendarWeekNumber(date) === 9 && new Date(date + 'T12:00:00').getDay() === 1)
    if (winterMonday) add('Sportlov', winterMonday, toIsoDate(new Date(new Date(winterMonday + 'T12:00:00').getTime() + 4 * 86400000)))
    const easter = easterSunday(year)
    const easterMonday = new Date(easter)
    easterMonday.setDate(easterMonday.getDate() + 1)
    const easterFriday = new Date(easterMonday)
    easterFriday.setDate(easterFriday.getDate() + 4)
    add('Påsklov', toIsoDate(easterMonday), toIsoDate(easterFriday))
  }
  return suggestions
}

function validSchoolClosure(item) {
  if (!item?.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.endDate || '')) return false
  const validDate = value => {
    const date = new Date(value + 'T12:00:00')
    return !Number.isNaN(date.getTime()) && toIsoDate(date) === value
  }
  return validDate(item.startDate) && validDate(item.endDate) && item.startDate <= item.endDate
}

function publicHolidaysInWeek(weekStart) {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const from = toIsoDate(start), to = toIsoDate(end)
  return [...new Set([start.getFullYear(), end.getFullYear()])]
    .flatMap(swedishPublicHolidays).filter(item => item.date >= from && item.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Ljus färgidentitet per planering; befintliga planer får en stabil färg utifrån ID.
const PLAN_THEMES = [
  { id: 'rose', name: 'Rosa', light: '#fff0f2', soft: '#ffe0e6', accent: '#ad5269', ink: '#79364b' },
  { id: 'sun', name: 'Solgul', light: '#fff9e6', soft: '#fff0bd', accent: '#986420', ink: '#704a22' },
  { id: 'sky', name: 'Himmelsblå', light: '#eff8ff', soft: '#d8efff', accent: '#326e9b', ink: '#244d72' },
  { id: 'lilac', name: 'Lavendel', light: '#f8f2ff', soft: '#ebddff', accent: '#79569c', ink: '#573c78' },
  { id: 'mint', name: 'Mint', light: '#effbf4', soft: '#d6f3e2', accent: '#347a65', ink: '#285b4e' },
  { id: 'peach', name: 'Persika', light: '#fff4e9', soft: '#ffe5cf', accent: '#a56842', ink: '#774a31' },
]
function planTheme(plan, fallback = '') {
  const named = PLAN_THEMES.find(theme => theme.id === plan?.themeId)
  if (named) return named
  const key = String(fallback || plan?.title || 'årsplanering')
  const hash = [...key].reduce((value, char) => ((value * 31 + char.charCodeAt(0)) >>> 0), 0)
  return PLAN_THEMES[hash % PLAN_THEMES.length]
}
function planThemeStyle(plan, fallback = '') {
  const theme = planTheme(plan, fallback)
  return { '--plan-light': theme.light, '--plan-soft': theme.soft, '--plan-accent': theme.accent, '--plan-ink': theme.ink }
}
function emptyPlan() {
  return {
    title: '', subject: '', schoolYear: '', className: '', county: '', municipality: '', schoolForm: '', grade: '', course: '', schoolClosures: [],
    startDate: mondayOf(), startWeek: 1, entryType: 'lektion', lessonDisplay: 'bara-lektion', studentLayout: 'grid', studentColumns: 3, studentRows: 2, lessonsPerWeek: 3, weeks: DEFAULT_WEEKS, weeksData: [],
    published: false, publicSlug: '', autoReleaseWeeks: false,
  }
}

function makeWeeks(plan, count = plan.weeks) {
  const total = Math.max(1, Math.trunc(Number(count) || DEFAULT_WEEKS))
  return Array.from({ length: total }, (_, index) => ({
    weekNumber: calendarWeekNumber(addWeeks(plan.startDate, index)) ?? (Number(plan.startWeek) || 1),
    weekStart: addWeeks(plan.startDate, index),
    title: `Vecka ${calendarWeekNumber(addWeeks(plan.startDate, index)) ?? (Number(plan.startWeek) || 1)}`,
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
  const total = Math.max(1, Math.trunc(Number(count) || DEFAULT_WEEKS))
  const previous = Array.isArray(plan.weeksData) && plan.weeksData.length ? plan.weeksData : makeWeeks(plan)
  const fresh = makeWeeks({ ...plan, startDate, weeks: total }, total)
  return fresh.map((week, index) => ({
    ...week,
    ...(previous[index] || {}),
    // Behåll egen rubrik, men uppdatera automatisk "Vecka N"-rubrik vid nytt datum.
    title: !previous[index]?.title || /^Vecka\s+\d+$/i.test(previous[index].title) ? week.title : previous[index].title,
    weekNumber: calendarWeekNumber(week.weekStart) ?? week.weekNumber,
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
    (plan.schoolClosures || []).length > 0 || (plan.weeksData || []).some(hasWeekWork)
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
  const sourceWeeks = Array.isArray(plan?.weeksData) ? (plan.entryType === 'dag' && plan.weeksData.length ? displayWeeks(plan) : plan.weeksData) : makeWeeks(plan)
  return {
    kind: 'arsplanering-v2',
    title: String(plan?.title || ''),
    subject: String(plan?.subject || ''),
    className: String(plan?.className || ''),
    schoolYear: String(plan?.schoolYear || ''),
    grade: String(plan?.grade || ''),
    schoolForm: String(plan?.schoolForm || ''),
    schoolClosures: Array.isArray(plan?.schoolClosures) ? plan.schoolClosures.filter(item => validSchoolClosure(item) && sourceWeeks.some(week => { if (!week || week.hidden || !/^\d{4}-\d{2}-\d{2}$/.test(week.weekStart || '')) return false; const monday = new Date(week.weekStart + 'T12:00:00'); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return item.startDate <= toIsoDate(sunday) && item.endDate >= toIsoDate(monday) })).map(item => ({ name: item.name, startDate: item.startDate, endDate: item.endDate, verified: Boolean(item.verified) })) : [],
    published: true,
    autoReleaseWeeks: plan?.autoReleaseWeeks === true,
    entryType: plan?.entryType === 'dag' ? 'dag' : 'lektion',
    lessonDisplay: ['dag-lektion', 'bara-dag', 'bara-lektion'].includes(plan?.lessonDisplay) ? plan.lessonDisplay : 'bara-lektion',
    themeId: String(plan?.themeId || ''),
    studentLayout: plan?.studentLayout === 'list' ? 'list' : 'grid',
    studentColumns: Math.max(1, Math.min(3, Number(plan?.studentColumns) || 3)),
    studentRows: Math.max(1, Math.min(6, Number(plan?.studentRows) || 2)),
    weeksData: sourceWeeks
      .filter(week => week && typeof week === 'object' && !week.hidden)
      // Filter skapar en ny array: sortering ändrar inte lärarens ursprungliga lista.
      .sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''))
      .map((week, index) => ({
        weekNumber: Number.isInteger(week.weekNumber) ? week.weekNumber : index + 1,
        weekStart: typeof week.weekStart === 'string' ? week.weekStart : '',
        title: typeof week.title === 'string' ? week.title : '',
        chapter: typeof week.chapter === 'string' ? week.chapter.slice(0, 160) : '',
        lessons: Array.isArray(week.lessons) ? week.lessons.filter(lesson => lesson && typeof lesson === 'object').map(lesson => ({ name: String(lesson.name || ''), day: String(lesson.day || ''), topics: Array.isArray(lesson.topics) ? lesson.topics.filter(topic => topic && typeof topic === 'object').map(topic => ({ name: String(topic.name || ''), pagesLabel: String(topic.pagesLabel || '').slice(0, 60), assignmentsLabel: String(topic.assignmentsLabel || '').slice(0, 60), pages: Array.isArray(topic.pages) ? topic.pages.map(String) : [], assignments: Array.isArray(topic.assignments) ? topic.assignments.map(String) : [], links: Array.isArray(topic.links) ? topic.links.filter(link => link && resourceInfo(typeof link === 'string' ? link : link.url)).map(link => typeof link === 'string' ? { url: link.trim(), label: resourceInfo(link).label } : { url: String(link.url).trim(), label: String(link.label || resourceInfo(link.url).label) }) : [] })) : [] })) : [],
        content: typeof week.content === 'string' ? week.content : '',
        pages: Array.isArray(week.pages) ? week.pages.filter(v => typeof v === 'string' && v.trim()).slice(0, 100) : [],
        assignments: Array.isArray(week.assignments) ? week.assignments.filter(v => typeof v === 'string' && v.trim()).slice(0, 100) : [],
        links: Array.isArray(week.links) ? week.links.filter(v => typeof v === 'string' && resourceInfo(v)).map(v => v.trim()).slice(0, 100) : [],
      })),
  }
}

function resourceInfo(url) {
  const value = String(url || '').trim()
  try {
    const parsed = new URL(value)
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return { label: 'YouTube', icon: '▶', kind: 'youtube' }
    if (/\.(pptx?|ppsx?)(?:$)/i.test(path)) return { label: 'PPTX', icon: 'P', kind: 'pptx' }
    if (/\.(pdf)(?:$)/i.test(path)) return { label: 'PDF', icon: 'PDF', kind: 'pdf' }
    if (/\.(docx?)(?:$)/i.test(path)) return { label: 'Word', icon: 'W', kind: 'word' }
    if (/\.(xlsx?)(?:$)/i.test(path)) return { label: 'Excel', icon: 'X', kind: 'excel' }
    if (host === 'drive.google.com' || host.endsWith('.onedrive.com') || host.endsWith('.sharepoint.com')) return { label: 'Fil', icon: '↗', kind: 'file' }
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

function studentWeekDateRange(dateString) {
  const start = new Date(dateString + 'T12:00:00')
  if (Number.isNaN(start.getTime())) return ''
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const format = date => new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(date)
  return format(start) + '–' + format(end) + ' ' + end.getFullYear()
}
function studentWeekStyle(dateString) {
  const date = new Date(dateString + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return {}
  // Global veckocykel: två intilliggande veckor får aldrig samma färg,
  // inte heller när de ligger i olika månader eller år.
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const ordinal = Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / (7 * 86400000))
  const colors = ['#eaf3ff', '#fff0df', '#f2ebff', '#e7f6ed']
  return { backgroundColor: colors[((ordinal % colors.length) + colors.length) % colors.length], borderColor: '#dce4e8' }
}
function studentMonthInfo(dateString) {
  const date = new Date(dateString + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return null
  // Tilldela en vecka till den månad som innehåller dess torsdag.
  // Då visas en gränsvecka bara under en månad, även vid årsskiftet.
  date.setDate(date.getDate() + (3 - ((date.getDay() + 6) % 7)))
  const year = date.getFullYear(), month = date.getMonth()
  // Endast veckor vars torsdag ligger i månaden ingår i intervallet.
  const firstThursday = new Date(year, month, 1, 12)
  firstThursday.setDate(firstThursday.getDate() + ((4 - firstThursday.getDay() + 7) % 7))
  const lastThursday = new Date(year, month + 1, 0, 12)
  lastThursday.setDate(lastThursday.getDate() - ((lastThursday.getDay() - 4 + 7) % 7))
  const firstWeek = calendarWeekNumber(toIsoDate(firstThursday))
  const lastWeek = calendarWeekNumber(toIsoDate(lastThursday))
  const range = firstWeek === lastWeek ? 'Vecka ' + firstWeek : 'Vecka ' + firstWeek + '–' + lastWeek
  return { name: new Intl.DateTimeFormat('sv-SE', { month: 'long' }).format(date).toLocaleUpperCase('sv-SE'), weeks: range, color: MONTH_PASTELS[month] }
}
// Veckoår enligt ISO: årsskiftet kan ligga mitt i en kalendervecka.
function isoWeekYear(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return null
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  return thursday.getUTCFullYear()
}
function studentWeekPageLabel(weeks) {
  if (!weeks.length) return 'Inga veckor'
  const format = week => {
    const number = calendarWeekNumber(week.weekStart) ?? week.weekNumber
    const year = isoWeekYear(week.weekStart)
    return `${number}${year ? ` (${year})` : ''}`
  }
  return weeks.length === 1 ? `Vecka ${format(weeks[0])}` : `Vecka ${format(weeks[0])}–${format(weeks[weeks.length - 1])}`
}
// Endast tillfällig A4-demonstration. Läggs aldrig i lärarens plan eller databasen.
function a4DemoPlan(plan) {
  const weeksData = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 12 + index * 7))
    const weekStart = date.toISOString().slice(0, 10)
    const long = index === 1
    const imported = index === 2
    return {
      weekStart, weekNumber: 42 + index, title: imported ? 'Test med långa texter och länkar' : long ? 'Innehållsrik testvecka' : 'Exempelvecka',
      chapter: 'A4-test – endast förhandsvisning',
      content: imported ? 'Test av längre inklistrade instruktioner, filnamn och länkar. Allt innehåll ska synas i stående A4 utan inre rullning.' : long ? 'Den här veckan innehåller extra många moment för att pröva utskriften.' : 'Kort exempeltext.',
      lessons: Array.from({ length: long ? 12 : imported ? 3 : 2 }, (_, lessonIndex) => ({
        name: 'Lektion ' + (lessonIndex + 1),
        day: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'][lessonIndex % 5],
        topics: [{ name: imported ? 'Längre inklistrat moment: Läs instruktionerna noggrant, jämför lösningsmetoder och förklara i flera steg hur du kommer fram till ditt svar. Kontrollera sedan beräkningarna och resonera om alternativa lösningar.' : 'Öva på tal och problemlösning med förklaringar och exempel ' + (lessonIndex + 1),
          pages: imported ? ['Sidorna 142–149, övning 3a–3f och fördjupning på sidan 150'] : ['42–45'], assignments: imported ? ['Uppgift 1–8: Visa uträkning, motivera varje steg och skriv en tydlig slutsats.', 'Inklistrad instruktion: Lämna in ett dokument med filnamnet Matematik_fordjupning_vecka44_komplett_redovisning.pdf. Beskriv vilka metoder du valde och varför.'] : ['Uppgift 1–8', 'Förklara ditt svar med egna ord'], links: imported ? ['https://example.org/undervisning/matematik/fordjupning/vecka-44/langt-resursnamn'] : [] }],
      })),
      pages: [], assignments: [], links: [],
    }
  })
  return { ...plan, title: 'A4-TEST – INTE SPARAD', studentLayout: 'grid', weeksData }
}

function ImportantDatesForWeek({ week, plan }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week?.weekStart || '')) return null
  const monday = new Date(week.weekStart + 'T12:00:00')
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { date: toIsoDate(date), day: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'][index] }
  })
  const closures = (Array.isArray(plan.schoolClosures) ? plan.schoolClosures : []).filter(validSchoolClosure)
  const exams = nationalExamsForPlan(plan)
  const entries = dates.flatMap(({ date, day }) => {
    const events = closures.filter(item => item.startDate <= date && item.endDate >= date)
      .map(item => ({ name: item.name, kind: /studiedag/i.test(item.name) ? 'study' : 'holiday', verified: item.verified }))
    events.push(...exams.filter(item => item.date === date).map(item => ({ name: 'NP – ' + item.subject + ', delprov ' + item.part, kind: 'exam', verified: true })))
    return events.map(event => ({ ...event, date, day }))
  })
  if (!entries.length) return null
  return <div className="student-important-dates" aria-label="Viktiga datum denna vecka">
    <h4>📅 Viktiga datum</h4>
    {entries.map((item, index) => <div className={`student-important-date student-important-date-${item.kind}`} key={item.date + item.name + index}>
      <strong>{item.day} <small>{Number(item.date.slice(8))}/{Number(item.date.slice(5, 7))}</small></strong>
      <span>{item.kind === 'exam' ? '📝' : item.kind === 'study' ? '📘' : '🌼'} {item.name}{!item.verified && <small> · Kontrollera datum</small>}</span>
    </div>)}
  </div>
}

function StudentView({ plan, error, preview = false, printPage = null, printWeekStart = null }) {
  const [page, setPage] = useState(0)
  const [singlePrintWeek, setSinglePrintWeek] = useState(null)
  useEffect(() => {
    if (printPage !== null) return undefined
    const clearPrintSelection = () => setSinglePrintWeek(null)
    window.addEventListener('afterprint', clearPrintSelection)
    return () => window.removeEventListener('afterprint', clearPrintSelection)
  }, [printPage])
  const printOnlyWeek = weekStart => {
    flushSync(() => setSinglePrintWeek(weekStart))
    window.print()
  }
  const gridMode = printPage !== null && plan?.studentLayout !== 'list'
  const columns = Math.max(1, Math.min(3, Number(plan?.studentColumns) || 3))
  const rows = Math.max(1, Math.min(Math.floor(6 / columns), Number(plan?.studentRows) || 2))
  const pageSize = Math.min(6, columns * rows)
  // Identifiera med datum: vecka 1 får återkomma varje år.
  // Behåll den mest innehållsrika posten om samma datum finns flera gånger.
  const weekContentScore = week => (String(week.content || '').length + String(week.chapter || '').length
    + (week.items?.length || 0) * 10 + (week.lessons?.length || 0) * 5
    + (week.assignments?.length || 0) * 10 + (week.links?.length || 0) * 10
    + (week.lessons || []).filter(Boolean).reduce((sum, lesson) => sum + String(lesson.name || '').length
      + (lesson.topics || []).filter(Boolean).reduce((topicSum, topic) => topicSum + String(topic.name || '').length
        + (topic.pages?.length || 0) * 8 + (topic.assignments?.length || 0) * 10
        + (topic.links?.length || 0) * 10, 0), 0))
  const studentWeeks = Array.isArray(plan?.weeksData) ? [...plan.weeksData]
    .filter(week => week && !week.hidden)
    .sort((a, b) => weekContentScore(b) - weekContentScore(a))
    .filter((week, index, weeks) => weeks.findIndex(other => (other.weekStart || `number-${other.weekNumber}`) === (week.weekStart || `number-${week.weekNumber}`)) === index)
    .sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || '')) : []
  const currentStudentWeekStart = mondayOf(new Date())
  const currentStudentWeek = studentWeeks.find(week => week.weekStart === currentStudentWeekStart)
  const upcomingStudentWeek = [...studentWeeks].reverse().find(week => week.weekStart >= currentStudentWeekStart)
  const jumpStudentWeek = currentStudentWeek || upcomingStudentWeek
  const pages = Math.max(1, Math.ceil(studentWeeks.length / pageSize))
  // Längre elevveckor får mer plats på A4. Grupperna består alltid av hela veckor.
  const printGroups = singlePrintWeek ? [{ weeks: studentWeeks.filter(week => week.weekStart === singlePrintWeek) }] : groupStudentWeeksForPrint(studentWeeks)
  const currentPage = printPage === null ? Math.min(page, pages - 1) : printPage
  const visibleWeeks = printPage === null
    ? studentWeeks
    : (printWeekStart ? studentWeeks.filter(week => week.weekStart === printWeekStart) : (printGroups[printPage]?.weeks || []))
  const pageWeekLabel = studentWeekPageLabel(visibleWeeks)
  if (error) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>{error}</p></section></main>
  if (!plan) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar planeringen...</p></section></main>
  return <><main style={planThemeStyle(plan)} className={`shell student-shell ${printPage === null ? "student-screen-view" : "student-print-page"} ${printPage !== null && visibleWeeks.length === 1 ? "student-print-spacious" : ""}`}>
    <header className="student-header">
      <div><p className="eyebrow">{preview ? 'FÖRHANDSVISNING' : 'PUBLICERAD ÅRSPLANERING'}</p><h1>{plan.title}</h1><p className="muted">{[plan.subject, plan.className, plan.schoolYear].filter(Boolean).join(' · ')}</p></div>

      <span className="public-badge">{preview ? "Förhandsvisning" : "Publicerad"}</span>
    </header>
    {printPage === null && jumpStudentWeek && <nav className="student-week-shortcut" aria-label="Hitta aktuell planering">
      <a href={'#student-week-' + jumpStudentWeek.weekStart}>{currentStudentWeek ? '📍 Gå till den här veckan' : '📍 Gå till nästa planerade vecka'} · vecka {calendarWeekNumber(jumpStudentWeek.weekStart) ?? jumpStudentWeek.weekNumber} ↓</a>
    </nav>}
    {studentWeeks.length === 0 && <p className="card empty" role="status">Det finns inga synliga veckor i den här planeringen ännu.</p>}
    <section className={gridMode ? 'year-grid student-matrix' : 'year-grid student-list'} style={gridMode ? { '--student-columns': columns, '--student-rows': rows } : undefined}>
      {visibleWeeks.map((week, index) => <div className="chapter-week-group" key={`${week.weekNumber}-${week.weekStart}`}>
        {week.chapter?.trim() && (gridMode || index === 0 || week.chapter !== visibleWeeks[index - 1]?.chapter) && <h2 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h2>}
        <article id={"student-week-" + week.weekStart} className="week-card student-week-card" style={studentWeekStyle(week.weekStart)}>

        <div className="week-top student-week-top">
          <div className="student-week-identity"><strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong><span>{studentWeekDateRange(week.weekStart)}</span></div>
          {printPage !== null && studentMonthInfo(week.weekStart) && <div className="student-month-info" style={{ backgroundColor: studentMonthInfo(week.weekStart).color }}><strong>{studentMonthInfo(week.weekStart).name}</strong><span>{studentMonthInfo(week.weekStart).weeks}</span></div>}
        </div>
        {!/^Vecka\s+\d+$/i.test(week.title || '') && week.title?.trim() && <h3>{week.title}</h3>}
        <div className="week-content">{week.content || (!week.pages?.length && !week.assignments?.length && !week.links?.length && !week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length)) ? 'Ingen planering angiven ännu.' : '')}</div>
        <ImportantDatesForWeek week={week} plan={plan} />\n        <LessonDetails week={week} entryType={plan.entryType || 'lektion'} lessonDisplay={plan.lessonDisplay || 'bara-lektion'} />
        <WeekDetails week={week} />
      </article></div>)}
    </section>
  </main>
  {false && printPage === null && studentWeeks.length > 0 && <div className="student-print-pages">
    {Array.from({ length: printGroups.length }, (_, index) => <StudentView key={index} plan={plan} preview={preview} printPage={index} printWeekStart={singlePrintWeek} />)}
  </div>}
</>
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

function isSchoolYear2026_27(value) {
  return /^(?:2026\s*[/–-]\s*(?:2027|27)|26\s*[/–-]\s*27|HT\s*(?:20)?26\s*[/–-]?\s*VT\s*(?:20)?27)$/i.test(String(value || '').trim())
}

function nationalExamsForPlan(plan) {
  const grade = String(plan.grade || '').replace(/[^0-9]/g, '')
  if (plan.schoolForm !== 'grundskola' || !isSchoolYear2026_27(plan.schoolYear) || !['3', '6', '9'].includes(grade)) return []
  return NATIONAL_EXAMS_2026_27.filter(item => item.grade === grade)
}

function YearCalendar({ weeks, schoolClosures = [], nationalExams = [], onClose, onUpdateWeek, onAddWeek, onDeleteWeek, onSave, isDirty, busy, saveStatus, entryType = 'lektion' }) {
  // Årsöversikt i nio veckor per sida, tre kolumner och tre rader.
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null)
  const [overviewPage, setOverviewPage] = useState(0)
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(null)
  const orderedWeeks = [...weeks].filter(week => week && /^\d{4}-\d{2}-\d{2}$/.test(week.weekStart || '')).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const selectedWeek = selectedWeekIndex === null ? null : orderedWeeks[selectedWeekIndex]
  const pageCount = Math.max(1, Math.ceil(orderedWeeks.length / 9))
  const currentPage = Math.min(overviewPage, pageCount - 1)
  const lessons = Array.isArray(selectedWeek?.lessons) ? selectedWeek.lessons : []
  const editSelectedWeek = changes => { const index = weeks.findIndex(week => week.weekStart === selectedWeek?.weekStart); if (index >= 0) onUpdateWeek?.(index, changes) }
  const back = () => {
    if (selectedLessonIndex !== null) setSelectedLessonIndex(null)
    else setSelectedWeekIndex(null)
  }
  return <section className="calendar-overlay" aria-label="Årsplanering månad för månad">
    <div className="calendar-top">
      <div><div className="calendar-week-heading-row"><h2>{selectedWeek ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : `Årsöversikt · månad för månad`}</h2>{selectedWeek && <label className="student-visibility-toggle week-heading-visibility calendar-heading-visibility"><input type="checkbox" checked={!selectedWeek.hidden} onChange={e => editSelectedWeek({ hidden: !e.target.checked })} aria-label={`Visa vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber} i elevvyn`} /><span>{selectedWeek.hidden ? "Dold för elever" : "Visa för elever"}</span></label>}</div><p>{selectedWeek ? (selectedWeek.chapter || (/^Vecka\s+\d+$/i.test(selectedWeek.title || '') ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : selectedWeek.title) || 'Din planering') : 'Välj en vecka för att zooma in och se dina dagar eller lektioner.'}</p></div>
      <div className="calendar-zoom-controls">{selectedWeek && <button type="button" className="secondary calendar-overview-button" onClick={back}>← Tillbaka</button>}<button type="button" className="secondary calendar-close-button" onClick={onClose}>✕ Stäng</button></div>
    </div>
    {selectedWeek ? <div className="calendar-week-detail">
      <p><strong>{(/^Vecka\s+\d+$/i.test(selectedWeek.title || '') ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : selectedWeek.title) || `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}`}</strong> · {formatDate(selectedWeek.weekStart)}</p>
      {schoolClosures.filter(item => validSchoolClosure(item) && item.startDate < addWeeks(selectedWeek.weekStart, 1) && item.endDate >= selectedWeek.weekStart).map(item => <p key={item.id} className="calendar-holiday"><strong>{item.verified ? "Skolledigt:" : "Skolledigt (ej verifierat):"}</strong> {item.name} · {formatDate(item.startDate)}–{formatDate(item.endDate)}</p>)}
      {nationalExams.filter(exam => exam.date >= selectedWeek.weekStart && exam.date < addWeeks(selectedWeek.weekStart, 1)).map(exam => <p key={exam.date + exam.subject + exam.part} className="calendar-holiday"><strong>🔒 Nationellt prov:</strong> {exam.subject}, delprov {exam.part} · {formatDate(exam.date)}{exam.startTime ? ` kl. ${exam.startTime}` : ''}</p>)}
      {publicHolidaysInWeek(selectedWeek.weekStart).map(holiday => <p key={holiday.date} className="calendar-holiday"><strong>Röd dag:</strong> {holiday.name} · {formatDate(holiday.date)}</p>)}
      {selectedWeek.content && <p>{selectedWeek.content}</p>}
      <LessonDetails week={selectedWeek} onChange={editSelectedWeek} entryType={entryType} />
      <div className="calendar-edit-actions">
        <button type="button" className="calendar-save-button" disabled={busy || !isDirty} onClick={onSave}>{busy ? 'Sparar...' : 'Spara ändringar'}</button>
        {isDirty && <span>Du har osparade ändringar.</span>}
        {saveStatus && <span role="status">{saveStatus}</span>}
      </div>
      <button type="button" className="secondary calendar-overview-button" onClick={() => { setSelectedWeekIndex(null); setSelectedLessonIndex(null) }}>← Till översikten</button>
    </div> : <>
      <p className="calendar-overview-count">{orderedWeeks.length} planerade veckor · månaderna visas under varandra. Svep åt sidan inom en månad på mobilen.</p>
      <div className="calendar-months">
        {Array.from(orderedWeeks.reduce((groups, week, index) => {
          const date = new Date(week.weekStart + 'T12:00:00')
          const key = week.weekStart.slice(0, 7)
          if (!groups.has(key)) groups.set(key, { date, weeks: [] })
          groups.get(key).weeks.push({ week, index })
          return groups
        }, new Map()).values()).map(group => <section className="calendar-month-section" key={group.date.toISOString()} style={{ backgroundColor: MONTH_PASTELS[group.date.getMonth()] }}>
          <h3>{new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(group.date)}</h3>
          <div className="calendar-month-row">
            {group.weeks.map(({ week, index }) => {
              const date = new Date(week.weekStart + 'T12:00:00')
              const topics = (week.lessons || []).flatMap(lesson => (lesson.topics || []).map(topic => topic.name).filter(Boolean))
        return <div className="calendar-week-wrapper" key={`${week.weekStart}-${index}`}>
          <button type="button" className="calendar-delete-week" disabled={busy || orderedWeeks.length <= 1} title={`Radera vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`} aria-label={`Radera vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`} onClick={() => onDeleteWeek?.(week.weekStart)}>🗑️ <span>Radera vecka</span></button>
          <label className="calendar-week-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => { const originalIndex = weeks.findIndex(item => item.weekStart === week.weekStart); if (originalIndex >= 0) onUpdateWeek?.(originalIndex, { hidden: !e.target.checked }) }} /> Visa för elever</label>
          <button type="button" className="calendar-week-tile" onClick={() => { setSelectedWeekIndex(index); setSelectedLessonIndex(null) }} aria-label={`Zooma in vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`}>
          
          <strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong>
          <span className="calendar-tile-date">{formatDate(week.weekStart)}</span>
          {schoolClosures.filter(item => validSchoolClosure(item) && item.startDate < addWeeks(week.weekStart, 1) && item.endDate >= week.weekStart).map(item => <span key={item.id} className="calendar-holiday">📅 {item.name}{item.verified ? "" : " · ej verifierat"}</span>)}
          {nationalExams.filter(exam => exam.date >= week.weekStart && exam.date < addWeeks(week.weekStart, 1)).map(exam => <span key={exam.date + exam.subject + exam.part} className="calendar-holiday">🔒 NP {exam.subject} · {formatDate(exam.date)}</span>)}
          {publicHolidaysInWeek(week.weekStart).map(holiday => <span key={holiday.date} className="calendar-holiday">🔴 {holiday.name} · {formatDate(holiday.date)}</span>)}
          {week.chapter && <span className="calendar-tile-chapter">{week.chapter}</span>}
          <span className="calendar-tile-topics">{topics.slice(0, 3).join(' · ') || week.content || 'Ingen planering inskriven ännu'}</span>
          <span className="calendar-tile-action">Visa veckan →</span>
          </button>
        </div>
            })}
          </div>
        </section>)}
      </div>
      <div className="calendar-add-week-actions calendar-add-week-bottom"><button type="button" className="primary" disabled={busy || weeks.length >= 52} onClick={() => { onAddWeek?.(); setSelectedWeekIndex(null); setOverviewPage(0) }}>+ Lägg till ny vecka efter sista veckan</button><span className="muted">{weeks.length >= 52 ? 'Maximalt 52 veckor i en planering.' : 'Den nya veckan läggs sist. Spara utkast när du är klar.'}</span></div>
    </>}
  </section>
}

function TeacherApp({ session }) {
  const [plan, setPlan] = useState(emptyPlan())
  const [plans, setPlans] = useState([])
  const [showArchive, setShowArchive] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareRecipient, setShareRecipient] = useState("")
  const [sharePassword, setSharePassword] = useState("")
  const [shareToken, setShareToken] = useState("")
  const [receivedToken, setReceivedToken] = useState("")
  const [shareMessage, setShareMessage] = useState("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [simpleSetup, setSimpleSetup] = useState(false)
  const [simpleMore, setSimpleMore] = useState(false)
  const [teacherTab, setTeacherTab] = useState("arsplan")
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const [previewStudents, setPreviewStudents] = useState(() => window.location.hash === '#elevvy')
  const [a4Demo, setA4Demo] = useState(false)
  useEffect(() => {
    const onNavigation = () => {
      if (window.location.hash === '#elevvy') {
        setTeacherTab('elevvy')
        setPreviewStudents(true)
        window.setTimeout(() => document.getElementById('elevvy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      } else if (window.location.hash === '#lararvy') {
        setTeacherTab('arsplan')
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
  const visibleTeacherWeeks = weeks.filter(week => week && !week.hidden)
  const weeksWithContent = visibleTeacherWeeks.filter(week => Boolean(
    String(week.content || '').trim() || String(week.chapter || '').trim() ||
    week.items?.length || week.pages?.length || week.assignments?.length || week.links?.length ||
    week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length))
  ))
  const publicationIssues = [
    ...(!String(plan.title || '').trim() ? ['Ange planeringens namn.'] : []),
    ...(!String(plan.subject || '').trim() ? ['Ange ämne.'] : []),
    ...(!visibleTeacherWeeks.length ? ['Visa minst en vecka för elever.'] : []),
    ...(weeksWithContent.length === 0 ? ['Fyll i innehåll i minst en synlig vecka.'] : []),
    ...(visibleTeacherWeeks.some(week => !validSchoolClosure({ name: 'Vecka', startDate: week.weekStart, endDate: week.weekStart })) ? ['Rätta startdatum på synliga veckor.'] : []),
    ...((plan.schoolClosures || []).some(item => !validSchoolClosure(item)) ? ['Kontrollera datum för lov och studiedagar.'] : []),
  ]

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
        if (lastPlan && JSON.stringify(latestPlanRef.current) === savedPlanRef.current) {
          // Skriv inte över ändringar som läraren hann göra medan listan laddades.
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

  function insertExampleWeek() {
    if (busy) return
    if (isDirty && !window.confirm('Du har osparade ändringar. Vill du lämna dem och öppna en separat fiktiv vecka 42?')) return
    const demo = { ...emptyPlan(), title: 'EXEMPEL – Vecka 42: Bråk', subject: 'Matematik', className: 'Årskurs 6',
      startDate: '2026-10-12', weeks: 1, entryType: 'lektion', lessonsPerWeek: 5, published: false, archived: false }
    const lessons = [
      ['Måndag – Vad är ett bråk?', 'Täljare, nämnare och bråk med bilder', '42–43', '1–6', 'https://www.youtube.com/results?search_query=br%C3%A5k+matematik+%C3%A5rskurs+6'],
      ['Tisdag – Likvärdiga bråk', 'Förlänga och förkorta bråk', '44–45', '7–12', 'https://www.youtube.com/results?search_query=f%C3%B6rl%C3%A4nga+f%C3%B6rkorta+br%C3%A5k'],
      ['Onsdag – Addera bråk', 'Gemensam nämnare och addition', '46–47', '13–18', 'https://www.youtube.com/results?search_query=addera+br%C3%A5k+gemensam+n%C3%A4mnare'],
      ['Torsdag – Problemlösning', 'Textuppgifter med bråk i par', '48', '19–22', 'https://www.youtube.com/results?search_query=probleml%C3%B6sning+br%C3%A5k+matematik'],
      ['Fredag – Repetition och diagnos', 'Repetera och genomför en kort diagnos', '42–48', 'Repetition 1–8', 'https://www.youtube.com/results?search_query=repetition+br%C3%A5k+matematik'],
    ].map(([name, topic, pages, assignments, url]) => ({
      name, topics: [{ name: topic, pages: [pages], assignments: [assignments], links: [url] }],
    }))
    const week = makeWeeks(demo, 1)[0]
    demo.weeksData = [{ ...week, title: 'Vecka 42 – Bråk', chapter: 'Matematik: Bråk',
      content: 'Fiktiv demonstration. Sid- och uppgiftsnummer är påhittade. YouTube-länkar leder till sökresultat. PowerPoint och PDF kan läggas till som egna länkar när filerna finns.',
      lessons }]
    setSelectedId(null)
    try { window.sessionStorage.removeItem(`arsplanering-last-open-${session.user.id}`) } catch { /* Lagring kan vara blockerad */ }
    setPlan(demo)
    savedPlanRef.current = JSON.stringify(demo)
    setSavedRevision(revision => revision + 1)
    setTeacherTab('arsplan')
    setCalendarOpen(false)
    setPreviewStudents(false)
    setA4Demo(false)
    setStatus('Fiktiv vecka 42 visas nu i Lärarvy. Den är inte sparad och inga tidigare planeringar har ändrats. PowerPoint och PDF kan läggas till som egna länkar.')
  }

  async function save(publish) {
    if (busy) return
    if (!String(plan.title || '').trim()) return setStatus('Skriv ett namn på årsplaneringen.')
    if (!String(plan.subject || '').trim()) return setStatus('Skriv ämne.')
    if ((plan.schoolClosures || []).some(item => !validSchoolClosure(item))) return setStatus('Rätta namn och datum för lov/studiedagar innan du sparar eller publicerar.')
    if (publish && !weeks.some(week => week && !week.hidden && (
      String(week.content || '').trim() || String(week.chapter || '').trim() ||
      week.items?.length || week.pages?.some(item => String(item || '').trim()) ||
      week.assignments?.some(item => String(item || '').trim()) ||
      week.links?.some(item => resourceInfo(typeof item === 'string' ? item : item?.url || '')) ||
      week.lessons?.some(lesson => lesson.topics?.some(topic => String(topic.name || '').trim() ||
        topic.pages?.some(item => String(item || '').trim()) ||
        topic.assignments?.some(item => String(item || '').trim()) ||
        topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || ''))))
    ))) return setStatus('Ingen synlig vecka har innehåll. Lägg till minst en uppgift eller ett lektionsinnehåll innan du publicerar.')
    if (publish && !sanitizeForStudents({ ...plan, weeksData: weeks }).weeksData.length) return setStatus('Det finns inga synliga veckor att publicera. Markera minst en vecka med ”Visa för elever”.')
    if (publish && weeks.some(week => week && !week.hidden && !validSchoolClosure({ name: 'Vecka', startDate: week.weekStart, endDate: week.weekStart }))) return setStatus('En synlig vecka saknar giltigt startdatum. Rätta veckans datum innan publicering.')
    if (publish && !window.confirm(
      'Publicera planeringen för elever?\n\n' +
      'Synliga veckor: ' + weeks.filter(week => week && !week.hidden).length + '\n' +
      'Dolda veckor: ' + weeks.filter(week => week && week.hidden).length + '\n\n' +
      'Endast den publicerade elevversionen uppdateras. Kontrollera gärna Elevvy först.'
    )) return
    setBusy(true)
    setStatus('Sparar...')
    try {
      if (publish && plan.autoReleaseWeeks === true) {
        const { data: releaseSupported, error: releaseError } = await supabase.rpc('supports_automatic_week_release')
        if (releaseError || releaseSupported !== true) {
          setStatus('Automatisk veckopublicering kräver den senaste Supabase-migrationen. Ingen publicering gjordes.')
          return
        }
      }
      // Databasens publiceringsstatus och länk kontrolleras även vid ompublicering.
      // Utkast får aldrig skriva över elevversionen.
      let databasePublished = false
      let databaseSlug = ''
      if (selectedId) {
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
      const slug = publish ? (databaseSlug || buildSlug(plan)) : (databaseSlug || '')
      const payload = { kind: 'arsplanering-v2', ...plan, themeId: plan.themeId || planTheme(plan, selectedId).id, weeksData: weeks, published: publish || keepPublished, publicSlug: slug }
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
        if (simpleSetup) { setSimpleSetup(false); setTeacherTab('arsplan') }
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
    const openedPlan = planFromRow(row)
    setSimpleSetup(false); setSelectedId(row.id); savedPlanRef.current = JSON.stringify(openedPlan); setSavedRevision(revision => revision + 1); setPlan(openedPlan); setTeacherTab('arsplan'); setCalendarOpen(false); setPreviewStudents(false); setA4Demo(false); setStatus('Planeringen är öppnad.'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function shareWithColleague(event) {
    event.preventDefault()
    if (!selectedId || !shareRecipient.trim() || !sharePassword) return
    if (plan.receivedCopy) { setShareMessage('En mottagen kopia får inte delas vidare.'); return }
    if (isDirty) { setShareMessage('Spara dina ändringar innan du delar planeringen.'); return }
    setBusy(true)
    setShareMessage('')
    try {
      const { data, error } = await supabase.rpc('create_plan_share_invite', {
        p_plan_id: selectedId, p_recipient_email: shareRecipient.trim(), p_password: sharePassword,
      })
      if (error) throw error
      if (typeof data === 'string' && data.startsWith('ERROR:')) throw new Error(data.slice(6))
      setShareToken(data)
      setSharePassword('')
      setShareMessage('Inbjudan skapad. Skicka engångskoden privat till kollegan. Ingen e-post skickas automatiskt. Koden gäller i sju dagar.')
    } catch (error) { setShareMessage('Kunde inte skapa inbjudan: ' + error.message) }
    finally { setBusy(false) }
  }

  async function receiveColleagueCopy(event) {
    event.preventDefault()
    if (!receivedToken.trim()) return
    setBusy(true)
    setShareMessage('')
    try {
      const { error } = await supabase.rpc('claim_plan_share_invite', { p_token: receivedToken.trim() })
      if (error) throw error
      setReceivedToken('')
      setShareMessage('Kopian finns nu under Mina planeringar. Den är privat och får inte delas vidare.')
      await loadPlans()
    } catch (error) { setShareMessage('Kunde inte ta emot kopian: ' + error.message) }
    finally { setBusy(false) }
  }

  async function clonePlan(row) {
    if (busy) return
    const source = planFromRow(row)
    const title = window.prompt('Namn på den nya planeringen:', `${source.title} – nytt läsår`)
    if (!title) return
    const subject = window.prompt('Ämne för kopian:', source.subject || '')
    if (subject === null) return
    const className = window.prompt('Klass/grupp för kopian:', source.className || '')
    if (className === null) return
    const schoolYear = window.prompt('Läsår för kopian:', source.schoolYear || '')
    if (schoolYear === null) return
    setBusy(true)
    try {
      const clone = { ...source, themeId: PLAN_THEMES[(PLAN_THEMES.findIndex(theme => theme.id === planTheme(source, row.id).id) + 1) % PLAN_THEMES.length].id, title, subject, className, schoolYear, archived: false, published: false, publicSlug: '', receivedCopy: Boolean(source.receivedCopy) }
      const { error } = await supabase.from('veckoplanering').insert({
        user_id: session.user.id, title, week_start: clone.startDate, content: JSON.stringify(clone), subject, class_name: className, school_year: schoolYear,
        start_date: clone.startDate, weeks: clone.weeks, published: false, public_slug: null, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      const refreshed = await loadPlans()
      setStatus(refreshed ? 'En ny aktiv planering har skapats som utkast. Originalet finns kvar i arkivet.' : 'Kopian sparades, men listan kunde inte uppdateras. Ladda om för att kontrollera.')
    } catch (error) {
      setStatus(`Kunde inte klona: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  async function setArchived(row, archived) {
    if (busy) return
    if (selectedId === row.id && isDirty) {
      setStatus('Spara eller lämna dina osparade ändringar innan du arkiverar eller återställer planeringen.')
      return
    }
    if (archived && !window.confirm(`Arkivera "${row.title}"? Den sparas och kan återställas när som helst.`)) return
    setBusy(true)
    try {
      const stored = parseContent(row.content)
      if (!stored || typeof stored !== 'object') throw new Error('Planeringens innehåll kunde inte läsas.')
      const updated = { ...stored, archived }
      const { data, error } = await supabase.from('veckoplanering').update({ content: JSON.stringify(updated), updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('user_id', session.user.id).select('id').single()
      if (error || !data) throw error || new Error('Ingen planering uppdaterades.')
      if (selectedId === row.id) {
        const next = { ...plan, archived }
        setPlan(next)
        savedPlanRef.current = JSON.stringify(next)
        setSavedRevision(revision => revision + 1)
      }
      const refreshed = await loadPlans()
      setStatus(refreshed ? (archived ? 'Planeringen är arkiverad.' : 'Planeringen är återställd.') : 'Ändringen sparades men listan kunde inte uppdateras.')
    } catch (error) {
      setStatus(`Kunde inte ändra arkivstatus: ${error.message || 'Okänt fel'}`)
    } finally {
      setBusy(false)
    }
  }

  async function deletePlan(row) {
    if (busy) return
    if (selectedId === row.id && JSON.stringify(plan) !== savedPlanRef.current && !window.confirm('Du har osparade ändringar i den här planeringen. Radering tar även bort dem. Vill du fortsätta?')) return
    if (!window.confirm(`Radera "${row.title}"? Detta kan inte ångras.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.from('veckoplanering').delete().eq('id', row.id).eq('user_id', session.user.id).select('id').single()
      if (error) throw error
      if (selectedId === row.id) {
        const fresh = { ...emptyPlan(), themeId: PLAN_THEMES[plans.length % PLAN_THEMES.length].id }
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

  const openExample = kind => {
    if (busy) return
    if (isDirty && !window.confirm('Du har osparade ändringar. Vill du öppna en påhittad testplanering utan att spara dem?')) return
    let example
    if (kind === 'math') {
      example = publicDemoWeek42()
    } else {
      const swedish = kind === 'swedish'
      example = { ...emptyPlan(), title: swedish ? 'EXEMPEL – Svenska åk 5: Berättelser' : 'EXEMPEL – NO åk 7: Ekosystem',
        subject: swedish ? 'Svenska' : 'NO', className: swedish ? 'Årskurs 5' : 'Årskurs 7',
        startDate: '2026-10-12', weeks: 3, lessonsPerWeek: 3, published: false }
      const titles = swedish
        ? ['Berättelsens början', 'Personer och miljö', 'Skriv och bearbeta']
        : ['Näringskedjor', 'Producenter och konsumenter', 'Ekosystem i närmiljön']
      example.weeksData = makeWeeks(example, 3).map((week, i) => ({
        ...week, chapter: titles[i], content: titles[i],
        lessons: week.lessons.map((lesson, j) => ({
          ...lesson, topics: [{ name: titles[i], pages: [swedish ? `${20 + i * 4}–${23 + i * 4}` : `${50 + i * 4}–${53 + i * 4}`],
            assignments: [`Uppgift ${j + 1}–${j + 3}`], links: [] }]
        }))
      }))
    }
    setSimpleSetup(false)
    setSelectedId(null)
    setPlan(example)
    savedPlanRef.current = JSON.stringify(example)
    setSavedRevision(revision => revision + 1)
    setTeacherTab('arsplan')
    setCalendarOpen(false)
    setPreviewStudents(false)
    setA4Demo(false)
    setStatus('Påhittad testplanering öppnad. Den är inte sparad i ditt konto.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const createPlan = () => {
    if (JSON.stringify(plan) !== savedPlanRef.current && !window.confirm('Du har osparade ändringar. Vill du lämna dem utan att spara?')) return
    const fresh = emptyPlan()
    try { window.sessionStorage.removeItem(`arsplanering-last-open-${session.user.id}`) } catch { /* Lagring kan vara blockerad */ }
    setSimpleSetup(true)
    setSimpleMore(false)
    setPlan(fresh); setSelectedId(null); savedPlanRef.current = JSON.stringify(fresh)
    setSavedRevision(revision => revision + 1)
    setTeacherTab('new'); setCalendarOpen(false); setPreviewStudents(false); setA4Demo(false)
    setStatus('Fyll i uppgifterna och välj Skapa planering.')
  }
  return <div style={planThemeStyle(plan, selectedId)} className={`planning-layout ${teacherTab === "elevvy" ? "view-student" : teacherTab === "new" ? "view-new" : "view-teacher"}`}><Navigation active={teacherTab} plans={plans.filter(row => !parseContent(row.content)?.archived)} selectedId={selectedId} getPlanTheme={row => planTheme(parseContent(row.content), row.id)} onOpenPlan={loadPlan} onNavigate={id => { setTeacherTab(id === 'mina' ? 'arsplan' : id); if (id === 'elevvy') setPreviewStudents(true) }} onOpenExample={openExample} onOpenArchive={() => { setShowArchive(true); setTeacherTab('mina') }} onNew={createPlan} onToggleCalendar={() => setCalendarOpen(open => !open)} calendarOpen={calendarOpen} /><main className="shell" id="lararvy">
    <header className="topbar">
      <div><p className="eyebrow">{teacherTab === "new" ? "NY PLANERING" : teacherTab === "mina" ? "MINA PLANERINGAR" : teacherTab === "elevvy" ? "ELEVVY" : "LÄRARVY"}</p><h1>{teacherTab === "new" ? "Skapa ny planering" : teacherTab === "mina" ? "Mina planeringar" : (plan.title?.trim() || "Ny planering")}</h1><p className="muted">{session.user.email}</p></div>
      <div className="topbar-share-actions">
        <button type="button" className="secondary share-settings-trigger" aria-expanded={shareOpen} onClick={() => { setShareOpen(open => !open); setShareToken(''); setShareMessage('') }} title="Klona och dela med kollega">⚙ Klona / dela</button>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Logga ut</button>
      </div>
    </header>

    {shareOpen && <section className="card colleague-share-panel" aria-label="Klona och dela med kollega">
      <div className="share-panel-heading"><div><h2>Klona och dela</h2><p className="muted">Kollegan får en egen, privat kopia. Den kan inte delas vidare via Årsplanering.</p></div><button type="button" className="secondary" onClick={() => setShareOpen(false)}>Stäng</button></div>
      <div className="colleague-share-grid">
        <form onSubmit={shareWithColleague}>
          <h3>Dela din planering</h3><p className="muted">Kollegan behöver ett eget konto med samma e-postadress som du anger. Du skickar engångskoden själv – ingen e-post skickas automatiskt.</p>
          {plan.receivedCopy ? <p className="muted">Den här planeringen är mottagen från en kollega och kan inte delas vidare.</p> : <>
            <label>Kollegans e-postadress<input type="email" required autoComplete="email" value={shareRecipient} onChange={e => setShareRecipient(e.target.value)} placeholder="kollega@skola.se" /></label>
            <label>Delningskod<input type="password" required autoComplete="off" value={sharePassword} onChange={e => setSharePassword(e.target.value)} placeholder="Ange delningskod" /></label>
            <button type="submit" className="primary" disabled={busy || !selectedId}>Skapa inbjudan</button>
            {!selectedId && <p className="muted">Spara och öppna en planering först.</p>}
            {shareToken && <div className="share-invite-code"><label>Engångskod till kollegan<input readOnly value={shareToken} onFocus={e => e.target.select()} /></label><button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(shareToken)}>Kopiera kod</button></div>}
          </>}
        </form>
        <form onSubmit={receiveColleagueCopy}>
          <h3>Ta emot en planering</h3>
          <p className="muted">Logga in på ditt eget konto och skriv in engångskoden från kollegan.</p>
          <label>Engångskod<input required value={receivedToken} onChange={e => setReceivedToken(e.target.value)} placeholder="Klistra in koden" /></label>
          <button type="submit" className="secondary" disabled={busy}>Ta emot privat kopia</button>
        </form>
      </div>
      {shareMessage && <p role="status" className="share-feedback">{shareMessage}</p>}
    </section>}
    <div className="planning-context"><span className={`planning-save-state ${busy ? "saving" : isDirty ? "unsaved" : selectedId ? "saved" : "new"}`} aria-live="polite"><span aria-hidden="true">{busy ? "◌" : isDirty ? "●" : selectedId ? "✓" : "○"}</span> {busy ? "Sparar ändringarna…" : isDirty ? "Osparade ändringar – spara innan du lämnar sidan" : selectedId ? "Alla ändringar sparade" : "Ny planering – inte sparad"}</span></div>

    {(isDirty || busy) && <div className="quick-save-bar" role="region" aria-label="Snabbspara årsplanering">
      <span aria-live="polite">{busy ? "Sparar…" : "Osparade ändringar"}</span>
      <button type="button" className="secondary" disabled={busy} onClick={() => save(false)}>Spara utkast</button>
    </div>}

    <div className={`teacher-tab-panel ${simpleSetup ? "simple-setup-active" : ""}`} id="panel-lararvy" role="tabpanel" aria-labelledby="tab-lararvy" hidden={teacherTab !== "arsplan" && teacherTab !== "new"}>
    {simpleSetup && <section className="card simple-setup-card" aria-label="Skapa ny planering">
      <h2>Skapa en ny planering</h2>
      <p className="muted">Fyll i uppgifterna och tryck på Skapa planering. Du kan lägga till lektioner och material efteråt.</p>
      <form onSubmit={event => { event.preventDefault(); save(false) }}>
        <div className="form-grid">
          <label>Planeringens namn<input required value={plan.title} onChange={event => setPlan(p => ({ ...p, title: event.target.value }))} placeholder="Matematik höstterminen" /></label>
          <label>Ämne<input required value={plan.subject} onChange={event => setPlan(p => ({ ...p, subject: event.target.value }))} placeholder="Matematik" /></label>
          <label>Klass / årskurs<input value={plan.className} onChange={event => setPlan(p => ({ ...p, className: event.target.value }))} placeholder="6A" /></label>
          <label>Läsår<input value={plan.schoolYear} onChange={event => setPlan(p => ({ ...p, schoolYear: event.target.value }))} placeholder="2026–2027" /></label>
          <label>Startdatum<input type="date" required value={plan.startDate} onChange={event => { if (event.target.value) setPlan(p => ({ ...p, startDate: mondayOf(`${event.target.value}T12:00:00`), weeksData: [] })) }} /></label>
          <p className="muted">Planeringen börjar med en vecka. Lägg till fler veckor efter sista veckan när du behöver. Importerade underlag kan innehålla flera veckor.</p>
        </div>
        {simpleMore && <div className="simple-extra-fields"><h3>Fler uppgifter</h3><div className="form-grid"><label>Skolform<input value={plan.schoolForm || ""} onChange={e => setPlan(p => ({ ...p, schoolForm: e.target.value }))} placeholder="Grundskola" /></label><label>Årskurs<input value={plan.grade || ""} onChange={e => setPlan(p => ({ ...p, grade: e.target.value }))} placeholder="6" /></label><label>Lektioner per vecka<input type="number" min="1" max="8" value={plan.lessonsPerWeek} onChange={e => setPlan(p => ({ ...p, lessonsPerWeek: Math.max(1, Math.min(8, Number(e.target.value) || 1)) }))} /></label><label>Kommun<input value={plan.municipality || ""} onChange={e => setPlan(p => ({ ...p, municipality: e.target.value }))} /></label></div>
          <div className="simple-closure-section">
            <h3>Lov och studiedagar</h3>
            <p className="muted">Ange datum för din skola. Förslag behöver kontrolleras mot kommunens läsårstider.</p>
            {(plan.schoolClosures || []).map(item => <div className="simple-closure-row" key={item.id}>
              <div className="form-grid">
                <label>Typ / namn<input value={item.name || ''} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, name: e.target.value } : v) }))} /></label>
                <label>Från datum<input type="date" value={item.startDate || ''} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, startDate: e.target.value } : v) }))} /></label>
                <label>Till datum<input type="date" value={item.endDate || ''} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, endDate: e.target.value } : v) }))} /></label>
              </div>
              {!validSchoolClosure(item) && <p role="alert">Kontrollera namn och datum.</p>}
              <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).filter(v => v.id !== item.id) }))}>Ta bort</button>
            </div>)}
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, schoolClosures: [...(p.schoolClosures || []), { id: crypto.randomUUID(), name: 'Lov', startDate: p.startDate, endDate: p.startDate, verified: false }] }))}>+ Lägg till lov</button>
              <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, schoolClosures: [...(p.schoolClosures || []), { id: crypto.randomUUID(), name: 'Studiedag', startDate: p.startDate, endDate: p.startDate, verified: false }] }))}>+ Lägg till studiedag</button>
            </div>
          </div>
          <div className="simple-exams-section">
            <h3>Nationella prov (NP)</h3>
            <p className="muted">Visas automatiskt för grundskolans årskurs 3, 6 och 9 under läsåret 2026/27. Kontrollera alltid aktuella datum hos Skolverket.</p>
            {nationalExamsForPlan(plan).length ? <ul>{nationalExamsForPlan(plan).map(exam => <li key={exam.date + exam.subject + exam.part}>{exam.date} – {exam.subject}, delprov {exam.part}</li>)}</ul> : <p className="muted">Inga nationella provdatum visas för de valda uppgifterna. Välj skolform Grundskola och årskurs 3, 6 eller 9 om det är aktuellt.</p>}
            <a href="https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-grundskola-sameskola-specialskola" target="_blank" rel="noopener noreferrer">Kontrollera NP-datum hos Skolverket ↗</a>
          </div>
        </div>}
        <div className="button-row"><button type="submit" className="primary" disabled={busy}>{busy ? 'Skapar…' : 'Skapa planering'}</button><button type="button" className="secondary" onClick={() => setSimpleMore(v => !v)}>{simpleMore ? "Dölj fler inställningar" : "Fler inställningar"}</button></div>
      </form>
      {status && <p className="status" role="status">{status}</p>}
    </section>}
    {status && <section className="card compact-status-card" aria-live="polite"><p className="status">{status}</p></section>}

    <div className="unified-planning-form" aria-label="Planeringens övriga uppgifter">
    <section className="card teacher-settings-card">
      <details className="teacher-settings-details">
        <summary><strong>Grunduppgifter och inställningar</strong><span>Ändra namn, ämne, skolform, läsår och visningsalternativ</span></summary>
      <div className="form-grid">
        <label>Namn<input value={plan.title} onChange={e => setPlan({ ...plan, title: e.target.value })} placeholder="Matematik 2026–2027" /></label>
        <label>Skolform<select value={plan.schoolForm || ''} onChange={e => setPlan(p => ({ ...p, schoolForm: e.target.value, grade: '', course: '' }))}>
          <option value="">Välj skolform</option>
          <option value="grundskola">Grundskola</option>
          <option value="anpassad-grundskola">Anpassad grundskola</option>
          <option value="gymnasieskola">Gymnasieskola</option>
          <option value="anpassad-gymnasieskola">Anpassad gymnasieskola</option>
          <option value="komvux">Kommunal vuxenutbildning (komvux)</option>
        </select></label>
        <label>{['gymnasieskola', 'anpassad-gymnasieskola', 'komvux'].includes(plan.schoolForm) ? 'Årskurs/nivå' : 'Årskurs'}
          <select value={plan.grade || ''} disabled={!plan.schoolForm} onChange={e => setPlan(p => ({ ...p, grade: e.target.value, course: '' }))}>
            <option value="">Välj årskurs/nivå</option>
            {(['grundskola', 'anpassad-grundskola'].includes(plan.schoolForm) ? Array.from({ length: 9 }, (_, i) => String(i + 1)) : ['gymnasieskola', 'anpassad-gymnasieskola'].includes(plan.schoolForm) ? ['1', '2', '3', '4'] : ['Grundläggande nivå', 'Gymnasial nivå']).map(grade => <option key={grade} value={grade}>{/^\d+$/.test(grade) ? `Årskurs ${grade}` : grade}</option>)}
          </select>
        </label>
        <label>Ämne<input value={plan.subject} onChange={e => setPlan({ ...plan, subject: e.target.value })} placeholder="Exempelvis matematik" /></label>
        {['gymnasieskola', 'anpassad-gymnasieskola', 'komvux'].includes(plan.schoolForm) && <label>Kurs/nivå<input value={plan.course || ''} onChange={e => setPlan({ ...plan, course: e.target.value })} placeholder="Exempelvis Matematik nivå 1b" /></label>}
        <label>Läsår<input value={plan.schoolYear} onChange={e => setPlan({ ...plan, schoolYear: e.target.value })} placeholder="2026–2027" /></label>
        <label>Klass/grupp<input value={plan.className} onChange={e => setPlan({ ...plan, className: e.target.value })} placeholder="8A" /></label>
        <label>Län/region<select value={plan.county || ''} onChange={e => setPlan(p => ({ ...p, county: e.target.value, municipality: '' }))}>
          <option value="">Välj län/region</option>
          {Object.keys(MUNICIPALITIES_BY_COUNTY).sort((a, b) => a.localeCompare(b, 'sv')).map(county => <option key={county} value={county}>{county}</option>)}
        </select></label>
        <label>Kommun<select value={plan.municipality || ''} disabled={!plan.county} onChange={e => setPlan(p => ({ ...p, municipality: e.target.value }))}>
          <option value="">{plan.county ? 'Välj kommun' : 'Välj län först'}</option>
          {(MUNICIPALITIES_BY_COUNTY[plan.county] || []).map(municipality => <option key={municipality} value={municipality}>{municipality}</option>)}
        </select></label>
        <label>Startdatum<input type="date" value={plan.startDate} onChange={e => {
          if (!e.target.value) return
          setPlan(p => {
            const startDate = mondayOf(`${e.target.value}T12:00:00`)
            return { ...p, startDate, weeksData: reconcileWeeks(p, startDate, p.weeks) }
          })
        }} /></label>
        <label>Första veckans nummer<input type="number" min="1" max="53" readOnly title="Beräknas automatiskt från startdatumet" value={calendarWeekNumber(plan.startDate) ?? plan.startWeek ?? 1} /></label>
        <label>Elevveckornas layout<select value={plan.studentLayout || 'grid'} onChange={e => setPlan(p => ({ ...p, studentLayout: e.target.value }))}><option value="grid">Kalendermatris</option><option value="list">Under varandra</option></select></label>
        {plan.studentLayout !== 'list' && <><label>Kolumner<input type="number" min="1" max="3" value={plan.studentColumns || 3} onChange={e => setPlan(p => ({ ...p, studentColumns: Math.max(1, Math.min(3, Number(e.target.value) || 1)), studentRows: Math.min(p.studentRows || 2, Math.floor(6 / Math.max(1, Math.min(3, Number(e.target.value) || 1)))) }))} /></label><label>Rader<input type="number" min="1" max={Math.floor(6 / (plan.studentColumns || 3))} value={Math.min(plan.studentRows || 2, Math.floor(6 / (plan.studentColumns || 3)))} onChange={e => setPlan(p => ({ ...p, studentRows: Math.max(1, Math.min(Math.floor(6 / (p.studentColumns || 3)), Number(e.target.value) || 1)) }))} /></label></>}
        <label>Visning för elever<select value={plan.lessonDisplay || 'bara-lektion'} onChange={e => setPlan(p => ({ ...p, lessonDisplay: e.target.value }))}><option value="dag-lektion">Dag + lektion</option><option value="bara-dag">Bara dag</option><option value="bara-lektion">Bara lektion</option></select></label>
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
        <label>Antal veckor<input type="number" min="1" value={plan.weeks} onChange={e => {
          const count = Math.max(1, Math.trunc(Number(e.target.value) || 1))
          if (count === weeks.length) return
          const discarded = weeks.slice(count)
          const hasWork = discarded.some((week, index) => hasWeekWork(week, count + index))
          if (hasWork && !window.confirm('Det finns innehåll i veckor som tas bort. Vill du verkligen radera det innehållet?')) return
          setPlan(p => ({ ...p, weeks: count, weeksData: reconcileWeeks(p, p.startDate, count) }))
        }} /></label>
      </div>
      </details>
    </section>

    {calendarOpen && <div id="teacher-year-calendar"><YearCalendar weeks={weeks} schoolClosures={plan.schoolClosures || []} nationalExams={nationalExamsForPlan(plan)} onClose={() => setCalendarOpen(false)} onUpdateWeek={updateWeek} onAddWeek={() => setPlan(p => {
      const existing = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
      if (existing.length >= 52) return p
      const latest = [...existing].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0]
      const nextDate = addWeeks(latest.weekStart, 1)
      const newWeek = makeWeeks({ ...p, startDate: nextDate, startWeek: calendarWeekNumber(nextDate), weeks: 1 }, 1)[0]
      return { ...p, weeks: existing.length + 1, weeksData: [...existing, newWeek] }
    })} onDeleteWeek={weekStart => { if (busy || weeks.length <= 1) return; const week = weeks.find(item => item.weekStart === weekStart); if (!week) return; if (!window.confirm(`Vill du radera vecka ${calendarWeekNumber(weekStart) ?? week.weekNumber} och allt innehåll i den? Ändringen sparas först när du väljer Spara ändringar.`)) return; setPlan(p => { const remaining = displayWeeks(p).filter(item => item.weekStart !== weekStart); return remaining.length ? { ...p, weeks: remaining.length, weeksData: remaining } : p }) }} onSave={() => save(false)} isDirty={isDirty} busy={busy} saveStatus={status} entryType={plan.entryType} /></div>}

    <details className="card optional-planning-section" aria-label="Skollov och studiedagar"><summary><strong>Skollov och studiedagar</strong><span>Lägg till lov och studiedagar vid behov</span></summary><div className="optional-planning-content">
      <h3>Skollov och studiedagar</h3>
      <p>Nationella helgdagar visas automatiskt. Lägg till och anpassa lov, studiedagar och andra lokala ledigheter här.</p>
      {(plan.schoolClosures || []).map(item => <div className="form-grid" key={item.id}>
        <label>Benämning<input value={item.name} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, name: e.target.value } : v) }))} /></label>
        <label>Från<input type="date" value={item.startDate} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, startDate: e.target.value, verified: false } : v) }))} /></label>
        <label>Till<input type="date" value={item.endDate} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, endDate: e.target.value, verified: false } : v) }))} /></label>
        <label><input type="checkbox" checked={item.verified === true} onChange={e => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).map(v => v.id === item.id ? { ...v, verified: e.target.checked } : v) }))} /> Datum kontrollerade mot skolans/kommunens läsårstider</label>
        {!item.verified && <p className="muted">Ej verifierat – kontrollera datum med skolan eller kommunen.</p>}
        {!validSchoolClosure(item) && <p role="alert">Ange namn och giltiga datum. Slutdatum måste vara samma dag eller senare än startdatum.</p>}
        <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, schoolClosures: (p.schoolClosures || []).filter(v => v.id !== item.id) }))}>Ta bort</button>
      </div>)}
      <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, schoolClosures: [...(p.schoolClosures || []), { id: crypto.randomUUID(), name: 'Studiedag', startDate: p.startDate, endDate: p.startDate, verified: false }] }))}>+ Lägg till lov eller studiedag</button>
      <button type="button" className="secondary" onClick={() => setPlan(p => {
        const proposed = suggestedSchoolClosures(p.startDate, p.weeks)
        const existing = p.schoolClosures || []
        const additions = proposed.filter(item => !existing.some(old => old.suggestionKey === item.suggestionKey || (old.name.startsWith(item.name.split(' (')[0]) && old.startDate.slice(0, 4) === item.startDate.slice(0, 4))))
        return { ...p, schoolClosures: [...existing, ...additions] }
      })}>+ Föreslå lov (redigerbara datum)</button>
      <p>Höstlov vecka 44, sportlov vecka 9, jullov 22 december–6 januari och påsklov veckan efter påsk är preliminära exempel, inte kommunens beslutade lovdatum. Kontrollera alltid mot kommunens eller skolans läsårstider och ändra vid behov.</p>
    </div></details>

    <details className="card optional-planning-section" aria-label="Nationella prov"><summary><strong>Nationella prov</strong><span>Datum och information från Skolverket</span></summary><div className="optional-planning-content">
      <h2>Nationella prov – Skolverkets datum 2026/27</h2>
      <p className="muted">Datumen och provperioderna är avstämda mot Skolverkets publicerade schema (kontrollerat 17 oktober 2026). Årskurs 9 börjar kl. 09.00 på fasta provdagar; årskurs 6 har ingen nationellt fastställd starttid. Kontrollera eventuella senare ändringar hos Skolverket. Muntliga prov och årskurs 3 har provperioder.</p>
      <p><a href="https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-grundskola-sameskola-specialskola" target="_blank" rel="noopener noreferrer">Kontrollera aktuella provdatum hos Skolverket ↗</a></p>
      {plan.schoolForm === 'grundskola' && isSchoolYear2026_27(plan.schoolYear) && ['3','6','9'].includes(String(plan.grade || '').replace(/[^0-9]/g, '')) ? <>
        {NATIONAL_EXAM_PERIODS_2026_27.filter(item => item.grade === String(plan.grade).replace(/[^0-9]/g, '')).map(item => <p key={item.subject}><strong>{item.subject}:</strong> {item.start}–{item.end} (provperiod)</p>)}
        <ul>{NATIONAL_EXAMS_2026_27.filter(item => item.grade === String(plan.grade).replace(/[^0-9]/g, '')).map(item => <li key={item.date + item.subject + item.part}>{item.date} {item.startTime ? `kl. ${item.startTime}` : ""} – {item.subject}, delprov {item.part} <span aria-label="Låst datum">🔒</span></li>)}</ul>
      </> : <p className="muted">Välj grundskola, läsåret 2026/27 och årskurs 3, 6 eller 9. Datum för andra skolformer och läsår visas inte förrän de har kontrollerats separat.</p>}
      <a href="https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-grundskola-sameskola-specialskola" target="_blank" rel="noreferrer">Kontrollera datum hos Skolverket</a>
    </div></details>

    <section className="card automatic-week-release" aria-label="Automatisk veckopublicering">
      <h3>Automatisk visning av veckor</h3>
      <label className="automatic-release-toggle"><input type="checkbox" checked={plan.autoReleaseWeeks === true} disabled={busy} onChange={e => setPlan(p => ({ ...p, autoReleaseWeeks: e.target.checked }))} /> Visa varje synlig vecka automatiskt från veckans måndag</label>
      <p className="muted">Dolda veckor visas aldrig. Funktionen kräver att den senaste Supabase-migrationen är installerad innan du publicerar. Tider följer svensk tid.</p>
    </section>
    <section className="card publication-readiness" aria-label="Kontroll före publicering">
      <h3>Kontroll före publicering</h3>
      <p><strong>{visibleTeacherWeeks.length}</strong> synliga veckor · <strong>{weeksWithContent.length}</strong> med innehåll · <strong>{weeks.length - visibleTeacherWeeks.length}</strong> dolda veckor</p>
      {publicationIssues.length ? <div role="status"><strong>Kontrollera innan eleverna får länken:</strong><ul>{publicationIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></div> : <p className="publication-ready">✓ Grunduppgifterna är ifyllda. Granska elevvyn innan du publicerar.</p>}
      <p className="muted">Spara utkast påverkar inte den redan publicerade elevversionen. Publicera för elever uppdaterar elevversionen.</p>
    </section>
    <section className="card calendar-primary-actions" aria-label="Spara och publicera årsplaneringen">
      <div className="button-row">
        <button type="button" className="secondary" disabled={busy} onClick={() => save(false)}>Spara utkast</button>
        <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>Publicera för elever</button>
        
      </div>
    </section>
    </div>

    </div>
    <div className="teacher-tab-panel" hidden={teacherTab !== "arsplan"}>
    <section className="card import-card"><h2>Redigera och importera underlag</h2>
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

    <div className="week-overview-toolbar" aria-label="Årskalender och zoom"><strong>Veckor i planeringen <span className="week-count-badge">{weeks.length} {weeks.length === 1 ? "vecka" : "veckor"}</span></strong><button type="button" className="primary" onClick={() => {
        setCalendarOpen(true)
        window.setTimeout(() => document.getElementById('teacher-year-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      }}>Visa årskalender och zooma</button></div>
    <details className="legacy-week-editor"><summary>Detaljerad veckoredigering (vid behov)</summary>
    <section className="card">
      <div className="section-heading"><div><p className="eyebrow">GRANSKA</p><h2>Årsplanering</h2></div><span className="count-pill">{weeks.length} veckor</span></div>
      <div className="year-grid">
        {weeks.map((week, index) => ({ week, index })).sort((a, b) => (a.week.weekStart || '').localeCompare(b.week.weekStart || '')).map(({ week, index }, displayIndex, ordered) => <div className="chapter-week-group" key={`${week.weekNumber}-${index}`}>
          {week.chapter?.trim() && (displayIndex === 0 || week.chapter !== ordered[displayIndex - 1]?.week.chapter) && <h3 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h3>}
          <article className="week-card" id={`calendar-week-${week.weekNumber}`} style={{ scrollMarginTop: 95 }}>
          <div className="week-top" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><label className="student-visibility-toggle week-heading-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} aria-label={`Visa vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber} för elever`} /><span>{week.hidden ? "Visa inte i elevvyn" : "Visa i elevvyn"}</span></label><strong style={{ fontSize: "1.45rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5 }}>Vecka <input type="number" aria-label="Ändra veckonummer" style={{ width: "3.3ch", minWidth: 66, fontSize: "1.45rem", fontWeight: 800, padding: "4px 6px" }} min="1" max="53" value={calendarWeekNumber(week.weekStart) ?? week.weekNumber} title="Ändra veckonumret för att flytta veckan och dess datum" onChange={e => {
            const target = Number(e.target.value)
            const current = calendarWeekNumber(week.weekStart)
            if (!Number.isInteger(target) || target < 1 || target > 53 || current === null) return
            const nextDate = addWeeks(week.weekStart, target - current)
            if (calendarWeekNumber(nextDate) !== target) { setStatus('Veckonumret finns inte vid detta årsskifte.'); return }
            if (weeks.some((other, i) => i !== index && other.weekStart === nextDate)) { setStatus('Det finns redan en planering för den veckan.'); return }
            updateWeek(index, { weekStart: nextDate, weekNumber: target })
            setStatus('')
          }} /></strong><span style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatDate(week.weekStart)}</span>
            <button type="button" className="remove-small" disabled={weeks.length <= 1} onClick={() => {
              if (hasWeekWork(week, index) && !window.confirm(`Ta bort vecka ${week.weekNumber} och allt innehåll i veckan?`)) return
              setPlan(p => {
                const current = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
                const remaining = current.filter((_, i) => i !== index)
                return { ...p, weeks: remaining.length, weeksData: remaining, startWeek: Number(remaining[0]?.weekNumber) || p.startWeek }
              })
            }}>× Ta bort vecka</button></div>
          <label className="chapter-editor">Kapitel / tema (valfritt)<input value={week.chapter || ''} placeholder="Exempel: Kapitel 5 – Taluppfattning" onChange={e => updateWeek(index, { chapter: e.target.value })} /></label>
          {!/^Vecka\s+\d+$/i.test(week.title || '') && <input className="week-title" aria-label="Egen veckorubrik" value={week.title || ''} onChange={e => updateWeek(index, { title: e.target.value })} />}
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
        
        <button className="secondary" disabled={busy} onClick={() => save(false)}>Spara utkast</button>
        <button className="primary" disabled={busy} onClick={() => save(true)}>Publicera för elever</button>
      </div>
      {isDirty && <p className="unsaved-notice" role="status">Osparade ändringar – välj Spara utkast innan du lämnar sidan.</p>}
      {status && <p className="status">{status}</p>}
    </section>

    </details>

    </div>
    <div className="teacher-tab-panel" id="panel-elevvy" role="tabpanel" aria-labelledby="tab-elevvy" hidden={teacherTab !== "elevvy"}>
    {previewStudents && <section className="card preview-panel" id="elevvy"><h2>Förhandsvisning för elever</h2><p className="muted">Detta är endast en förhandsvisning. Inget publiceras.</p><StudentView plan={sanitizeForStudents({ ...plan, weeksData: weeks })} preview /></section>}

    </div>
    <div className="teacher-tab-panel" hidden={teacherTab !== "mina"}>
    <section className="card" id="mina-arsplaneringar">
      <div className="section-heading"><div><p className="eyebrow">BIBLIOTEK</p><h2>Mina årsplaneringar</h2></div><button type="button" className="primary" onClick={createPlan}>+ Ny planering</button></div>
      <div className="button-row" role="group" aria-label="Planeringsbibliotek">
        <button type="button" className={!showArchive ? 'primary' : 'secondary'} aria-pressed={!showArchive} onClick={() => setShowArchive(false)}>Aktiva ({plans.filter(row => !parseContent(row.content)?.archived).length})</button>
        <button type="button" className={showArchive ? 'primary' : 'secondary'} aria-pressed={showArchive} onClick={() => setShowArchive(true)}>Arkiv ({plans.filter(row => parseContent(row.content)?.archived).length})</button>
      </div>
      {!plans.some(row => Boolean(parseContent(row.content)?.archived) === showArchive) ? <p className="muted">{showArchive ? 'Arkivet är tomt.' : 'Du har inga aktiva årsplaneringar ännu.'}</p> : <div className="library-list">
        {plans.filter(row => Boolean(parseContent(row.content)?.archived) === showArchive).map(row => <article className="library-item" key={row.id}>
          <div><strong className="library-title">{row.title}</strong><p className="muted">{[row.subject, row.class_name, row.school_year].filter(Boolean).join(' · ')}</p></div>
          <div className="button-row">
            <span className={`status-badge ${row.published ? 'published' : 'draft'}`}>{row.published ? 'Publicerad' : 'Utkast'}</span>
            <button className="secondary" disabled={busy} onClick={() => loadPlan(row)}>Öppna</button>
            <button className="secondary" disabled={busy} onClick={() => clonePlan(row)}>{showArchive ? 'Återanvänd som ny' : 'Klona'}</button>
            <button className="secondary" disabled={busy} onClick={() => setArchived(row, !showArchive)}>{showArchive ? 'Återställ' : 'Arkivera'}</button>
            {row.published && <button className="secondary" disabled={busy} onClick={() => unpublish(row)}>Avpublicera</button>}
            <button className="danger" disabled={busy} onClick={() => deletePlan(row)}>Radera</button>
          </div>
        </article>)}
      </div>}
      <p className="muted">Arkivering döljer bara planeringen från den aktiva listan. Publicerade elevlänkar påverkas inte.</p>
    </section>
    </div>
  </main></div>
}

function publicDemoWeek42() {
  const plan = { ...emptyPlan(), title: 'Fiktiv vecka 42 – Matematik: Bråk', subject: 'Matematik',
    className: 'Årskurs 6', startDate: '2026-10-12', weeks: 1, entryType: 'lektion',
    lessonsPerWeek: 5, studentLayout: 'list' }
  const lessons = [
    ['Måndag – Vad är ett bråk?', 'Täljare, nämnare och bråk med bilder', '42–43', '1–6', 'https://www.youtube.com/results?search_query=br%C3%A5k+matematik+%C3%A5rskurs+6'],
    ['Tisdag – Likvärdiga bråk', 'Förlänga och förkorta bråk', '44–45', '7–12', 'https://www.youtube.com/results?search_query=f%C3%B6rl%C3%A4nga+f%C3%B6rkorta+br%C3%A5k'],
    ['Onsdag – Addera bråk', 'Gemensam nämnare och addition', '46–47', '13–18', 'https://www.youtube.com/results?search_query=addera+br%C3%A5k+gemensam+n%C3%A4mnare'],
    ['Torsdag – Problemlösning', 'Textuppgifter med bråk i par', '48', '19–22', 'https://www.youtube.com/results?search_query=probleml%C3%B6sning+br%C3%A5k+matematik'],
    ['Fredag – Repetition och diagnos', 'Repetera och genomför en kort diagnos', '42–48', 'Repetition 1–8', 'https://www.youtube.com/results?search_query=repetition+br%C3%A5k+matematik'],
  ].map(([name, topic, pages, assignments, url]) => ({
    name, topics: [{ name: topic, pages: [pages], assignments: [assignments], links: [url] }],
  }))
  const week = makeWeeks(plan, 1)[0]
  return sanitizeForStudents({ ...plan, weeksData: [{ ...week, title: 'Vecka 42 – Bråk',
    chapter: 'Matematik: Bråk', content: 'Fiktiv exempelvecka. Sid- och uppgiftsnummer är påhittade. YouTube-länkarna leder till sökresultat.',
    lessons }] })
}

function AnnualApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [studentPlan, setStudentPlan] = useState(null)
  const [studentError, setStudentError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  const isPublicDemo = window.location.pathname.replace(/\/$/, '') === '/elev/demo-vecka-42'

  const studentSlug = useMemo(() => {
    const match = window.location.pathname.match(/^\/elev\/([^/]+)\/?$/)
    return match ? decodeURIComponent(match[1]) : null
  }, [])

  useEffect(() => {
    if (isPublicDemo) { setStudentPlan(publicDemoWeek42()); setLoading(false); return undefined }
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
  }, [studentSlug, isPublicDemo])

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
          {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon">{info.icon}</span><span>{info.label}</span><span className="print-resource-url">{url}</span></a>}
          {editable && <button type="button" className="remove-small" aria-label={`Ta bort länk ${index + 1}`} onClick={() => updateList('links', links.filter((_, i) => i !== index))}>×</button>}
        </div>
      })}
      {editable && <button type="button" className="add-detail" onClick={() => updateList('links', [...links, ''])}>+ Lägg till länk eller filadress</button>}
    </div>}
  </div>
}


function lessonDayDate(weekStart, lessonName) {
  const names = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
  const index = names.indexOf(String(lessonName || '').trim().toLocaleLowerCase('sv-SE'))
  if (index < 0 || !weekStart) return ''
  const date = new Date(weekStart + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + index)
  return formatDate(toIsoDate(date))
}
function LessonDetails({ week, onChange, entryType = 'lektion', lessonDisplay = 'bara-lektion' }) {
  const lessons = Array.isArray(week?.lessons) ? week.lessons : []
  const editable = typeof onChange === 'function'
  const changeLessons = next => onChange?.({ lessons: next, ...(entryType === 'dag' ? { daysCustomized: true } : {}) })
  const changeLesson = (i, next) => changeLessons(lessons.map((lesson, index) => index === i ? next : lesson))
  return <div className="lessons">
    {lessons.map((lesson, i) => ({ lesson, i })).filter(({ lesson }) => (editable || lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || ''))))).map(({ lesson, i }) => <section className="lesson" key={i}>
      <div className="lesson-heading">
        {editable ? <div className="lesson-edit-heading">
          <input aria-label={entryType === 'dag' ? 'Dagens namn' : 'Lektionens namn'} value={lesson.name || ''} onChange={e => changeLesson(i, { ...lesson, name: e.target.value })} />
          {entryType !== 'dag' && <label>Dag <select aria-label={'Veckodag för ' + (lesson.name || 'lektion ' + (i + 1))} value={lesson.day || ''} onChange={e => changeLesson(i, { ...lesson, day: e.target.value })}><option value="">Välj dag</option>{WEEKDAYS.map(day => <option key={day} value={day}>{day}</option>)}</select></label>}
          {lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day) && <span className="lesson-day-date">{lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day)}</span>}
        </div> : <h4>
          {(() => {
            const day = entryType === 'dag' ? (lesson.name || WEEKDAYS[i]) : lesson.day
            const name = lesson.name || (entryType === 'dag' ? (WEEKDAYS[i] || 'Dag ' + (i + 1)) : 'Lektion ' + (i + 1))
            const showDay = lessonDisplay !== 'bara-lektion'
            const showLesson = lessonDisplay !== 'bara-dag'
            const dayLabel = day || 'Dag ej vald'
            return <>{showDay && <span>{dayLabel}</span>}{showDay && showLesson && ' · '}{showLesson && <span>{name}</span>}{lessonDayDate(week.weekStart, day) && <span className="lesson-day-date"> · {lessonDayDate(week.weekStart, day)}</span>}</>
          })()}
        </h4>}
        {editable && <button type="button" className="remove-small" onClick={() => { if (!(lesson.topics || []).some(topic => topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm(entryType === 'dag' ? 'Ta bort dagen och allt innehåll i den?' : 'Ta bort lektionen och allt innehåll i den?')) changeLessons(lessons.filter((_, index) => index !== i)) }}>× Ta bort {entryType === 'dag' ? 'dag' : 'lektion'}</button>}
      </div>
      {(lesson.topics || []).map((topic, j) => ({ topic, j })).filter(({ topic }) => (editable || topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || '')))).map(({ topic, j }) => {
        const updateTopic = next => changeLesson(i, { ...lesson, topics: (lesson.topics || []).map((item, index) => index === j ? next : item) })
        const pages = Array.isArray(topic.pages) ? topic.pages : []
        const assignments = Array.isArray(topic.assignments) ? topic.assignments : []
        const links = Array.isArray(topic.links) ? topic.links : []
        const lastFilledRow = values => values.reduce((last, value, index) => String(value ?? '').trim() ? index + 1 : last, 0)
        const rows = editable ? Math.max(pages.length, assignments.length) : Math.max(lastFilledRow(pages), lastFilledRow(assignments))
        return <div className="topic" key={j}>
          <div className="topic-grid">
            <div className="topic-name">{editable ? <textarea aria-label="Momentets namn" placeholder="Exempel: Procent – tryck Enter för ny rad" rows={Math.max(2, String(topic.name || '').split('\n').length)} value={topic.name || ''} onChange={e => updateTopic({ ...topic, name: e.target.value })} /> : <strong className="topic-name-display">{topic.name || 'Moment'}</strong>}</div>
            {['pages', 'assignments'].map(field => <div className={`topic-column ${field}`} key={field}>
              {editable ? <label className="topic-custom-heading"><span className="sr-only">{field === 'pages' ? 'Byt rubrik för Sida' : 'Byt rubrik för Uppgift'}</span><input type="text" maxLength={60} aria-label={field === 'pages' ? 'Rubrik för sidor' : 'Rubrik för uppgifter'} placeholder={field === 'pages' ? 'Sida' : 'Uppgift'} value={field === 'pages' ? (topic.pagesLabel || '') : (topic.assignmentsLabel || '')} onChange={e => updateTopic({ ...topic, [field === 'pages' ? 'pagesLabel' : 'assignmentsLabel']: e.target.value })} title="Ändra rubriken. Lämna tomt för standardnamnet." /></label> : <h5>{(field === 'pages' ? topic.pagesLabel : topic.assignmentsLabel)?.trim() || (field === 'pages' ? 'Sida' : 'Uppgift')}</h5>}
              {Array.from({ length: rows }, (_, row) => <div className="topic-cell" key={row}>
                {editable ? <><input aria-label={`${(field === 'pages' ? topic.pagesLabel : topic.assignmentsLabel)?.trim() || (field === 'pages' ? 'Sida' : 'Uppgift')} rad ${row + 1}`} value={(field === 'pages' ? pages : assignments)[row] || ''} onChange={e => {
                  const next = [...(field === 'pages' ? pages : assignments)]
                  while (next.length <= row) next.push('')
                  next[row] = e.target.value
                  updateTopic({ ...topic, [field]: next })
                }} /><button className="remove-small" type="button" aria-label={`Ta bort ${field === "pages" ? "sida" : "uppgift"} på rad ${row + 1}`} onClick={() => updateTopic({ ...topic, [field]: (field === 'pages' ? pages : assignments).filter((_, index) => index !== row) })}>×</button></> : <span>{(field === 'pages' ? pages : assignments)[row] || ' '}</span>}
              </div>)}
              {editable && <button type="button" className="add-detail" onClick={() => updateTopic({ ...topic, [field]: [...(field === 'pages' ? pages : assignments), ''] })}>+ {(field === 'pages' ? topic.pagesLabel : topic.assignmentsLabel)?.trim() || (field === 'pages' ? 'Sida' : 'Uppgift')}</button>}
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
                {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon">{info.icon}</span>{label || info.label}<span className="print-resource-url">{url}</span></a>}
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
