-- Isolated PostgreSQL RLS + security-definer RPC simulation.
-- This deliberately does NOT claim equivalence to production Supabase RLS/RPC.
BEGIN;
CREATE ROLE isolated_student NOLOGIN;
CREATE ROLE isolated_teacher NOLOGIN;
CREATE TEMP TABLE isolated_plans (
 id integer PRIMARY KEY, owner_id text NOT NULL, public_slug text UNIQUE,
 published boolean NOT NULL, published_content jsonb
) ON COMMIT DROP;
INSERT INTO isolated_plans VALUES
 (1,'teacher-a','public-a',true,'{"weeksData":[{"title":"Visible"}]}'::jsonb),
 (2,'teacher-b','private-b',false,'{"weeksData":[{"title":"Hidden"}]}'::jsonb),
 (3,'teacher-b','public-b',true,'{"weeksData":[{"title":"Other"}]}'::jsonb);
ALTER TABLE isolated_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE isolated_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY isolated_teacher_owner ON isolated_plans
 FOR ALL TO isolated_teacher USING (owner_id=current_setting('app.teacher_id',true))
 WITH CHECK (owner_id=current_setting('app.teacher_id',true));
CREATE POLICY isolated_public_read ON isolated_plans
 FOR SELECT TO isolated_student USING (published=true AND published_content IS NOT NULL);
GRANT SELECT ON isolated_plans TO isolated_student;
GRANT SELECT,UPDATE ON isolated_plans TO isolated_teacher;
-- SET ROLE cannot access temp tables by default: explicit grant is required.
DO $ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %s TO isolated_student,isolated_teacher',pg_my_temp_schema()::regnamespace); END $;
DO $$
DECLARE visible_count integer;
BEGIN
 SET LOCAL ROLE isolated_student;
 SELECT count(*) INTO visible_count FROM isolated_plans;
 RESET ROLE;
 IF visible_count<>2 THEN RAISE EXCEPTION 'Student RLS exposed private plan or hid public plan: %',visible_count; END IF;
END $$;
SELECT set_config('app.teacher_id','teacher-a',true);
DO $$
DECLARE visible_count integer;
BEGIN
 SET LOCAL ROLE isolated_teacher;
 SELECT count(*) INTO visible_count FROM isolated_plans;
 RESET ROLE;
 IF visible_count<>1 THEN RAISE EXCEPTION 'Teacher RLS leaked other owner rows: %',visible_count; END IF;
END $$;
ROLLBACK;
SELECT 'isolated RLS role checks' AS name,'ok' AS expected,'ok' AS actual,true AS passed;
