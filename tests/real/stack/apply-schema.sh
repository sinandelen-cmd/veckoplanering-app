#!/bin/bash
# Applicerar repots SQL i den LOKALA testdatabasen. Stoppar vid första fel.
# Lokal kopia: adminens UUID från produktionsmigrationen byts mot en fiktiv admin, och teacher_access
# får de tre kolumner som appen läser men som repots migrationer inte definierar. Repot ändras inte.
set -e
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"
FAKE_ADMIN=00000000-0000-4000-8000-0000000000ad
mkdir -p local-sql
sed "s/fa85f509-bf1c-43c4-bc82-78777232a339/$FAKE_ADMIN/g" "$REPO/supabase/migrations/20261019_teacher_approval.sql" > local-sql/teacher_approval.sql
cat > local-sql/teacher_access_columns.sql <<'SQL'
alter table public.teacher_access add column if not exists timer_period text not null default 'none', add column if not exists expires_at timestamptz, add column if not exists extension_requested boolean not null default false;
SQL
FILES=("$REPO/supabase-migration.sql" "local-sql/teacher_approval.sql" "local-sql/teacher_access_columns.sql" "$REPO/supabase/migrations/20261019_teacher_application_trigger.sql" "$REPO/supabase/migrations/20261110_planning_materials_storage.sql" "$REPO/supabase/proposals/2026-11-amnen-unikt-index.sql")
for f in "${FILES[@]}"; do
  echo "== $(basename "$f")"
  cat "$f" | docker compose --env-file env.local exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
done
docker compose --env-file env.local exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c "GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;" -c "GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;" -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;" -c "GRANT ALL ON ALL ROUTINES IN SCHEMA storage TO anon, authenticated, service_role;" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO anon, authenticated, service_role;"
echo schema-ok
