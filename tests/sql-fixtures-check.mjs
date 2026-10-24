import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Safe offline guard: only SELECT/CTE fixtures, never DDL/DML or network access.
const fixtures = new Map([
  ['tests/sql/automatic-week-release-regression.sql', 6],
  ['tests/sql/future-week-release-regression.sql', 9],
  ['tests/sql/hide-date-boundary-regression.sql', 7],
])

for (const [file, expectedCases] of fixtures) {
  const sql = readFileSync(file, 'utf8')
  const withoutComments = sql.replace(/^--.*$/gm, '').trim()
  assert.match(withoutComments, /^WITH\s/i, file + ' must start with a read-only CTE')
  const caseCount = (withoutComments.match(/^\s*\('/gm) || []).length
  assert.equal(caseCount, expectedCases, file + ' must retain all synthetic cases')
  assert.equal((withoutComments.match(/;\s*$/g) || []).length, 1, file + ' must terminate with a semicolon')
  assert.equal((withoutComments.match(/;/g) || []).length, 1, file + ' must contain exactly one statement')
  assert.doesNotMatch(withoutComments, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i, file + ' must not modify data')
  assert.match(withoutComments, /coalesce\(hide_date\s*~/i, file + ' must handle missing hideDate')
  assert.match(withoutComments, /IS NOT DISTINCT FROM/i, file + ' must report boolean pass/fail')
  assert.match(withoutComments, /FROM\s+(results|tested)\s+ORDER BY/i, file + ' must end in results query')
  console.log('SQL fixture structure OK:', file)
}

const publicationFixture = readFileSync('tests/sql/published-jsonb-snapshot-regression.sql','utf8')
assert.match(publicationFixture.trim(),/^--[^\n]*\nWITH\s/i)
assert.equal((publicationFixture.match(/^ \('/gm)||[]).length,4,'Four publication JSONB cases required')
assert.equal((publicationFixture.match(/;/g)||[]).length,1)
assert.doesNotMatch(publicationFixture,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i)
assert.match(publicationFixture,/IS NOT DISTINCT FROM/i)
console.log('SQL fixture structure OK: published JSONB snapshots')
