import fs from 'node:fs'
import assert from 'node:assert/strict'
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
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
