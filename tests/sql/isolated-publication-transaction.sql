-- Runs ONLY against the ephemeral PostgreSQL 16 GitHub Actions service.
-- Isolated transaction with a temporary table. Never connect to Supabase.
BEGIN;
CREATE TEMP TABLE isolated_publication (
 id text PRIMARY KEY, user_id text NOT NULL, draft jsonb NOT NULL,
 published boolean NOT NULL DEFAULT false, published_content jsonb
) ON COMMIT DROP;
INSERT INTO isolated_publication(id,user_id,draft) VALUES
 ('plan-1','teacher-1','{"title":"Original","classGroups":[{"overrides":{"1":{"text":"Class A"}}}]}');
UPDATE isolated_publication
 SET published=true,published_content=draft
 WHERE id='plan-1' AND user_id='teacher-1';
DO $$
DECLARE current_snapshot jsonb;
BEGIN
 SELECT published_content INTO current_snapshot FROM isolated_publication WHERE id='plan-1';
 IF current_snapshot #>> '{classGroups,0,overrides,1,text}' IS DISTINCT FROM 'Class A' THEN
   RAISE EXCEPTION 'Initial publication did not store original class content';
 END IF;
END $$;
UPDATE isolated_publication SET draft=jsonb_set(draft,'{classGroups,0,overrides,1,text}','"Changed draft"')
 WHERE id='plan-1';
DO $$
DECLARE current_snapshot jsonb;
BEGIN
 SELECT published_content INTO current_snapshot FROM isolated_publication WHERE id='plan-1';
 IF current_snapshot #>> '{classGroups,0,overrides,1,text}' IS DISTINCT FROM 'Class A' THEN
   RAISE EXCEPTION 'Draft edit mutated published JSONB snapshot';
 END IF;
END $$;
UPDATE isolated_publication SET published_content=draft
 WHERE id='plan-1' AND user_id='wrong-teacher';
DO $$
DECLARE current_snapshot jsonb;
BEGIN
 SELECT published_content INTO current_snapshot FROM isolated_publication WHERE id='plan-1';
 IF current_snapshot #>> '{classGroups,0,overrides,1,text}' IS DISTINCT FROM 'Class A' THEN
   RAISE EXCEPTION 'Wrong owner overwrote published snapshot';
 END IF;
END $$;
UPDATE isolated_publication SET published_content=draft
 WHERE id='plan-1' AND user_id='teacher-1';
DO $$
DECLARE current_snapshot jsonb;
BEGIN
 SELECT published_content INTO current_snapshot FROM isolated_publication WHERE id='plan-1';
 IF current_snapshot #>> '{classGroups,0,overrides,1,text}' IS DISTINCT FROM 'Changed draft' THEN
   RAISE EXCEPTION 'Explicit republication did not replace snapshot';
 END IF;
END $$;
ROLLBACK;
SELECT 'isolated transaction snapshot and owner checks' AS name, 'ok' AS expected, 'ok' AS actual, true AS passed;
