import fs from 'node:fs'
import assert from 'node:assert/strict'
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const sql = fs.readFileSync(new URL('../supabase-migration.sql', import.meta.url), 'utf8')
const redirects = fs.readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
assert.match(app, /sanitizeForStudents/)
assert.match(app, /function sanitizeForStudents\(plan\)/)
assert.match(app, /weeksData: sourceWeeks/)
assert.match(app, /!week\.hidden/)
assert.match(app, /published_content/)
assert.match(app, /rpc\('get_public_annual_plan'/)
assert.doesNotMatch(app, /eq\('published', true\).*eq\('public_slug'/s)
assert.match(sql, /create table if not exists public\.veckoplanering/)
assert.match(sql, /published_content text/)
assert.match(sql, /security definer/)
assert.match(sql, /revoke all on function public\.get_public_annual_plan/)
assert.match(sql, /drop policy if exists "Public can view published annual plans"/)
assert.match(redirects, /\/\*\s+\/index\.html\s+200/)
// Regression checks for the student view and publication safety.
assert.match(app, /const pageSize = Math\.min\(6, columns \* rows\)/)
assert.match(app, /studentWeeks\.slice\(currentPage \* pageSize, \(currentPage \+ 1\) \* pageSize\)/)
assert.match(app, /const printGroups = \[\]/)
assert.match(app, /printGroups\[printPage\]\?\.weeks/)
assert.match(app, /function isoWeekYear\(dateString\)/)
assert.match(app, /weekStart \|\| `number-\$\{other\.weekNumber\}`/)
assert.match(app, /\.sort\(\(a, b\) => \(a\.weekStart \|\| ''\)\.localeCompare\(b\.weekStart \|\| ''\)\)/)
assert.match(app, /const keepPublished = !publish && databasePublished/)
assert.match(app, /\.select\('published,public_slug'\)/)
assert.match(app, /publishedPayload = publish \? sanitizeForStudents\(payload\) : null/)
assert.match(app, /JSON\.stringify\(latestPlanRef\.current\) === savedPlanRef\.current/)
// Draft saves must not overwrite the snapshot students currently see.
assert.match(app, /\.\.\.\(publish \|\| !selectedId \? publicationFields\(publish, false, slug, publishedPayload\) : \{\}\)/)
assert.match(app, /const publishedPayload = publish \? sanitizeForStudents\(payload\) : null/)
assert.match(app, /if \(busy\) return\s+if \(!String\(plan\.title/)
assert.match(app, /published_content: null,\s+public_slug: null/)
assert.match(app, /\.eq\('id', row\.id\)\.eq\('user_id', session\.user\.id\)\.select\('id'\)\.single\(\)/)
assert.doesNotMatch(app, /max="52"/)
// Execute the pure date/week functions against real year-boundary examples.
const extractFunction = (name, nextMarker) => {
  const start = app.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `Missing function: ${name}`)
  const end = app.indexOf(nextMarker, start)
  assert.ok(end > start, `Missing end marker for ${name}`)
  return app.slice(start, end)
}
const calendarWeekNumber = new Function(extractFunction('calendarWeekNumber', 'const MONTH_PASTELS') + '; return calendarWeekNumber')()
const isoWeekYear = new Function(extractFunction('isoWeekYear', 'function studentWeekPageLabel') + '; return isoWeekYear')()
for (const [date, number, year] of [
  ['2026-12-28', 53, 2026],
  ['2027-01-01', 53, 2026],
  ['2027-01-04', 1, 2027],
  ['2028-01-03', 1, 2028],
  ['2029-12-31', 1, 2030],
]) {
  assert.equal(calendarWeekNumber(date), number, `Wrong ISO week for ${date}`)
  assert.equal(isoWeekYear(date), year, `Wrong ISO week year for ${date}`)
}
// Run the same pagination arithmetic as the student view with boundary sizes.
for (const [columns, rows, expected] of [[3, 2, 6], [2, 2, 4], [1, 2, 2], [3, 99, 6]]) {
  const clampedColumns = Math.max(1, Math.min(3, columns))
  const clampedRows = Math.max(1, Math.min(Math.floor(6 / clampedColumns), rows))
  const pageSize = Math.min(6, clampedColumns * clampedRows)
  assert.equal(pageSize, expected)
  const weekIds = Array.from({ length: 13 }, (_, i) => i + 1)
  const pages = Math.ceil(weekIds.length / pageSize)
  const actual = Array.from({ length: pages }, (_, page) => weekIds.slice(page * pageSize, (page + 1) * pageSize)).flat()
  assert.deepEqual(actual, weekIds, 'Pagination must neither duplicate nor skip weeks')
}
console.log('Static security/routing checks: OK')

// Lovförslag får inte dupliceras efter att läraren har flyttat datumet.
assert.match(app, /suggestionKey: `\$\{name\}-\$\{start\.slice\(0, 4\)\}`/)
assert.match(app, /old\.suggestionKey === item\.suggestionKey/)
// Utskriften använder hela veckogrupper och ska inte döljas för hjälpmedel.
assert.match(app, /printGroups\[printPage\]\?\.weeks/)
assert.doesNotMatch(app, /className="student-print-pages" aria-hidden="true"/)

assert.match(app, /student-print-spacious/)
assert.match(css, /student-print-page\.student-print-spacious/)
assert.match(css, /break-inside: avoid-page !important/)

const municipalitiesSource = fs.readFileSync(new URL('../src/swedishMunicipalities.js', import.meta.url), 'utf8')
const countyBlocks = [...municipalitiesSource.matchAll(new RegExp('"[^"]+ län": \\[([\\s\\S]*?)\\]', 'g'))]
assert.equal(countyBlocks.length, 21, 'Sverige ska ha 21 län')
assert.equal(countyBlocks.reduce((sum, [, block]) => sum + [...block.matchAll(/"[^"]+"/g)].length, 0), 290, 'Sverige ska ha 290 kommuner')
assert.match(municipalitiesSource, /"Håbo"/)
assert.match(municipalitiesSource, /"Ängelholm"/)

const nationalExams = fs.readFileSync(new URL('../src/nationalExams.js', import.meta.url), 'utf8')
assert.match(app, /nationalExamsForPlan\(plan\)/)
assert.match(app, /nationalExams=\{nationalExamsForPlan\(plan\)\}/)
assert.ok(app.includes('🔒 Nationellt prov:'))
assert.match(nationalExams, /2027-03-17/)
assert.match(nationalExams, /2027-05-14/)
assert.match(nationalExams, /locked:true/)

assert.match(app, /verified: false, name: name/)
assert.match(app, /checked=\{item.verified === true\}/)
assert.match(app, /Skolledigt \(ej verifierat\)/)

assert.match(app, /startDate: e\.target\.value, verified: false/)
assert.match(app, /endDate: e\.target\.value, verified: false/)
assert.match(app, /toIsoDate\(date\) === value/)

assert.match(app, /const contentBlocks = \(week\.lessons \|\| \[\]\)\.length/)
assert.match(app, /textLength > 1100 \|\| contentBlocks > 16/)
assert.doesNotMatch(app, /JSON\.stringify\(week\)\.length/)

assert.match(app, /const contentBlocks = \(week\.lessons \|\| \[\]\)\.length/)
assert.match(app, /textLength > 1100 \|\| contentBlocks > 16/)
assert.match(app, /printGroups\.push\(\{ weeks: \[week\], weight \}\)/)

assert.match(app, /weekContentScore = week =>/)
assert.match(app, /topic\.links\?\.length \|\| 0/)
assert.match(app, /\.\.\.\(week\.links \|\| \[\]\)/)

assert.match(app, /week\.lessons\.filter\(lesson => lesson && typeof lesson === 'object'\)/)
assert.match(app, /lesson\.topics\.filter\(topic => topic && typeof topic === 'object'\)/)
assert.match(app, /\(week\.lessons \|\| \[\]\)\.filter\(Boolean\)\.flatMap/)

assert.match(app, /parsed\.username \|\| parsed\.password/)
assert.match(app, /host === 'drive\.google\.com'/)
assert.match(app, /host\.endsWith\('\.sharepoint\.com'\)/)
assert.match(app, /week\.links\.filter\(v => typeof v === 'string' && resourceInfo\(v\)\)\.map\(v => v\.trim\(\)\)/)

assert.match(app, /publish && !sanitizeForStudents\(\{ \.\.\.plan, weeksData: weeks \}\)\.weeksData\.length/)
assert.match(app, /Det finns inga synliga veckor att publicera/)

assert.match(app, /if \(selectedId\) \{\s*const \{ data: existing, error: lookupError \}/)
assert.match(app, /const slug = publish \? \(databaseSlug \|\| buildSlug\(plan\)\)/)
assert.match(app, /\.\.\.\(publish \|\| !selectedId \? publicationFields/)

assert.match(app, /publish && weeks\.some\(week => week && !week\.hidden && !validSchoolClosure/)
assert.match(app, /En synlig vecka saknar giltigt startdatum/)

assert.match(app, /function isSchoolYear2026_27\(value\)/)
assert.match(app, /!isSchoolYear2026_27\(plan\.schoolYear\)/)
assert.match(app, /Nationella prov – Skolverkets datum 2026\/27/)
assert.match(app, /kontrollerat 17 oktober 2026/)

assert.match(app, /Kontrollera aktuella provdatum hos Skolverket/)

const { NATIONAL_EXAMS_2026_27, NATIONAL_EXAM_PERIODS_2026_27 } = await import('../src/nationalExams.js')
const officialFixedDates = {
  '6': ['2027-04-19', '2027-04-21', '2027-04-27', '2027-04-29', '2027-05-11', '2027-05-13'],
  '9': ['2027-03-17', '2027-03-19', '2027-04-13', '2027-04-15', '2027-04-20', '2027-04-28', '2027-05-04', '2027-05-12', '2027-05-14'],
}
for (const [grade, dates] of Object.entries(officialFixedDates)) {
  assert.deepEqual(NATIONAL_EXAMS_2026_27.filter(item => item.grade === grade).map(item => item.date).sort(), dates)
  assert.ok(NATIONAL_EXAMS_2026_27.filter(item => item.grade === grade).every(item => item.startTime === (grade === '9' ? '09:00' : null)))
}
assert.ok(NATIONAL_EXAM_PERIODS_2026_27.some(item => item.grade === '3' && item.start === '2027-03-15' && item.end === '2027-05-21'))
assert.ok(NATIONAL_EXAM_PERIODS_2026_27.filter(item => ['6', '9'].includes(item.grade)).every(item => item.start === '2026-11-02' && item.end === '2026-12-04'))
assert.match(css, /overflow-wrap: anywhere/)

const isSchoolYear2026_27 = new Function(extractFunction('isSchoolYear2026_27', 'function nationalExamsForPlan') + '; return isSchoolYear2026_27')()
for (const value of ['2026/2027', '2026–2027', '2026-2027', '2026/27', '26/27', 'HT26–VT27', ' HT 26 - VT 27 ']) {
  assert.equal(isSchoolYear2026_27(value), true, `Läsår ska accepteras: ${value}`)
}
for (const value of ['2025/2027', '2026/2028', '2026/2027 extra', '2026-2027-2028', '', null]) {
  assert.equal(isSchoolYear2026_27(value), false, `Felaktigt läsår ska avvisas: ${value}`)
}

const nationalExamsForPlan = new Function(
  'NATIONAL_EXAMS_2026_27',
  extractFunction('isSchoolYear2026_27', 'function nationalExamsForPlan') +
  '\n' + extractFunction('nationalExamsForPlan', 'function YearCalendar') +
  '; return nationalExamsForPlan'
)(NATIONAL_EXAMS_2026_27)
assert.equal(nationalExamsForPlan({ schoolForm: 'grundskola', schoolYear: '2026/27', grade: '6' }).length, 6)
assert.equal(nationalExamsForPlan({ schoolForm: 'grundskola', schoolYear: 'HT26–VT27', grade: '9' }).length, 9)
for (const plan of [
  { schoolForm: 'gymnasium', schoolYear: '2026/27', grade: '9' },
  { schoolForm: 'grundskola', schoolYear: '2025/26', grade: '9' },
  { schoolForm: 'grundskola', schoolYear: '2026/27', grade: '7' },
]) assert.deepEqual(nationalExamsForPlan(plan), [], 'Nationella prov får inte visas för fel planering')
