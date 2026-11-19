#!/bin/bash
# Sätter lösenord för tjänsterollerna i den lokala testdatabasen. Körs efter att db-containern har startat.
set -e
cd "$(dirname "$0")"
set -a; . ./env.local; set +a
docker compose --env-file env.local exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE supabase_auth_admin WITH LOGIN PASSWORD '$PGPASS';" \
  -c "ALTER ROLE authenticator WITH LOGIN PASSWORD '$PGPASS';" \
  -c "ALTER ROLE supabase_storage_admin WITH LOGIN PASSWORD '$PGPASS';" > /dev/null
echo roles-ok
