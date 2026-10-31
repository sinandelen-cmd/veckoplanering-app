function capitalizeFirstSwedish(value) { return String(value || '').replace(/^(\s*)([a-zåäö])/i, (_, spaces, letter) => spaces + letter.toLocaleUpperCase('sv-SE')) }
import UpdateNotices from './UpdateNotices.jsx'
import { groupStudentWeeksForPrint } from './printGroups.js'
import { Component, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabase'
import './App.css'
import Navigation from './Navigation.jsx'
import ClassSchedules from './ClassSchedules.jsx'
import { buildClassSchedule } from './classScheduleUtils.js'
import { MUNICIPALITIES_BY_COUNTY } from './swedishMunicipalities.js'
import { NATIONAL_EXAMS_2026_27 } from './nationalExams.js'

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


// Ljus färgidentitet per planering; befintliga planer får en stabil färg utifrån ID.
// Gränssnittsdelar som är avstängda tills de är färdiga. Ändra till true för att visa dem.
const AVSTANGD_GRANSSNITT = false
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
    if (/^(?:sida|sidor|sid\.|uppgifter|material|länk|mål)\s*[:-]/i.test(line) && last) {
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

function ResourceIcon({ kind, fallback }) {
  if (kind === 'youtube') return <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0033"/><path d="M10 8l6 4-6 4z" fill="white"/></svg>
  const types = { pdf: ['#E5252A', 'PDF'], pptx: ['#D24726', 'P'], word: ['#185ABD', 'W'], excel: ['#107C41', 'X'], file: ['#4285F4', '↗'], link: ['#2563EB', '↗'] }
  const [color, label] = types[kind] || ['#2563EB', fallback || '↗']
  return <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M5 1h9l6 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill={color}/><path d="M14 1v6h6" fill="white" opacity=".65"/><text x="11.5" y="17" textAnchor="middle" fontSize={label.length > 1 ? 6 : 12} fontWeight="bold" fill="white">{label}</text></svg>
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

// Väljer hur många veckor som ryms bredvid varandra (1–4) så att miniatyrerna blir så stora som möjligt i aktuell skärm.
function bestThumbCols(width, height) {
  const ORIGINAL_HEIGHT = 1350
  if (width < 700) return 1 // telefon: en vecka per rad, sidan får scrolla i höjdled
  let best = { cols: 1, scale: 0 }
  for (const cols of [1, 2, 3, 4]) {
    const rows = Math.ceil(4 / cols)
    const cellWidth = Math.max(0, width - 40) / cols
    const scale = Math.min(cellWidth / 960, Math.max(120, (height - 330) / rows) / ORIGINAL_HEIGHT)
    if (scale > best.scale) best = { cols, scale }
  }
  return best.cols
}
const CHAPTER_VOCABULARY = [
  [/geometri|cirkel|area|omkrets|volym/, ['Radie','Diameter','Omkrets','Area','Cirkelbåge','Cirkelsektor','Volym','Cylinder']],
  [/algebra|uttryck|ekvation|variabel/, ['Variabel','Uttryck','Ekvation','Likhetstecken','Term','Förenkla','Lösning']],
  [/bråk|bråktal/, ['Täljare','Nämnare','Bråkform','Blandad form','Förkorta','Förlänga','Likvärdiga bråk']],
  [/procent/, ['Procent','Andel','Helhet','Procenttal','Förändring','Förändringsfaktor']],
  [/statistik|sannolikhet/, ['Medelvärde','Median','Typvärde','Frekvens','Diagram','Sannolikhet']],
  [/funktion|graf|koordinat/, ['Koordinat','Koordinatsystem','X-axel','Y-axel','Graf','Funktion','Lutning']],
  [/taluppfattning|heltal|decimaltal/, ['Positionssystem','Ental','Tiotal','Decimal','Avrundning','Negativa tal']],
  [/ekonomi|ränta/, ['Budget','Inkomst','Utgift','Ränta','Kapital','Rabatt']],
  [/skala|proportion/, ['Skala','Förhållande','Proportion','Förstoring','Förminskning']],
  [/^tal\b|talområde|multiplikation|division|addition|subtraktion/, ['Tal','Negativa tal','Multiplikation','Division','Addition','Subtraktion','Positionssystem']],
]
function chapterVocabulary(chapter, weeks = []) {
  const title = String(chapter || '').toLocaleLowerCase('sv-SE')
  const lessonText = weeks.map(week => [week.content, ...(week.lessons || []).flatMap(lesson => [lesson.name, ...(lesson.topics || []).map(topic => topic.name)])].join(' ')).join(' ').toLocaleLowerCase('sv-SE')
  const match = CHAPTER_VOCABULARY.find(([pattern]) => pattern.test(title)) || CHAPTER_VOCABULARY.find(([pattern]) => pattern.test(lessonText))
  return match ? match[1] : []
}
function isGeneratedLessonSummary(content, chapter) {
  const lines = String(content || '').split(/\n/).map(line => line.trim()).filter(Boolean)
  const prefix = String(chapter || '').trim()
  return Boolean(prefix && lines.length > 1 && lines.every(line => line.toLocaleLowerCase('sv-SE').startsWith(prefix.toLocaleLowerCase('sv-SE') + ' – ')))
}
function ChapterVocabulary({ chapter, weeks }) {
  const words = chapterVocabulary(chapter, weeks)
  return words.length ? <div className="chapter-vocabulary" aria-label={`Viktiga begrepp i ${chapter}`}><div className="chapter-vocabulary-list">{words.map((word, index) => <span className={`chapter-vocabulary-term vocabulary-color-${index % 7}`} key={word}>{word}</span>)}</div></div> : null
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

function StudentView({ plan, error, preview = false, printPage = null, printWeekStart = null, initialClass = "", hideSelector = false, _publishedOnly = false }) {
  useState(0)
  const [singlePrintWeek, setSinglePrintWeek] = useState(null)
  const [previewClass, setPreviewClass] = useState(initialClass)
  const [linkCopied, setLinkCopied] = useState(false)
  useEffect(()=>{setLinkCopied(false)},[previewClass])
  const requestedClass = new URLSearchParams(window.location.search).get('klass')
  const selectedClass = (preview ? previewClass : requestedClass) && plan?.classGroups?.find(g => g.name === (preview ? previewClass : requestedClass))
  const classLessons = selectedClass ? buildClassSchedule(plan,selectedClass) : []
  // Grundplaneringens veckor är den enda källan för klassernas veckokort.
  // Klassens schema får bara placera lektioner i redan skapade veckor.
  const sourceClassWeeks = (Array.isArray(plan?.weeksData) ? plan.weeksData : [])
    .filter(week => week && !week.hidden && week.weekStart)
    .sort((a,b)=>a.weekStart.localeCompare(b.weekStart))
  // Visa även mellanliggande kalenderveckor utan att ändra grundplaneringens data.
  const classWeekTimeline = sourceClassWeeks.length ? (() => {
    const byDate = new Map(sourceClassWeeks.map(week=>[week.weekStart,week]))
    const timeline = []
    for(let date=sourceClassWeeks[0].weekStart, end=sourceClassWeeks[sourceClassWeeks.length-1].weekStart;date<=end && timeline.length<110;date=addWeeks(date,1)){
      timeline.push(byDate.get(date)||{weekStart:date,weekNumber:calendarWeekNumber(date),title:'Vecka '+calendarWeekNumber(date),lessons:[],content:''})
    }
    return timeline
  })() : []
  const classWeeks = selectedClass ? classWeekTimeline
    .map(week => {
      const scheduled = classLessons.filter(item => mondayOf(item.date) === week.weekStart)
      const lessons = scheduled.map((item, index) => {
        const lesson = {...item.lesson,day:item.day,date:item.date,name:'Lektion '+(index+1)}
        if(item.override?.text) lesson.topics=[{name:item.override.text}]
        const requestedMoments = Math.max(1,Math.min(20,Number(selectedClass.momentsPerDay?.[item.day])||1))
        const existingTopics = Array.isArray(lesson.topics) ? lesson.topics : []
        // Lägg till tomma moment vid behov, men radera aldrig befintligt innehåll.
        if(existingTopics.length < requestedMoments) lesson.topics=[...existingTopics,...Array.from({length:requestedMoments-existingTopics.length},()=>({name:'',pages:[],assignments:[],links:[],classMomentPlaceholder:true}))]
        return lesson
      })
      return {...week,content:'',items:[],pages:[],assignments:[],links:[],lessons}
    }) : []

  useEffect(() => {
    if (printPage !== null) return undefined
    const clearPrintSelection = () => setSinglePrintWeek(null)
    window.addEventListener('afterprint', clearPrintSelection)
    return () => window.removeEventListener('afterprint', clearPrintSelection)
  }, [printPage])
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
    .filter(week => week && !week.hidden && (week.keepVisibleExtra === true || ((week.weekStart || '') >= addWeeks(mondayOf(new Date()), -1) && (week.weekStart || '') <= mondayOf(new Date()))) && (!week.publishDate || week.publishDate <= toIsoDate(new Date())) && (!week.hideDate || week.hideDate > toIsoDate(new Date())))
    .sort((a, b) => weekContentScore(b) - weekContentScore(a))
    .filter((week, index, weeks) => weeks.findIndex(other => (other.weekStart || `number-${other.weekNumber}`) === (week.weekStart || `number-${week.weekNumber}`)) === index)
    .sort((a, b) => {
      const current = mondayOf(new Date())
      const previous = addWeeks(current, -1)
      const rank = week => week.weekStart === current ? 0 : week.weekStart === previous ? 1 : 2
      return rank(a) - rank(b) || (b.weekStart || '').localeCompare(a.weekStart || '')
    }) : []
  const currentStudentWeekStart = mondayOf(new Date())
  const currentStudentWeek = studentWeeks.find(week => week.weekStart === currentStudentWeekStart)
  const upcomingStudentWeek = [...studentWeeks].reverse().find(week => week.weekStart >= currentStudentWeekStart)
  // Längre elevveckor får mer plats på A4. Grupperna består alltid av hela veckor.
  const printGroups = singlePrintWeek ? [{ weeks: studentWeeks.filter(week => week.weekStart === singlePrintWeek) }] : groupStudentWeeksForPrint(studentWeeks)
  const visibleWeeks = printPage === null
    ? studentWeeks
    : (printWeekStart ? studentWeeks.filter(week => week.weekStart === printWeekStart) : (printGroups[printPage]?.weeks || []))
  if (error) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>{error}</p></section></main>
  if (!preview && requestedClass && plan && !selectedClass) return <main className="shell"><section className="card"><h2>Klassen hittades inte</h2><p>Kontrollera elevlänken med din lärare.</p></section></main>
  const previewClassSelector = preview && !hideSelector && plan?.classGroups?.length>0 && <div className="student-preview-classbar"><div className="student-preview-class-buttons">{plan.classGroups.map(g=><button key={g.name} type="button" className={previewClass===g.name?'active':''} onClick={()=>setPreviewClass(g.name)}>🏫 {g.name}</button>)}</div><button type="button" className="student-class-copy-link" aria-label={linkCopied ? "Elevlänken kopierad" : "Kopiera elevlänk för "+(previewClass || "grundplaneringen")} title={linkCopied ? "Elevlänken kopierad" : "Kopiera elevlänk för "+(previewClass || "grundplaneringen")} disabled={!plan?.published||!plan?.publicSlug} onClick={async()=>{const url=window.location.origin+'/elev/'+encodeURIComponent(plan.publicSlug)+(previewClass?'?klass='+encodeURIComponent(previewClass):'');try{await navigator.clipboard.writeText(url);setLinkCopied(true)}catch{window.prompt('Kopiera elevlänk',url)}}}><span aria-hidden="true">{linkCopied?'✓':'🔗'}</span></button></div>
  if (!plan) return <main className="shell"><section className="card empty"><h1>{APP_TITLE}</h1><p>Laddar planeringen...</p></section></main>
  return <>{previewClassSelector}<main style={planThemeStyle(plan)} className={`shell student-shell ${printPage === null ? "student-screen-view" : "student-print-page"} ${printPage !== null && visibleWeeks.length === 1 ? "student-print-spacious" : ""}`}>

    <header className="student-header student-header-simple">
      <div className="student-heading-title">
        <h1>{plan.subject || plan.title}</h1>
        {plan.schoolYear && <span className="student-heading-year">{plan.schoolYear}</span>}
      </div>
      <div className="student-heading-actions">
        {selectedClass && <div className="student-class-label"><span>KLASS</span><strong>{selectedClass.name}</strong></div>}
        {printPage === null && <button type="button" className="secondary student-heading-print" onClick={() => window.print()}>🖨️ <span>Skriv ut</span></button>}
      </div>
    </header>
    {studentWeeks.length === 0 && <p className="card empty" role="status">{plan.autoReleaseWeeks ? "Ingen vecka är publicerad för elever ännu. Nästa vecka visas automatiskt när dess måndag börjar." : "Det finns inga synliga veckor i den här planeringen ännu."}</p>}
    <section className={gridMode ? 'year-grid student-matrix' : 'year-grid student-list'} style={gridMode ? { '--student-columns': columns, '--student-rows': rows } : undefined}>
      {visibleWeeks.map((week, index) => <div className="chapter-week-group" key={`${week.weekNumber}-${week.weekStart}`}>
        {week.chapter?.trim() && (gridMode || index === 0 || week.chapter !== visibleWeeks[index - 1]?.chapter) && <h2 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h2>}{week.chapter?.trim() && (gridMode || index === 0 || week.chapter !== visibleWeeks[index - 1]?.chapter) && <ChapterVocabulary chapter={week.chapter} weeks={visibleWeeks.filter(w => w.chapter === week.chapter)} />}
        <article id={"student-week-" + week.weekStart} className="week-card student-week-card" style={studentWeekStyle(week.weekStart)}>

        <div className="week-top student-week-top">
          <div className="student-week-identity"><strong>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong><span className="calendar-month-corner calendar-tile-month">{weekMonthLabel(week.weekStart)}</span><span>{studentWeekDateRange(week.weekStart)}</span></div>
          {printPage !== null && studentMonthInfo(week.weekStart) && <div className="student-month-info" style={{ backgroundColor: studentMonthInfo(week.weekStart).color }}><strong>{studentMonthInfo(week.weekStart).name}</strong><span>{studentMonthInfo(week.weekStart).weeks}</span></div>}
        </div>
        {!/^Vecka\s+\d+$/i.test(week.title || '') && week.title?.trim() && <h3>{week.title}</h3>}
        <div className="week-content">{week.content || (!week.pages?.length && !week.assignments?.length && !week.links?.length && !week.lessons?.some(lesson => lesson.topics?.some(topic => topic.name?.trim() || topic.pages?.length || topic.assignments?.length || topic.links?.length)) ? 'Ingen planering angiven ännu.' : '')}</div>
        <ImportantDatesForWeek week={week} plan={plan} />
        <LessonDetails week={week} entryType={plan.entryType || 'lektion'} lessonDisplay="dag-och-lektion" />
        <WeekDetails week={week} />
      </article></div>)}
    </section>
  </main>
  {AVSTANGD_GRANSSNITT && printPage === null && studentWeeks.length > 0 && <div className="student-print-pages">
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
const MONTH_PASTELS = ['#e5f0fc','#f8e5f1','#e9e5fb','#e5f5e8','#fff0cf','#ffe6dc','#e3f4f8','#f6e6f5','#e7f1d8','#ffead1','#eee5fb','#fce5e5']

function isSchoolYear2026_27(value) {
  return /^(?:2026\s*[/–-]\s*(?:2027|27)|26\s*[/–-]\s*27|HT\s*(?:20)?26\s*[/–-]?\s*VT\s*(?:20)?27)$/i.test(String(value || '').trim())
}

function nationalExamsForPlan(plan) {
  const grade = String(plan.grade || '').replace(/[^0-9]/g, '')
  if (plan.schoolForm !== 'grundskola' || !isSchoolYear2026_27(plan.schoolYear) || !['3', '6', '9'].includes(grade)) return []
  const subject = String(plan.subject || '').toLowerCase().trim()
  const matchesSubject = exam => {
    const examSubject = String(exam.subject || '').toLowerCase()
    if (/matematik|^ma$/.test(subject)) return /matematik/.test(examSubject)
    if (/svenska som andraspråk|^sva$/.test(subject)) return /svenska som andraspråk/.test(examSubject)
    if (/svenska|^sv$/.test(subject)) return /svenska/.test(examSubject) && !/andraspråk/.test(examSubject)
    if (/engelska|^en$/.test(subject)) return /engelska/.test(examSubject)
    if (/biologi|fysik|kemi|geografi|historia|religion|samhällskunskap/.test(subject)) return examSubject.includes(subject)
    return false
  }
  return NATIONAL_EXAMS_2026_27.filter(item => item.grade === grade && matchesSubject(item))
}

function CalendarWeekThumbnail({ week, entryType, onOpen, onOpenLesson }) {
  const frame = useRef(null)
  const original = useRef(null)
  const [dimensions, setDimensions] = useState({ scale: 0.25, height: 380 })
  useEffect(() => {
    const resize = () => {
      if (!frame.current || !original.current) return
      const phone = window.innerWidth < 700
      const fitRows = Math.ceil(4 / bestThumbCols(window.innerWidth, window.innerHeight))
      const fitHeight = phone ? Infinity : Math.max(120, (window.innerHeight - 330) / fitRows) / Math.max(1, original.current.offsetHeight)
      const scale = Math.min(frame.current.clientWidth / 960, fitHeight)
      const height = original.current.offsetHeight * scale
      setDimensions(prev => Math.abs(prev.height - height) > 1 || Math.abs(prev.scale - scale) > 0.001 ? { scale, height } : prev)
    }
    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (observer) { observer.observe(frame.current); observer.observe(original.current) }
    window.addEventListener('resize', resize)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize) }
  }, [week])
  return <div className="calendar-real-week-thumbnail">
    <div className="calendar-real-week-label"><button type="button" className="calendar-week-heading-open" onClick={onOpen} aria-label={`Visa hela vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`} title="Visa hela veckan"><span>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</span><span className="calendar-week-expand-icon" aria-hidden="true">⛶ Öppna</span></button></div>
    <div className="calendar-real-week-frame" ref={frame} style={{ height: dimensions.height }} onClick={event => { const lesson = event.target.closest(".lesson"); if (lesson) { onOpenLesson(Number(lesson.dataset.lessonIndex)) } else { const lessons = Array.from(event.currentTarget.querySelectorAll(".lesson")); if (lessons.length) { const y = event.clientY; const nearest = lessons.reduce((best, item) => Math.abs(item.getBoundingClientRect().top + item.getBoundingClientRect().height/2 - y) < Math.abs(best.getBoundingClientRect().top + best.getBoundingClientRect().height/2 - y) ? item : best, lessons[0]); onOpenLesson(Number(nearest.dataset.lessonIndex)) } } }} role="button" tabIndex={0} aria-label="Välj lektion att redigera" onKeyDown={event => { if (event.key === "Enter") onOpenLesson(0) }}>
      <div className="calendar-real-week-original" ref={original} style={{ transform: `scale(${dimensions.scale})` }} aria-hidden="true">
        <article className="calendar-inline-week" style={{ backgroundColor: weekColor(week.weekStart) }}>
          <div className="calendar-inline-week-heading"><h2>Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</h2><span>{week.chapter}</span></div>
          <LessonDetails week={week} entryType={entryType} onChange={() => {}} />
        </article>
      </div>
    </div>
  </div>
}

function ClassTwoWeekCalendar({ plan, className, onChangeClassGroups, onSave, busy, saveStatus }) {
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState(false)
  const [visibleWeekCount, setVisibleWeekCount] = useState(3)
  const [expandedFullWeek, setExpandedFullWeek] = useState(null)
  const group = (plan.classGroups || []).find(item => item.name === className)
  const scheduled = useMemo(() => group ? buildClassSchedule(plan, group) : [], [plan, group])
  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const currentStart = [monday.getFullYear(), String(monday.getMonth()+1).padStart(2,'0'), String(monday.getDate()).padStart(2,'0')].join('-')
  const weekStarts = Array.from({length:visibleWeekCount},(_,i)=>{
    const date=new Date(monday)
    date.setDate(date.getDate()+7*(i-(visibleWeekCount===1?0:1)))
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
  })
  const weeks = weekStarts.map(start => {
    const source = (plan.weeksData || []).find(w => w.weekStart === start)
    const slots = scheduled.filter(item => item.weekStart === start)
    return {...(source || {}), weekStart:start, weekNumber:calendarWeekNumber(start), lessons:slots.map(item => {
      const text = item.override?.text
      return item.override?.lesson || (text != null ? {...item.lesson,name:text,topics:[]} : item.lesson)
    }), chapter:source?.chapter || ''}
  })
  if (!group) return null
  return <section className="class-real-two-weeks" aria-label={className+' – '+visibleWeekCount+' veckor'}>
    <div className="class-real-two-weeks-header"><div className="class-week-count-controls" role="group" aria-label="Antal veckor att visa">{[1,2,3].map(n=><button key={n} type="button" className={visibleWeekCount===n?"active":""} aria-pressed={visibleWeekCount===n} onClick={()=>setVisibleWeekCount(n)}>{n} {n===1?"vecka":"veckor"}</button>)}</div></div>
    <div className="class-real-two-weeks-grid" style={{"--class-week-columns":visibleWeekCount}}>{weeks.map((week,_i)=><div className="class-real-week-column" key={week.weekStart}>
      <strong>{week.weekStart===currentStart?'Nuvarande vecka':`Vecka ${calendarWeekNumber(week.weekStart)}`}</strong>
      <CalendarWeekThumbnail week={week} entryType={plan.entryType || 'lektion'} onOpen={()=>setExpandedFullWeek(week.weekStart)} onOpenLesson={lessonIndex=>setExpanded({weekStart:week.weekStart,lessonIndex})}/>
    </div>)}</div>
    {expandedFullWeek && <div className="class-full-week-backdrop" role="presentation"><section className="class-full-week-panel" role="dialog" aria-modal="true" aria-label={`Hela vecka ${calendarWeekNumber(expandedFullWeek)} för ${className}`}><div className="class-full-week-header"><h3>{className} · Vecka {calendarWeekNumber(expandedFullWeek)}</h3><button type="button" className="secondary" onClick={()=>setExpandedFullWeek(null)}>⊟ Minska veckan</button></div><LessonDetails week={weeks.find(w=>w.weekStart===expandedFullWeek)} entryType={plan.entryType||"lektion"} onChange={changes=>{const slots=scheduled.filter(item=>item.weekStart===expandedFullWeek);const overrides={...(group.overrides||{})};(changes.lessons||[]).forEach((lesson,i)=>{const slot=slots[i];if(!slot)return;const key=String(slot.lessonNumber-1);overrides[key]={...(overrides[key]||{}),lesson}});onChangeClassGroups?.((plan.classGroups||[]).map(g=>g.name===className?{...g,overrides}:g))}}/><div className="class-full-week-footer"><button type="button" className="class-lesson-done-icon" aria-label="Spara och minska veckan" title="Spara och minska veckan" disabled={saving||busy} onClick={async()=>{setSaving(true);try{const ok=await onSave?.();if(ok===true)setExpandedFullWeek(null)}finally{setSaving(false)}}}>{saving||busy?"…":"✓"}</button></div></section></div>}
    {expanded && <div className="calendar-lesson-modal-backdrop" role="presentation"><section className="calendar-lesson-modal" role="dialog" aria-modal="true" aria-label="Redigera klassens lektion">
      <div className="calendar-lesson-modal-header"><h3>Vecka {calendarWeekNumber(expanded.weekStart)}{expanded.lessonIndex!==null?' · Lektion '+(expanded.lessonIndex+1):''} · {className}</h3><button type="button" onClick={()=>setExpanded(null)}>Stäng</button></div>
      <LessonDetails week={weeks.find(w=>w.weekStart===expanded.weekStart)} entryType={plan.entryType||'lektion'} onlyLessonIndex={expanded.lessonIndex} onChange={changes=>{
        const slots=scheduled.filter(item=>item.weekStart===expanded.weekStart)
        const overrides={...(group.overrides||{})}
        ;(changes.lessons||[]).forEach((lesson,i)=>{
          if (expanded.lessonIndex !== null && i !== expanded.lessonIndex) return
          const slot=slots[i];if(!slot)return
          const key=String(slot.lessonNumber-1)
          overrides[key]={...(overrides[key]||{}),lesson}
        })
        onChangeClassGroups?.((plan.classGroups||[]).map(g=>g.name===className?{...g,overrides}:g))
      }}/>
      <div className="calendar-lesson-modal-footer"><button type="button" className="class-lesson-done-icon" aria-label="Klar – spara lektionen" title="Klar – spara lektionen" disabled={saving||busy} onClick={async()=>{setSaving(true);try{const ok=await onSave?.();if(ok===true)setExpanded(null)}finally{setSaving(false)}}}>{saving||busy?"…":"✓"}</button>{saveStatus && <span role="status">{saveStatus}</span>}</div>
    </section></div>}
  </section>
}

function YearCalendar({ weeks, schoolClosures = [], nationalExams = [], startOnFirstWeek: _startOnFirstWeek = false, embedded = false, onOpen, onClose: _onClose, onUpdateWeek, onSetAllVisibility, onAddWeek, onDeleteWeek, onUndo, canUndo = false, onSave, isDirty, busy, saveStatus, onBackToPrevious: _onBackToPrevious, entryType = 'lektion', classGroups = [], classPlan = null, publicSlug: _publicSlug = '', onChangeClassGroups, onImportFile: _onImportFile, fileImportState: _fileImportState = {phase:'idle',message:''} }) {
  // Årsöversikt i nio veckor per sida, tre kolumner och tre rader.
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null)
  const [editingCalendarLesson, setEditingCalendarLesson] = useState(null)
  const [savingCalendarLesson, setSavingCalendarLesson] = useState(false)
  useState(0)
  const [showOriginalCalendar, setShowOriginalCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => { const date = new Date(weeks[0]?.weekStart ? weeks[0].weekStart + 'T12:00:00' : Date.now()); return new Date(date.getFullYear(),date.getMonth(),1) })
  useState(null)
  const [selectedCalendarClass, setSelectedCalendarClass] = useState('')
  const [showQuickClassMatrix,setShowQuickClassMatrix] = useState(false)
  const [newQuickClassName,setNewQuickClassName] = useState('')
  const [quickClassDays,setQuickClassDays] = useState(['Måndag','Onsdag'])
  const quickDays=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
  const addQuickClass=()=>{
    const name=newQuickClassName.trim()
    if(!name || classGroups.some(g=>String(g.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv-SE')===name.replace(/\s+/g,' ').toLocaleLowerCase('sv-SE')))return
    onChangeClassGroups?.([...classGroups,{name,days:quickClassDays,startDate:classPlan?.startDate||weeks[0]?.weekStart||toIsoDate(new Date()),cancelledDates:[],overrides:{}}])
    setSelectedCalendarClass(name)
    setNewQuickClassName('')
  }
  const toggleQuickDay=(className,day)=>{
    onChangeClassGroups?.(classGroups.map(g=>g.name!==className?g:{...g,days:g.days?.includes(day)?g.days.filter(d=>d!==day):[...(g.days||[]),day]}))
  }
  const activeCalendarGroup = classGroups.find(g=>g.name===selectedCalendarClass)
  const orderedWeeks = [...weeks].filter(week => week && /^\d{4}-\d{2}-\d{2}$/.test(week.weekStart || '')).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const selectedWeek = selectedWeekIndex === null ? null : orderedWeeks[selectedWeekIndex]
  const editSelectedWeek = changes => { const index = weeks.findIndex(week => week.weekStart === selectedWeek?.weekStart); if (index >= 0) onUpdateWeek?.(index, changes) }
  if (embedded) return <section className="calendar-inline-weeks" aria-label="Alla skapade veckor och lektioner">
    {orderedWeeks.map(week => {
      const originalIndex = weeks.findIndex(item => item.weekStart === week.weekStart)
      const weekNo = calendarWeekNumber(week.weekStart) ?? week.weekNumber
      return <article key={week.weekStart} className="calendar-inline-week" style={{ backgroundColor: weekColor(week.weekStart) }}>
        <div className="calendar-inline-week-heading">
          <label className="calendar-visibility-large-toggle" title={week.hidden ? 'Visa veckan för elever' : 'Dölj veckan för elever'}>
            <input type="checkbox" checked={!week.hidden} aria-label={`Visa vecka ${weekNo} för elever`} onChange={event => onUpdateWeek?.(originalIndex, { hidden: !event.target.checked })} />
          </label>
          <h2>Vecka {weekNo}</h2>
          <span className="calendar-month-corner">{weekMonthLabel(week.weekStart)}</span>
          <span className="calendar-inline-date">{formatDate(week.weekStart)}</span>
          <button type="button" className="calendar-delete-week danger" disabled={busy || orderedWeeks.length <= 1} onClick={() => onDeleteWeek?.(week.weekStart)}>🗑️ Radera vecka</button>
        </div>
        <LessonDetails week={week} onChange={changes => onUpdateWeek?.(originalIndex, changes)} entryType={entryType} />
      </article>
    })}
    <div className="calendar-add-week-actions"><button type="button" className="primary" disabled={busy || orderedWeeks.length >= 52} onClick={() => onAddWeek?.()}>+ Lägg till ny vecka</button><button type="button" className="secondary" onClick={onOpen}>Visa årsöversikt</button><button type="button" className="calendar-save-button" disabled={busy || !isDirty} onClick={onSave}>{busy ? 'Sparar...' : 'Spara ändringar'}</button></div>
    {saveStatus && <p role="status">{saveStatus}</p>}
  </section>
  return <section className={`${embedded ? "calendar-overlay calendar-embedded" : "calendar-overlay calendar-page"} ${!selectedWeek ? "calendar-full-year-overview" : ""}`} aria-label="Årsplanering månad för månad">
    <div className="calendar-top">
      
      <div><div className="calendar-week-heading-row">{selectedWeek && <label className="calendar-visibility-large-toggle" title={selectedWeek.hidden ? "Visa veckan för elever" : "Dölj veckan för elever"}><input type="checkbox" aria-label={`Visa vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber} för elever`} checked={!selectedWeek.hidden} onChange={e => editSelectedWeek({ hidden: !e.target.checked })} /></label>}<h2>{selectedWeek ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : `Årsöversikt`}</h2>{selectedWeek && <span className="calendar-month-corner">{weekMonthLabel(selectedWeek.weekStart)}</span>}</div><p>{selectedWeek ? (selectedWeek.chapter || (!/^Vecka\s+\d+$/i.test(selectedWeek.title || "") ? selectedWeek.title : "") || "") : ""}</p></div>
      <div className="calendar-zoom-controls calendar-zoom-controls-left">{selectedWeek && <button type="button" className="secondary calendar-return-overview" onClick={() => { setSelectedLessonIndex(null); setSelectedWeekIndex(null); setOverviewPage(0) }}>✕ Stäng veckan – visa hela Månadsvy</button>}</div>
    </div>
    {showQuickClassMatrix && <div className="calendar-quick-matrix"><div className="calendar-quick-header"><strong>Klassernas lektionsdagar</strong><button type="button" className="calendar-quick-close" onClick={()=>setShowQuickClassMatrix(false)}>✕ Stäng</button></div><div className="calendar-quick-add"><label htmlFor="calendar-new-class">Ny klass</label><input id="calendar-new-class" placeholder="T.ex. EK26A" value={newQuickClassName} onChange={e=>setNewQuickClassName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addQuickClass()}}}/><button type="button" onClick={addQuickClass} disabled={!newQuickClassName.trim()||classGroups.some(g=>g.name.toLocaleLowerCase('sv')===newQuickClassName.trim().toLocaleLowerCase('sv'))}>+ Lägg till</button></div><p>Markera vilka dagar klassen har lektioner. Inga klockslag behövs.</p><div className="calendar-quick-matrix-scroll"><table><thead><tr><th>Klass</th>{quickDays.map(day=><th key={day}>{day.slice(0,3)}</th>)}</tr></thead><tbody>{classGroups.map(g=><tr key={g.name}><th>{g.name}</th>{quickDays.map(day=><td key={day}><input type="checkbox" aria-label={g.name+' '+day} checked={g.days?.includes(day)||false} onChange={()=>toggleQuickDay(g.name,day)}/>{g.days?.includes(day)&&<div className="calendar-day-moments"><button type="button" aria-label={'Minska moment '+g.name+' '+day} disabled={(g.momentsPerDay?.[day]||1)<=1} onClick={()=>onChangeClassGroups?.(classGroups.map(item=>item.name===g.name?{...item,momentsPerDay:{...item.momentsPerDay,[day]:Math.max(1,(item.momentsPerDay?.[day]||1)-1)}}:item))}>−</button><span>{g.momentsPerDay?.[day]||1}</span><button type="button" aria-label={'Öka moment '+g.name+' '+day} onClick={()=>onChangeClassGroups?.(classGroups.map(item=>item.name===g.name?{...item,momentsPerDay:{...item.momentsPerDay,[day]:(item.momentsPerDay?.[day]||1)+1}}:item))}>+</button></div>}</td>)}</tr>)}<tr><th>Ny klass</th>{quickDays.map(day=><td key={day}><input type="checkbox" aria-label={'Ny klass '+day} checked={quickClassDays.includes(day)} onChange={()=>setQuickClassDays(prev=>prev.includes(day)?prev.filter(d=>d!==day):[...prev,day])}/></td>)}</tr></tbody></table></div></div>}
    {activeCalendarGroup && <section className="calendar-selected-class-cards"><StudentView key={activeCalendarGroup.name} plan={{...sanitizeForStudents({...classPlan,weeksData:weeks}),classGroups:[activeCalendarGroup]}} preview initialClass={activeCalendarGroup.name} hideSelector /></section>}
    {editingCalendarLesson && <div className="calendar-lesson-modal-backdrop" role="presentation"><section className="calendar-lesson-modal" role="dialog" aria-modal="true" aria-label="Redigera lektion">
      <div className="calendar-lesson-modal-header"><h3>Vecka {calendarWeekNumber(editingCalendarLesson.weekStart)} · Lektion {editingCalendarLesson.lessonIndex + 1}</h3><button type="button" onClick={() => setEditingCalendarLesson(null)}>Stäng</button></div>
      {(() => { const editWeek = orderedWeeks.find(week => week.weekStart === editingCalendarLesson.weekStart); if (!editWeek) return <p>Veckan finns inte längre.</p>; const originalIndex = weeks.findIndex(week => week.weekStart === editWeek.weekStart); return <LessonDetails week={editWeek} entryType={entryType} onlyLessonIndex={editingCalendarLesson.lessonIndex} onChange={changes => onUpdateWeek?.(originalIndex, changes)} /> })()}
      <div className="calendar-lesson-modal-footer"><button type="button" className="primary" disabled={savingCalendarLesson || busy} onClick={async () => { setSavingCalendarLesson(true); try { const result = await onSave?.(); if (result === true) setEditingCalendarLesson(null) } catch  { /* Keep dialog open so edits remain accessible */ } finally { setSavingCalendarLesson(false) } }}>{savingCalendarLesson || busy ? 'Sparar…' : '✓ Klar – spara lektionen'}</button>{saveStatus && <span role="status">{saveStatus}</span>}</div>
    </section></div>}
    {!activeCalendarGroup && <>
    {selectedWeek ? <div className="calendar-week-detail" style={{ backgroundColor: weekColor(selectedWeek.weekStart) }}>
      <p><strong>{(/^Vecka\s+\d+$/i.test(selectedWeek.title || '') ? `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}` : selectedWeek.title) || `Vecka ${calendarWeekNumber(selectedWeek.weekStart) ?? selectedWeek.weekNumber}`}</strong> · {formatDate(selectedWeek.weekStart)}</p>
      {schoolClosures.filter(item => validSchoolClosure(item) && item.startDate < addWeeks(selectedWeek.weekStart, 1) && item.endDate >= selectedWeek.weekStart).map(item => <p key={item.id} className="calendar-holiday"><strong>{item.verified ? "Skolledigt:" : "Skolledigt (ej verifierat):"}</strong> {item.name} · {formatDate(item.startDate)}–{formatDate(item.endDate)}</p>)}
      {nationalExams.filter(exam => exam.date >= selectedWeek.weekStart && exam.date < addWeeks(selectedWeek.weekStart, 1)).map(exam => <p key={exam.date + exam.subject + exam.part} className="calendar-holiday"><strong>🔒 Nationellt prov:</strong> {exam.subject}, delprov {exam.part} · {formatDate(exam.date)}{exam.startTime ? ` kl. ${exam.startTime}` : ''}</p>)}
      
      {selectedWeek.content && <p>{selectedWeek.content}</p>}
      <LessonDetails week={selectedWeek} onChange={editSelectedWeek} entryType={entryType} />
      <div className="calendar-edit-actions">
        <button type="button" className="calendar-save-button" disabled={busy || !isDirty} onClick={onSave}>{busy ? 'Sparar...' : 'Spara ändringar'}</button>
        {isDirty && <span>Du har osparade ändringar.</span>}
        {saveStatus && <span role="status">{saveStatus}</span>}
      </div>
      <button type="button" className="calendar-delete-week danger" disabled={busy || weeks.length <= 1} onClick={() => { onDeleteWeek?.(selectedWeek.weekStart); setSelectedWeekIndex(null); setSelectedLessonIndex(null) }}>🗑️ Radera vecka</button>
      <button type="button" className="secondary calendar-overview-button" onClick={() => { setSelectedWeekIndex(null); setSelectedLessonIndex(null) }}>← Till översikten</button>
    </div> : !showOriginalCalendar ? <div className="calendar-real-month-overview">
      <div className="calendar-real-month-toolbar">
        <button type="button" onClick={() => setCalendarMonth(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>← Föregående månad</button>
        <h3>{new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
        <button type="button" onClick={() => setCalendarMonth(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>Nästa månad →</button>
      </div>
      <div className="calendar-real-month-gallery">
        {orderedWeeks.map((week, index) => ({ week, index })).filter(({ week }) => {
          const start = new Date(week.weekStart + 'T12:00:00')
          const end = new Date(start); end.setDate(end.getDate() + 6)
          const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
          const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 23, 59, 59)
          return start <= monthEnd && end >= monthStart
        }).map(({ week, index }) => <CalendarWeekThumbnail key={week.weekStart} week={week} entryType={entryType} onOpenLesson={lessonIndex => { if (lessonIndex >= 0) setEditingCalendarLesson({ weekStart: week.weekStart, lessonIndex }) }} onOpen={() => { setSelectedWeekIndex(index); setSelectedLessonIndex(null) }} />)}
      </div>
      {!orderedWeeks.some(week => { const d = new Date(week.weekStart + 'T12:00:00'); const e = new Date(d); e.setDate(e.getDate()+6); return d <= new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0,23,59,59) && e >= new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1) }) && <p>Inga planerade veckor den här månaden.</p>}
      <button type="button" className="secondary" onClick={() => setShowOriginalCalendar(true)}>Visa tidigare kalenderlayout</button>
    </div> : <>
      <button type="button" className="secondary" onClick={() => setShowOriginalCalendar(false)}>Visa veckominiatyrer</button>
      <div className="calendar-overview-history">
        <button type="button" className="secondary" onClick={onUndo} disabled={busy || !canUndo} title="Ångra den senaste ändringen i planeringen">↶ Ångra</button>
      </div>
      <div className="calendar-bulk-visibility" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '12px 0 18px', flexWrap: 'wrap' }}>
        <button type="button" className="secondary" disabled={busy} onClick={() => onSetAllVisibility?.(!orderedWeeks.every(week => !week.hidden))} style={{ padding: '12px 18px', fontSize: '1rem', fontWeight: 800, background: '#e4f6e9', border: '2px solid #80b69a', borderRadius: 12 }}>{orderedWeeks.every(week => !week.hidden) ? '☑ Dölj alla veckor i Elevvy' : '☐ Visa alla veckor i Elevvy'}</button>
        <span className="muted">{orderedWeeks.filter(week => !week.hidden).length} av {orderedWeeks.length} veckor visas för elever</span>
      </div>
      <div className="reference-calendar" aria-label="Månadsvy måndag till fredag">
        <div className="reference-calendar-toolbar">
          <button type="button" className="secondary" aria-label="Föregående månad" onClick={() => setCalendarMonth(value => new Date(value.getFullYear(), value.getMonth()-1, 1))}>‹</button>
          <h3>{new Intl.DateTimeFormat('sv-SE',{month:'long',year:'numeric'}).format(calendarMonth)}</h3>
          <button type="button" className="secondary" aria-label="Nästa månad" onClick={() => setCalendarMonth(value => new Date(value.getFullYear(), value.getMonth()+1, 1))}>›</button>
          <span className="reference-calendar-mode">Månad</span>
        </div>
        <div className="reference-calendar-scroll">
          <div className="reference-calendar-grid">
            <div className="reference-calendar-weekday">Vecka</div>
            {['Måndag','Tisdag','Onsdag','Torsdag','Fredag'].map(day => <div className="reference-calendar-weekday" key={day}>{day}</div>)}
            {orderedWeeks.filter(week => {
              const monday = new Date(week.weekStart + 'T12:00:00')
              const thursday = new Date(monday)
              thursday.setDate(thursday.getDate() + 3)
              return thursday.getFullYear() === calendarMonth.getFullYear() && thursday.getMonth() === calendarMonth.getMonth()
            }).map(week => {
              const monday = new Date(week.weekStart + 'T12:00:00')
              const sunday = new Date(monday)
              sunday.setDate(sunday.getDate() + 6)
              return <Fragment key={week.weekStart}>
                <div className="reference-calendar-weeknumber"><strong>v. {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong><span>{new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short'}).format(monday)} – {new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short'}).format(sunday)}</span></div>
                {['Måndag','Tisdag','Onsdag','Torsdag','Fredag'].map((day,dayIndex) => {
                  const dayLessons = (week.lessons || []).map((lesson,index) => ({lesson,index})).filter(({lesson,index}) => {
                    const explicit = String(lesson.day || (entryType === 'dag' ? lesson.name : '')).toLocaleLowerCase('sv-SE')
                    return explicit ? explicit === day.toLocaleLowerCase('sv-SE') : index === dayIndex
                  })
                  return <div className="reference-calendar-cell" key={day}>
                    {dayLessons.map(({lesson,index}) => {
                      const topics = lesson.topics || []
                      const chapter = week.chapter || 'Planering'
                      const tone = /geometri/i.test(chapter) ? 'geometry' : /algebra/i.test(chapter) ? 'algebra' : /samband/i.test(chapter) ? 'relation' : /statistik/i.test(chapter) ? 'statistics' : /sannolikhet/i.test(chapter) ? 'probability' : 'other'
                      return <details className={`reference-calendar-lesson tone-${tone}`} key={index} open>
                        <summary><span>{chapter}</span><span className="reference-calendar-chevron">⌄</span></summary>
                        <div className="reference-calendar-lesson-body">
                          <strong>{`Lektion ${index+1}`}{topics[0]?.name ? ` – ${topics[0].name}` : ''}</strong>
                          {topics.map((topic,topicIndex) => <div className="reference-calendar-topic" key={topicIndex}>
                            {topicIndex > 0 && topic.name && <strong>{topic.name}</strong>}
                            {(topic.pages || []).filter(Boolean).map((value,i) => <span key={`p${i}`}>▤ Sida {value}</span>)}
                            {(topic.assignments || []).filter(Boolean).map((value,i) => <span key={`a${i}`}>▣ Uppgift {value}</span>)}
                            {(topic.links || []).filter(link => resourceInfo(typeof link === 'string' ? link : link?.url)).map((link,i) => { const url = typeof link === 'string' ? link : link.url; return <a key={`l${i}`} href={url} target="_blank" rel="noopener noreferrer">↗ {(typeof link === 'object' && link.label) || resourceInfo(url)?.label || 'Länk'}</a> })}
                            {topic.description && <p>{topic.description}</p>}
                          </div>)}
                          {topics.length === 0 && <span className="muted">Ingen planerad aktivitet</span>}
                        </div>
                      </details>
                    })}
                  </div>
                })}
              </Fragment>
            })}
          </div>
        </div>
      </div>
      <div className="calendar-add-week-actions calendar-add-week-bottom"><button type="button" className="primary" disabled={busy || weeks.length >= 52} onClick={() => { onAddWeek?.(); setSelectedWeekIndex(null); setOverviewPage(0) }}>+ Lägg till ny vecka efter sista veckan</button><span className="muted">{weeks.length >= 52 ? 'Maximalt 52 veckor i en planering.' : 'Den nya veckan läggs sist. Spara utkast när du är klar.'}</span></div>
    </>}
    </>}
  </section>
}



function PublishedStudentPreview({ slug, initialClass = "" }) {
  const [publishedPlan, setPublishedPlan] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setPublishedPlan(null)
    setError('')
    setLoading(true)
    if (!slug) { setLoading(false); setError('Publicera planeringen först för att förhandsgranska elevlänken.'); return }
    supabase.rpc('get_public_annual_plan', { slug_value: slug }).maybeSingle().then(({data, error: requestError}) => {
      if (cancelled) return
      if (requestError || !data) setError('Kunde inte hämta elevens publicerade planering.')
      else {
        try {
          const content = JSON.parse(data.published_content || '{}')
          if (!Array.isArray(content.weeksData)) throw new Error('Missing weeks')
          setPublishedPlan(sanitizeForStudents(content))
        } catch { setError('Den publicerade planeringen kunde inte läsas.') }
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [slug])
  if (loading) return <p role="status">Hämtar det som eleverna ser…</p>
  if (error) return <p role="status">{error}</p>
  return <StudentView key={slug} plan={publishedPlan} preview hideSelector={Boolean(initialClass)} publishedOnly initialClass={initialClass || publishedPlan.classGroups?.[0]?.name || ''} />
}

function TeacherApp({ session, isAdmin = false, adminOpen = false, onToggleAdmin, adminContent, pendingCount = 0 }) {
  const [editingClassView,setEditingClassView] = useState('')
  const [, setClassStudentPreview] = useState(false)
  const [plan, setPlan] = useState(emptyPlan())
  const [plans, setPlans] = useState([])
  const [showArchive, setShowArchive] = useState(false)
  const [planSearch, setPlanSearch] = useState("")
  const [libraryYear, setLibraryYear] = useState('alla')
  const [subjectFolders, setSubjectFolders] = useState(() => { try { return JSON.parse(localStorage.getItem('arsplanering-subject-folders') || '{}') } catch { return {} } })
  const [personalSchool, setPersonalSchool] = useState(() => { try { return localStorage.getItem('arsplanering-personal-school') || 'Grundskola' } catch { return 'Grundskola' } })
  const [personalSubjects, setPersonalSubjects] = useState(() => { try { return JSON.parse(localStorage.getItem('arsplanering-personal-subjects') || '[]') } catch { return [] } })
  const [personalCustomize, setPersonalCustomize] = useState(false)
  const [visibleSchoolForms, setVisibleSchoolForms] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arsplanering-visible-schoolforms') || 'null')
      return Array.isArray(saved) ? saved.filter(value => ['Grundskola','Gymnasiet'].includes(value)) : ['Grundskola','Gymnasiet']
    } catch { return ['Grundskola','Gymnasiet'] }
  })
  const [schoolFilterOpen, setSchoolFilterOpen] = useState(false)
  const toggleVisibleSchoolForm = (school) => {
    setVisibleSchoolForms(current => {
      const next = current.includes(school) ? current.filter(item => item !== school) : [...current,school]
      try { localStorage.setItem('arsplanering-visible-schoolforms', JSON.stringify(next)) } catch {}
      return next
    })
    setLibrarySchool('')
    setLibrarySubject('')
  }
  const [librarySchool, setLibrarySchool] = useState('')
  const [librarySubject, setLibrarySubject] = useState('')
  const [editingSubject, setEditingSubject] = useState('')
  const [editingSubjectValue, setEditingSubjectValue] = useState('')
  const [, setLibraryBoardPage] = useState(0)
  const [openedFromLibrary, setOpenedFromLibrary] = useState(false)
  useState(false)
  useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareRecipient, setShareRecipient] = useState("")
  useState("")
  const [shareToken, setShareToken] = useState("")
  const [receivedToken, setReceivedToken] = useState("")
  const [shareMessage, setShareMessage] = useState("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [focusedTeacherWeek, setFocusedTeacherWeek] = useState(null)
  const [focusedTeacherLesson, setFocusedTeacherLesson] = useState(null)
  const [lessonModal, setLessonModal] = useState(null)
  const [lessonModalChanged, setLessonModalChanged] = useState(false)
  const [teacherWindowStart, setTeacherWindowStart] = useState(null)
  const [viewport, setViewport] = useState(() => ({ width: typeof window !== 'undefined' ? window.innerWidth : 1200, height: typeof window !== 'undefined' ? window.innerHeight : 800 }))
  useEffect(() => { const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize); return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize) } }, [])
  const [teacherWeekOverview, setTeacherWeekOverview] = useState(true)
  const [simpleSetup, setSimpleSetup] = useState(true)
  const [simpleMore, setSimpleMore] = useState(false)
  const [teacherTab, setTeacherTab] = useState("mina")
  const [showPastTeacherWeeks, setShowPastTeacherWeeks] = useState(false)
  const [allWeekContentsOpen, setAllWeekContentsOpen] = useState(true)
  const [weekContentOverrides, setWeekContentOverrides] = useState({})
  const [pinnedChapter, setPinnedChapter] = useState(null)

  // Kompakt, stabil kapitel- och veckovisare när alla veckor är öppna.
  // DOM uppdateras bara när kapitlet/veckan faktiskt ändras, utan animation.
  useEffect(() => {
    const indicator = document.querySelector('#lararvy .teacher-scroll-context')
    if (!showPastTeacherWeeks || teacherTab !== 'arsplan' || !indicator) return undefined
    const label = indicator.querySelector('.teacher-scroll-context-label')
    let frame = 0
    const update = () => {
      frame = 0
      const sections = [...document.querySelectorAll('#lararvy .teacher-months .teacher-chapter-section')]
      const header = document.querySelector('.planning-layout > .planning-unified-navigation')
      const nav = document.querySelector('#lararvy .teacher-week-navigation')
      const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom || 0)
      const navRect = nav?.getBoundingClientRect()
      const navBottom = navRect && navRect.top <= headerBottom + 4 && navRect.bottom > headerBottom ? navRect.bottom : headerBottom
      const top = Math.max(0, Math.ceil(navBottom)) + 5
      indicator.style.top = top + 'px'
      const boundary = top + 15
      const section = sections.find(el => { const rect = el.getBoundingClientRect(); return rect.top <= boundary && rect.bottom > boundary })
      if (!section) { indicator.hidden = true; return }
      const heading = section.querySelector('.teacher-chapter-sticky')
      if (!heading || heading.getBoundingClientRect().top >= boundary) { indicator.hidden = true; return }
      const groups = [...section.querySelectorAll('.chapter-week-group')]
      const current = groups.find(el => el.getBoundingClientRect().bottom > boundary) || groups[groups.length - 1]
      const chapter = section.dataset.chapter || 'Utan kapitel'
      const week = current?.dataset.week || ''
      const next = chapter + (week ? ' · Vecka ' + week : '')
      if (label.textContent !== next) label.textContent = next
      indicator.hidden = false
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame) }
  }, [showPastTeacherWeeks, teacherTab])

  useEffect(() => {
    if (teacherTab !== "arsplan") { setPinnedChapter(null); return undefined }
    const update = () => {
      const toolbar = document.querySelector('#lararvy .teacher-year-review-bar')
      const sections = document.querySelectorAll('#lararvy .teacher-chapter-section')
      if (!toolbar || !sections.length) { setPinnedChapter(null); return }
      const header = document.querySelector('.planning-layout > .planning-unified-navigation')
      const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
      const reviewRect = toolbar.closest('.teacher-year-review')?.getBoundingClientRect()
      const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height)
      const boundary = headerBottom + toolbarHeight + 78
      if (reviewRect) {
        document.documentElement.style.setProperty('--teacher-pinned-left', Math.max(0, reviewRect.left) + 'px')
        document.documentElement.style.setProperty('--teacher-pinned-width', Math.min(reviewRect.width, window.innerWidth - Math.max(0, reviewRect.left)) + 'px')
      }
      document.documentElement.style.setProperty('--teacher-pinned-top', (headerBottom + toolbarHeight) + 'px')
      document.documentElement.style.setProperty('--teacher-review-sticky-top', headerBottom + 'px')
      let found = null
      for (const section of sections) {
        const rect = section.getBoundingClientRect()
        const heading = section.querySelector(':scope > .chapter-heading')
        if (heading && rect.top <= boundary && rect.bottom > boundary) {
          found = { name: heading.textContent.trim(), tone: heading.className.match(/chapter-tone-[0-9]+/)?.[0] || '' }
          break
        }
      }
      if (!found) {
        const first = sections[0]
        const last = sections[sections.length - 1]
        const candidate = first.getBoundingClientRect().top > boundary ? first : last
        const heading = candidate.querySelector(':scope > .chapter-heading')
        if (heading) found = { name: heading.textContent.trim(), tone: heading.className.match(/chapter-tone-[0-9]+/)?.[0] || '' }
      }
      setPinnedChapter(prev => prev?.name === found?.name && prev?.tone === found?.tone ? prev : found)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [teacherTab, showPastTeacherWeeks])

  useEffect(() => {
    if (teacherTab !== "arsplan") return undefined
    const updateHeight = () => {
      const bar = document.querySelector('#lararvy .teacher-year-review-bar')
      if (bar) document.documentElement.style.setProperty('--teacher-review-bar-height', Math.ceil(bar.getBoundingClientRect().height) + 'px')
    }
    const observer = new ResizeObserver(updateHeight)
    const bar = document.querySelector('#lararvy .teacher-year-review-bar')
    if (bar) observer.observe(bar)
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
      document.documentElement.style.removeProperty('--teacher-review-bar-height')
    }
  }, [teacherTab, showPastTeacherWeeks])

  const [creatingFromBranch, setCreatingFromBranch] = useState(false)
  // Layouten är responsiv i CSS; ingen automatisk utzoomning av mappträdet.
  const boardTreeRef = useRef(null)

  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [navigationHistory, setNavigationHistory] = useState([{ tab: 'mina', planId: null, calendar: false }])
  const [navigationIndex, setNavigationIndex] = useState(0)
  const restoringNavigation = useRef(false)

  const [pasteText, setPasteText] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const [fileImportState, setFileImportState] = useState({phase:'idle',message:''})
  const [previewStudents, setPreviewStudents] = useState(() => window.location.hash === '#elevvy')
  const [, setA4Demo] = useState(false)
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
  const historyRef = useRef({ past: [], current: JSON.stringify(plan), future: [] })
  const historySkipRef = useRef(false)
  const [, setHistoryVersion] = useState(0)
  useEffect(() => {
    const next = JSON.stringify(plan)
    const history = historyRef.current
    if (next === history.current) return
    if (historySkipRef.current) {
      historySkipRef.current = false
      history.current = next
      return
    }
    history.past.push(history.current)
    if (history.past.length > 60) history.past.shift()
    history.current = next
    history.future = []
    setHistoryVersion(v => v + 1)
  }, [plan])
  const undoPlan = () => {
    const h = historyRef.current
    if (!h.past.length) return
    h.future.unshift(h.current)
    h.current = h.past.pop()
    historySkipRef.current = true
    setPlan(JSON.parse(h.current))
    setHistoryVersion(v => v + 1)
  }
  const redoPlan = () => {
    const h = historyRef.current
    if (!h.future.length) return
    h.past.push(h.current)
    h.current = h.future.shift()
    historySkipRef.current = true
    setPlan(JSON.parse(h.current))
    setHistoryVersion(v => v + 1)
  }
  const savedPlanRef = useRef(JSON.stringify(plan))
  const [, setSavedRevision] = useState(0)
  const isDirty = JSON.stringify(plan) !== savedPlanRef.current
  const confirmNavigation = () => JSON.stringify(latestPlanRef.current) === savedPlanRef.current || window.confirm('Du har osparade ändringar. Vill du lämna dem utan att spara?')
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
  const teacherDisplayWeeks = weeks.map((week, index) => ({week, index})) // Alla veckor finns kvar; passerade veckor kan fällas ut kapitelvis
  const pastTeacherWeeks = teacherDisplayWeeks.filter(({week}) => week.weekStart && week.weekStart < mondayOf(new Date()))
  const upcomingTeacherWeeks = teacherDisplayWeeks.filter(({week}) => !week.weekStart || week.weekStart >= mondayOf(new Date()))
  // Standardvyn visar tre veckor: föregående, nuvarande och nästa (utan att användaren behöver klicka "Alla veckor").
  const defaultWindowFirst = (() => { const first = upcomingTeacherWeeks[0] ? teacherDisplayWeeks.indexOf(upcomingTeacherWeeks[0]) : teacherDisplayWeeks.length; return Math.max(0, first - 1) })()
const addNewTeacherWeek = () => setPlan(p => {
    const existing = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
    const base = existing.find(w => String(w.weekStart || w.weekNumber) === focusedTeacherWeek) || [...existing].sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''))[0]
    const newStart = addWeeks(base?.weekStart || p.startDate, 1)
    // Veckor efter den nya flyttas en vecka, så numren (Vecka N) räknas om automatiskt.
    const shifted = existing.map(w => (w.weekStart && w.weekStart >= newStart) ? { ...w, weekStart: addWeeks(w.weekStart, 1), weekNumber: calendarWeekNumber(addWeeks(w.weekStart, 1)) ?? w.weekNumber } : w)
    const newWeek = makeWeeks({ ...p, startWeek: calendarWeekNumber(newStart), startDate: newStart, weeks: 1 }, 1)[0]
    const all = [...shifted, newWeek].sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''))
    return { ...p, weeks: all.length, weeksData: all }
  })
  const removeFocusedTeacherWeek = () => {
    const target = weeks.find(w => String(w.weekStart || w.weekNumber) === focusedTeacherWeek)
    if (!target || weeks.length <= 1) return
    const index = weeks.indexOf(target)
    if (hasWeekWork(target, index) && !window.confirm(`Ta bort vecka ${target.weekNumber} och allt innehåll i veckan?`)) return
    setPlan(p => {
      const current = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
      const remaining = current.filter(w => w.weekStart !== target.weekStart || w.weekNumber !== target.weekNumber)
      return { ...p, weeks: remaining.length, weeksData: remaining, startWeek: Number(remaining[0]?.weekNumber) || p.startWeek }
    })
    setFocusedTeacherWeek(null)
  }
  useEffect(() => { const home = () => { setFocusedTeacherWeek(null); setShowPastTeacherWeeks(false) }; window.addEventListener('planning-home', home); return () => window.removeEventListener('planning-home', home) }, [])
  const windowStart = Math.max(0, Math.min(teacherWindowStart ?? defaultWindowFirst, Math.max(0, teacherDisplayWeeks.length - 4)))
  const defaultTeacherWindow = teacherDisplayWeeks.slice(windowStart, windowStart + 4)
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
          setSimpleSetup(false)
          setTeacherTab("arsplan")
          setCalendarOpen(false)
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

  function shiftAllWeeks(index, target) {
    const currentWeeks=displayWeeks(plan)
    const selected=currentWeeks[index]
    if(!selected)return
    const current=calendarWeekNumber(selected.weekStart)
    if(!Number.isInteger(target)||target<1||target>53||current==null)return
    const shiftedDate=addWeeks(selected.weekStart,target-current)
    if(calendarWeekNumber(shiftedDate)!==target){setStatus('Veckonumret finns inte vid detta årsskifte.');return}
    const shift=target-current
    setPlan(previous=>{
      const source=displayWeeks(previous)
      const updated=source.map(week=>{
        const weekStart=addWeeks(week.weekStart,shift)
        const weekNumber=calendarWeekNumber(weekStart)
        const title=!week.title||/^Vecka\s+\d+$/i.test(week.title) ? 'Vecka '+weekNumber : week.title
        return {...week,weekStart,weekNumber,title}
      })
      return {...previous,startDate:updated[0]?.weekStart||previous.startDate,startWeek:updated[0]?.weekNumber||previous.startWeek,weeksData:updated}
    })
    setStatus('Alla veckor och datum har anpassats. Spara planeringen för att behålla ändringen.')
  }

  function insertBlankWeekAfter(index) {
    setPlan(previous => {
      const existing=displayWeeks(previous)
      if(index<0||index>=existing.length-1||existing.length>=52)return previous
      const nextDate=addWeeks(existing[index].weekStart,1)
      const blank=makeWeeks({...previous,startDate:nextDate,startWeek:calendarWeekNumber(nextDate),weeks:1},1)[0]
      const following=existing.slice(index+1).map(week=>{
        const weekStart=addWeeks(week.weekStart,1)
        const weekNumber=calendarWeekNumber(weekStart)
        return {...week,weekStart,weekNumber,title:!week.title||/^Vecka\s+\d+$/i.test(week.title)?'Vecka '+weekNumber:week.title}
      })
      const weeksData=[...existing.slice(0,index+1),blank,...following]
      return {...previous,weeks:weeksData.length,weeksData}
    })
    setStatus('Tom vecka infogad. Efterföljande veckor har flyttats framåt.')
  }

  function updateWeek(index, changes) {
    setPlan(p => ({ ...p, weeksData: displayWeeks(p).map((week, i) => {
      if (i !== index) return week
      const next = { ...week, ...changes }
      if (changes.weekStart) {
        const monday = mondayOf(changes.weekStart + 'T12:00:00')
        const number = calendarWeekNumber(monday)
        next.weekStart = monday
        if (number != null) {
          next.weekNumber = number
          if (!week.title || /^Vecka\s+\d+$/i.test(week.title)) next.title = `Vecka ${number}`
        }
      }
      return next
    }) }))
  }

  function setAllWeeksDisplayMode(mode) {
    if (!["normal", "extra", "hidden"].includes(mode) || busy) return
    const label = mode === "extra" ? "visa alla veckor för elever, även passerade" : mode === "hidden" ? "dölja alla veckor för elever" : "återställa automatisk elevvisning för alla veckor"
    if (!window.confirm("Vill du " + label + "? Det påverkar samtliga veckor.")) return
    setPlan(p => ({ ...p, weeksData: displayWeeks(p).map(week => ({
      ...week,
      hidden: mode === "hidden",
      keepVisibleExtra: mode === "extra"
    })) }))
    setStatus("Elevvisning för alla veckor har ändrats. Ändringen sparas automatiskt.")
  }

  function setAllWeeksVisibility(visible) {
    setPlan(p => ({ ...p, weeksData: displayWeeks(p).map(week => ({ ...week, hidden: !visible })) }))
    setStatus(visible ? 'Alla veckor visas nu i Elevvy. Ändringen sparas automatiskt.' : 'Alla veckor är nu dolda i Elevvy. Ändringen sparas automatiskt.')
  }


  async function save(publish, automatic = false) {
    if (busy) return
    if (!String(plan.title || '').trim()) return setStatus('Skriv ett namn på årsplaneringen.')
    if (!String(plan.subject || '').trim()) return setStatus('Skriv ämne.')
    if ((plan.schoolClosures || []).some(item => !validSchoolClosure(item))) return setStatus('Rätta namn och datum för lov/studiedagar innan du sparar eller publicerar.')
    if (publish && !automatic && !weeks.some(week => week && !week.hidden && (
      String(week.content || '').trim() || String(week.chapter || '').trim() ||
      week.items?.length || week.pages?.some(item => String(item || '').trim()) ||
      week.assignments?.some(item => String(item || '').trim()) ||
      week.links?.some(item => resourceInfo(typeof item === 'string' ? item : item?.url || '')) ||
      week.lessons?.some(lesson => lesson.topics?.some(topic => String(topic.name || '').trim() ||
        topic.pages?.some(item => String(item || '').trim()) ||
        topic.assignments?.some(item => String(item || '').trim()) ||
        topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || ''))))
    ))) return setStatus('Ingen synlig vecka har innehåll. Lägg till minst en uppgift eller ett lektionsinnehåll innan du publicerar.')
    if (publish && !automatic && !sanitizeForStudents({ ...plan, weeksData: weeks }).weeksData.length) return setStatus('Det finns inga synliga veckor att publicera. Markera minst en vecka med ”Visa för elever”.')
    if (publish && weeks.some(week => week && !week.hidden && !validSchoolClosure({ name: 'Vecka', startDate: week.weekStart, endDate: week.weekStart }))) return setStatus('En synlig vecka saknar giltigt startdatum. Rätta veckans datum innan publicering.')
    if (publish && !automatic && !window.confirm(
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
      if (error) { setStatus(`Kunde inte spara: ${error.message}`); return false }
      else {
        if (simpleSetup) { setSimpleSetup(false); setTeacherTab('arsplan'); setCalendarOpen(false) }
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
            : 'Planeringen är sparad.'
        setStatus(newerEdits ? `${message} Nya ändringar i redigeraren är ännu inte sparade.` : message)
        return !newerEdits
      }
    } catch (error) {
      setStatus(`Kunde inte spara: ${error.message || 'Okänt fel'}`)
      return false
    } finally {
      setBusy(false)
    }
  }

  // Spara automatiskt enbart redan skapade planeringar som utkast.
  // Publicerad elevversion påverkas inte förrän läraren väljer Publicera.
  useEffect(() => {
    if (!selectedId || simpleSetup || busy || !isDirty || teacherTab === 'new') return undefined
    const timer = window.setTimeout(() => {
      if (JSON.stringify(latestPlanRef.current) !== savedPlanRef.current) {
        void save(true, true)
      }
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [plan, selectedId, simpleSetup, busy, isDirty, teacherTab])



  async function importFile(file) {
    if (!file) return
    setBusy(true); setStatus(`Läser ${file.name}...`); setPendingImport(null); setFileImportState({phase:'loading',message:`Läser ${file.name}…`})
    try {
      const chapterWeeks = /[.]xlsx?$/i.test(file.name) ? distributeChapterWorkbook(plan, XLSX.read(await file.arrayBuffer(),{type:'array'})) : null
      const text = chapterWeeks ? '' : await extractText(file)
      const weeksData = chapterWeeks || distributeText(plan,text)
      setPendingImport({ source: file.name, weeksData, structured: true })
      setStatus(chapterWeeks ? 'Kapitel och delmoment är fördelade på planeringens lektioner. Granska före import.' : 'Importen är klar för förhandsgranskning. Inget har ersatts ännu.'); setFileImportState({phase:'success',message:`${file.name} är inläst – granska nedan.`})
    } catch (error) { const message=error.message || 'Importen misslyckades.'; setStatus(message); setFileImportState({phase:'error',message}) }
    setBusy(false)
  }

  function distributePastedText() {
    if (!pasteText.trim()) return setStatus('Klistra in text innan du fördelar den över veckorna.')
    setPendingImport({ source: 'Inklistrad text', weeksData: distributeText(plan, pasteText) })
    setStatus('Texten är klar för förhandsgranskning. Inget har ersatts ännu.')
  }

  function loadPlan(row, className, navigationApproved = false) {
    if (busy) return
    if (!navigationApproved && !confirmNavigation()) return false
    try { window.sessionStorage.setItem(`arsplanering-last-open-${session.user.id}`, String(row.id)) } catch { /* Lagring kan vara blockerad */ }
    setOpenedFromLibrary(teacherTab === 'bibliotek')
    const openedPlan = planFromRow(row)
    setSimpleSetup(false); setSelectedId(row.id); savedPlanRef.current = JSON.stringify(openedPlan); setSavedRevision(revision => revision + 1); setPlan(openedPlan); setTeacherTab('arsplan'); setCalendarOpen(false); setEditingClassView(className || ""); setPreviewStudents(false); setA4Demo(false); setStatus(className ? `Klassen ${className} tillhör grundplaneringen. Öppna klassernas schema nedan.` : ''); if (className) { setCalendarOpen(false); setTimeout(()=>document.querySelector('[aria-label="Kopplade klasser"]')?.scrollIntoView({behavior:'smooth',block:'start'}),150) } else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function shareWithColleague(event) {
    event.preventDefault()
    if (!shareRecipient.trim()) return
    if (plan.receivedCopy) { setShareMessage('En mottagen kopia får inte delas vidare.'); return }
    if (selectedId && isDirty) { setShareMessage('Spara dina ändringar innan du delar planeringen.'); return }
    setBusy(true)
    setShareMessage('')
    try {
      const { data, error } = await supabase.rpc('create_plan_share_invite', {
        p_plan_id: null, p_recipient_email: shareRecipient.trim(), p_password: '',
      })
      if (error) throw error
      if (typeof data === 'string' && data.startsWith('ERROR:')) throw new Error(data.slice(6))
      setShareToken(data)
      setShareMessage('Inbjudan skapad. Skicka engångskoden privat till kollegan. Kollegan får ett eget konto och börjar med en tom planering. Koden gäller i sju dagar.')
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

  async function renamePlan(row) {
    if (busy) return
    if (selectedId === row.id && isDirty) {
      setStatus('Spara dina ändringar innan du byter namn på planeringen.')
      return
    }
    const title = window.prompt('Nytt namn på planeringen:', row.title || '')
    if (title === null) return
    const newTitle = title.trim()
    if (!newTitle) { setStatus('Planeringen måste ha ett namn.'); return }
    if (newTitle === row.title) return
    setBusy(true)
    try {
      const stored = parseContent(row.content)
      if (!stored || typeof stored !== 'object') throw new Error('Planeringens innehåll kunde inte läsas.')
      const updated = { ...stored, title: newTitle }
      const { error } = await supabase.from('veckoplanering').update({
        title: newTitle,
        content: JSON.stringify(updated),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('user_id', session.user.id).select('id').single()
      if (error) throw error
      if (selectedId === row.id) {
        setPlan(p => ({ ...p, title: newTitle }))
        savedPlanRef.current = JSON.stringify({ ...plan, title: newTitle })
        setSavedRevision(v => v + 1)
      }
      await loadPlans()
      setStatus('Planeringen har fått namnet "' + newTitle + '".')
    } catch (error) {
      setStatus('Kunde inte byta namn: ' + (error.message || 'Okänt fel'))
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
  useEffect(() => {
    if (restoringNavigation.current) { restoringNavigation.current = false; return }
    const next = { tab: teacherTab, planId: selectedId, calendar: calendarOpen }
    const current = navigationHistory[navigationIndex]
    if (current?.tab === next.tab && current?.planId === next.planId && current?.calendar === next.calendar) return
    setNavigationHistory(previous => [...previous.slice(0, navigationIndex + 1), next].slice(-40))
    setNavigationIndex(previous => Math.min(previous + 1, 39))
  }, [teacherTab, selectedId, calendarOpen]) // Navigationshistorik per inloggad session.

  const restoreNavigation = direction => {
    const targetIndex = navigationIndex + direction
    if (targetIndex < 0 || targetIndex >= navigationHistory.length) return
    const target = navigationHistory[targetIndex]
    if (!confirmNavigation()) return
    if (target.planId && target.planId !== selectedId) {
      const row = plans.find(item => item.id === target.planId)
      if (row) loadPlan(row, undefined, true)
      else return
    }
    restoringNavigation.current = true
    setTeacherTab(target.tab)
    setCalendarOpen(target.calendar)
    setPreviewStudents(target.tab === 'elevvy')
    setNavigationIndex(targetIndex)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const createPlan = () => {
    if (!confirmNavigation()) return false
    setCreatingFromBranch(false)
    const fresh = {...emptyPlan(), lessonsPerWeek:5, lessonDays:['Måndag','Tisdag','Onsdag','Torsdag','Fredag']}
    try { window.sessionStorage.removeItem(`arsplanering-last-open-${session.user.id}`) } catch { /* Lagring kan vara blockerad */ }
    setSimpleSetup(true)
    setSimpleMore(false)
    setPlan(fresh); setSelectedId(null); savedPlanRef.current = JSON.stringify(fresh)
    setSavedRevision(revision => revision + 1)
    setTeacherTab('new'); setCalendarOpen(false); setPreviewStudents(false); setA4Demo(false)
    setStatus('Fyll i uppgifterna och välj Skapa planering.')
  }
  const returnToPlanningTree = () => { setTeacherTab('bibliotek'); setCalendarOpen(false); setOpenedFromLibrary(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const [coursePicker, setCoursePicker] = useState(null)
  const [bookPicker, setBookPicker] = useState(null)
  useState('')
  const [bookQuery, setBookQuery] = useState('')
  const bookChoices = bookPicker ? booksForSubject(bookPicker.school, bookPicker.subject).filter(book => [book.title,book.publisher,book.subject,book.levels].some(value => value.toLocaleLowerCase('sv').includes(bookQuery.toLocaleLowerCase('sv')))) : []
  const matchingBookPlan = name => {
    if (!bookPicker || !String(name || '').trim()) return null
    const norm = value => String(value || '').trim().toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ')
    const schoolForm = bookPicker.school === 'Gymnasiet' ? 'Gymnasieskola' : 'Grundskola'
    return [...plans].sort((a,b)=>Number(Boolean(parseContent(a.content)?.archived))-Number(Boolean(parseContent(b.content)?.archived))).find(row => {
      const old = parseContent(row.content)
      return old && (old.kind === 'arsplanering-v2' || old.kind === 'arsplanering-v1')
        && norm(old.schoolForm) === norm(schoolForm)
        && norm(old.subject) === norm(bookPicker.subject)
        && norm(old.grade) === norm(bookPicker.year || '')
        && norm(old.course) === norm(bookPicker.course || (bookPicker.school === 'Gymnasiet' ? bookPicker.subject : ''))
        && norm(old.textbook) === norm(name)
    }) || null
  }
  const chooseBook = name => {
    const existing = matchingBookPlan(name)
    if (!existing) { void confirmBook(name); return }
    const archived = Boolean(parseContent(existing.content)?.archived)
    setBookPicker(null)
    setShowArchive(archived)
    if (!archived) {
      loadPlan(existing)
      setStatus('Planeringen finns redan! Den befintliga grundplaneringen har öppnats. Lägg till klass där.')
    } else {
      setTeacherTab('bibliotek')
      setStatus('Den här planeringen finns redan i ditt arkiv! Återanvänd den istället. Ingen ny dubblett skapades.')
    }
  }
  const confirmBook = async name => {
    const item = bookPicker
    if (!item || busy) return
    if (!confirmNavigation()) return
    const fresh = {
      ...emptyPlan(), schoolYear:libraryYear === 'alla' ? '' : libraryYear,
      schoolForm:item.school === 'Gymnasiet' ? 'Gymnasieskola' : 'Grundskola',
      subject:item.subject,grade:item.year || '',textbook:name,
      course:item.course || (item.school === 'Gymnasiet' ? item.subject : ''),
      title:item.course ? item.subject+' – '+item.course : item.year ? item.subject+' – '+item.year : item.subject,
      lessonsPerWeek:5,lessonDays:['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
    }
    fresh.weeksData = makeWeeks(fresh)
    setBusy(true)
    setStatus('Kontrollerar om grundplaneringen redan finns…')
    try {
      // Check the server, not only the locally loaded list, including archived plans.
      const {data: existingRows, error: lookupError} = await supabase.from('veckoplanering')
        .select('id,content').eq('user_id',session.user.id)
      if (lookupError) throw lookupError
      const normalize = value => String(value || '').trim().toLocaleLowerCase('sv-SE').replace(/\s+/g,' ')
      const existing = [...(existingRows || [])].sort((a,b)=>Number(Boolean(parseContent(a.content)?.archived))-Number(Boolean(parseContent(b.content)?.archived))).find(row => {
        const old = parseContent(row.content)
        return old && (old.kind === 'arsplanering-v2' || old.kind === 'arsplanering-v1')
          && normalize(old.schoolForm) === normalize(fresh.schoolForm)
          && normalize(old.subject) === normalize(fresh.subject)
          && normalize(old.grade) === normalize(fresh.grade)
          && normalize(old.course) === normalize(fresh.course)
          && normalize(old.textbook) === normalize(fresh.textbook)
      })
      if (existing) {
        const archived = Boolean(parseContent(existing.content)?.archived)
        setStatus(archived
          ? 'Den här grundplaneringen finns redan i ditt arkiv. Återanvänd den och lägg till klass i stället för att skapa en dubblett.'
          : 'Den här grundplaneringen finns redan. Öppna den befintliga planeringen och lägg till klass i stället.')
        setBookPicker(null)
        setShowArchive(archived)
        setTeacherTab('bibliotek')
        return
      }
      setStatus('Skapar grundplanering och veckor…')
      const payload = {kind:'arsplanering-v2',...fresh,published:false,publicSlug:''}
      const {data,error} = await supabase.from('veckoplanering').insert({
        user_id:session.user.id,title:fresh.title,week_start:fresh.startDate,
        content:JSON.stringify(payload),subject:fresh.subject,school_year:fresh.schoolYear,
        class_name:fresh.className,start_date:fresh.startDate,weeks:fresh.weeks,
        ...publicationFields(false,false,'',null),updated_at:new Date().toISOString()
      }).select('id').single()
      if(error) throw error
      setPlan(payload)
      savedPlanRef.current = JSON.stringify(payload)
      setSavedRevision(v=>v+1)
      setSelectedId(data.id)
      setCreatingFromBranch(false)
      setSimpleSetup(false)
      setTeacherTab('arsplan')
      setCalendarOpen(false)
      setPreviewStudents(false)
      setBookPicker(null)
      setStatus('Grundplaneringen är skapad. Veckorna visas nedan.')
      try {window.sessionStorage.setItem(`arsplanering-last-open-${session.user.id}`,String(data.id))} catch {}
      void loadPlans()
    } catch(error) {
      setStatus('Kunde inte skapa grundplaneringen: '+(error.message||'Okänt fel'))
    } finally {setBusy(false)}
  }
  const previousStepLabel = teacherTab === 'arsplan' || teacherTab === 'elevvy' ? (librarySubject ? librarySubject.split('|')[1] : 'Mina planeringar') : teacherTab === 'bibliotek' ? (librarySubject ? librarySchool || 'Mina planeringar' : librarySchool ? 'Mina planeringar' : 'Startsida') : 'Startsida'
  const goToPreviousStep = () => {
    if (!confirmNavigation()) return
    if (adminOpen) onToggleAdmin?.()
    if (teacherTab === 'arsplan' || teacherTab === 'elevvy') {
      if (calendarOpen) { setCalendarOpen(false); return }
      setTeacherTab('bibliotek'); setCalendarOpen(false); setFocusedTeacherWeek(null)
    } else if (teacherTab === 'bibliotek' && librarySubject) {
      setLibrarySubject('')
    } else if (teacherTab === 'bibliotek' && librarySchool) {
      setLibrarySchool('')
    } else {
      setTeacherTab('mina'); setCalendarOpen(false)
    }
    window.scrollTo({top:0,behavior:'smooth'})
  }
  return <div style={planThemeStyle(plan, selectedId)} className={`planning-layout ${teacherTab === "mina" ? "view-home" : teacherTab === "elevvy" ? "view-student" : teacherTab === "new" ? "view-new" : "view-teacher"}`}>{teacherTab !== "mina" && <Navigation planTitle={teacherTab === "bibliotek" ? "Mina planeringar" : (teacherTab === "arsplan" || teacherTab === "elevvy") && selectedId ? (plan.title || plan.subject || "Min planering") : ""} previousLabel={previousStepLabel} onPrevious={goToPreviousStep} onAllWeeks={() => { setFocusedTeacherWeek(null); setFocusedTeacherLesson(null); setShowPastTeacherWeeks(value => !value); setTeacherWeekOverview(true); setTeacherTab("arsplan"); setCalendarOpen(false) }} allWeeksOpen={showPastTeacherWeeks} active={teacherTab} plans={plans.filter(row => !parseContent(row.content)?.archived)} selectedId={selectedId} getPlanTheme={row => planTheme(parseContent(row.content), row.id)} onOpenPlan={loadPlan} onDeletePlan={deletePlan} onNavigate={(id, planningHome = false) => { if (!confirmNavigation()) return false; if (planningHome) window.dispatchEvent(new Event('planning-home')); if (id === 'bibliotek') { setLibrarySchool(''); setLibrarySubject(''); setLibraryBoardPage(0); setShowArchive(false) } setTeacherTab(id); setCalendarOpen(false); if (id === 'elevvy') { setPreviewStudents(true); setCalendarOpen(false) } else { setPreviewStudents(false) } }} onOpenExample={() => { if (!confirmNavigation()) return false; return openExample() }} onOpenArchive={() => { if (!confirmNavigation()) return false; setShowArchive(true); setTeacherTab('bibliotek') }} onToggleCalendar={() => { if (!confirmNavigation()) return false; setTeacherTab('arsplan'); setCalendarOpen(true) }} calendarOpen={calendarOpen} hasOpenPlan={Boolean(selectedId && teacherTab === 'arsplan')} isAdmin={isAdmin} adminOpen={adminOpen} onOpenAdmin={() => { if (!confirmNavigation()) return false; onToggleAdmin?.(); return true }} onCloseAdmin={() => { if (adminOpen) onToggleAdmin?.() }} onSignOut={() => { if (!confirmNavigation()) return false; return supabase.auth.signOut() }} pendingCount={pendingCount} planSearch={planSearch} onPlanSearchChange={setPlanSearch} showArchive={showArchive} planContext={selectedId && teacherTab === 'arsplan' ? {subject:plan.subject || plan.title, textbook:plan.textbook, grade:plan.grade || plan.course} : null} onPrintPlan={selectedId && teacherTab === 'arsplan' ? () => { document.body.classList.add("teacher-plan-print"); const cleanup = () => document.body.classList.remove("teacher-plan-print"); window.addEventListener("afterprint", cleanup, { once:true }); window.print(); setTimeout(cleanup,1500) } : null} /> }<main className={`shell${adminOpen ? " admin-workspace" : ""}`} id="lararvy">
  {!isAdmin && <UpdateNotices userId={session.user.id} isAdmin={false} />}
  {adminOpen ? adminContent : <>
    {teacherTab !== "elevvy" && teacherTab !== "mina" && <header className="topbar">
      
      <div className="teacher-header-identity">
        
        <nav className="teacher-breadcrumb" aria-label="Du är här">
        </nav>
        {teacherTab !== "bibliotek" && teacherTab !== "arsplan" && <h1>{teacherTab === "new" ? "Skapa ny planering" : teacherTab === "mina" ? "Startsida" : (plan.title?.trim() || "Ny planering")}</h1>}
        {teacherTab !== 'bibliotek' && teacherTab !== 'arsplan' && <p className="muted">{session.user.email}</p>}
        {AVSTANGD_GRANSSNITT && selectedId && teacherTab === 'arsplan' && <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',marginTop:10}}>
          <div><p style={{margin:'0 0 4px',color:'#526a81'}}>Grundplanering</p><strong style={{fontSize:'clamp(1.3rem,3vw,2rem)'}}>{plan.subject || plan.title}</strong>{(plan.textbook || plan.schoolYear) && <p style={{margin:'5px 0 0',color:'#526a81'}}>{[plan.textbook,plan.schoolYear].filter(Boolean).join(' · ')}</p>}</div>
          <div className="planning-grade-badge" style={{textAlign:'center',padding:'5px 9px',borderRadius:9,background:'#edf6ff',border:'1px solid #d5e6f7'}}><div style={{fontSize:12,fontWeight:750,letterSpacing:'.09em',color:'#526a81'}}>{['gymnasieskola','anpassad-gymnasieskola','komvux'].includes(String(plan.schoolForm || '').toLocaleLowerCase('sv-SE')) ? 'KURS' : 'ÅRSKURS'}</div><div style={{fontSize:'clamp(.85rem,1.5vw,1.1rem)',fontWeight:850,color:'#234e75'}}>{['gymnasieskola','anpassad-gymnasieskola','komvux'].includes(String(plan.schoolForm || '').toLocaleLowerCase('sv-SE')) ? (plan.course || plan.grade || '—') : (plan.grade || plan.course || '—')}</div></div>
        </div>}

      </div>
      
      
      {AVSTANGD_GRANSSNITT && selectedId && teacherTab === "arsplan" && <div className="archive-plan-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="secondary" disabled={busy || !plans.some(row => row.id === selectedId)} style={{ fontSize: '1rem', fontWeight: 850, padding: '13px 18px', borderRadius: 12, background: '#f9e5ed', border: '2px solid #c87e9b', color: '#73394f' }} onClick={() => { const row = plans.find(item => item.id === selectedId); if (row) void setArchived(row, true) }}>🗂 Arkivera planeringen</button>
        
      </div>}
      {AVSTANGD_GRANSSNITT && teacherTab === "new" && <div className="topbar-share-actions">
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Logga ut</button>
      </div>}
      <div className="planning-header-toolbar" style={{width:'100%',flexBasis:'100%'}}>
    {selectedId && !calendarOpen && teacherTab === "arsplan" && <div id="kopplade-klasser" style={{margin:"10px 0 14px"}}><ClassSchedules onOpenCalendar={()=>{setCalendarOpen(true);window.scrollTo({top:0,behavior:"smooth"})}} onGoHome={returnToPlanningTree} plan={{...plan,weeksData:weeks}} publicSlug={plan.published ? (plan.publicSlug || buildSlug(plan)) : ""} onChange={next => setPlan(previous => ({...previous,classGroups:next.classGroups}))} editingClassView={editingClassView} setEditingClassView={setEditingClassView} onSelectClassPreview={setClassStudentPreview} onUndo={undoPlan} onRedo={redoPlan} canUndo={historyRef.current.past.length>0} canRedo={historyRef.current.future.length>0} onSetAllDisplayMode={setAllWeeksDisplayMode} allWeeksDisplayMode={weeks.every(w=>w.hidden)?"hidden":weeks.every(w=>!w.hidden&&w.keepVisibleExtra)?"extra":weeks.every(w=>!w.hidden&&!w.keepVisibleExtra)?"normal":""} weeksBusy={busy} /></div>}
      </div>
    </header>}

    {AVSTANGD_GRANSSNITT && teacherTab === "new" && shareOpen && <section className="card colleague-share-panel" aria-label="Klona och dela med kollega">
      <div className="share-panel-heading"><div><h2>Klona och dela</h2><p className="muted">Kollegan skapar ett eget konto och börjar med en tom planering.</p></div><button type="button" className="secondary" onClick={() => setShareOpen(false)}>Stäng</button></div>
      <div className="colleague-share-grid">
        <form onSubmit={shareWithColleague}>
          <h3>Bjud in en kollega</h3><p className="muted">Kollegan behöver ett eget konto med samma e-postadress som du anger. Du skickar engångskoden själv – ingen e-post skickas automatiskt.</p>
          {plan.receivedCopy ? <p className="muted">Den här planeringen är mottagen från en kollega och kan inte delas vidare.</p> : <>
            <label>Kollegans e-postadress<input type="email" required autoComplete="email" value={shareRecipient} onChange={e => setShareRecipient(e.target.value)} placeholder="kollega@skola.se" /></label>
            <button type="submit" className="primary" disabled={busy}>Skapa inbjudan</button>
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
    {teacherTab !== "elevvy" && (isDirty || busy) && <div className="quick-save-bar" role="region" aria-label="Snabbspara årsplanering">
      <span aria-live="polite">{busy ? "Sparar…" : "Osparade ändringar"}</span>
      <span className="autosave-info">Sparas automatiskt</span>
    </div>}

    

    {selectedId && !calendarOpen && teacherTab === "arsplan" && editingClassView && <ClassTwoWeekCalendar plan={{...plan,weeksData:weeks}} className={editingClassView} onChangeClassGroups={groups=>setPlan(previous=>({...previous,classGroups:groups}))} onSave={()=>save(false)} busy={busy} saveStatus={status} />}
    {selectedId && !calendarOpen && teacherTab === "arsplan" && <div className="expanded-weeks-inline" style={editingClassView && plan.classGroups?.some(g=>g.name===editingClassView)?{display:"none"}:undefined}>
    
<section className="card teacher-year-review">
      <div className="teacher-year-review-bar" aria-label="Årsplaneringens verktygsrad">
        <div className="teacher-review-title"><h2>Årsplanering</h2><span className="count-pill">{weeks.length} veckor</span></div>
        <div className="teacher-review-actions">
        </div>
      </div>
      {<div className="teacher-pinned-chapter-shell" aria-label="Aktuellt kapitel"><div className={`teacher-pinned-chapter-heading ${pinnedChapter?.tone || ""}`}>{pinnedChapter?.name || "Kapitel"}</div>{pinnedChapter?.name && <ChapterVocabulary chapter={pinnedChapter.name} weeks={weeks.filter(week => (week.chapter?.trim() || "Utan kapitel") === pinnedChapter.name)} />}</div>}
      <nav className="teacher-week-navigation" aria-label="Navigera mellan veckor">

        
        {focusedTeacherWeek && <button type="button" className="teacher-close-week" aria-label="Stäng veckan och visa fyra veckor" title="Stäng veckan" onClick={() => {setFocusedTeacherWeek(null);setFocusedTeacherLesson(null);setTeacherWeekOverview(false)}}>✕ Stäng</button>}

        <button type="button" aria-label="Föregående vecka" onClick={() => { if (!focusedTeacherWeek) { setTeacherWindowStart(Math.max(0, windowStart - 1)); return } const i = weeks.findIndex(w => String(w.weekStart || w.weekNumber) === focusedTeacherWeek); const next = weeks[Math.max(0, i < 0 ? 0 : i - 1)]; if (next) setFocusedTeacherWeek(String(next.weekStart || next.weekNumber)) }}>◀</button>
        {[-1, 0, 1].map(offset => { const i = weeks.findIndex(w => String(w.weekStart || w.weekNumber) === focusedTeacherWeek); const todayIndex = weeks.findIndex(w => w.weekStart === mondayOf(new Date())); const center = i >= 0 ? i : (todayIndex >= 0 ? todayIndex : 0); const w = weeks[center + offset]; return <button type="button" key={offset} className={offset === 0 ? 'current' : 'adjacent'} disabled={!w} onClick={() => w && setFocusedTeacherWeek(String(w.weekStart || w.weekNumber))}>{w ? `Vecka ${calendarWeekNumber(w.weekStart) ?? w.weekNumber}` : '–'}</button> })}
        <button type="button" aria-label="Nästa vecka" onClick={() => { if (!focusedTeacherWeek) { setTeacherWindowStart(Math.min(Math.max(0, teacherDisplayWeeks.length - 4), windowStart + 1)); return } const i = weeks.findIndex(w => String(w.weekStart || w.weekNumber) === focusedTeacherWeek); const next = weeks[Math.min(weeks.length - 1, i < 0 ? 0 : i + 1)]; if (next) setFocusedTeacherWeek(String(next.weekStart || next.weekNumber)) }}>▶</button>
        
        <button type="button" className="teacher-all-weeks-inline-toggle" aria-expanded={showPastTeacherWeeks} title={showPastTeacherWeeks ? "Stäng alla öppna veckor och återgå till grundplaneringen" : "Visa alla veckor i en sammanhängande vy"} onClick={() => { setFocusedTeacherWeek(null); setFocusedTeacherLesson(null); setTeacherWeekOverview(false); setWeekContentOverrides({}); setShowPastTeacherWeeks(current => !current) }}><span aria-hidden="true">{showPastTeacherWeeks ? "✕" : "▦"}</span> {showPastTeacherWeeks ? "Stäng alla veckor" : "Visa alla veckor"}</button>
      </nav>
      {focusedTeacherWeek && <div className="teacher-mobile-week-overview"><div className="teacher-mobile-week-overview-actions"><strong>Vecka {calendarWeekNumber(weeks.find(w=>String(w.weekStart||w.weekNumber)===focusedTeacherWeek)?.weekStart) || ""} · Helvecksvy</strong><button type="button" className="secondary" aria-expanded={!teacherWeekOverview} onClick={()=>setTeacherWeekOverview(v=>!v)}>{teacherWeekOverview?"Visa och redigera detaljer":"Visa hela veckan"}</button></div>{teacherWeekOverview && <CalendarWeekThumbnail week={weeks.find(w=>String(w.weekStart||w.weekNumber)===focusedTeacherWeek)} entryType={plan.entryType||"lektion"} onOpen={()=>setTeacherWeekOverview(false)} onOpenLesson={()=>setTeacherWeekOverview(false)}/>}</div>}

      {!focusedTeacherWeek && !showPastTeacherWeeks && <div className="smart-four-week-overview" aria-label="Fyra veckor i miniatyr">
        {defaultTeacherWindow.map(({week}) => <div className="smart-week-mini" key={week.weekStart || week.weekNumber}>
          <CalendarWeekThumbnail week={week} entryType={plan.entryType||"lektion"} onOpen={()=>{setFocusedTeacherWeek(String(week.weekStart||week.weekNumber));setTeacherWeekOverview(false)}} onOpenLesson={lessonIndex=>{if(lessonIndex<0)return;setLessonModal({weekKey:String(week.weekStart||week.weekNumber),lessonIndex});setLessonModalChanged(false)}}/>
          
        </div>)}
      </div>}
      {lessonModal && (()=>{const modalIndex=weeks.findIndex(w=>String(w.weekStart||w.weekNumber)===lessonModal.weekKey);const modalWeek=weeks[modalIndex];if(!modalWeek)return null;return <div className="smart-lesson-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){setLessonModal(null);setLessonModalChanged(false)}}}>
        <section className="smart-lesson-dialog" role="dialog" aria-modal="true" aria-label={`Redigera lektion ${lessonModal.lessonIndex+1} vecka ${calendarWeekNumber(modalWeek.weekStart)??modalWeek.weekNumber}`}>
          <div className="smart-lesson-dialog-header"><div><strong>Vecka {calendarWeekNumber(modalWeek.weekStart)??modalWeek.weekNumber}</strong><span> · Lektion {lessonModal.lessonIndex+1} av {modalWeek.lessons?.length||1}</span></div><button type="button" className={lessonModalChanged?'smart-lesson-dialog-done':'smart-lesson-dialog-close'} aria-label={lessonModalChanged?'Klar och återgå till fyra veckor':'Stäng utan ändringar'} onClick={()=>{setLessonModal(null);setLessonModalChanged(false)}}>{lessonModalChanged?'✓ Klar':'✕'}</button></div>
          <div className="smart-lesson-dialog-body"><LessonDetails week={modalWeek} entryType={plan.entryType||"lektion"} onlyLessonIndex={lessonModal.lessonIndex} onPreviousLesson={()=>setLessonModal(current=>({...current,lessonIndex:Math.max(0,current.lessonIndex-1)}))} onNextLesson={()=>setLessonModal(current=>({...current,lessonIndex:Math.min((modalWeek.lessons?.length||1)-1,current.lessonIndex+1)}))} lessonCount={modalWeek.lessons?.length||1} onUndo={undoPlan} onRedo={redoPlan} canUndo={historyRef.current.past.length>0} canRedo={historyRef.current.future.length>0} onChange={changes=>{updateWeek(modalIndex,changes);setLessonModalChanged(true)}} /></div>
        </section>
      </div>})()}
      {showPastTeacherWeeks && !focusedTeacherWeek && <div className="teacher-scroll-context" hidden aria-live="off"><span className="teacher-scroll-context-label" /></div>}
      <div className={`teacher-months ${focusedTeacherWeek ? "teacher-months-focused" : ""} ${focusedTeacherWeek && teacherWeekOverview ? "teacher-months-overview-hidden" : ""} ${!focusedTeacherWeek && !showPastTeacherWeeks ? "smart-months-mini-hidden" : ""} `}>
        {Object.values((focusedTeacherWeek ? teacherDisplayWeeks.filter(item => String(item.week.weekStart || item.week.weekNumber) === focusedTeacherWeek) : (showPastTeacherWeeks ? teacherDisplayWeeks : defaultTeacherWindow)).slice().sort((a, b) => (a.week.weekStart || '').localeCompare(b.week.weekStart || '')).reduce((chapters, item) => {
          const chapterName = item.week.chapter?.trim() || 'Utan kapitel'
          if (!chapters[chapterName]) chapters[chapterName] = { name: chapterName, items: [] }
          chapters[chapterName].items.push(item)
          return chapters
        }, {})).map(group => <section className="teacher-month-section teacher-chapter-section" data-chapter={group.name} key={group.name}>
          <div className="teacher-chapter-sticky"><h3 className={`chapter-heading chapter-tone-${chapterTone(group.name)}`}>{group.name}</h3>{group.name !== "Utan kapitel" && <ChapterVocabulary chapter={group.name} weeks={group.items.map(item => item.week)} />}</div>
          <div className="teacher-month-weeks">
          {group.items.map(({ week, index }) => <div className="chapter-week-group" data-week={calendarWeekNumber(week.weekStart) ?? week.weekNumber} key={`${week.weekStart || week.weekNumber}-${index}`}>
          <article className={`week-card teacher-collapsible-week ${(focusedTeacherWeek || (!showPastTeacherWeeks && !focusedTeacherWeek) || (weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen)) ? "teacher-week-open" : "teacher-week-closed"}`} id={`calendar-week-${week.weekNumber}`} style={{ scrollMarginTop: 95 }}>
          <div className="teacher-week-controls">
          <div className="teacher-week-history-actions" aria-label="Ångra eller gör om ändring">
            <button type="button" className="secondary" disabled={historyRef.current.past.length === 0} onClick={undoPlan} title="Ångra senaste ändringen i planeringen">↶ Ångra</button>
            <button type="button" className="secondary" disabled={historyRef.current.future.length === 0} onClick={redoPlan} title="Gör om senaste ångrade ändringen i planeringen">↷ Gör om</button>
          </div>
          <button type="button" className="teacher-week-collapse-toggle" aria-expanded={Boolean(focusedTeacherWeek || (!showPastTeacherWeeks && !focusedTeacherWeek) || (weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen))} onClick={()=>{const key=week.weekStart || `${index}`;setWeekContentOverrides(prev=>({...prev,[key]:!(prev[key] ?? allWeekContentsOpen)}))}} title={(weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen) ? "Dölj innehåll för vecka " + (calendarWeekNumber(week.weekStart) ?? week.weekNumber) : "Visa innehåll för vecka " + (calendarWeekNumber(week.weekStart) ?? week.weekNumber)} aria-label={(weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen) ? "Dölj innehåll för vecka " + (calendarWeekNumber(week.weekStart) ?? week.weekNumber) : "Visa innehåll för vecka " + (calendarWeekNumber(week.weekStart) ?? week.weekNumber)}><span aria-hidden="true">{(weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen) ? "▾" : "▸"}</span></button>

          {!(weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen) && <strong className="teacher-collapsed-week-label">Vecka {calendarWeekNumber(week.weekStart) ?? week.weekNumber}</strong>}

          <div className="teacher-week-elevvisning">
            <label>Elevvisning
              <select aria-label={"Elevvisning vecka "+week.weekNumber} value={week.hidden?"hidden":week.keepVisibleExtra?"extra":"normal"} onChange={e=>updateWeek(index,e.target.value==="hidden"?{hidden:true,keepVisibleExtra:false}:e.target.value==="extra"?{hidden:false,keepVisibleExtra:true}:{hidden:false,keepVisibleExtra:false})}>
                <option value="normal">Automatisk</option>
                <option value="extra">Visa manuellt för elever (även passerad vecka)</option>
                <option value="hidden">Dölj för elever</option>
              </select>
            </label>
          </div>
          <label className="student-visibility-toggle week-heading-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} aria-label={`Visa vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber} för elever`} /><span>{week.hidden ? "Dold för elever" : "Visa för elever"}</span></label>
          </div>
          <div className="teacher-week-collapsible-content" hidden={!(!focusedTeacherWeek && !showPastTeacherWeeks) && !(weekContentOverrides[week.weekStart || `${index}`] ?? allWeekContentsOpen)}>
          <div className="week-top" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong style={{ fontSize: "1.45rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5 }}>Vecka <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Ändra veckonummer" key={`${week.weekStart}-${week.weekNumber}`} style={{ width: "3.3ch", minWidth: 66, fontSize: "1.45rem", fontWeight: 800, padding: "4px 6px" }} defaultValue={calendarWeekNumber(week.weekStart) ?? week.weekNumber} title="Skriv veckonummer direkt och tryck Enter" onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = String(calendarWeekNumber(week.weekStart) ?? week.weekNumber); e.currentTarget.blur() } }} onBlur={e => {
            const target = Number(e.target.value.trim())
            const current = calendarWeekNumber(week.weekStart)
            if (!/^\\d{1,2}$/.test(e.target.value.trim()) || !Number.isInteger(target) || target < 1 || target > 53 || current === null) { e.target.value = String(current ?? week.weekNumber); return }
            if (target === current) return
            const nextDate = addWeeks(week.weekStart, target - current)
            if (calendarWeekNumber(nextDate) !== target) { setStatus('Veckonumret finns inte vid detta årsskifte.'); e.target.value = String(current); return }
            setPlan(previous => {
              const source = displayWeeks(previous)
              const updated = source.map((item, itemIndex) => itemIndex === index ? {
                ...item,
                weekStart: nextDate,
                weekNumber: target,
                title: !item.title || /^Vecka\\s+\\d+$/i.test(item.title) ? 'Vecka '+target : item.title
              } : item)
              return {...previous, weeksData: updated}
            })
            setStatus('Vecka '+target+' är ändrad. Lektionerna är kvar.')
          }} /></strong><span style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatDate(week.weekStart)}</span>
            <button type="button" className="remove-small teacher-week-delete-icon" aria-label={`Ta bort vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber}`} title="Ta bort vecka" disabled={weeks.length <= 1} onClick={() => {
              if (hasWeekWork(week, index) && !window.confirm(`Ta bort vecka ${week.weekNumber} och allt innehåll i veckan?`)) return
              setPlan(p => {
                const current = Array.isArray(p.weeksData) && p.weeksData.length ? p.weeksData : makeWeeks(p)
                const remaining = current.filter((_, i) => i !== index)
                return { ...p, weeks: remaining.length, weeksData: remaining, startWeek: Number(remaining[0]?.weekNumber) || p.startWeek }
              })
            }}>×</button></div>
          <label className="chapter-editor">Kapitel / tema (valfritt)<input value={week.chapter || ''} placeholder="Exempel: Kapitel 5 – Taluppfattning" onChange={e => updateWeek(index, { chapter: e.target.value })} /></label>
          {!/^Vecka\s+\d+$/i.test(week.title || '') && <input className="week-title" aria-label="Egen veckorubrik" value={week.title || ''} onChange={e => updateWeek(index, { title: e.target.value })} />}
          {!isGeneratedLessonSummary(week.content, week.chapter) && <textarea value={week.content} onChange={e => updateWeek(index, { content: e.target.value })} placeholder="Vad ska eleverna arbeta med?" />}
          <LessonDetails week={week} entryType={plan.entryType || 'lektion'} onChange={changes => updateWeek(index, changes)} />
          <details className="legacy-week-details" defaultOpen={Boolean(week.pages?.length || week.assignments?.length || week.links?.length)}>
            <summary>Extra veckomaterial (sidor, uppgifter och länkar)</summary>
            <p className="muted">Använd i första hand momenten under varje lektion. Här kan du även lägga material för hela veckan.</p>
            <WeekDetails week={week} onChange={changes => updateWeek(index, changes)} />
          </details>
          </div>
          {weeks.some(other=>other.weekStart>week.weekStart) && <div className="insert-week-between teacher-week-insert-inside"><button type="button" className="secondary" disabled={weeks.length>=52} onClick={()=>insertBlankWeekAfter(index)}>＋ Lägg till vecka efter denna</button></div>}
        </article></div>)}
          </div>
        </section>)}
      </div>

      <div className="sticky-actions button-row">
        
        <span className="autosave-info" role="status">Ändringar sparas och publiceras automatiskt när lektionerna har innehåll.</span>
      </div>
      {isDirty && <p className="unsaved-notice" role="status">Osparade ändringar – välj Spara utkast innan du lämnar sidan.</p>}
      {status && <p className="status">{status}</p>}
    </section>
    </div>}
    {selectedId && calendarOpen && teacherTab === "arsplan" && <div id="teacher-year-calendar">{nationalExamsForPlan(plan).length > 0 && <p className="calendar-exam-note">Nationella prov – Skolverkets datum 2026/27 (kontrollerat 17 oktober 2026). Kontrollera aktuella provdatum hos Skolverket.</p>}{pendingImport && <section className="card import-preview" aria-live="polite" style={{marginBottom:14}}><h3>Förhandsgranska: {pendingImport.source}</h3><p>Filen har lästs in. Kontrollera innehållet innan du lägger in det i grundplaneringen.</p>{pendingImport.weeksData.slice(0,5).map((week,i)=><div key={i}><strong>Vecka {week.weekNumber}</strong><pre style={{whiteSpace:'pre-wrap',maxHeight:120,overflow:'auto'}}>{week.content || '(Tom vecka)'}</pre></div>)}<div className="button-row"><button type="button" className="primary" onClick={()=>{if(!confirmReplacingWeeks(plan))return;setPlan(p=>({...p,weeksData:pendingImport.weeksData,weeks:pendingImport.weeksData.length}));setPendingImport(null);setStatus('Excel-filen har lagts in i grundplaneringen. Klicka Spara för att behålla ändringarna.')}}>Använd import</button><button type="button" className="secondary" onClick={()=>setPendingImport(null)}>Avbryt</button></div></section>}{status && !status.startsWith("Senast öppnade årsplanering") && <p className="status" role="status">{status}</p>}<YearCalendar key="month-overview" onImportFile={importFile} fileImportState={fileImportState} onBackToPrevious={() => { if (openedFromLibrary) returnToPlanningTree(); else if (navigationIndex > 0) restoreNavigation(-1); else { setCalendarOpen(false); setTeacherTab('mina') } }} embedded={false} onOpen={() => setCalendarOpen(true)} startOnFirstWeek={weeks.length === 1} weeks={weeks} schoolClosures={plan.schoolClosures || []} nationalExams={nationalExamsForPlan(plan)} onClose={() => { setCalendarOpen(false); setTeacherTab("arsplan"); window.scrollTo({ top: 0, behavior: "smooth" }) }} onUpdateWeek={updateWeek} onSetAllVisibility={setAllWeeksVisibility} onAddWeek={() => setPlan(p => {
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

    {AVSTANGD_GRANSSNITT && !simpleSetup && <div className="unified-planning-form" aria-label="Inställningar och publicering"><h2 className="settings-publication-title">Inställningar och publicering</h2>
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


    {AVSTANGD_GRANSSNITT && <>
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
        {teacherDisplayWeeks.slice().sort((a, b) => (a.week.weekStart || '').localeCompare(b.week.weekStart || '')).map(({ week, index }, displayIndex, ordered) => <div className="chapter-week-group" key={`${week.weekNumber}-${index}`}>
          {week.chapter?.trim() && (displayIndex === 0 || week.chapter !== ordered[displayIndex - 1]?.week.chapter) && <h3 className={`chapter-heading chapter-tone-${chapterTone(week.chapter)}`}>{week.chapter}</h3>}
          <article className="week-card" id={`calendar-week-${week.weekNumber}`} style={{ scrollMarginTop: 95 }}>
          <div className="week-top" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><label className="student-visibility-toggle week-heading-visibility"><input type="checkbox" checked={!week.hidden} onChange={e => updateWeek(index, { hidden: !e.target.checked })} aria-label={`Visa vecka ${calendarWeekNumber(week.weekStart) ?? week.weekNumber} för elever`} /><span>{week.hidden ? "Visa inte i elevvyn" : "Visa i elevvyn"}</span></label><strong style={{ fontSize: "1.45rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5 }}>Vecka <input type="number" aria-label="Ändra veckonummer" style={{ width: "3.3ch", minWidth: 66, fontSize: "1.45rem", fontWeight: 800, padding: "4px 6px" }} min="1" max="53" value={calendarWeekNumber(week.weekStart) ?? week.weekNumber} title="Ändra veckonumret för att flytta veckan och dess datum" onChange={e => {
            const target = Number(e.target.value)
            const current = calendarWeekNumber(week.weekStart)
            if (!Number.isInteger(target) || target < 1 || target > 53 || current === null) return
            const nextDate = addWeeks(week.weekStart, target - current)
            if (calendarWeekNumber(nextDate) !== target) { setStatus('Veckonumret finns inte vid detta årsskifte.'); return }
            shiftAllWeeks(index, target)
          }} /></strong><span style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatDate(week.weekStart)}</span>
</div>
          <label className="chapter-editor">Kapitel / tema (valfritt)<input value={week.chapter || ''} placeholder="Exempel: Kapitel 5 – Taluppfattning" onChange={e => updateWeek(index, { chapter: e.target.value })} /></label>
          {!/^Vecka\s+\d+$/i.test(week.title || '') && <input className="week-title" aria-label="Egen veckorubrik" value={week.title || ''} onChange={e => updateWeek(index, { title: e.target.value })} />}
          {!isGeneratedLessonSummary(week.content, week.chapter) && <textarea value={week.content} onChange={e => updateWeek(index, { content: e.target.value })} placeholder="Vad ska eleverna arbeta med?" />}
          <LessonDetails week={week} entryType={plan.entryType || 'lektion'} onChange={changes => updateWeek(index, changes)} />
          <details className="legacy-week-details" defaultOpen={Boolean(week.pages?.length || week.assignments?.length || week.links?.length)}>
            <summary>Extra veckomaterial (sidor, uppgifter och länkar)</summary>
            <p className="muted">Använd i första hand momenten under varje lektion. Här kan du även lägga material för hela veckan.</p>
            <WeekDetails week={week} onChange={changes => updateWeek(index, changes)} />
          </details>
        </article>{displayIndex<ordered.length-1&&<div style={{display:'flex',justifyContent:'center',padding:'12px 0'}}><button type="button" className="secondary" disabled={weeks.length>=52} onClick={()=>insertBlankWeekAfter(index)}>＋ Infoga tom vecka här</button></div>}</div>)}
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
    {previewStudents && <section className="student-preview-clean" id="elevvy"><PublishedStudentPreview slug={plan.published ? (plan.publicSlug || buildSlug(plan)) : ""} /></section>}

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
      <div className="visual-planning-tree planning-board" id="planeringstrad"><div className="planning-board-bar"><div className="planning-board-tools"><div className="school-filter"><button type="button" className="secondary school-filter-toggle" aria-expanded={schoolFilterOpen} onClick={()=>setSchoolFilterOpen(value=>!value)}>⚙ Visa skolformer</button>{schoolFilterOpen && <div className="school-filter-panel"><strong>Visa i planeringsträdet</strong>{['Grundskola','Gymnasiet'].map(school=><label key={school}><input type="checkbox" checked={visibleSchoolForms.includes(school)} onChange={()=>toggleVisibleSchoolForm(school)}/>{school}</label>)}<small>Valet sparas på den här enheten. Inga planeringar tas bort.</small><button type="button" className="secondary" onClick={()=>setSchoolFilterOpen(false)}>✓ Klar</button></div>}</div><button type="button" className="planning-board-new-plan" onClick={createPlan}>＋ Ny planering</button><button type="button" className="secondary" aria-pressed={showArchive} onClick={() => { setShowArchive(value => !value); setLibrarySchool(''); setLibrarySubject('') }}>{showArchive ? '📂 Visa aktiva' : '🗃 Arkiv'}</button><label htmlFor="library-year-select">Läsår</label><select id="library-year-select" value={libraryYear} onChange={event => { setLibraryYear(event.target.value); setLibrarySchool(''); setLibrarySubject('') }}><option value="alla">Alla läsår</option>{[...new Set(plans.map(row => String(row.school_year || parseContent(row.content)?.schoolYear || '').trim()).filter(Boolean))].sort((a,b) => b.localeCompare(a,'sv',{numeric:true})).map(year => <option key={year} value={year}>{year}</option>)}</select><button type="button" className="secondary" onClick={() => { const year = window.prompt('Nytt läsår (exempelvis 2027–2028):'); if (year?.trim()) { setLibraryYear(year.trim()); setLibrarySchool(''); setLibrarySubject('') } }}>＋ Läsår</button></div></div><div className="visual-tree-schools" ref={boardTreeRef}>
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
        }, { Grundskola: Object.fromEntries((subjectFolders[session?.user?.id]?.Grundskola || []).map(name => [name, []])), Gymnasiet: Object.fromEntries((subjectFolders[session?.user?.id]?.Gymnasiet || []).map(name => [name, []])) })) .filter(([grade]) => visibleSchoolForms.includes(grade)).map(([grade, subjects]) => <section key={grade} className={"visual-tree-school " + (grade === "Gymnasiet" ? "school-gymnasiet" : "school-grundskola")} ><div className="school-folder-heading"><button type="button" className="visual-tree-node" aria-expanded={librarySchool === grade} onClick={() => { setLibrarySchool(current => current === grade ? '' : grade); setLibrarySubject(''); setLibraryBoardPage(0) }}>📁 {grade} ({Object.values(subjects).reduce((count, rows) => count + rows.length, 0)})</button></div>{librarySchool === grade && <><div className="visual-tree-courses">{!Object.keys(subjects).length && <p className="muted">Inga planeringar i denna kategori ännu.</p>}{Object.entries(subjects).sort(([a],[b]) => a.localeCompare(b, 'sv', { numeric: true })).map(([subject, rows]) => <div key={subject} className="visual-tree-course"><div className="subject-folder-heading"><button type="button" className="visual-tree-node" aria-expanded={librarySubject === grade + '|' + subject} onClick={() => { setLibrarySubject(current => current === grade + '|' + subject ? '' : grade + '|' + subject); setLibraryBoardPage(0) }} onDoubleClick={()=>{setEditingSubject(grade+'|'+subject);setEditingSubjectValue(subject)}} title="Visa kurser under ämnet"><span className="folder-chevron">{librarySubject === grade + '|' + subject ? '⌄' : '›'}</span> 📚 {editingSubject===grade+'|'+subject ? "" : subject}</button>{editingSubject===grade+'|'+subject && <input autoFocus className="subject-inline-rename" aria-label="Redigera ämnesnamn" value={editingSubjectValue} onChange={event=>setEditingSubjectValue(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setEditingSubject('');event.currentTarget.blur()}if(event.key==='Enter')event.currentTarget.blur()}} onBlur={async()=>{setEditingSubject('');
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

}} />}<button type="button" className="secondary subject-folder-add" onClick={() => { setCoursePicker({school:grade,subject,course:'',year:grade === 'Grundskola' ? 'Årskurs 7' : ''}) }}>＋ Ny kurs</button><button type="button" className="subject-folder-remove" disabled={busy} title="Ta bort ämnesmappen" onClick={() => { if(rows.length){window.alert("Ämnet innehåller kurser. Arkivera eller radera kursplaneringarna först.");return} if(!window.confirm("Ta bort ämnet "+subject+"?"))return;const uid=session?.user?.id;if(!uid)return;setSubjectFolders(current=>{const folders=current[uid]||{};const next={...current,[uid]:{...folders,[grade]:(folders[grade]||[]).filter(value=>value!==subject)}};localStorage.setItem("arsplanering-subject-folders",JSON.stringify(next));return next});setLibrarySubject("") }}>Ta bort ämne</button></div>{librarySubject === grade + '|' + subject && <>{grade === 'Gymnasiet' && rows.map(row => <div key={row.id} className="course-folder-with-delete"><button type="button" className="course-folder-link" style={{ "--folder-hue": [275, 145, 30, 340, 175][Array.from(row.title || "").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5] }} disabled={busy} onDoubleClick={event => {event.preventDefault();renamePlan(row)}} onClick={() => loadPlan(row)}>📁 {((parseContent(row.content) || {}).course || row.course || row.title)} <small style={{marginLeft:"auto",fontWeight:400,fontSize:11,opacity:.7}}>{(parseContent(row.content) || {}).textbook || ""}</small></button><button type="button" className="course-folder-archive" disabled={busy} onClick={() => setArchived(row,true)} title="Arkivera kursplaneringen" aria-label={"Arkivera " + row.title}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg></button><button type="button" className="course-folder-delete" disabled={busy} title="Radera denna planering" aria-label={"Radera " + row.title} onClick={() => deletePlan(row)}><span aria-hidden="true">×</span></button></div>)}{grade === 'Grundskola' && <div className="visual-tree-grade-folders">{Object.entries(rows.reduce((byGrade, row) => { const data = parseContent(row.content) || {}; const value = [data.grade, row.grade, data.className, row.class_name, row.title].map(item => String(item || '')).join(' '); const match = value.match(/(?:årskurs|åk)\s*(\d+)/i) || value.match(/(?:^|\s)([7-9])(?:[a-z])?(?:\s|$)/i); const label = match ? 'Årskurs ' + match[1] : (data.course || row.course || 'Övriga kurser'); (byGrade[label] ||= []).push(row); return byGrade }, {})).sort(([a],[b]) => a.localeCompare(b, 'sv', {numeric:true})).map(([label, gradeRows]) => <div key={label} className="visual-tree-grade-folder textbook-only-grade"><div className="textbook-plan-list">{gradeRows.map(row => { const data=parseContent(row.content)||{}; const gradeNumber=label.replace(/[^0-9]/g,''); const book=String(data.textbook||'').trim(); const displayName=book ? (gradeNumber && !book.endsWith(' '+gradeNumber) ? book+' '+gradeNumber : book) : (row.title||'Öppna planering'); return <div className="textbook-plan-row" key={row.id}><button type="button" disabled={busy} title={row.title||displayName} onDoubleClick={event=>{event.preventDefault();renamePlan(row)}} onClick={()=>loadPlan(row)}>📘 {displayName}</button><button type="button" className="course-folder-archive" disabled={busy} onClick={()=>setArchived(row,true)} title="Arkivera planeringen" aria-label={"Arkivera "+displayName}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg></button><button type="button" className="course-folder-delete" disabled={busy} title="Radera planeringen" aria-label={"Radera "+displayName} onClick={()=>deletePlan(row)}><span aria-hidden="true">×</span></button></div>})}</div></div>)}</div>}</>}</div>)}</div></>}</section>)}
      </div></div>
      <p className="muted">Arkivering döljer bara planeringen från den aktiva listan. Publicerade elevlänkar påverkas inte.</p>
    </section>
    </div>
  </>}
  </main>{coursePicker && <div className="textbook-picker-backdrop" role="presentation"><form className="textbook-picker course-create-dialog" role="dialog" aria-modal="true" aria-label="Skapa ny kurs" onSubmit={event => {event.preventDefault();if(!coursePicker.course.trim())return;setBookQuery('');setBookPicker({...coursePicker,course:coursePicker.course.trim()});setCoursePicker(null)}}><h3>Skapa ny kurs</h3><p>Välj kursen som ska ligga under ämnet.</p><label>Ämne<input value={coursePicker.subject} readOnly aria-label="Ämne" /></label><label>Kursens namn<input autoFocus value={coursePicker.course} onChange={event=>setCoursePicker({...coursePicker,course:capitalizeFirstSwedish(event.target.value)})} placeholder={coursePicker.school === 'Gymnasiet' ? 'Exempel: Matematik 1b' : 'Exempel: Matematik åk 7'} required /></label>{coursePicker.school === 'Grundskola' && <label>Årskurs<select value={coursePicker.year} onChange={event=>setCoursePicker({...coursePicker,year:event.target.value})}>{Array.from({length:9},(_,i)=><option key={i+1} value={'Årskurs '+(i+1)}>Årskurs {i+1}</option>)}</select></label>}<div className="textbook-picker-actions"><button type="button" onClick={()=>setCoursePicker(null)}>← Tillbaka</button><button type="submit" disabled={!coursePicker.course.trim()}>Framåt →</button></div></form></div>}{bookPicker && <div className="textbook-picker-backdrop" role="presentation"><section className="textbook-picker" role="dialog" aria-modal="true" aria-label="Välj lärobok"><h3>Välj lärobok</h3><p><strong>Ämne:</strong> {bookPicker.subject} · <strong>Kurs:</strong> {bookPicker.course}</p><p>Sök bland svenska läromedelsserier. Förlag visas där uppgiften finns i katalogen. Du kan också skriva ett eget namn.</p><input autoFocus type="search" value={bookQuery} onChange={event => setBookQuery(event.target.value)} placeholder="Sök titel, förlag eller ämne…" /><div className="textbook-picker-results">{bookChoices.map(book => <button type="button" key={book.title} onClick={() => chooseBook(book.title)}><strong>📘 {book.title}</strong><small style={{display:"block",marginLeft:25,opacity:.75}}>{book.publisher} · {book.subject} · {book.levels}</small><small style={{display:"block",marginLeft:25,marginTop:4,fontWeight:700}}>{matchingBookPlan(book.title) ? (parseContent(matchingBookPlan(book.title).content)?.archived ? 'Finns i arkivet – återanvänd →' : 'Planeringen finns redan – öppna →') : 'Välj och skapa planering →'}</small></button>)}</div><div className="textbook-picker-actions"><button type="button" onClick={() => {setCoursePicker(bookPicker);setBookPicker(null)}}>← Tillbaka</button><button type="button" disabled={!bookQuery.trim()} onClick={() => chooseBook(bookQuery.trim())}>{matchingBookPlan(bookQuery.trim()) ? 'Öppna befintlig planering' : 'Skapa planering med eget boknamn'}</button></div></section></div>}</div>
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
  return sanitizeForStudents({...plan,weeksData:weeks,classGroups:course.classes.map(([name,days],i)=>({name,startDate:'2026-10-19',days,lessonTimes:Object.fromEntries(days.map((day,_j)=>[day,[i%2===0?'09:00':'10:15']])),cancelledDates:[],overrides:{}}))})
}
function GymnasiumDemoIndex() {
  return <main className="shell gym-demo-index"><section className="card"><p className="eyebrow">SEPARAT DEMOMILJÖ · FIKTIVA UPPGIFTER</p><h1>Gymnasiet – testkurser</h1><p>Fem fiktiva kurser med olika klasser och lektionsscheman. Demot sparar ingenting i ditt konto eller i Supabase.</p><div className="gym-demo-courses">{GYMNASIUM_DEMO_COURSES.map(course=><article className="gym-demo-course" key={course.id}><h2>{course.subject} · {course.course}</h2><p>📘 {course.book}</p><div className="gym-demo-classlinks">{course.classes.map(([name])=><a key={name} href={'/elev/demo-gymnasiet-'+course.id+'?klass='+encodeURIComponent(name)}>🔗 Elevvy {name}</a>)}</div><a href={'/elev/demo-gymnasiet-'+course.id}>Visa gemensam planering →</a></article>)}</div></section></main>
}

function AnnualApp() {
  // Hela planeringsvyn skalas som en film på olika stora skärmar: layouten räknas i en referensbredd och krymps/växer proportionellt.
  useEffect(() => {
    const REFERENCE_WIDTH = 1180
    const update = () => {
      const scale = Math.min(1, Math.max(0.5, window.innerWidth / REFERENCE_WIDTH))
      document.documentElement.style.setProperty('--planning-scale', String(scale))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
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
    const header = document.querySelector('.planning-layout > .planning-unified-navigation')
    if (!header) return undefined
    const updateOffset = () => {
      const rect = header.getBoundingClientRect()
      document.documentElement.style.setProperty('--teacher-review-sticky-top', Math.max(0, Math.ceil(rect.bottom)) + 'px')
      document.documentElement.style.setProperty('--planning-nav-height', Math.max(0, Math.ceil(rect.bottom)) + 'px')
    }
    updateOffset()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOffset) : null
    observer?.observe(header)
    window.addEventListener('resize', updateOffset)
    window.addEventListener('scroll', updateOffset, { passive: true })
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateOffset)
      window.removeEventListener('scroll', updateOffset)
      document.documentElement.style.removeProperty('--teacher-review-sticky-top')
      document.documentElement.style.removeProperty('--planning-nav-height')
    }
  }, [session])

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
          {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon"><ResourceIcon kind={info.kind} fallback={info.icon} /></span><span>{info.label}</span><span className="print-resource-url">{url}</span></a>}
          {editable && onUndo && <div className="lesson-inline-history"><button type="button" disabled={!canUndo} onClick={onUndo} aria-label="Ångra" title="Ångra">↶</button><button type="button" disabled={!canRedo} onClick={onRedo} aria-label="Gör om" title="Gör om">↷</button></div>}{editable && <button type="button" className="remove-small" aria-label={`Ta bort länk ${index + 1}`} onClick={() => updateList('links', links.filter((_, i) => i !== index))}>×</button>}
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
function PlanningActionIcon({ name, size = 16 }) {
  const paths = {
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    "arrow-up": <><path d="m12 19 0-14" /><path d="m5 12 7-7 7 7" /></>,
    "arrow-down": <><path d="m12 5 0 14" /><path d="m5 12 7 7 7-7" /></>,
    "undo": <><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 1 3 6" /></>,
    "redo": <><path d="M21 7v6h-6" /><path d="M21 13a9 9 0 1 0-3 6" /></>,
    "trash": <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 10v7M14 10v7" /></>,
    "clipboard-plus": <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4.5V3h6v1.5M12 10v7M8.5 13.5h7" /></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">{paths[name]}</svg>;
}

function LessonDetails({ week, onChange, entryType = 'lektion', lessonDisplay = 'bara-lektion', onlyLessonIndex = null, onPreviousLesson = null, onNextLesson = null, lessonCount = null, onUndo = null, onRedo = null, canUndo = false, canRedo = false }) {
  const lessons = Array.isArray(week?.lessons) ? week.lessons : []
  const editable = typeof onChange === 'function'
  const assessmentTypes = ['Prov','Test','Examination','Nationellt prov (NP)','Diagnos','Läxförhör','Egen benämning']
  const updateAssessment = (index, changes) => changeLesson(index, { ...lessons[index], assessment: {...(lessons[index].assessment || {}), ...changes} })
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
    {lessons.map((lesson, i) => ({ lesson, i })).sort((a, b) => editable ? a.i - b.i : (WEEKDAYS.indexOf(a.lesson.day || a.lesson.name) + 5) % 5 - (WEEKDAYS.indexOf(b.lesson.day || b.lesson.name) + 5) % 5).filter(({ i }) => onlyLessonIndex === null || i === onlyLessonIndex).map(({ lesson, i }) => <section className="lesson" data-lesson-index={i} key={i}>
      <div className="lesson-heading">
        {editable ? <div className={`lesson-edit-heading${onPreviousLesson ? " lesson-edit-heading-pager" : ""}`} style={{ '--lesson-day-color': DAY_COLORS[Math.max(0, WEEKDAYS.indexOf(entryType === 'dag' ? lesson.name : lesson.day)) % DAY_COLORS.length] }}>
          {onPreviousLesson && <button type="button" className="lesson-heading-prev" aria-label="Föregående lektion" disabled={i===0} onClick={onPreviousLesson}><PlanningActionIcon name="chevron-left" /></button>}<span className="lesson-number-inline">{entryType === 'dag' ? (lesson.name || WEEKDAYS[i]) : (lesson.day || 'Välj dag')} · {entryType === 'dag' ? `Lektion ${i + 1}` : `Lektion ${i + 1}`}{lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day) ? ` · ${lessonDayDate(week.weekStart, entryType === 'dag' ? lesson.name : lesson.day)}` : ''}</span>{onNextLesson && <button type="button" className="lesson-heading-next" aria-label="Nästa lektion" disabled={i >= (lessonCount || lessons.length)-1} onClick={onNextLesson}><PlanningActionIcon name="chevron-right" /></button>}
        </div> : <h4>
          {(() => {
            const day = entryType === 'dag' ? (lesson.name || WEEKDAYS[i]) : lesson.day
            const name = lesson.name || (entryType === 'dag' ? (WEEKDAYS[i] || 'Dag ' + (i + 1)) : 'Lektion ' + (i + 1))
            const showDay = lessonDisplay !== 'bara-lektion'
            const showLesson = lessonDisplay !== 'bara-dag'
            const dayLabel = day || 'Dag ej vald'
            return <>{showDay && <span>{dayLabel}</span>}{showDay && showLesson && ' · '}{showLesson && <span>{name}</span>}{lesson.assessment && <> · <span className="lesson-heading-assessment">{lesson.assessment.type === 'Egen benämning' ? (lesson.assessment.customType || 'Prov') : (lesson.assessment.type || 'Prov')}</span></>}{lessonDayDate(week.weekStart, day) && <span className="lesson-day-date"> · {lessonDayDate(week.weekStart, day)}</span>}</>
          })()}
        </h4>}
        {editable && entryType !== 'dag' && <div className="lesson-reorder-controls"><button type="button" disabled={i === 0} aria-label={`Flytta lektion ${i + 1} uppåt`} onClick={() => moveLesson(i, -1)} title="Flytta upp"><PlanningActionIcon name="arrow-up" /></button><button type="button" disabled={i === lessons.length - 1} aria-label={`Flytta lektion ${i + 1} nedåt`} onClick={() => moveLesson(i, 1)} title="Flytta ned"><PlanningActionIcon name="arrow-down" /></button></div>}
        {editable && <button type="button" className="remove-small" onClick={() => { if (!(lesson.topics || []).some(topic => topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm(entryType === 'dag' ? 'Ta bort dagen och allt innehåll i den?' : 'Ta bort lektionen och allt innehåll i den?')) changeLessons(entryType === 'dag' ? lessons.filter((_, index) => index !== i) : normalizeLessonOrder(lessons.filter((_, index) => index !== i))) }} title="Ta bort lektion" aria-label="Ta bort lektion"><PlanningActionIcon name="trash" /></button>}
      </div>
      {lesson.assessment && <div className="lesson-assessment-card" role="note">
        <strong>📝 {lesson.assessment.type === 'Egen benämning' ? (lesson.assessment.customType || 'Prov/test') : (lesson.assessment.type || 'Prov')}</strong>
        {editable ? <div className="lesson-assessment-fields">
          <select aria-label="Typ av prov" value={lesson.assessment.type || 'Prov'} onChange={e=>updateAssessment(i,{type:e.target.value})}>{assessmentTypes.map(type=><option key={type}>{type}</option>)}</select>
          {lesson.assessment.type === 'Egen benämning' && <input aria-label="Egen provtyp" placeholder="Skriv egen benämning" value={lesson.assessment.customType||''} onChange={e=>updateAssessment(i,{customType:e.target.value})}/>}
          <input aria-label="Provets rubrik" placeholder="Rubrik för provet" value={lesson.assessment.title||''} onChange={e=>updateAssessment(i,{title:e.target.value})}/>
          <textarea aria-label="Information om provet" placeholder="Information till eleverna" value={lesson.assessment.description||''} onChange={e=>updateAssessment(i,{description:e.target.value})}/>
          <button type="button" onClick={()=>changeLesson(i,{...lesson,assessment:null})}>Ta bort provmarkering</button>
        </div> : <><div>{lesson.assessment.title}</div>{lesson.assessment.description && <p>{lesson.assessment.description}</p>}</>}
      </div>}
      {editable && !lesson.assessment && <button type="button" className="lesson-add-assessment" aria-label="Lägg till examination" title="Lägg till examination" onClick={()=>updateAssessment(i,{type:'Prov',title:'',description:''})}><PlanningActionIcon name="clipboard-plus" size={15} /><span>Examination</span></button>}
      {(lesson.topics || []).map((topic, j) => ({ topic, j })).filter(({ topic }) => (editable || topic.classMomentPlaceholder || topic.name?.trim() || topic.pages?.some(Boolean) || topic.assignments?.some(Boolean) || topic.links?.some(link => resourceInfo(typeof link === 'string' ? link : link?.url || '')))).map(({ topic, j }) => {
        const updateTopic = next => changeLesson(i, { ...lesson, topics: (lesson.topics || []).map((item, index) => index === j ? next : item) })
        const pages = Array.isArray(topic.pages) ? topic.pages : []
        const assignments = Array.isArray(topic.assignments) ? topic.assignments : []
        const links = Array.isArray(topic.links) ? topic.links : []
        const lastFilledRow = values => values.reduce((last, value, index) => String(value ?? '').trim() ? index + 1 : last, 0)
        const rows = editable ? Math.max(1, pages.length, assignments.length) : Math.max(lastFilledRow(pages), lastFilledRow(assignments))
        return <div className="topic" key={j}>
          <div className={`topic-grid ${topic.hidePages ? "without-pages" : ""} ${topic.hideAssignments ? "without-assignments" : ""}`}>
            <div className="topic-name">{editable ? <textarea aria-label="Momentets namn" placeholder="Exempel: Procent – tryck Enter för ny rad" rows={Math.max(2, String(topic.name || '').split('\n').length)} value={topic.name || ''} onChange={e => updateTopic({ ...topic, name: e.target.value })} /> : <strong className="topic-name-display">{topic.name || 'Moment'}</strong>}
            <div className="topic-links moment-inner-links">
            {links.map((link, k) => {
              const url = typeof link === 'string' ? link : link.url || ''
              const label = typeof link === 'string' ? resourceInfo(link)?.label || '' : link.label || ''
              const info = resourceInfo(url)
              const changeLink = next => updateTopic({ ...topic, links: links.map((item, index) => index === k ? next : item) })
              return <div className="topic-link topic-link-compact" key={k}>
                {info && <a className={`resource-chip ${info.kind}`} href={url} target="_blank" rel="noopener noreferrer"><span className="resource-icon"><ResourceIcon kind={info.kind} fallback={info.icon} /></span><span className="resource-label">{label || info.label}</span><span className="print-resource-url">{url}</span></a>}
                {editable && <details className="topic-link-editor" open={!url.trim()}>
                  <summary aria-label={`Öppna eller stäng redigering av länk ${k + 1}`} title="Länkens meny: redigera eller radera"><span aria-hidden="true">···</span></summary>
                  <div className="topic-link-editor-fields">
                    <label>Namn<input aria-label="Länkens namn" placeholder="Länkens namn" value={label} onChange={e => changeLink({ url, label: e.target.value })} /></label>
                    <label>Webbadress<input aria-label="Länkadress" placeholder="https://..." value={url} onChange={e => changeLink({ url: e.target.value, label })} /></label>
                    <button type="button" className="remove-small" aria-label={`Ta bort länk ${k + 1}`} onClick={() => updateTopic({ ...topic, links: links.filter((_, index) => index !== k) })}>Radera</button>
                  </div>
                </details>}
              </div>
            })}
            {editable && <button type="button" className="add-detail lesson-bare-icon lesson-bare-link" title="Lägg till länk" aria-label="Lägg till länk" onClick={() => updateTopic({ ...topic, links: [...links, { label: '', url: '' }] })}>🔗</button>}
          </div>

            <div className="moment-inner-actions">
{editable && (lesson.topics || []).length > 1 && <button type="button" className="remove-small lesson-bare-icon lesson-bare-remove" title="Ta bort moment" aria-label="Ta bort moment" onClick={() => { if (!(topic.name?.trim() || topic.pages?.some(value => String(value).trim()) || topic.assignments?.some(value => String(value).trim()) || topic.links?.some(link => (typeof link === 'string' ? link : link?.url)?.trim())) || window.confirm('Ta bort momentet och allt innehåll?')) changeLesson(i, { ...lesson, topics: (lesson.topics || []).filter((_, index) => index !== j) }) }}>×</button>}
{editable && <button type="button" className="secondary lesson-bare-icon lesson-bare-add" title="Lägg till moment" aria-label="Lägg till moment" onClick={() => changeLesson(i, { ...lesson, topics: [...(lesson.topics || []), { name: '', pages: [], assignments: [], links: [] }] })}>+</button>}
            </div></div>
            {editable && (topic.hidePages || topic.hideAssignments) && <div className="topic-restore-columns">
              {topic.hidePages && <button type="button" className="secondary" onClick={() => updateTopic({ ...topic, hidePages: false })}>+ Sida</button>}
              {topic.hideAssignments && <button type="button" className="secondary" onClick={() => updateTopic({ ...topic, hideAssignments: false })}>+ Uppgift</button>}
            </div>}
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
              {editable && <button type="button" className={`add-detail lesson-bare-icon ${field === 'pages' ? 'lesson-bare-page' : 'lesson-bare-task'}`} title={field === 'pages' ? 'Lägg till sida' : 'Lägg till uppgift'} aria-label={field === 'pages' ? 'Lägg till sida' : 'Lägg till uppgift'} onClick={() => updateTopic({ ...topic, [field]: [...(field === 'pages' ? pages : assignments), ''] })}>+</button>}
            </div>)}
          </div>
        </div>
      })}

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
