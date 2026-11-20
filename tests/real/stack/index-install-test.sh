#!/bin/bash
# Testar installation, atomär återrullning, återställning och åtkomst för amnen-unikt-index.
# Körs ENBART mot den lokala Docker-databasen (tests/real/stack). Rör aldrig produktion.
# Stoppar vid första fel. Kräver att stacken är igång och att create-test-users.mjs har körts.
set -uo pipefail
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"
INSTALL="$REPO/supabase/proposals/2026-11-amnen-unikt-index.sql"
ATERSTALL="$REPO/supabase/proposals/2026-11-amnen-unikt-index-aterstall.sql"
CHECKS="$PWD/index-install-checks.sql"
# STACK_DIR: mappen där den lokala stacken startades (med docker-compose.yml och env.local). Standard: denna mapp.
STACK_DIR="${STACK_DIR:-$PWD}"
[ -f "$STACK_DIR/env.local" ] || { echo "FEL: saknar $STACK_DIR/env.local (sätt STACK_DIR till mappen där stacken startades)" >&2; exit 1; }
DB=(docker compose -f "$STACK_DIR/docker-compose.yml" --env-file "$STACK_DIR/env.local" exec -T db psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -q)

fail() { echo "FEL: $*" >&2; exit 1; }
q() { "${DB[@]}" -c "$1"; }
kor_fil() { "${DB[@]}" < "$1"; }
tillstand() {
  q "select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'amne_json_text') || '/' || (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'veckoplanering_unikt_amne')"
}
RADER_SQL="select md5(coalesce(string_agg(id::text || '|' || user_id::text || '|' || coalesce(content, '') || '|' || coalesce(updated_at::text, ''), E'\n' order by id::text), '')) || ' ' || count(*) from public.veckoplanering"
LAGRING_SQL="select md5(coalesce(string_agg(id::text || '|' || bucket_id || '|' || name, E'\n' order by id::text), '')) || ' ' || count(*) from storage.objects"

UID_LOKAL=$(q "select id from auth.users order by created_at limit 1") || fail "kunde inte läsa testanvändare"
[ -n "$UID_LOKAL" ] || fail "inga testanvändare i lokal databas (kör create-test-users.mjs)"

echo "== 1. Utgångsläge: ta bort ev. kvarvarande installation"
kor_fil "$ATERSTALL" >/dev/null || fail "återställning i utgångsläget misslyckades"
[ "$(tillstand)" = "0/0" ] || fail "funktion/index kvar efter återställning: $(tillstand)"
R0=$(q "$RADER_SQL"); L0=$(q "$LAGRING_SQL")
echo "  rader: $R0"
echo "  lagring: $L0"

echo "== 2. Misslyckad installation ska rullas tillbaka helt (dubbletter ger fel i indexsteget)"
q "insert into public.veckoplanering (user_id, title, content) values
  ('$UID_LOKAL', 'TEST-ATOMISK-1', '{\"kind\":\"amne-v1\",\"schoolForm\":\"Grundskola\",\"subject\":\"Atomtest\"}'),
  ('$UID_LOKAL', 'TEST-ATOMISK-2', '{\"kind\":\"amne-v1\",\"schoolForm\":\"grundskola\",\"subject\":\"atomtest\"}')" >/dev/null || fail "kunde inte lägga testdubbletter"
R1=$(q "$RADER_SQL")
if kor_fil "$INSTALL" >/dev/null 2>&1; then fail "installationen lyckades trots dubbletter"; fi
[ "$(tillstand)" = "0/0" ] || fail "delvis installation kvar efter fel: $(tillstand)"
[ "$(q "$RADER_SQL")" = "$R1" ] || fail "rader ändrades vid misslyckad installation"
echo "  OK: funktion och index rullades tillbaka"
q "delete from public.veckoplanering where title like 'TEST-ATOMISK-%'" >/dev/null || fail "kunde inte städa testdubbletter"
[ "$(q "$RADER_SQL")" = "$R0" ] || fail "rader efter städning skiljer sig från utgångsläget"

echo "== 3. Installation"
kor_fil "$INSTALL" >/dev/null || fail "installationen misslyckades"
[ "$(tillstand)" = "1/1" ] || fail "efter installation: $(tillstand)"
[ "$(q "$RADER_SQL")" = "$R0" ] || fail "installationen ändrade planeringsrader"
[ "$(q "$LAGRING_SQL")" = "$L0" ] || fail "installationen ändrade lagringsobjekt"
echo "  OK: installerad, inga rader eller filer ändrade"

echo "== 4. Ny installation när allt redan finns ska stanna utan ändring"
if kor_fil "$INSTALL" >/dev/null 2>&1; then fail "andra installationen lyckades"; fi
[ "$(tillstand)" = "1/1" ] || fail "tillstånd ändrat av misslyckad omkörning: $(tillstand)"
echo "  OK"

echo "== 5. Beteende och åtkomst som den inloggade rollen"
"${DB[@]}" -v uid="$UID_LOKAL" < "$CHECKS" || fail "beteendekontrollerna misslyckades"
[ "$(q "$RADER_SQL")" = "$R0" ] || fail "beteendekontrollerna lämnade kvar data"

echo "== 6. Återställning"
kor_fil "$ATERSTALL" >/dev/null || fail "återställningen misslyckades"
[ "$(tillstand)" = "0/0" ] || fail "efter återställning: $(tillstand)"
[ "$(q "$RADER_SQL")" = "$R0" ] || fail "återställningen ändrade planeringsrader"
[ "$(q "$LAGRING_SQL")" = "$L0" ] || fail "återställningen ändrade lagringsobjekt"
echo "  OK: återställd, inga rader eller filer ändrade"

echo "== 7. Ny installation efter återställning"
kor_fil "$INSTALL" >/dev/null || fail "ominstallation misslyckades"
[ "$(tillstand)" = "1/1" ] || fail "efter ominstallation: $(tillstand)"
echo "  OK: lokala databasen står kvar med installationen, som apply-schema.sh förväntar sig"

echo "ALLA INSTALLATIONSTESTER OK"
