-- SKRIVSKYDDADE kontroller att köra mot PRODUKTION före något beslut om indexet 2026-11-amnen-unikt-index.sql.
-- Inga ändringar. Kör var och en separat. Resultatet ska vara tomt eller de värden som anges.
-- Obs: kontroll 1 kan kasta fel för nästlad JSON över djupgränsen (54001). Ett sådant fel är i sig ett fynd och ska rapporteras.

-- DEL A: före installation

-- 1. Rader vars content inte är giltig JSON. Förväntat: 0 rader (verifierat 2026-11 att alla 16 är giltiga).
select id from public.veckoplanering where not pg_input_is_valid(content, 'jsonb');

-- 2. Finns det redan ämnesrader? Förväntat: 0. Frågan läser content som jsonb först i en CTE, så filtret körs innan kind läses.
with giltiga as materialized (
  select content from public.veckoplanering where pg_input_is_valid(content, 'jsonb')
)
select count(*) from giltiga where (content::jsonb ->> 'kind') = 'amne-v1';

-- 3. Finns det redan ett index med samma namn? Förväntat: 0 rader.
select indexname from pg_indexes where schemaname = 'public' and indexname = 'veckoplanering_unikt_amne';

-- 4. Finns det redan en funktion med samma namn? Förväntat: 0 rader. Annars skriver installationen över den.
select p.oid::regprocedure as funktion, p.prosecdef as security_definer, p.provolatile as volatilitet
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'amne_json_text';

-- 5. Hur ser tabellen planning_subjects ut? Behövs för att avgöra om två system för ämnen riskerar att krocka.
select column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema = 'public' and table_name = 'planning_subjects' order by ordinal_position;

-- 6. Unika index och constraints på planning_subjects och veckoplanering.
select conrelid::regclass as tabell, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.planning_subjects'::regclass, 'public.veckoplanering'::regclass) and contype in ('u', 'p', 'f', 'c');
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('planning_subjects', 'veckoplanering');

-- 7. RLS-policyer för planning_subjects. Visar vem som får läsa och skriva.
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'planning_subjects';

-- 8. Teacher_access: kolumnernas default-värden. Behövs för att veta hur en ny rad (bara user_id) får sina värden.
select column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'teacher_access' order by ordinal_position;

-- 9. Hur många rader har veckoplanering och planning_subjects? Spara värdena som referens för kontrollsumman.
select (select count(*) from public.veckoplanering) as veckoplanering_rader, (select count(*) from public.planning_subjects) as planning_subjects_rader;

-- DEL B: efter installation (körs endast efter godkänd installation, aldrig före)

-- 10. Funktionens rättigheter. Förväntat: anon = false (och därmed även PUBLIC, som anon ärver), authenticated = true, service_role = true.
select r as roll, has_function_privilege(r, 'public.amne_json_text(text,text)', 'EXECUTE') as kan_anropa
from unnest(array['anon', 'authenticated', 'service_role']) as r;

-- 11. Indexets definition. Förväntat: en rad med unique index och where-villkor på amne-v1.
select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'veckoplanering_unikt_amne';
