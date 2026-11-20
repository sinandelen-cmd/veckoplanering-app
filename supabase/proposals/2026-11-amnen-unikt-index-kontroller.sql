-- SKRIVSKYDDADE kontroller att köra mot PRODUKTION före något beslut om indexet 2026-11-amnen-unikt-index.sql.
-- Inga ändringar. Kör var och en separat. Resultatet ska vara tomt eller de värden som anges.

-- 1. Rader vars content inte är giltig JSON. Indexet kan inte skapas om någon rad finns här. Förväntat: 0 rader.
select id from public.veckoplanering where not pg_input_is_valid(content, 'jsonb');

-- 2. Finns det redan ämnesrader? Förväntat: 0.
select count(*) from public.veckoplanering where pg_input_is_valid(content, 'jsonb') and (content::jsonb->>'kind') = 'amne-v1';

-- 3. Finns det redan ett index med samma namn? Förväntat: 0 rader.
select indexname from pg_indexes where schemaname = 'public' and indexname = 'veckoplanering_unikt_amne';

-- 4. Hur ser tabellen planning_subjects ut? Behövs för att avgöra om två system för ämnen riskerar att krocka.
select column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema = 'public' and table_name = 'planning_subjects' order by ordinal_position;

-- 5. Unika index och constraints på planning_subjects och veckoplanering.
select conrelid::regclass as tabell, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.planning_subjects'::regclass, 'public.veckoplanering'::regclass) and contype in ('u', 'p', 'f', 'c');
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('planning_subjects', 'veckoplanering');

-- 6. RLS-policyer för planning_subjects. Visar vem som får läsa och skriva.
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'planning_subjects';

-- 7. Teacher_access: kolumnernas default-värden. Behövs för att veta hur en ny rad (bara user_id) får sina värden.
select column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'teacher_access' order by ordinal_position;

-- 8. Hur många rader har veckoplanering och planning_subjects?
select (select count(*) from public.veckoplanering) as veckoplanering_rader, (select count(*) from public.planning_subjects) as planning_subjects_rader;
