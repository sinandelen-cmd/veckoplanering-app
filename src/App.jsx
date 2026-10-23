function capitalizeFirstSwedish(value) { return String(value || '').replace(/^(\s*)([a-zåäö])/i, (_, spaces, letter) => spaces + letter.toLocaleUpperCase('sv-SE')) }
import UpdateNotices from './UpdateNotices.jsx'
import { groupStudentWeeksForPrint } from './printGroups.js'
import { Component, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabase'
import './App.css'
import Navigation from './Navigation.jsx'
import ClassSchedules, { buildClassSchedule } from './ClassSchedules.jsx'
import { MUNICIPALITIES_BY_COUNTY } from './swedishMunicipalities.js'
import { NATIONAL_EXAMS_2026_27, NATIONAL_EXAM_PERIODS_2026_27 } from './nationalExams.js'

const APP_TITLE = 'Årsplanering'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
const DEFAULT_WEEKS = 1
const WEEK_COLORS = ['#fffcf5', '#fff9fa', '#fafaff', '#f8fcf9', '#f8fbff', '#fffbf7']
const DAY_COLORS = ['#fff6f8', '#fffdf3', '#f6f8ff', '#f4fcf7', '#f8f6ff', '#fffaf5', '#f5fbfc']
function weekColor(weekStart) { const d = new Date(weekStart + 'T12:00:00'); return WEEK_COLORS[Math.floor((d.getDate() - 1) / 7) % WEEK_COLORS.length] }

function weekMonthLabel(iso) {
 const d = new Date(iso + 'T12:00:00')
 const y = d.getFullYear(), m = d.getMonth()
 const first = new Date(y,m,1), last = new Date(y,m+1,0)
 const monday = date => { const x = new Date(date); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x }
 const firstWeek = calendarWeekNumber(toIsoDate(monday(first)))
 const lastWeek = calendarWeekNumber(toIsoDate(monday(last)))
 const name = new Intl.DateTimeFormat('sv-SE',{month:'long'}).format(d)
 return name[0].toUpperCase()+name.slice(1)+' V'+firstWeek+'–V'+lastWeek
}
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
function SchoolYearPicker({ value, onChange }) {
  const currentYear = new Date().getFullYear()
  const currentStart = new Date().getMonth() >= 7 ? currentYear : currentYear - 1
  const parsed = Number(String(value || '').match(/\d{4}/)?.[0])
  const start = Number.isFinite(parsed) && parsed >= 1 ? parsed : currentStart
  const choose = year => onChange(`${year}–${year + 1}`)
  return <div className="school-year-picker">
    <button type="button" className="secondary" onClick={() => choose(start - 1)} aria-label="Föregående läsår">‹</button>
    <input type="number" min="1" step="1" aria-label="Läsårets startår" value={start} onChange={e => { const year = Number(e.target.value); if (Number.isInteger(year) && year > 0) choose(year) }} />
    <span>– {start + 1}</span>
    <button type="button" className="secondary" onClick={() => choose(start + 1)} aria-label="Nästa läsår">›</button>
    <button type="button" className="secondary" onClick={() => choose(currentStart)}>Aktuellt läsår</button>
  </div>
}
function emptyPlan() {
  return {
    title: '', subject: '', schoolYear: '', className: '', county: '', municipality: '', schoolForm: '', grade: '', course: '', textbook: '', schoolClosures: [],
    startDate: mondayOf(), startWeek: 1, entryType: 'lektion', lessonDisplay: 'bara-lektion', studentLayout: 'grid', studentColumns: 3, studentRows: 2, lessonsPerWeek: 3, lessonDays: ['Måndag', 'Onsdag', 'Fredag'], weeks: DEFAULT_WEEKS, weeksData: [],
    published: false, publicSlug: '', autoReleaseWeeks: false, visibleWeekCount: 2,
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
    items: [], lessons: Array.from({ length: plan.entryType === 'dag' ? 5 : Math.max(1, Math.min(8, Number(plan.lessonsPerWeek) || 3)) }, (_, i) => ({ name: plan.entryType === 'dag' ? WEEKDAYS[i] : `Lektion ${i + 1}`, day: plan.entryType === 'dag' ? WEEKDAYS[i] : (plan.lessonDays?.[i] || ''), topics: [] })),
  }))
}

// Bevara befintlig veckotext när startdatum eller antal veckor ändras.
function displayWeeks(plan) {
  const raw = Array.isArray(plan.weeksData) && plan.weeksData.length ? plan.weeksData : makeWeeks(plan)
  // Svenska ISO-veckor: datumet bestämmer alltid veckonumret, även för äldre sparade planer.
  // Ändra inte lärarens eget lektionsinnehåll eller egna veckorubriker.
  const source = raw.map(week => {
    const number = calendarWeekNumber(week.weekStart)
    if (number == null) return week
    const automaticTitle = !week.title || /^Vecka\s+\d+$/i.test(week.title)
    return { ...week, weekNumber: number, title: automaticTitle ? `Vecka ${number}` : week.title }
  })
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

// Alla importer normaliseras till samma veckor och lektionsfält som Grundplanering.
function distributeUnits(plan, units) {
  if (!units.length) throw new Error('Filen innehåller inga läsbara planeringsmoment.')
  const base = displayWeeks(plan)
  const capacity = Math.max(1,Math.min(8,Number(plan.lessonsPerWeek)||5))
  const groups = []
  let current = null
  for (const unit of units) {
    const week = Number(unit.week) || null
    if (!current || current.units.length >= capacity || (week && current.week !== week)) {
      current = {week,units:[]}
      groups.push(current)
    }
    current.units.push(unit)
  }
  return groups.map((group,index)=>{
    const template = base[index] || makeWeeks({...plan,startDate:addWeeks(base[0]?.weekStart||plan.startDate,index),weeks:1},1)[0]
    const lessons = Array.from({length:capacity},(_,i)=>{
      const unit=group.units[i]
      const previous=template.lessons?.[i]||{}
      return {...previous,name:previous.name||'Lektion '+(i+1),day:previous.day||plan.lessonDays?.[i]||'',
        topics:unit?[{name:unit.topic,description:[unit.chapter&&'Kapitel: '+unit.chapter,unit.details].filter(Boolean).join('\n'),pages:[],assignments:[],links:[]}]:[]}
    })
    const chapters=[...new Set(group.units.map(u=>u.chapter).filter(Boolean))]
    return {...template,chapter:chapters.join(' / '),content:group.units.map(u=>[u.chapter,u.topic].filter(Boolean).join(' – ')).join('\n'),
      items:group.units.map(u=>({text:[u.chapter,u.topic].filter(Boolean).join(' – ')})),lessons}
  })
}

function unitsFromText(text) {
  const lines=normalizeLines(text)
  const units=[]
  let chapter='',week=null,last=null
  for (const raw of lines) {
    const line=raw.replace(/^[-•*]\s*/,'').trim()
    if (!line || /^(?:innehållsförteckning|contents|delmoment|kapitel nr)$/i.test(line)) continue
    const weekMatch=line.match(/^(?:vecka|v\.)\s*(\d{1,2})(?:\s*[-–:]\s*(.*))?$/i)
    if (weekMatch) {week=Number(weekMatch[1]);if(weekMatch[2])chapter=weekMatch[2];last=null;continue}
    const chapterMatch=line.match(/^(?:kapitel|chapter)\s*\d*\s*[:.\-–]?\s*(.+)$/i)
    if(chapterMatch){chapter=chapterMatch[1].trim();last=null;continue}
    const lessonMatch=line.match(/^(?:lektion|pass)\s*\d+\s*[-–:.]?\s*(.*)$/i)
    if(lessonMatch){if(lessonMatch[1]){last={week,chapter,topic:lessonMatch[1],details:''};units.push(last)}else last=null;continue}
    if (/^(?:sida|sidor|sid\.|uppgifter|material|länk|mål)\s*[:\-]/i.test(line) && last) {
      last.details=[last.details,line].filter(Boolean).join('\n')
      continue
    }
    if (/^#{1,3}\s*/.test(line)){chapter=line.replace(/^#+\s*/,'');last=null;continue}
    last={week,chapter,topic:line,details:''}
    units.push(last)
  }
  return units
}

function unitsFromWorkbook(workbook) {
  const units=[]
  for(const sheetName of workbook.SheetNames) {
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:''})
    let headers=null,chapter='',week=null
    for(const row of rows) {
      const cells=row.map(value=>String(value??'').replace(/\s+/g,' ').trim())
      if(!cells.some(Boolean))continue
      const labels=cells.map(v=>v.toLowerCase())
      if(labels.some(v=>/^(kapitel|kapitel nr|delmoment|lektion|moment|innehåll|vecka|week|topic|chapter|område|rubrik)$/.test(v))) {
        headers=labels;continue
      }
      const find=(pattern)=>headers?.findIndex(v=>pattern.test(v))??-1
      const chapterCol=find(/^(kapitel|chapter|område)$/)
      const topicCol=find(/^(delmoment|moment|innehåll|topic|lektion|rubrik)$/)
      const weekCol=find(/^(vecka|week)$/)
      if(chapterCol>=0 && cells[chapterCol])chapter=cells[chapterCol]
      if(weekCol>=0 && /^\d{1,2}$/.test(cells[weekCol]))week=Number(cells[weekCol])
      if(topicCol>=0){
        const topic=cells[topicCol]
        if(topic)units.push({chapter,week,topic,details:cells.filter((v,i)=>v&&i!==chapterCol&&i!==topicCol&&i!==weekCol).join(' · ')})
        continue
      }
      const populated=cells.filter(Boolean)
      if(populated.length===1){
        const match=populated[0].match(/^(?:kapitel|chapter)\s*\d*\s*[:.\-–]?\s*(.+)$/i)
        if(match){chapter=match[1];continue}
      }
      // För tabeller utan kända rubriker: använd första kolumnen som område och sista som moment.
      if(populated.length>=2) {
        const topic=populated[populated.length-1]
        if(populated.length>=3 && populated[1])chapter=populated[1]
        else if(!chapter && populated[0]!==topic)chapter=populated[0]
        units.push({chapter,week,topic,details:''})
      }else if(populated.length===1 && !/^(?:titel|namn|ämne|kurs)$/i.test(populated[0])) {
        units.push({chapter,week,topic:populated[0],details:''})
      }
    }
  }
  return units
}

function distributeText(plan,text){return distributeUnits(plan,unitsFromText(text))}
function distributeChapterWorkbook(plan,workbook){return distributeUnits(plan,unitsFromWorkbook(workbook))}

// OCR laddas först när en bild eller en skannad PDF behöver tolkas.
let ocrScriptPromise
async function recognizeImage(source) {
  if (!ocrScriptPromise) ocrScriptPromise = new Promise((resolve,reject)=>{
    if (window.Tesseract) {resolve(window.Tesseract);return}
    const script=document.createElement('script')
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    script.onload=()=>window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Bildigenkänningen kunde inte startas.'))
    script.onerror=()=>reject(new Error('Bildigenkänningen kunde inte laddas. Kontrollera internetanslutningen.'))
    document.head.appendChild(script)
  }).catch(error=>{ocrScriptPromise=null;throw error})
  const engine=await ocrScriptPromise
  const result=await engine.recognize(source,'swe+eng')
  const text=result?.data?.text?.trim()||''
  if(!text)throw new Error('Ingen läsbar text hittades i bilden. Prova en tydligare bild.')
  return text
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
      // Bevara radbrytningar i PDF så veckor, kapitel och lektioner kan kännas igen.
      const rows = []
      for (const item of content.items) {
        if (!item.str?.trim()) continue
        const y = Math.round(item.transform?.[5] ?? 0)
        let row = rows.find(entry => Math.abs(entry.y-y) <= 3)
        if (!row) {row={y,parts:[]};rows.push(row)}
        row.parts.push({x:item.transform?.[4] ?? 0,text:item.str})
      }
      let pageText=rows.sort((a,b)=>b.y-a.y).map(row=>row.parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(' ').trim()).join('\n')
      if (!pageText.trim()) {
        const viewport=page.getViewport({scale:1.8})
        const canvas=document.createElement('canvas')
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
        const context=canvas.getContext('2d')
        await page.render({canvasContext:context,viewport}).promise
        pageText=await recognizeImage(canvas)
        canvas.width=0;canvas.height=0
      }
      pages.push(pageText)
    }
    const result=pages.join('\n')
    if(!result.trim()) throw new Error('Ingen läsbar text hittades i PDF-filen.')
    return result
  }
  if (/\\.(?:png|jpe?g|webp)$/i.test(name)) return recognizeImage(file)
  if (/\\.doc$/i.test(name)) throw new Error('Äldre Word-filer (.doc) stöds ännu inte. Spara som .docx för att importera.')
  throw new Error('Filtypen stöds inte. Använd Excel, DOCX, textbaserad PDF, CSV eller TXT.')
}

const TEXTBOOK_CATALOG = {
  Grundskola: {
    Matematik: ['Matte Direkt','Matematik XYZ','Favorit matematik','Prio Matematik','Koll på matematik','Eldorado','Matematik Alfa Beta Gamma','Milli matematik','Matte Direkt Triumf',"Singma matematik","Matematikboken","Pixel matematik","Prima matematik","Mondo matematik","Matematik X","Matematik Y","Matematik Z"],
    Svenska: ['Klara svenskan','Prima svenska','Simsalabim','Zick Zack','Spegla språket','Svenska impulser','Kontakt','Arkad','Jalla','Upptäck texten',"Svenska Direkt","Bums svenska","ABC-klubben","Läsresan","Språkskrinet","Robin"],
    Engelska: ['Awesome','Sparks',"What's Up?","Magic!","Wings","Good Stuff","New Champion","Happy"],
    Biologi: ['Spektrum','Titano','PULS',"Biologi Direkt","NO Direkt","Utkik Biologi"],
    Fysik: ['Spektrum','Titano','PULS',"Fysik Direkt","NO Direkt","Utkik Fysik"],
    Kemi: ['Spektrum','Titano','PULS',"Kemi Direkt","NO Direkt","Utkik Kemi"],
    Historia: ['SOL Nova','Utkik','Koll på',"Historia Direkt","SO Direkt","PULS Historia"],
    Geografi: ['SOL Nova','Utkik','Koll på',"Geografi Direkt","SO Direkt","PULS Geografi"],
    Samhällskunskap: ['SOL Nova','Utkik','Koll på',"Samhällskunskap Direkt","SO Direkt","PULS Samhällskunskap"],
    Religionskunskap: ['SOL Nova','Utkik','Koll på',"Religion Direkt","SO Direkt","PULS Religion"],
    Spanska: ['Qué bien',"¡Vale!","¡Vamos!","Caminando"], Franska: ['Bon Voyage','Chez nous',"Escalade","Allez hop!"], Tyska: ['Der Sprung','Alles Deutsch',"Lieber Deutsch","Genau!"],
    Teknik: ["Teknik Direkt","PULS Teknik"],
  },
  Gymnasiet: {
    Matematik: ['Matematik 5000+','Matematik 7000','Matematik Origo','CordaNova',"Matematik 5000","Matematik 4000","Exponent","M-serien"],
    Svenska: ['Svenska impulser','Människans texter','Helt enkelt','Språkporten',"Svenska rum","Svenska för livet"],
    Engelska: ['Blueprint','Solid Gold','Viewpoints',"Progress Gold","Echo","Blueprint A"],
    Fysik: ['Heureka',"Impuls Fysik","Ergo Fysik"], Kemi: ['Gymnasiekemi',"Kemiboken","Reaktion Kemi"], Biologi: ['Iris',"Biologi Campus","Spira Biologi"],
    Historia: ['Perspektiv på historien',"Alla tiders historia","Epok Historia"], Samhällskunskap: ['Reflex',"Forum Samhällskunskap","Kompass Samhällskunskap"],
    Naturkunskap: ['Frank','Synpunkt',"Insikt Naturkunskap"], Företagsekonomi: ['E3000',"Goodwill Företagsekonomi","E2000"],
    Religionskunskap: ["Under samma himmel"],
    Psykologi: ["Psykologi 1 och 2"],
    Filosofi: ["Filosofi 1 och 2"],
    Geografi: ["Geografi 1 och 2"],
    Spanska: ["Caminando"],
    Franska: ["Escalade"],
    Tyska: ["Lieber Deutsch"],
  }
}
const TEXTBOOK_PUBLISHERS = {
  'Matte Direkt':'Sanoma Utbildning','Matematik XYZ':'Liber','Favorit matematik':'Studentlitteratur',
  'Matematik 5000+':'Natur & Kultur','Matematik 5000':'Natur & Kultur','Matematik 7000':'Natur & Kultur',
  'Matematik Origo':'Sanoma Utbildning','Matematikboken':'Liber','Svenska Direkt':'Sanoma Utbildning',
  'Svenska impulser':'Sanoma Utbildning','Klara svenskan':'Natur & Kultur',
  'Spektrum':'Liber','SOL Nova':'Natur & Kultur','PULS':'Natur & Kultur',
  'Heureka':'Natur & Kultur','Blueprint':'Liber','Good Stuff':'Liber',
  'Prio Matematik':'Sanoma Utbildning','Eldorado':'Natur & Kultur',
  'Matematik Alfa Beta Gamma':'Liber','Zick Zack':'Sanoma Utbildning',
  'Simsalabim':'Sanoma Utbildning','Prima svenska':'Gleerups'
}
function booksForSubject(school, subject) {
  const group = TEXTBOOK_CATALOG[school] || {}
  const key = Object.keys(group).find(name => name.toLocaleLowerCase('sv') === String(subject).toLocaleLowerCase('sv'))
  return (key ? group[key] : []).map(title => ({
    title, subject:key || subject, school,
    publisher: TEXTBOOK_PUBLISHERS[title] || 'Förlag ej angivet',
    levels:school === 'Gymnasiet' ? 'Gymnasiet' : 'Grundskolan'
  })).sort((a,b) => a.title.localeCompare(b.title,'sv'))
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
    startDate: String(plan?.startDate || ''),
    classGroups: Array.isArray(plan?.classGroups) ? plan.classGroups.filter(g=>g && typeof g.name==='string').map(g=>({name:g.name.slice(0,80),startDate:String(g.startDate || plan.startDate || ''),days:Array.isArray(g.days)?g.days.filter(d=>['Måndag','Tisdag','Onsdag','Torsdag','Fredag'].includes(d)):[],extraSlots:Array.isArray(g.extraSlots)?g.extraSlots.filter(item=>item && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '')).map(item=>({date:item.date})):[],cancelledDates:Array.isArray(g.cancelledDates)?g.cancelledDates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)):[],lessonTimes:g.lessonTimes && typeof g.lessonTimes==='object'?g.lessonTimes:{},overrides:g.overrides && typeof g.overrides==='object'?g.overrides:{}})) : [],
    schoolYear: String(plan?.schoolYear || ''),
    grade: String(plan?.grade || ''),
    schoolForm: String(plan?.schoolForm || ''),
    schoolClosures: Array.isArray(plan?.schoolClosures) ? plan.schoolClosures.filter(item => validSchoolClosure(item) && sourceWeeks.some(week => { if (!week || week.hidden || !/^\d{4}-\d{2}-\d{2}$/.test(week.weekStart || '')) return false; const monday = new Date(week.weekStart + 'T12:00:00'); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return item.startDate <= toIsoDate(sunday) && item.endDate >= toIsoDate(monday) })).map(item => ({ name: item.name, startDate: item.startDate, endDate: item.endDate, verified: Boolean(item.verified) })) : [],
    published: true,
    autoReleaseWeeks: plan?.autoReleaseWeeks === true,
    visibleWeekCount: Math.max(1, Math.min(12, Number(plan?.visibleWeekCount) || 2)),
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
        autoVisibility: week.autoVisibility === true,
        keepVisibleExtra: week.keepVisibleExtra === true,
        publishDate: /^\d{4}-\d{2}-\d{2}$/.test(week.publishDate || '') ? week.publishDate : '',
        hideDate: /^\d{4}-\d{2}-\d{2}$/.test(week.hideDate || '') ? week.hideDate : '',
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

function Login({ email, password, setEmail, setPassword, onSubmit, onSignUp, status }) {
  const [registering, setRegistering] = useState(false)
  return <main className="shell narrow-shell">
    <section className="brand-card">
      <div className="brand-mark">Å</div>
      <p className="eyebrow">LÄRARPORTAL</p>
      <h1>{APP_TITLE}</h1>
      <p className="muted">Planera, importera, klona och publicera.</p>
    </section>
    <form className="card" onSubmit={registering ? onSignUp : onSubmit}>
      <h2>{registering ? 'Ansök om lärarkonto' : 'Logga in som lärare'}</h2>
      <label>E-post<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Lösenord<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="primary full" type="submit">{registering ? "Skapa konto" : "Logga in"}</button>
      <button type="button" className="secondary full" onClick={() => setRegistering(value => !value)}>{registering ? "Har du redan konto? Logga in" : "Ny lärare? Ansök om konto"}</button>
      {registering && <p className="muted">Använd din egen e-postadress och välj ett lösenord med minst 6 tecken. Du kan behöva bekräfta din e-post innan du loggar in.</p>}
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
  const exams = []
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

function StudentView({ plan, error, preview = false, printPage = null, printWeekStart = null, initialClass = "", hideSelector = false }) {
  const [page, setPage] = useState(0)
  const [singlePrintWeek, setSinglePrintWeek] = useState(null)
  const [previewClass, setPreviewClass] = useState(initialClass)
  const [linkCopied, setLinkCopied] = useState(false)
  useEffect(()=>{setLinkCopied(false)},[previewClass])
  const requestedClass = new URLSearchParams(window.location.search).get('klass')
  const selectedClass = (preview ? previewClass : requestedClass) && plan?.classGroups?.find(g => g.name === (preview ? previewClass : requestedClass))
  const classLessons = selectedClass ? buildClassSchedule(plan,selectedClass) : []
  // Grundplaneringens veckor är den enda källan för klassernas veckokort.
  // Klassens schema får bara placera lektioner i redan skapade veckor.
  const classWeeks = selectedClass ? (Array.isArray(plan?.weeksData) ? plan.weeksData : [])
    .filter(week => week && !week.hidden && week.weekStart)
    .map(week => ({
      ...week,
      lessons: classLessons
        .filter(item => mondayOf(item.date) === week.weekStart)
        .map(item => {
          const lesson = {...item.lesson,day:item.day,date:item.date,name:item.override?.text || item.lesson?.name || 'Lektion '+item.lessonNumber}
          if(item.override?.text) lesson.topics=[{name:item.override.text}]
          return lesson
        })
    })) : []

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
  const studentWeeks = Array.isArray(selectedClass ? classWeeks : plan?.weeksData) ? [...(selectedClass ? classWeeks : plan.weeksData)]
    .filter(week => week && (preview || !week.hidden) && (preview || (week.weekStart || '') <= toIsoDate(new Date())) && (preview || !week.hideDate || week.hideDate > toIsoDate(new Date())))
    .sort((a, b) => weekContentScore(b) - weekContentScore(a))
    .filter((week, index, weeks) => weeks.findIndex(other => (other.weekStart || `number-${other.weekNumber}`) === (week.weekStart || `number-${week.weekNumber}`)) === index)
    .sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''))
    .filter((week, index, all) => plan?.autoReleaseWeeks !== true || week.keepVisibleExtra === true || index >= all.length - Math.max(1, Math.min(12, Number(plan?.visibleWeekCount) || 2)))
    .sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || '')) : []
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
  if (!preview && requestedClass && plan && !selectedClass) return <main className="shell"><section className="card"><h2>Klassen hittades inte</h2><p>Kontrollera elevlänken med din lärare.</p></section></main>
  const previewClassSelector = preview && !hideSelector && plan?.classGroups?.length>0 && <div className="student-preview-classbar"><div className="student-preview-class-buttons"><button type="button" className={!previewClass?'active':''} onClick={()=>setPreviewClass('')}>📘 Grundplanering</button>{plan.classGroups.map(g=><button key={g.name} type="button" className={previewClass===g.name?'active':''} onClick={()=>setPreviewClass(g.name)}>🏫 {g.name}</button>)}</div><button type="button" className="student-class-copy-link" aria-label={linkCopied ? "Elevlänken kopierad" : "Kopiera elevlänk för "+(previewClass || "grundplaneringen")} title={linkCopied ? "Elevlänken kopierad" : "Kopiera elevlänk för "+(previewClass || "grundplaneringen")} disabled={!plan?.published||!plan?.publicSlug} onClick={async()=>{const url=window.location.origin+'/elev/'+encodeURIComponent(plan.publicSlug)+(previewClass?'?klass='+encodeURIComponent(previewClass):'');try{await navigator.clipboard.writeText(url);setLinkCopied(true)}catch{window.prompt('Kopiera elevlänk',url)}}}><span aria-hidden="true">{linkCopied?'✓':'🔗'}</span></button></div>
  if (!plan) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar planeringen...</p></section></main>
  return <>{previewClassSelector}<main style={planThemeStyle(plan)} className={`shell student-shell ${printPage === null ? "student-screen-view" : "student-print-page"} ${printPage !== null && visibleWeeks.length === 1 ? "student-print-spacious" : ""}`}>
    {printPage === null && <div className="student-print-action"><button type="button" className="secondary" onClick={() => window.print()}>🖨️ Skriv ut elevvyn</button></div>}
    {!preview && <header className="student-header student-header-simple">
      <h1 style={{ fontSize: 'clamp(2.6rem, 5vw, 4.5rem)', fontWeight: 900, lineHeight: 1.12, margin: '8px 0 24px' }}>{plan.title}</h1>
    </header>}
    {studentWeeks.length === 0 && <p className="card empty" role="status">{plan.autoReleaseWeeks ? "Ingen vecka är publicerad för elever ännu. Nästa vecka visas automatiskt när dess måndag börjar." : "Det finns inga synliga veckor i den här planeringen ännu."}</p>}
    <section className={gridMode ? 'year-grid student-matrix' : 'year-grid student-list'} style={gridMode ? { '--student-columns': columns, '--student-rows': rows } : undefined}>
      {visibleWeeks.map((week, index) => <div className="chapter-week-group" key={`${week.weekNumber}-${week.weekStart}`}>
        {week.chapter?.trim() && (gridMode || index === 0 || week.chapter !== visibleWeeks[index - 1]?.chapter) && <h2 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h2>}
        <article id={"student-week-" + week.weekStart} className="week-card student-week-card" style={studentWeekStyle(week.weekStart)}>

        <div className="week-top student-week-top">
          <div className="student-week-identity"><strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong><span className="calendar-month-corner calendar-tile-month">{weekMonthLabel(week.weekStart)}</span><span>{studentWeekDateRange(week.weekStart)}</span></div>
          {printPage !== null && studentMonthInfo(week.weekStart) && <div className="student-month-info" style={{ backgroundColor: studentMonthInfo(week.weekStart).color }}><strong>{studentMonthInfo(week.weekStart).name}</strong><span>{studentMonthInfo(week.weekStart).weeks}</span></div>}
        </div>
        {!/^Vecka\s+\d+$/i.test(week.title || '') && week.title?.trim() && <h3>{week.title}</h3>}
        <div className="week-content">{week.content || (!week.pages?.length && !week.assignments?.length && !week.links?.length && !week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length)) ? 'Ingen planering angiven ännu.' : '')}</div>
        <ImportantDatesForWeek week={week} plan={plan} />
        <LessonDetails week={week} entryType={plan.entryType || 'lektion'} lessonDisplay={plan.lessonDisplay || 'bara-lektion'} />
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
function WeekNumberEditor({week,index,onChange}) {
  const actual=calendarWeekNumber(week.weekStart)??week.weekNumber
  const [draft,setDraft]=useState(String(actual))
  useEffect(()=>setDraft(String(actual)),[actual,week.weekStart])
  const commit=()=>{
    const value=Number(draft)
    if(Number.isInteger(value)&&value>=1&&value<=53&&value!==actual)onChange(index,value)
    else setDraft(String(actual))
  }
  return <WeekNumberEditor week={week} index={index} onChange={shiftAllWeeks} /></strong><span style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatDate(week.weekStart)}</span>
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
        </section>)}
      </div>
      <div className="button-row week-add-actions">
        <button type="button" className="secondary" disabled={weeks.length >= 52} onClick={() => setPlan(p => {
          const existing = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
          // Välj sista veckan efter datum, inte högsta veckonumret (som nollställs vid nyår).
          const latest = [...existing].sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''))[0]
          const nextDate = addWeeks(latest?.weekStart || p.startDate, 1)
          const newWeek = makeWeeks({ ...p, startWeek: calendarWeekNumber(nextDate), startDate: nextDate, weeks: 1 }, 1)[0]
          return { ...p, weeks: existing.length + 1, weeksData: [...existing, newWeek] }
        })}>+ Lägg till vecka</button>
      </div>
      <div className="sticky-actions button-row">
        
        <span className="autosave-info" role="status">Ändringar sparas och publiceras automatiskt när lektionerna har innehåll.</span>
      </div>
      {isDirty && <p className="unsaved-notice" role="status">Osparade ändringar – välj Spara utkast innan du lämnar sidan.</p>}
      {status && <p className="status">{status}</p>}
    </section>
    </div>}
    {selectedId && calendarOpen && teacherTab !== "elevvy" && teacherTab !== "new" && <div id="teacher-year-calendar">{nationalExamsForPlan(plan).length > 0 && <p className="calendar-exam-note">Nationella prov – Skolverkets datum 2026/27 (kontrollerat 17 oktober 2026). Kontrollera aktuella provdatum hos Skolverket.</p>}{pendingImport && <section className="card import-preview" aria-live="polite" style={{marginBottom:14}}><h3>Förhandsgranska: {pendingImport.source}</h3><p>Filen har lästs in. Kontrollera innehållet innan du lägger in det i grundplaneringen.</p>{pendingImport.weeksData.slice(0,5).map((week,i)=><div key={i}><strong>Vecka {week.weekNumber}</strong><pre style={{whiteSpace:'pre-wrap',maxHeight:120,overflow:'auto'}}>{week.content || '(Tom vecka)'}</pre></div>)}<div className="button-row"><button type="button" className="primary" onClick={()=>{if(!confirmReplacingWeeks(plan))return;setPlan(p=>({...p,weeksData:pendingImport.weeksData,weeks:pendingImport.weeksData.length}));setPendingImport(null);setStatus('Excel-filen har lagts in i grundplaneringen. Klicka Spara för att behålla ändringarna.')}}>Använd import</button><button type="button" className="secondary" onClick={()=>setPendingImport(null)}>Avbryt</button></div></section>}{status && <p className="status" role="status">{status}</p>}<YearCalendar key="month-overview" onImportFile={importFile} fileImportState={fileImportState} onBackToPrevious={() => { if (openedFromLibrary) returnToPlanningTree(); else if (navigationIndex > 0) restoreNavigation(-1); else { setCalendarOpen(false); setTeacherTab('mina') } }} embedded={false} onOpen={() => setCalendarOpen(true)} startOnFirstWeek={weeks.length === 1} weeks={weeks} schoolClosures={plan.schoolClosures || []} nationalExams={nationalExamsForPlan(plan)} onClose={() => { setCalendarOpen(false); setTeacherTab("arsplan"); window.scrollTo({ top: 0, behavior: "smooth" }) }} onUpdateWeek={updateWeek} onSetAllVisibility={setAllWeeksVisibility} onAddWeek={() => setPlan(p => {
      const existing = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
      if (existing.length >= 52) return p
      const latest = [...existing].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0]
      const nextDate = addWeeks(latest.weekStart, 1)
      const newWeek = makeWeeks({ ...p, startDate: nextDate, startWeek: calendarWeekNumber(nextDate), weeks: 1 }, 1)[0]
      return { ...p, weeks: existing.length + 1, weeksData: [...existing, newWeek] }
    })} onUndo={undoPlan} canUndo={historyRef.current.past.length > 0} onDeleteWeek={weekStart => { if (busy || weeks.length <= 1) return; const week = weeks.find(item => item.weekStart === weekStart); if (!week) return; if (!window.confirm(`Vill du radera vecka ${calendarWeekNumber(weekStart) ?? week.weekNumber} och allt innehåll i den? Ändringen sparas först när du väljer Spara ändringar.`)) return; setPlan(p => { const remaining = displayWeeks(p).filter(item => item.weekStart !== weekStart); return remaining.length ? { ...p, weeks: remaining.length, weeksData: remaining } : p }) }} onSave={() => save(false)} isDirty={isDirty} busy={busy} saveStatus={status} entryType={plan.entryType} classGroups={plan.classGroups || []} onChangeClassGroups={groups=>setPlan(previous=>({...previous,classGroups:groups}))} classPlan={plan} publicSlug={plan.published ? plan.publicSlug || "" : ""} /></div>}

    <div className={`teacher-tab-panel ${simpleSetup ? "simple-setup-active" : ""}`} id="panel-lararvy" role="tabpanel" aria-labelledby="tab-lararvy" hidden={teacherTab !== "arsplan" && teacherTab !== "new"}>
    {simpleSetup && <section className="card simple-setup-card" aria-label="Skapa ny planering">
      <h2>Skapa planering</h2>
      <p className="muted">Ämne, skolform, årskurs och lärobok följer med från din valda mapp. Du kan lägga till klasser, lektioner och material efteråt.</p>
      <form onSubmit={event => { event.preventDefault(); void save(false) }}>
        <div style={{marginBottom:14}}>
          <label style={{display:"grid",gap:5}}><strong>Planeringens namn</strong><input required value={plan.title} onChange={event => setPlan(p => ({ ...p, title:event.target.value, subject: (!p.subject || p.subject===p.title) ? event.target.value : p.subject }))} placeholder="Exempel: Matematik 1b" /></label>
        </div>
        {creatingFromBranch && <p className="muted">📚 {plan.subject} · {plan.grade || plan.course} {plan.textbook ? "· 📘 " + plan.textbook : ""} · {plan.lessonsPerWeek} lektioner/vecka</p>}
        <details style={{margin:"10px 0 14px",padding:"10px 12px",border:"1px solid #e1d7c8",borderRadius:10}}>
          <summary style={{cursor:"pointer",fontWeight:600}}>Läsår och startdatum</summary>
          <div className="form-grid" style={{marginTop:12}}>
            <label>Läsår<SchoolYearPicker value={plan.schoolYear} onChange={schoolYear => setPlan(p => ({...p, schoolYear}))} /></label>
            <label>Startdatum<input type="date" required value={plan.startDate} onChange={event=>{if(event.target.value)setPlan(p=>({...p,startDate:mondayOf(`${event.target.value}T12:00:00`),weeksData:[]}))}} /></label>
          </div>
        </details>
        {simpleMore && <div className="simple-extra-fields"><h3>Fler uppgifter</h3><label>Ämne – välj i listan eller skriv ett eget<input list="planning-subject-options" value={plan.subject || ""} onChange={e => setPlan(p => ({...p,subject:e.target.value}))} placeholder="Välj eller skriv ämne, t.ex. Modersmål" /><datalist id="planning-subject-options">{["Matematik","Svenska","Svenska som andraspråk","Engelska","Biologi","Fysik","Kemi","Teknik","Historia","Geografi","Religionskunskap","Samhällskunskap","Idrott och hälsa","Bild","Musik","Slöjd","Hem- och konsumentkunskap","Moderna språk","Modersmål","Entreprenörskap"].map(subject => <option key={subject} value={subject} />)}</datalist></label><div className="form-grid">{!creatingFromBranch && <label>Skolform<select value={plan.schoolForm || ""} onChange={e => setPlan(p => ({ ...p, schoolForm: e.target.value, grade: "", course: "" }))}><option value="">Välj skolform</option><option value="Grundskola">Grundskolan</option><option value="Gymnasieskola">Gymnasiet</option></select></label>}<label>Årskurs<input value={plan.grade || ""} onChange={e => setPlan(p => ({ ...p, grade: e.target.value }))} placeholder="6" /></label>{!creatingFromBranch && <label>Lektioner per vecka<input type="number" min="1" max="8" value={plan.lessonsPerWeek} onChange={e => setPlan(p => ({ ...p, lessonsPerWeek: Math.max(1, Math.min(8, Number(e.target.value) || 1)) }))} /></label>}<label>Kommun<input value={plan.municipality || ""} onChange={e => setPlan(p => ({ ...p, municipality: e.target.value }))} /></label></div>
        </div>}
        <details className="simple-import-section" style={{marginTop:14}} aria-label="Importera underlag"><summary style={{cursor:"pointer",fontWeight:700}}>Importera underlag (valfritt)</summary>
          <h3>Importera underlag (valfritt)</h3>
          <p className="muted">Bifoga Excel, Word eller PDF, eller klistra in din planering här.</p>
          <label>Bifoga planering<input type="file" accept=".xlsx,.xls,.docx,.pdf,.txt,.csv" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) importFile(file) }} /></label>
          <label>Klistra in planering<textarea value={pasteText} placeholder="Klistra in din planering, kursplan eller lektionsinnehåll…" onChange={e => setPasteText(e.target.value)} /></label>
          <button type="button" className="secondary" disabled={busy || !pasteText.trim()} onClick={distributePastedText}>Importera inklistrad text</button>
          {pendingImport && <div className="import-preview"><h3>Förhandsgranska: {pendingImport.source}</h3><p>Granska innan du använder importen.</p>{pendingImport.weeksData.slice(0, 5).map((week, i) => <div key={i}><strong>Vecka {week.weekNumber}</strong><pre>{week.content || '(Tom vecka)'}</pre></div>)}<div className="button-row"><button type="button" className="primary" onClick={() => { if (!confirmReplacingWeeks(plan)) return; setPlan(p => ({ ...p, weeksData: pendingImport.weeksData, weeks: pendingImport.weeksData.length })); setPendingImport(null); setStatus('Importen är inlagd. Granska och skapa planeringen.') }}>Använd import</button><button type="button" className="secondary" onClick={() => setPendingImport(null)}>Avbryt</button></div></div>}
        </details>
        <div className="button-row"><button type="submit" className="primary" disabled={busy}>{busy ? 'Skapar…' : 'Skapa planering'}</button><button type="button" className="secondary" onClick={() => setSimpleMore(v => !v)}>{simpleMore ? "Dölj fler inställningar" : "Fler inställningar"}</button></div>
      </form>
      {status && <p className="status" role="status">{status}</p>}
    </section>}
    {status && <section className="card compact-status-card" aria-live="polite"><p className="status">{status}</p></section>}

    {false && !simpleSetup && <div className="unified-planning-form" aria-label="Inställningar och publicering"><h2 className="settings-publication-title">Inställningar och publicering</h2>
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
        <label>Läsår<SchoolYearPicker value={plan.schoolYear} onChange={schoolYear => setPlan(p => ({...p, schoolYear}))} /></label>
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
              !lesson.topics?.length && (!lesson.name || /^(Lektion \d+|Dag \d+|Måndag|Tisdag|Onsdag|Torsdag|Fredag)$/.test(lesson.name))
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


    {false && <>
    <details className="card optional-planning-section" aria-label="Skollov och studiedagar"><summary><strong>Skollov och studiedagar</strong><span>Lägg till lov och studiedagar vid behov</span></summary><div className="optional-planning-content">
      <h3>Skollov och studiedagar</h3>
      <p>Lägg själv till lov, studiedagar, röda dagar och nationella prov vid behov. Inget läggs in automatiskt.</p>
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

    <section className="card automatic-week-release" aria-label="Automatisk veckopublicering">
      <h3>Elevvisning och publicering</h3>
      <label className="automatic-release-toggle"><input type="checkbox" checked={plan.autoReleaseWeeks === true} disabled={busy} onChange={e => setPlan(p => ({ ...p, autoReleaseWeeks: e.target.checked }))} /> Visa veckor automatiskt enligt veckans publiceringsdatum</label>
      <label>Antal veckor som visas samtidigt för elever<input type="number" min="1" max="12" value={plan.visibleWeekCount || 2} onChange={e => setPlan(p => ({ ...p, visibleWeekCount: Math.max(1, Math.min(12, Number(e.target.value) || 2)) }))} /></label>
      <p className="muted">Dolda veckor visas inte. Du kan välja publiceringsdatum och döljningsdatum under Elevvisning i varje vecka.</p>
    </section>
    <section className="card publication-readiness" aria-label="Kontroll före publicering">
      <h3>Redo att publicera?</h3>
      <p><strong>{visibleTeacherWeeks.length}</strong> synliga veckor · <strong>{weeksWithContent.length}</strong> med innehåll · <strong>{weeks.length - visibleTeacherWeeks.length}</strong> dolda veckor</p>
      {publicationIssues.length ? <div role="status"><strong>Kontrollera:</strong><ul>{publicationIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></div> : <p className="publication-ready">✓ Grunduppgifterna är ifyllda. Granska elevvyn innan du publicerar.</p>}
      <p className="muted">Spara utkast eller välj Publicera för elever när planeringen är klar.</p>
    </section>
    </>}
    <section className="card calendar-primary-actions" aria-label="Spara och publicera årsplaneringen">
      <div className="button-row">
        <span className="autosave-info">Sparas automatiskt</span>
        <span className="autosave-info">Publiceras automatiskt när det finns innehåll</span>
        
      </div>
    </section>
    </div>}

    </div>
    <div className="teacher-tab-panel legacy-post-creation-panel" hidden={true}>
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

    <div className="button-row" aria-label="Spara planering"><button type="button" className="secondary" disabled={busy} onClick={() => save(false)}>Spara ändringar</button><span className="autosave-info">Publiceras automatiskt när det finns innehåll</span></div>
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
          <div className="week-top" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><label className="student-visibility-toggle week-heading-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} aria-label={`Visa vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber} för elever`} /><span>{week.hidden ? "Visa inte i elevvyn" : "Visa i elevvyn"}</span></label><strong style={{ fontSize: "1.45rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5 }}>Vecka <WeekNumberEditor week={week} index={index} onChange={shiftAllWeeks} /></strong><span style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatDate(week.weekStart)}</span>
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
          // Välj sista veckan efter datum, inte högsta veckonumret (som nollställs vid nyår).
          const latest = [...existing].sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''))[0]
          const nextDate = addWeeks(latest?.weekStart || p.startDate, 1)
          const newWeek = makeWeeks({ ...p, startWeek: calendarWeekNumber(nextDate), startDate: nextDate, weeks: 1 }, 1)[0]
          return { ...p, weeks: existing.length + 1, weeksData: [...existing, newWeek] }
        })}>+ Lägg till vecka</button>
      </div>
      <div className="sticky-actions button-row">
        
        <span className="autosave-info" role="status">Ändringar sparas och publiceras automatiskt när lektionerna har innehåll.</span>
      </div>
      {isDirty && <p className="unsaved-notice" role="status">Osparade ändringar – välj Spara utkast innan du lämnar sidan.</p>}
      {status && <p className="status">{status}</p>}
    </section>

    </details>

    </div>
    <div className="teacher-tab-panel" id="panel-elevvy" role="tabpanel" aria-labelledby="tab-elevvy" hidden={teacherTab !== "elevvy"}>
    {previewStudents && <section className="student-preview-clean" id="elevvy"><StudentView plan={{...sanitizeForStudents({ ...plan, weeksData: weeks }),published:plan.published,publicSlug:plan.publicSlug}} preview /></section>}

    </div>
    
    <div className="teacher-tab-panel" hidden={teacherTab !== "mina"}>
      <section className="card planning-start-card">
        <div className="section-heading"><div><h1>Vad vill du göra?</h1></div></div>
        <div className="home-tiles">
          <button type="button" className="home-tile" onClick={() => { setShowArchive(false); setLibrarySchool(''); setLibrarySubject(''); setLibraryBoardPage(0); setTeacherTab('bibliotek') }}><span className="home-tile-icon">📂</span><strong>Mina planeringar</strong><span>Öppna ämnen och kurser</span></button>
        </div>
      </section>
    </div>
    <div className="teacher-tab-panel" hidden={teacherTab !== "bibliotek"}>
    <section className="card" id="mina-arsplaneringar">

      {planSearch && plans.some(row => Boolean(parseContent(row.content)?.archived) === showArchive) && !plans.some(row => Boolean(parseContent(row.content)?.archived) === showArchive && [row.title, row.subject, row.class_name, row.school_year].some(value => String(value || "").toLocaleLowerCase("sv").includes(planSearch.trim().toLocaleLowerCase("sv")))) && <p className="muted">Inga planeringar matchar sökningen. Prova ett annat ord eller rensa sökningen.</p>}
      <div className="visual-planning-tree planning-board" id="planeringstrad"><div className="planning-board-bar"><button type="button" className="secondary" onClick={() => { if (librarySubject) setLibrarySubject(''); else if (librarySchool) setLibrarySchool(''); else setTeacherTab('mina'); setLibraryBoardPage(0) }}>← Tillbaka</button><strong>{librarySubject ? librarySubject.split('|')[1] : librarySchool || 'Mina planeringar'}</strong><div className="planning-board-tools"><button type="button" className="secondary" aria-pressed={showArchive} onClick={() => { setShowArchive(value => !value); setLibrarySchool(''); setLibrarySubject('') }}>{showArchive ? '📂 Visa aktiva' : '🗃 Arkiv'}</button><label htmlFor="library-year-select">Läsår</label><select id="library-year-select" value={libraryYear} onChange={event => { setLibraryYear(event.target.value); setLibrarySchool(''); setLibrarySubject('') }}><option value="alla">Alla läsår</option>{[...new Set(plans.map(row => String(row.school_year || parseContent(row.content)?.schoolYear || '').trim()).filter(Boolean))].sort((a,b) => b.localeCompare(a,'sv',{numeric:true})).map(year => <option key={year} value={year}>{year}</option>)}</select><button type="button" className="secondary" onClick={() => { const year = window.prompt('Nytt läsår (exempelvis 2027–2028):'); if (year?.trim()) { setLibraryYear(year.trim()); setLibrarySchool(''); setLibrarySubject('') } }}>＋ Läsår</button></div></div><div className="visual-tree-schools" ref={boardTreeRef}><div className="planning-tree-root-row"><div className="visual-tree-root">📂 Min planering</div></div>
                {Object.entries(plans.filter(row => Boolean(parseContent(row.content)?.archived) === showArchive && (libraryYear === 'alla' || String(row.school_year || parseContent(row.content)?.schoolYear || '').trim() === libraryYear) && [row.title, row.subject, row.class_name, row.school_year].some(value => String(value || "").toLocaleLowerCase("sv").includes(planSearch.trim().toLocaleLowerCase("sv")))).reduce((groups, row) => {
          const data = parseContent(row.content) || {}
          const grade = String(data.grade || row.grade || '').trim()
          const className = String(data.className || row.class_name || '').trim()
          const course = String(data.course || '').trim()
          const subjectName = String(data.subject || row.subject || '').trim()
          const title = String(row.title || '').trim()
          const courseName = course || [subjectName, title].find(value => /(?:matematik|svenska|engelska|fysik|kemi|biologi|historia|samhällskunskap)\s*\d+[a-z]?\b/i.test(value)) || ''
          const gradeMatch = grade.match(/(?:årskurs|åk)\s*(\d+)/i) || grade.match(/^(\d+)[A-Za-z]?$/) || className.match(/(?:årskurs|åk)\s*(\d+)/i) || className.match(/^(\d+)[A-Za-z]?$/) || title.match(/(?:årskurs|åk)\s*(\d+)/i) || title.match(/(?:matematik|svenska|engelska)\s+(\d)(?!\d)/i)
          const schoolSubject = (subjectName || title.match(/^[^\d–-]+/)?.[0] || 'Övriga ämnen').trim()
          const schoolForm = String(data.schoolForm || data.school_form || row.school_form || '').toLocaleLowerCase('sv')
          const isGymnasium = /gymnas/.test(schoolForm) || (!/grundskol/.test(schoolForm) && Boolean(courseName))
          const gradeLabel = isGymnasium ? 'Gymnasiet' : /grundskol/.test(schoolForm) || gradeMatch ? 'Grundskola' : 'Övriga planeringar'
          const subject = isGymnasium ? (subjectName || courseName.replace(/\\s+(?:nivå\\s+)?\\d+[a-z]?.*$/i, '') || 'Övriga ämnen') : (schoolSubject || 'Övriga ämnen')
          ;(groups[gradeLabel] ||= {})[subject] ||= []
          groups[gradeLabel][subject].push(row)
          return groups
        }, { Grundskola: Object.fromEntries((subjectFolders[session?.user?.id]?.Grundskola || []).map(name => [name, []])), Gymnasiet: Object.fromEntries((subjectFolders[session?.user?.id]?.Gymnasiet || []).map(name => [name, []])) })) .map(([grade, subjects]) => <section key={grade} className={"visual-tree-school " + (grade === "Gymnasiet" ? "school-gymnasiet" : "school-grundskola")}><div className="school-folder-heading"><button type="button" className="visual-tree-node" aria-expanded={librarySchool === grade} onClick={() => { setLibrarySchool(current => current === grade ? '' : grade); setLibrarySubject(''); setLibraryBoardPage(0) }}>📁 {grade} ({Object.values(subjects).reduce((count, rows) => count + rows.length, 0)})</button><button type="button" className="secondary school-folder-add" onClick={() => { const subject = window.prompt('Ämne:'); if (subject?.trim()) { const name=capitalizeFirstSwedish(subject.trim()); const uid=session?.user?.id; if (!uid) return; setSubjectFolders(current => { const userFolders=current[uid] || {}; const next={...current,[uid]:{...userFolders,[grade]:[...new Set([...(userFolders[grade] || []),name])]}}; localStorage.setItem('arsplanering-subject-folders',JSON.stringify(next));return next });setLibrarySchool(grade);setLibrarySubject(grade+'|'+name) } }}>＋ Ny planering</button></div>{librarySchool === grade && <><div className="visual-tree-courses">{!Object.keys(subjects).length && <p className="muted">Inga planeringar i denna kategori ännu.</p>}{Object.entries(subjects).filter(([subject]) => !librarySubject || librarySubject === grade + '|' + subject).sort(([a],[b]) => a.localeCompare(b, 'sv', { numeric: true })).map(([subject, rows]) => <div key={subject} className="visual-tree-course"><div className="subject-folder-heading"><button type="button" className="visual-tree-node" aria-expanded={librarySubject === grade + '|' + subject} onClick={() => { setLibrarySubject(current => current === grade + '|' + subject ? '' : grade + '|' + subject); setLibraryBoardPage(0) }} onDoubleClick={()=>{setEditingSubject(grade+'|'+subject);setEditingSubjectValue(subject)}} title="Visa kurser under ämnet"><span className="folder-chevron">{librarySubject === grade + '|' + subject ? '⌄' : '›'}</span> 📚 {editingSubject===grade+'|'+subject ? "" : subject}</button>{editingSubject===grade+'|'+subject && <input autoFocus className="subject-inline-rename" aria-label="Redigera ämnesnamn" value={editingSubjectValue} onChange={event=>setEditingSubjectValue(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setEditingSubject('');event.currentTarget.blur()}if(event.key==='Enter')event.currentTarget.blur()}} onBlur={async()=>{setEditingSubject('');
  if(busy)return;
  if(rows.some(row=>row.id===selectedId)&&isDirty){setStatus('Spara ändringarna i den öppna planeringen innan du byter ämnesnamn.');return}
  const name=capitalizeFirstSwedish(editingSubjectValue.trim());
  if(!name||name===subject)return;
  const uid=session?.user?.id;if(!uid)return;
  if(Object.keys(subjects).some(existing=>existing!==subject&&existing.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv'))){setStatus('Det finns redan ett ämne med det namnet.');return}
  setBusy(true);
  try {
    for(const row of rows){
      const stored=parseContent(row.content);
      if(!stored||typeof stored!=='object')throw new Error('En kursplanering kunde inte läsas.');
      const updated={...stored,subject:name};
      const {error}=await supabase.from('veckoplanering').update({subject:name,content:JSON.stringify(updated),updated_at:new Date().toISOString()}).eq('id',row.id).eq('user_id',uid);
      if(error)throw error;
      if(row.id===selectedId){setPlan(current=>({...current,subject:name}));savedPlanRef.current=JSON.stringify({...plan,subject:name});setSavedRevision(v=>v+1)}
    }
    setSubjectFolders(current=>{const folders=current[uid]||{};const next={...current,[uid]:{...folders,[grade]:[...new Set([...(folders[grade]||[]).filter(value=>value!==subject),name])]}};localStorage.setItem('arsplanering-subject-folders',JSON.stringify(next));return next});
    setLibrarySubject(grade+'|'+name);
    await loadPlans();
    setStatus('Ämnet har bytt namn till '+name+'.');
  }catch(error){await loadPlans();setStatus('Namnbytet kunde inte slutföras: '+(error.message||'Okänt fel'))}
  finally{setBusy(false)}

}} />}<button type="button" className="secondary subject-folder-add" onClick={() => { setCoursePicker({school:grade,subject,course:'',year:grade === 'Grundskola' ? 'Årskurs 7' : ''}) }}>＋ Ny kurs</button><button type="button" className="subject-folder-remove" disabled={busy} title="Ta bort ämnesmappen" onClick={() => { if(rows.length){window.alert("Ämnet innehåller kurser. Arkivera eller radera kursplaneringarna först.");return} if(!window.confirm("Ta bort ämnet "+subject+"?"))return;const uid=session?.user?.id;if(!uid)return;setSubjectFolders(current=>{const folders=current[uid]||{};const next={...current,[uid]:{...folders,[grade]:(folders[grade]||[]).filter(value=>value!==subject)}};localStorage.setItem("arsplanering-subject-folders",JSON.stringify(next));return next});setLibrarySubject("") }}>Ta bort ämne</button></div>{librarySubject === grade + '|' + subject && <>{grade === 'Gymnasiet' && rows.map(row => <div key={row.id} className="course-folder-with-delete"><button type="button" className="course-folder-link" style={{ "--folder-hue": [275, 145, 30, 340, 175][Array.from(row.title || "").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5] }} disabled={busy} onDoubleClick={event => {event.preventDefault();renamePlan(row)}} onClick={() => loadPlan(row)}>📁 {((parseContent(row.content) || {}).course || row.course || row.title)} <small style={{marginLeft:"auto",fontWeight:400,fontSize:11,opacity:.7}}>{(parseContent(row.content) || {}).textbook || ""}</small></button><button type="button" className="course-folder-archive" disabled={busy} onClick={() => setArchived(row,true)} title="Arkivera kursplaneringen" aria-label={"Arkivera " + row.title}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg></button><button type="button" className="course-folder-delete" disabled={busy} title="Radera denna planering" aria-label={"Radera " + row.title} onClick={() => deletePlan(row)}><span aria-hidden="true">×</span></button></div>)}{grade === 'Grundskola' && <div className="visual-tree-grade-folders">{Object.entries(rows.reduce((byGrade, row) => { const data = parseContent(row.content) || {}; const value = [data.grade, row.grade, data.className, row.class_name, row.title].map(item => String(item || '')).join(' '); const match = value.match(/(?:årskurs|åk)\s*(\d+)/i) || value.match(/(?:^|\s)([7-9])(?:[a-z])?(?:\s|$)/i); const label = match ? 'Årskurs ' + match[1] : (data.course || row.course || 'Övriga kurser'); (byGrade[label] ||= []).push(row); return byGrade }, {})).sort(([a],[b]) => a.localeCompare(b, 'sv', {numeric:true})).map(([label, gradeRows]) => <details key={label} className="visual-tree-grade-folder" style={{ "--folder-hue": ({ "Årskurs 7": 275, "Årskurs 8": 145, "Årskurs 9": 30 })[label] ?? [275, 145, 30, 340, 175][Array.from(label).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5] }}><summary className="visual-tree-node grade-folder-heading"><span>📁 {label}</span></summary><div className="textbook-plan-list">{gradeRows.map(row => { const data=parseContent(row.content)||{}; const gradeNumber=label.replace(/[^0-9]/g,''); const book=String(data.textbook||'').trim(); const displayName=book ? (gradeNumber && !book.endsWith(' '+gradeNumber) ? book+' '+gradeNumber : book) : (row.title||'Öppna planering'); return <div className="textbook-plan-row" key={row.id}><button type="button" disabled={busy} title={row.title||displayName} onDoubleClick={event=>{event.preventDefault();renamePlan(row)}} onClick={()=>loadPlan(row)}>📘 {displayName}</button><button type="button" className="course-folder-archive" disabled={busy} onClick={()=>setArchived(row,true)} title="Arkivera planeringen" aria-label={"Arkivera "+displayName}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg></button><button type="button" className="course-folder-delete" disabled={busy} title="Radera planeringen" aria-label={"Radera "+displayName} onClick={()=>deletePlan(row)}><span aria-hidden="true">×</span></button></div>})}</div></details>)}</div>}</>}</div>)}</div></>}</section>)}
      </div></div>
      <p className="muted">Arkivering döljer bara planeringen från den aktiva listan. Publicerade elevlänkar påverkas inte.</p>
    </section>
    </div>
  </>}
  </main>{coursePicker && <div className="textbook-picker-backdrop" role="presentation"><form className="textbook-picker course-create-dialog" role="dialog" aria-modal="true" aria-label="Skapa ny kurs" onSubmit={event => {event.preventDefault();if(!coursePicker.course.trim())return;setBookQuery('');setBookPicker({...coursePicker,course:coursePicker.course.trim()});setCoursePicker(null)}}><h3>Skapa ny kurs</h3><p>Välj kursen som ska ligga under ämnet.</p><label>Ämne<input value={coursePicker.subject} readOnly aria-label="Ämne" /></label><label>Kursens namn<input autoFocus value={coursePicker.course} onChange={event=>setCoursePicker({...coursePicker,course:capitalizeFirstSwedish(event.target.value)})} placeholder={coursePicker.school === 'Gymnasiet' ? 'Exempel: Matematik 1b' : 'Exempel: Matematik åk 7'} required /></label>{coursePicker.school === 'Grundskola' && <label>Årskurs<select value={coursePicker.year} onChange={event=>setCoursePicker({...coursePicker,year:event.target.value})}>{Array.from({length:9},(_,i)=><option key={i+1} value={'Årskurs '+(i+1)}>Årskurs {i+1}</option>)}</select></label>}<div className="textbook-picker-actions"><button type="button" onClick={()=>setCoursePicker(null)}>← Tillbaka</button><button type="submit" disabled={!coursePicker.course.trim()}>Framåt →</button></div></form></div>}{bookPicker && <div className="textbook-picker-backdrop" role="presentation"><section className="textbook-picker" role="dialog" aria-modal="true" aria-label="Välj lärobok"><h3>Välj lärobok</h3><p><strong>Ämne:</strong> {bookPicker.subject} · <strong>Kurs:</strong> {bookPicker.course}</p><p>Sök bland svenska läromedelsserier. Förlag visas där uppgiften finns i katalogen. Du kan också skriva ett eget namn.</p><input autoFocus type="search" value={bookQuery} onChange={event => setBookQuery(event.target.value)} placeholder="Sök titel, förlag eller ämne…" /><div className="textbook-picker-results">{bookChoices.map(book => <button type="button" key={book.title} onClick={() => confirmBook(book.title)}><strong>📘 {book.title}</strong><small style={{display:"block",marginLeft:25,opacity:.75}}>{book.publisher} · {book.subject} · {book.levels}</small><small style={{display:"block",marginLeft:25,marginTop:4,fontWeight:700}}>Välj och skapa planering →</small></button>)}</div><div className="textbook-picker-actions"><button type="button" onClick={() => {setCoursePicker(bookPicker);setBookPicker(null)}}>← Tillbaka</button><button type="button" disabled={!bookQuery.trim()} onClick={() => confirmBook(bookQuery.trim())}>Skapa planering med eget boknamn</button></div></section></div>}</div>
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

const GYMNASIUM_DEMO_COURSES = [
  {id:'mat1b',subject:'Matematik',course:'Matematik 1b',book:'Matematik 5000+',classes:[['EK25A',['Måndag','Onsdag','Fredag']],['EK25B',['Tisdag','Torsdag']],['SA25A',['Måndag','Torsdag']]],topics:['Algebraiska uttryck','Ekvationer','Procent och förändringsfaktor','Linjära funktioner','Problemlösning']},
  {id:'mat2b',subject:'Matematik',course:'Matematik 2b',book:'Matematik Origo',classes:[['EK24A',['Måndag','Torsdag']],['SA24A',['Tisdag','Fredag']]],topics:['Andragradsekvationer','Parabler','Statistik','Logaritmer','Modellering']},
  {id:'sv1',subject:'Svenska',course:'Svenska nivå 1',book:'Svenska impulser',classes:[['NA25A',['Måndag','Onsdag']],['TE25A',['Tisdag','Fredag']]],topics:['Muntlig framställning','Argumenterande text','Källkritik','Litterär analys','Respons och bearbetning']},
  {id:'en1',subject:'Engelska',course:'Engelska nivå 1',book:'Blueprint',classes:[['EK25A',['Tisdag','Fredag']],['SA25B',['Måndag','Torsdag']]],topics:['Reading strategies','Discussion','Writing a review','Listening comprehension','Presentations']},
  {id:'hi1b',subject:'Historia',course:'Historia nivå 1b',book:'Perspektiv på historien',classes:[['SA25A',['Tisdag','Torsdag']],['SA25B',['Måndag','Fredag']]],topics:['Historiska källor','Industrialiseringen','Demokratisering','1900-talets konflikter','Historiebruk']}
]
function gymnasiumDemoPlan(course) {
  const plan={...emptyPlan(),title:'DEMO · '+course.course,subject:course.subject,course:course.course,textbook:course.book,schoolForm:'gymnasiet',schoolYear:'2026–2027',startDate:'2026-10-19',weeks:3,lessonsPerWeek:5,studentLayout:'list'}
  const weeks=makeWeeks(plan,3).map((week,wi)=>({...week,lessons:Array.from({length:5},(_,li)=>{const topic=course.topics[(wi*5+li)%course.topics.length];return {name:topic,topics:[{name:topic+' – övningar och diskussion',pagesLabel:'Exempelsidor '+(10+wi*10+li*2)+'–'+(11+wi*10+li*2),assignmentsLabel:'Uppgift '+(li+1)+'–'+(li+4)}]}})}))
  return sanitizeForStudents({...plan,weeksData:weeks,classGroups:course.classes.map(([name,days],i)=>({name,startDate:'2026-10-19',days,lessonTimes:Object.fromEntries(days.map((day,j)=>[day,[i%2===0?'09:00':'10:15']])),cancelledDates:[],overrides:{}}))})
}
function GymnasiumDemoIndex() {
  return <main className="shell gym-demo-index"><section className="card"><p className="eyebrow">SEPARAT DEMOMILJÖ · FIKTIVA UPPGIFTER</p><h1>Gymnasiet – testkurser</h1><p>Fem fiktiva kurser med olika klasser och lektionsscheman. Demot sparar ingenting i ditt konto eller i Supabase.</p><div className="gym-demo-courses">{GYMNASIUM_DEMO_COURSES.map(course=><article className="gym-demo-course" key={course.id}><h2>{course.subject} · {course.course}</h2><p>📘 {course.book}</p><div className="gym-demo-classlinks">{course.classes.map(([name])=><a key={name} href={'/elev/demo-gymnasiet-'+course.id+'?klass='+encodeURIComponent(name)}>🔗 Elevvy {name}</a>)}</div><a href={'/elev/demo-gymnasiet-'+course.id}>Visa gemensam planering →</a></article>)}</div></section></main>
}

function AnnualApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [studentPlan, setStudentPlan] = useState(null)
  const [studentError, setStudentError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [access, setAccess] = useState(null)
  const [accountInfo,setAccountInfo] = useState(null)
  const [extensionNotice,setExtensionNotice] = useState('')
  const [accessLoading, setAccessLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [adminError, setAdminError] = useState('')
  const [adminNotice, setAdminNotice] = useState('')
  const [reviewingUserId, setReviewingUserId] = useState(null)
  const [showApprovedTeachers, setShowApprovedTeachers] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const isAdmin = session?.user?.id === 'fa85f509-bf1c-43c4-bc82-78777232a339'

  useEffect(() => {
    if (!session?.user?.id) { setAccess(null); setAccessLoading(false); return }
    let cancelled = false
    setAccessLoading(true)
    supabase.from('teacher_access').select('status,timer_period,expires_at,extension_requested').eq('user_id', session.user.id).maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error) { setAccess('error'); setAccessLoading(false); return }
        if (!data) {
          const result = await supabase.from('teacher_access').insert({ user_id: session.user.id })
          if (cancelled) return
          setAccess(result.error ? 'error' : 'pending')
        } else { setAccountInfo(data); setAccess(data.status === 'approved' && data.expires_at && new Date(data.expires_at).getTime() <= Date.now() ? 'expired' : data.status) }
        setAccessLoading(false)
      })
    return () => { cancelled = true }
  }, [session?.user?.id])

  async function loadRequests() {
    const { data, error } = await supabase.rpc('admin_list_teacher_accounts')
    if (error) setAdminError('Kunde inte läsa ansökningarna.')
    else { setRequests(data || []); setAdminError('') }
  }

  useEffect(() => { if (isAdmin && access === 'approved') loadRequests() }, [isAdmin, access])

  async function reviewRequest(userId, approve) {
    if (reviewingUserId) return
    const applicant = requests.find(item => item.user_id === userId)
    const email = applicant?.email || 'lärarkontot'
    if (!window.confirm(`${approve ? 'Godkänna' : 'Avslå'} ansökan för ${email}?`)) return
    setReviewingUserId(userId)
    setAdminNotice('')
    setAdminError('')
    try {
      const { error } = await supabase.rpc('admin_review_teacher_request', { p_user_id: userId, p_approve: approve })
      if (error) { setAdminError(`Kunde inte ${approve ? 'godkänna' : 'avslå'} ${email}. Försök igen.`); return }
      setRequests(previous => previous.map(item => item.user_id === userId ? { ...item, status: approve ? 'approved' : 'rejected' } : item))
      await loadRequests()
      setAdminNotice(`${email} har ${approve ? 'godkänts' : 'avslagits'}.`)
    } catch (error) {
      setAdminError(`Kunde inte ändra ansökan för ${email}: ${error?.message || 'Okänt fel'}.`)
    } finally { setReviewingUserId(null) }
  }

  async function changeTeacher(userId, action, period = null) {
    if (reviewingUserId) return
    const email = requests.find(item => item.user_id === userId)?.email || 'lärarkontot'
    if ((action === 'block' || action === 'activate') && !window.confirm(`${action === 'block' ? 'Ta bort åtkomsten för' : 'Återge åtkomst till'} ${email}? ${action === 'block' ? 'Lärarens planeringar sparas och kontot kan återaktiveras.' : ''}`)) return
    setReviewingUserId(userId)
    setAdminError('')
    setAdminNotice('')
    try {
      const { error } = await supabase.rpc('admin_set_teacher_access', { p_user_id: userId, p_action: action, p_period: period })
      if (error) { setAdminError(`Ändringen för ${email} kunde inte sparas: ${error.message}`); return }
      await loadRequests()
      const descriptions = { block: 'spärrats', activate: 'återaktiverats', timer: 'fått uppdaterad giltighetstid', extend: 'fått förlängd giltighetstid' }
      setAdminNotice(`${email} har ${descriptions[action] || 'uppdaterats'}.`)
    } catch (error) {
      setAdminError(`Ändringen för ${email} misslyckades: ${error?.message || 'Okänt fel'}.`)
    } finally { setReviewingUserId(null) }
  }

  async function setTeacherExpiry(userId, email) {
    if (reviewingUserId) return
    const date = window.prompt('Ange slutdatum för ' + email + ' (ÅÅÅÅ-MM-DD):')
    if (date === null) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) { setAdminError('Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.'); return }
    if (!window.confirm('Ändra slutdatum för ' + email + ' till ' + date + '?')) return
    setReviewingUserId(userId)
    setAdminError('')
    setAdminNotice('')
    try {
      const { error } = await supabase.rpc('admin_set_teacher_expiry', { p_user_id: userId, p_date: date })
      if (error) { setAdminError('Slutdatum för ' + email + ' kunde inte sparas: ' + error.message); return }
      await loadRequests()
      setAdminNotice('Slutdatum har uppdaterats för ' + email + '.')
    } catch (error) {
      setAdminError('Slutdatum för ' + email + ' kunde inte sparas: ' + (error?.message || 'Okänt fel'))
    } finally { setReviewingUserId(null) }
  }

  const isPublicDemo = window.location.pathname.replace(/\/$/, '') === '/elev/demo-vecka-42'
  const isGymnasiumDemoIndex = window.location.pathname.replace(/\/$/, '') === '/demo/gymnasiet'
  const gymnasiumDemoId = window.location.pathname.match(/^\/elev\/demo-gymnasiet-([a-z0-9]+)\/?$/)?.[1]

  const studentSlug = useMemo(() => {
    const match = window.location.pathname.match(/^\/elev\/([^/]+)\/?$/)
    return match ? decodeURIComponent(match[1]) : null
  }, [])

  useEffect(() => {
    if (isPublicDemo) { setStudentPlan(publicDemoWeek42()); setLoading(false); return undefined }
    if (gymnasiumDemoId) { const course=GYMNASIUM_DEMO_COURSES.find(item=>item.id===gymnasiumDemoId);if(course)setStudentPlan(gymnasiumDemoPlan(course));else setStudentError('Demokursen finns inte.');setLoading(false);return undefined }
    if (isGymnasiumDemoIndex) { setLoading(false); return undefined }
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
    if (error) setStatus(error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '') ? 'E-postadressen är inte bekräftad. Öppna bekräftelsemejlet från Supabase och klicka på länken innan du loggar in.' : `Inloggningen misslyckades: ${error.message || 'Okänt fel'} (${error.code || 'ingen felkod'}).`)
    else { setPassword(''); setStatus('') }
  }

  async function signUp(event) {
    event.preventDefault()
    if (password.length < 6) { setStatus('Lösenordet måste ha minst 6 tecken.'); return }
    setStatus('Skapar konto...')
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + '/' } })
    if (error) { setStatus('Kunde inte skapa konto. ' + error.message); return }
    setPassword('')
    setStatus(data.session ? 'Kontot är skapat. Vänta på administratörens godkännande.' : 'Kontot är registrerat. Bekräfta din e-postadress och vänta på administratörens godkännande.')
  }

  if (loading) return <><Navigation /><main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar...</p></section></main></>
  if (isGymnasiumDemoIndex) return <><Navigation /><GymnasiumDemoIndex /></>
  if (studentSlug) return <><Navigation /><StudentView plan={studentPlan} error={studentError} /></>
  if (!session) return <><Navigation /><Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} onSubmit={login} onSignUp={signUp} status={status} /></>
  if (accessLoading) return <><Navigation /><main className="shell"><section className="card"><h2>Kontrollerar lärarbehörighet…</h2></section></main></>
  if (access !== 'approved') return <><Navigation /><main className="shell narrow-shell"><section className="card"><h1>Ansökan om lärarkonto</h1><p>{access === 'pending' ? 'Ditt konto väntar på administratörens godkännande.' : access === 'rejected' ? 'Din ansökan har avslagits.' : access === 'blocked' ? 'Ditt konto är spärrat. Dina planeringar finns kvar.' : access === 'expired' ? 'Kontots giltighetstid har gått ut. Dina planeringar finns kvar.' : 'Behörigheten kunde inte kontrolleras. Försök igen senare.'}</p><button type="button" onClick={() => supabase.auth.signOut()}>Logga ut</button></section></main></>
  if (isAdmin) {
    const colleagues = requests.filter(item => item.user_id !== session.user.id)
    const pending = colleagues.filter(item => item.status === 'pending')
    const approved = colleagues.filter(item => item.status === 'approved')
    const rejected = colleagues.filter(item => item.status === 'rejected')
    return <TeacherApp key={session.user.id} session={session} isAdmin adminOpen={showAdminPanel} pendingCount={pending.length} onToggleAdmin={() => setShowAdminPanel(value => !value)} adminContent={<>
      <UpdateNotices userId={session.user.id} isAdmin approvedTeachers={approved} />
      <section className="card" id="admin-teacher-panel">
      <h2>Administratör – lärarkonton</h2>
      <p>Endast du kan godkänna nya lärarkonton.</p>
      {adminError && <p role="alert">{adminError}</p>}
      {adminNotice && <p role="status" style={{ padding: 12, border: '1px solid #27844a', borderRadius: 8, background: '#e9f7ed', color: '#165b30', fontWeight: 700 }}>✓ {adminNotice}</p>}
      <h3>Väntande ansökningar ({pending.length})</h3>
      {pending.length === 0 && <p>Inga ansökningar väntar på godkännande.</p>}
      {pending.map(item => <div key={item.user_id} style={{ padding: 12, borderBottom: '1px solid #ddd' }}>
        <strong>{item.email}</strong> – Väntar på godkännande{' '}
        <button type="button" disabled={Boolean(reviewingUserId)} onClick={() => reviewRequest(item.user_id, true)}>{reviewingUserId === item.user_id ? 'Sparar…' : 'Godkänn'}</button>{' '}
        <button type="button" disabled={Boolean(reviewingUserId)} onClick={() => reviewRequest(item.user_id, false)}>Avslå</button>
      </div>)}
      <h3><button type="button" aria-expanded={showApprovedTeachers} aria-controls="approved-teachers-list" onClick={() => setShowApprovedTeachers(value => !value)}>{showApprovedTeachers ? "▾ Dölj" : "▸ Visa"} godkända lärare ({approved.length})</button></h3>
      {showApprovedTeachers && <div id="approved-teachers-list">{approved.length === 0 && <p>Inga kollegor är godkända ännu.</p>}{approved.map(item => <div key={item.user_id} style={{ padding: 12, borderBottom: '1px solid #ddd' }}><strong>{item.email}</strong> – ✓ Godkänd</div>)}</div>}
      <h3>Kontomatris – timer och behörighet</h3>
      <p>Ta bort åtkomst spärrar lärarens inloggning till planeringen utan att radera kontot eller sparade planeringar. Du kan återge åtkomsten senare.</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>Lärare</th><th>Status</th><th>Timer</th><th>Gäller till</th><th>Åtgärder</th></tr></thead><tbody>
      {colleagues.filter(item=>item.status==='approved'||item.status==='blocked').map(item=><tr key={item.user_id}>
        <td style={{padding:8}}>{item.email}{item.extension_requested&&<strong> – Begär förlängning</strong>}</td>
        <td>{item.status==='blocked'?'Spärrad':item.expires_at&&new Date(item.expires_at)<=new Date()?'Utgången':'Aktiv'}</td>
        <td><select aria-label={'Timer för '+item.email} value={item.timer_period||'none'} disabled={Boolean(reviewingUserId)} onChange={e=>changeTeacher(item.user_id,'timer',e.target.value)}><option value="none">Ingen</option><option value="month">1 månad</option><option value="year">1 år</option></select></td>
        <td>{item.expires_at?new Date(item.expires_at).toLocaleDateString('sv-SE'):'Ingen gräns'}{' '}{item.timer_period!=='none'&&<button type="button" disabled={Boolean(reviewingUserId)||item.status!=='approved'} onClick={()=>setTeacherExpiry(item.user_id,item.email)}>Ändra datum</button>}</td>
        <td><button type="button" disabled={Boolean(reviewingUserId)} onClick={()=>changeTeacher(item.user_id,item.status==='blocked'?'activate':'block')}>{item.status==='blocked'?'Återge åtkomst':'Ta bort åtkomst'}</button>{' '}<button type="button" disabled={Boolean(reviewingUserId)||item.timer_period==='none'} onClick={()=>changeTeacher(item.user_id,'extend')}>Förläng</button></td>
      </tr>)}</tbody></table></div>
      {rejected.length > 0 && <><h3>Avslagna ansökningar ({rejected.length})</h3>{rejected.map(item => <div key={item.user_id} style={{ padding: 12, borderBottom: '1px solid #ddd' }}><strong>{item.email}</strong> – Avslagen</div>)}</>}
      <button type="button" onClick={loadRequests}>Uppdatera listorna</button>
      </section>
    </>} />
  }
  const daysLeft=accountInfo?.expires_at?Math.max(0,Math.ceil((new Date(accountInfo.expires_at).getTime()-Date.now())/86400000)):null
  return <><TeacherApp key={session.user.id} session={session} />{daysLeft!==null&&<aside style={{position:'fixed',bottom:12,right:12,zIndex:9999,background:'#fff4db',border:'2px solid #a66a00',borderRadius:12,padding:16,maxWidth:340,boxShadow:'0 4px 20px #0003'}} role="status"><strong>Ditt konto gäller till {new Date(accountInfo.expires_at).toLocaleDateString('sv-SE')} ({daysLeft} dagar kvar)</strong>{daysLeft<=30&&<p>Vill du behålla kontot? Begär förlängning hos administratören.</p>}{daysLeft<=30&&<button type="button" disabled={accountInfo.extension_requested} onClick={async()=>{const {error}=await supabase.rpc('request_teacher_extension');if(error)setExtensionNotice('Kunde inte skicka begäran.');else{setAccountInfo(p=>({...p,extension_requested:true}));setExtensionNotice('Begäran skickad till administratören.')}}}>{accountInfo.extension_requested?'Begäran skickad':'Begär förlängning'}</button>}{extensionNotice&&<p>{extensionNotice}</p>}</aside>}</>
}

class AppErrorBoundary extends Component {
  constructor(props) {super(props);this.state={error:null}}
  static getDerivedStateFromError(error) {return {error}}
  componentDidCatch(error,info) {console.error('Årsplanering: visningsfel',error,info)}
  render() {
    if(!this.state.error)return this.props.children
    return <main style={{maxWidth:740,margin:'48px auto',padding:24,fontFamily:'system-ui',color:'#213547'}}>
      <h1>Årsplanering kunde inte visas</h1>
      <p>Ett fel inträffade när sidan öppnades. Dina sparade planeringar har inte ändrats.</p>
      <div style={{padding:14,border:'1px solid #d9a8a8',borderRadius:10,background:'#fff7f7',overflowWrap:'anywhere'}}>
        <strong>Felmeddelande:</strong> {this.state.error.message||String(this.state.error)}
      </div>
      <button type="button" style={{marginTop:18,padding:'10px 18px',cursor:'pointer'}} onClick={()=>window.location.reload()}>Försök igen</button>
      <p style={{fontSize:13,marginTop:20}}>Skicka gärna en bild av felmeddelandet så kan vi rätta orsaken.</p>
    </main>
  }
}
export default function App() { return <AppErrorBoundary><AnnualApp /></AppErrorBoundary> }

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
  const normalizeLessonOrder = items => items.map((lesson, index) => ({ ...lesson, name: `Lektion ${index + 1}` }))
  const moveLesson = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= lessons.length) return
    const next = [...lessons]
    const sourceDay = next[index].day
    const targetDay = next[target].day
    ;[next[index], next[target]] = [next[target], next[index]]
    next[index] = { ...next[index], day: sourceDay }
    next[target] = { ...next[target], day: targetDay }
    changeLessons(normalizeLessonOrder(next))
  }
  return <div className="lessons">
    {lessons.map((lesson, i) => ({ lesson, i })).sort((a, b) => editable ? a.i - b.i : (WEEKDAYS.indexOf(a.lesson.day || a.lesson.name) + 5) % 5 - (WEEKDAYS.indexOf(b.lesson.day || b.lesson.name) + 5) % 5).map(({ lesson, i }) => <section className="lesson" key={i}>
      <div className="lesson-heading">
        {editable ? <div className="lesson-edit-heading" style={{ '--lesson-day-color': DAY_COLORS[Math.max(0, WEEKDAYS.indexOf(entryType === 'dag' ? lesson.name : lesson.day)) % DAY_COLORS.length] }}>
          <span className="lesson-number-inline">{entryType === 'dag' ? (lesson.name || WEEKDAYS[i]) : (lesson.day || 'Välj dag')} · {entryType === 'dag' ? `Lektion ${i + 1}` : `Lektion ${i + 1}`}{lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day) ? ` · ${lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day)}` : ''}</span>
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
        {editable && entryType !== 'dag' && <div className="lesson-reorder-controls"><button type="button" disabled={i === 0} aria-label={`Flytta lektion ${i + 1} uppåt`} onClick={() => moveLesson(i, -1)}>↑ Flytta upp</button><button type="button" disabled={i === lessons.length - 1} aria-label={`Flytta lektion ${i + 1} nedåt`} onClick={() => moveLesson(i, 1)}>↓ Flytta ned</button></div>}
        {editable && <button type="button" className="remove-small" onClick={() => { if (!(lesson.topics || []).some(topic => topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm(entryType === 'dag' ? 'Ta bort dagen och allt innehåll i den?' : 'Ta bort lektionen och allt innehåll i den?')) changeLessons(entryType === 'dag' ? lessons.filter((_, index) => index !== i) : normalizeLessonOrder(lessons.filter((_, index) => index !== i))) }}>× Ta bort {entryType === 'dag' ? 'dag' : 'lektion'}</button>}
      </div>
      {(lesson.topics || []).map((topic, j) => ({ topic, j })).filter(({ topic }) => (editable || topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || '')))).map(({ topic, j }) => {
        const updateTopic = next => changeLesson(i, { ...lesson, topics: (lesson.topics || []).map((item, index) => index === j ? next : item) })
        const pages = Array.isArray(topic.pages) ? topic.pages : []
        const assignments = Array.isArray(topic.assignments) ? topic.assignments : []
        const links = Array.isArray(topic.links) ? topic.links : []
        const lastFilledRow = values => values.reduce((last, value, index) => String(value ?? '').trim() ? index + 1 : last, 0)
        const rows = editable ? Math.max(1, pages.length, assignments.length) : Math.max(lastFilledRow(pages), lastFilledRow(assignments))
        return <div className="topic" key={j}>
          <div className={`topic-grid ${topic.hidePages ? "without-pages" : ""} ${topic.hideAssignments ? "without-assignments" : ""}`}>
            <div className="topic-name">{editable ? <textarea aria-label="Momentets namn" placeholder="Exempel: Procent – tryck Enter för ny rad" rows={Math.max(2, String(topic.name || '').split('\n').length)} value={topic.name || ''} onChange={e => updateTopic({ ...topic, name: e.target.value })} /> : <strong className="topic-name-display">{topic.name || 'Moment'}</strong>}</div>
            {['pages', 'assignments'].filter(field => !topic[field === 'pages' ? 'hidePages' : 'hideAssignments']).map(field => <div className={`topic-column ${field}`} key={field}>
              <div className="topic-fixed-heading"><h5>{field === 'pages' ? 'Sida' : 'Uppgift'}</h5>{editable && <button type="button" className="remove-small remove-topic-column" title={`Ta bort hela ${field === 'pages' ? 'Sida' : 'Uppgift'}-rutan`} aria-label={`Ta bort hela ${field === 'pages' ? 'Sida' : 'Uppgift'}-rutan`} onClick={() => { if ((field === 'pages' ? pages : assignments).some(value => String(value).trim()) && !window.confirm(`Dölj hela ${field === 'pages' ? 'Sida' : 'Uppgift'}-rutan? Innehållet sparas och kan visas igen.`)) return; updateTopic({ ...topic, [field === 'pages' ? 'hidePages' : 'hideAssignments']: true }) }}>× Ta bort ruta</button>}</div>
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
        const lastDayIndex = lessons.length ? WEEKDAYS.indexOf(lessons[lessons.length - 1].day) : -1
        const nextDay = WEEKDAYS[(lastDayIndex + 1) % WEEKDAYS.length]
        changeLessons(normalizeLessonOrder([...lessons, { name: `Lektion ${lessons.length + 1}`, day: nextDay, topics: [] }]))
      }
    }}>{entryType === 'dag' ? `+ Lägg tillbaka ${WEEKDAYS.find(day => !lessons.some(lesson => lesson.name === day)) || 'dag'}` : '+ Lägg till lektion'}</button>}
  </div>
}
