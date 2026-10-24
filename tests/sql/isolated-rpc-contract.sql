-- Ephemeral PostgreSQL RPC contract tests. Deliberately NOT the deployed Supabase RPC.
-- Temporary table and temporary SECURITY DEFINER function disappear at session end.
BEGIN;
CREATE ROLE isolated_rpc_student NOLOGIN;
CREATE TEMP TABLE rpc_plans (
  id integer PRIMARY KEY,
  public_slug text UNIQUE NOT NULL,
  published boolean NOT NULL,
  published_content jsonb
) ON COMMIT DROP;
INSERT INTO rpc_plans VALUES
(1,'visible-plan',true,'{"weeksData":[{"weekStart":"2026-01-05","title":"Published","hidden":false},{"weekStart":"2026-01-12","title":"Hidden","hidden":true}]}'::jsonb),
(2,'private-plan',false,'{"weeksData":[{"title":"PRIVATE"}]}'::jsonb),
(3,'empty-plan',true,null);
ALTER TABLE rpc_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpc_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY rpc_public_only ON rpc_plans FOR SELECT TO isolated_rpc_student
USING (published AND published_content IS NOT NULL);
DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %s TO isolated_rpc_student',pg_my_temp_schema()::regnamespace);
END $$;
GRANT SELECT ON rpc_plans TO isolated_rpc_student;
CREATE FUNCTION pg_temp.get_public_plan_for_test(slug_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_temp
AS $function$
  SELECT jsonb_set(
    published_content,
    '{weeksData}',
    COALESCE((
      SELECT jsonb_agg(w.value ORDER BY w.ordinality)
      FROM jsonb_array_elements(published_content->'weeksData') WITH ORDINALITY w(value,ordinality)
      WHERE COALESCE((w.value->>'hidden')::boolean,false)=false
    ),'[]'::jsonb)
  )
  FROM rpc_plans
  WHERE public_slug=slug_value AND published AND published_content IS NOT NULL
  LIMIT 1
$function$;
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s.get_public_plan_for_test(text) TO isolated_rpc_student',pg_my_temp_schema()::regnamespace);
END $$;
DO $$
DECLARE public_result jsonb; private_result jsonb; missing_result jsonb; empty_result jsonb;
BEGIN
 SET LOCAL ROLE isolated_rpc_student;
 SELECT pg_temp.get_public_plan_for_test('visible-plan') INTO public_result;
 SELECT pg_temp.get_public_plan_for_test('private-plan') INTO private_result;
 SELECT pg_temp.get_public_plan_for_test('not-found') INTO missing_result;
 SELECT pg_temp.get_public_plan_for_test('empty-plan') INTO empty_result;
 RESET ROLE;
 IF public_result #>> '{weeksData,0,title}' IS DISTINCT FROM 'Published' THEN
   RAISE EXCEPTION 'Published week not returned';
 END IF;
 IF jsonb_array_length(public_result->'weeksData') <> 1 THEN
   RAISE EXCEPTION 'Hidden week was exposed';
 END IF;
 IF private_result IS NOT NULL OR missing_result IS NOT NULL OR empty_result IS NOT NULL THEN
   RAISE EXCEPTION 'RPC exposed private, missing or unpublished content';
 END IF;
END $$;
ROLLBACK;
SELECT 'ephemeral callable RPC publication contract' AS name,'ok' AS expected,'ok' AS actual,true AS passed;
