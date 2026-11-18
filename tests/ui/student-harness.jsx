// Testsida för elevvyn (StudentView) med fiktiv planering. Används av ui-layout-testet, ingen riktig data.
import { createRoot } from 'react-dom/client'
import { StudentView } from '../../src/App.jsx'
import '../../src/index.css'
import '../../src/compact-week-layout.css'
import '../../src/paper-layout.css'
import { SCENARIOS } from '../print/fixtures.js'
export const FIXED = new Date('2026-11-11T10:00:00')
const monday = new Date(FIXED); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const iso = d => d.toISOString().slice(0, 10)
const REAL = {
  9: { chapter: 'Ekvationer och samband', lessons: [
    { name: 'Lektion 1', topics: [{ name: 'Lösa ekvationer med en obekant: lika-tecknet, addition och subtraktion, och kontroll av svaret genom att sätta in det i ursprungsekvationen. Eleverna arbetar i par med balansmodellen.', pages: ['s. 40–42'], assignments: ['Uppgift 1–10 i boken', 'Extra: 11–12 för snabba elever'], links: [] }] },
    { name: 'Lektion 2', topics: [{ name: 'Multiplikation och division i ekvationer: 4x = 20 och x/3 = 5. Repetera tabellerna och förklara varför vi dividerar båda leden.', pages: ['s. 43'], assignments: ['Uppgift 13–16'], links: [] }] },
    { name: 'Lektion 3', topics: [{ name: 'Kort test om enkla ekvationer (15 min)', pages: [], assignments: ['Förbered tre frågor'], links: [] }] },
  ] },
  10: { chapter: 'Ekvationer och samband', lessons: [
    { name: 'Lektion 1', topics: [{ name: 'Parenteser i ekvationer: utveckla parenteser med hjälp av distributiva lagen, samla termer på samma sida och lös ekvationer med bråktal. Diskutera när en ekvation saknar lösning eller har oändligt många.', pages: ['s. 48–50'], assignments: ['Uppgift 1–8', 'Uppgift 9 (utmaning)', 'Uppgift 10: skriv en egen ekvation och lös den'], links: [] }] },
    { name: 'Lektion 2', topics: [{ name: 'Ekvationer i verkliga situationer: ställa upp en ekvation utifrån en text, lösa problemet och tolka svaret i sammanhanget.', pages: ['s. 51'], assignments: ['Problemlösning 1–4'], links: [] }] },
    { name: 'Lektion 3', topics: [{ name: 'Repetition inför prov', pages: [], assignments: [], links: [] }] },
  ] },
}
const weeksData = SCENARIOS['alla-21']().map((w, i) => {
  const d = new Date(monday); d.setDate(d.getDate() + 7 * (i - 9))
  const real = REAL[i]
  return { ...w, weekStart: iso(d), keepVisibleExtra: true, chapter: real?.chapter ?? (i < 9 ? 'Tal' : 'Geometri'), pages: [], hidden: false,
    lessons: real ? real.lessons : w.lessons?.map(l => ({ ...l, topics: [{ name: 'Ekvation och variabel', pages: ['s. 5'], assignments: ['Uppgift 2'], links: [] }] })) }
})
const plan = { kind: 'arsplanering-v2', title: 'Probe', subject: 'Matematik', schoolYear: 'Testår', entryType: 'lektion', studentColumns: 1, studentRows: 1, weeksData, published: true, classGroups: [{ name: '8A', days: [] }] }
export { plan }
createRoot(document.getElementById('root')).render(<StudentView plan={plan} preview publishedOnly initialClass="" hideSelector={true} />)
