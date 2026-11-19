# Lokal Supabase-testmiljö (kostnadsfri)

Körs på den egna datorn i Docker. Ingen anslutning till produktion eller till något molnprojekt.
Använd endast fiktiva konton och data. Skriv aldrig produktionsnycklar eller riktiga användaruppgifter i den här miljön.

## Komponenter (samma avbilder som Supabase använder)
- PostgreSQL: `supabase/postgres:17.6.1.166` (Supabase-scheman, roller och extensions)
- Auth: `supabase/gotrue:v2.177.0`
- API: `postgrest/postgrest:v12.2.3`
- Storage: `supabase/storage-api:v1.14.6` med filsystem som lagring
- Gateway: nginx som ersätter Kong. Den lägger till CORS och routar `/auth/v1`, `/rest/v1`, `/storage/v1`.

## Steg
1. Skapa hemligheter utanför repot:
   `node tests/real/stack/gen-env.mjs ~/arsplanering-lokal/env.local`
2. Starta stacken från en katalog utanför repot, med filen ovan:
   `cp tests/real/stack/docker-compose.yml tests/real/stack/nginx.conf ~/arsplanering-lokal/ && cd ~/arsplanering-lokal && docker compose --env-file env.local up -d db && sleep 15`
   `sh /home/user/veckoplanering-app/tests/real/stack/setup-roles.sh` (kopiera skriptet om katalogen är annan)
   `docker compose --env-file env.local up -d auth rest storage gateway`
3. Applicera schemat (lokala justeringar beskrivs i `apply-schema.sh`):
   `bash tests/real/stack/apply-schema.sh`
4. Skapa testkonton och godkänn två av dem:
   `REAL_SUPABASE_URL=http://localhost:8000 REAL_SUPABASE_ANON_KEY=<anon> node tests/real/stack/create-test-users.mjs ~/arsplanering-lokal/test-users.json`
   `docker compose --env-file env.local exec -T db psql -U supabase_admin -d postgres -c "insert into public.teacher_access(user_id,status) select id,'approved' from auth.users where email in ('larare-a@test.invalid','larare-b@test.invalid') on conflict (user_id) do update set status='approved';"`
5. Bygg testappen mot den lokala stacken (ska inte göras till produktions-ZIP):
   `VITE_SUPABASE_URL=http://localhost:8000 VITE_SUPABASE_ANON_KEY=<anon> npx vite build --outDir ~/arsplanering-lokal/dist-real --emptyOutDir`
   Servera med `python3 -m http.server 4180` i den katalogen.
6. Kör testerna:
   `REAL_SUPABASE_URL=http://localhost:8000 REAL_SUPABASE_ANON_KEY=<anon> REAL_SUPABASE_SERVICE_KEY=<service> REAL_TEST_USERS=~/arsplanering-lokal/test-users.json npm run test:real`
   `REAL_APP_URL=http://127.0.0.1:4180 ...samma... npm run test:real-ui`

Testerna vägrar köra mot något annat än localhost.

## Lokala justeringar som inte finns i repot
- Adminens UUID i `20261019_teacher_approval.sql` byts mot en fiktiv admin. Produktionens UUID används inte lokalt.
- Kolumnerna `timer_period`, `expires_at` och `extension_requested` läggs till i `teacher_access`. Appen läser dem, men repots migrationer definierar dem inte. Verifiera mot produktion med skrivskyddad export innan något ändras i repot.
- Storage-rollerna får standardrättigheter (`GRANT`), som Supabase-plattformen sätter i produktion.
- Gatewayen ersätter Kong. Kong kan ge andra felkoder och headers, så vissa felmeddelanden kan skilja sig.
