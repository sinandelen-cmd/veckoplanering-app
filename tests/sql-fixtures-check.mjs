import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Safe offline guard: only SELECT/CTE fixtures, never DDL/DML or network access.
for (const file of ['tests/sql/automatic-week-release-regression.sql', 'tests/sql/future-week-release-regression.sql', 'tests/sql/hide-date-boundary-regression.sql']) {
  const sql = readFileSync(file, 'utf8')
  const withoutComments = sql.replace(/^--.*$/gm, '').trim()
  assert.match(withoutComments, /^WITH\s/i, file + ' must start with a read-only CTE')
  assert.equal((withoutComments.match(/;\s*$/g) || []).length, 1, file + ' must terminate with a semicolon')
  assert.equal((withoutComments.match(/;/g) || []).length, 1, file + ' must contain exactly one statement')
  assert.doesNotMatch(withoutComments, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i, file + ' must not modify data')
  assert.match(withoutComments, /coalesce\(hide_date\s*~/i, file + ' must handle missing hideDate')
  assert.match(withoutComments, /IS NOT DISTINCT FROM/i, file + ' must report boolean pass/fail')
  assert.match(withoutComments, /FROM\s+(results|tested)\s+ORDER BY/i, file + ' must end in results query')
  console.log('SQL fixture structure OK:', file)
}
