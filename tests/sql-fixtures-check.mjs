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
assert.equal((publicationFixture.replace(/^--.*$/gm,'').match(/;/g)||[]).length,1)
assert.doesNotMatch(publicationFixture,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i)
assert.match(publicationFixture,/IS NOT DISTINCT FROM/i)
console.log('SQL fixture structure OK: published JSONB snapshots')

const transactionFixture=readFileSync('tests/sql/isolated-publication-transaction.sql','utf8')
assert.match(transactionFixture,/\bBEGIN\s*;/i)
assert.match(transactionFixture,/CREATE\s+TEMP\s+TABLE/i)
assert.match(transactionFixture,/ON\s+COMMIT\s+DROP/i)
assert.match(transactionFixture,/\bROLLBACK\s*;/i)
assert.doesNotMatch(transactionFixture,/\b(COMMIT|TRUNCATE|DROP\s+TABLE|CREATE\s+SCHEMA|GRANT|REVOKE)\s*;/i)
assert.match(transactionFixture,/user_id='wrong-teacher'/)
assert.match(transactionFixture,/user_id='teacher-1'/)
console.log('SQL transaction fixture structure OK: ephemeral table, owner predicate, rollback')

const isolatedRpc=readFileSync('tests/sql/isolated-rpc-contract.sql','utf8')
for(const pattern of [/\bBEGIN\s*;/i,/CREATE\s+TEMP\s+TABLE/i,/SECURITY\s+DEFINER/i,/SET\s+search_path\s*=\s*pg_temp/i,/\bROLLBACK\s*;/i,/private-plan/,/hidden/,/GRANT\s+EXECUTE/i]){
  assert.match(isolatedRpc,pattern,'Isolated RPC fixture must retain its security guard')
}
assert.doesNotMatch(isolatedRpc,/\b(COMMIT|TRUNCATE|DROP\s+TABLE|CREATE\s+SCHEMA|GRANT\s+ALL)\s*;/i)
console.log('SQL RPC contract fixture structure OK: temporary table/function, RLS, rollback')
