#!/usr/bin/env bash
set -euo pipefail
# CI-only PostgreSQL service. No Supabase credentials, no production access.
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
for file in tests/sql/automatic-week-release-regression.sql tests/sql/future-week-release-regression.sql tests/sql/hide-date-boundary-regression.sql tests/sql/published-jsonb-snapshot-regression.sql; do
  echo "Running isolated SQL regression: $file"
  psql -X -v ON_ERROR_STOP=1 -At -f "$file" | awk -F'|' '
    NF == 4 {
      count++
      if ($4 != "t") {
        print "FAILED: " $0 > "/dev/stderr"
        failed=1
      }
    }
    END {
      if (count == 0) {
        print "No test results returned" > "/dev/stderr"
        exit 1
      }
      print "Checked " count " SQL cases"
      if (failed) exit 1
    }'
done

# The temporary-table test deliberately uses DDL/DML only inside this ephemeral
# PostgreSQL 16 CI service; it rolls back and never uses Supabase credentials.
echo "Running isolated publication storage integration"
output=$(psql -X -v ON_ERROR_STOP=1 -At -f tests/sql/isolated-publication-storage-integration.sql)
printf '%s\n' "$output"
test "$(printf '%s\n' "$output" | grep -c '^PASS:')" -eq 2
if printf '%s\n' "$output" | grep -q '^FAIL:'; then exit 1; fi
