-- CI-only isolated PostgreSQL 16 service. Creates a temporary table in a transaction
-- and rolls back. NEVER execute against a production or shared database.
BEGIN;
CREATE TEMP TABLE isolated_publication_snapshots (
  plan_id integer PRIMARY KEY,
  draft jsonb NOT NULL,
  published_content jsonb
) ON COMMIT DROP;
INSERT INTO isolated_publication_snapshots(plan_id,draft,published_content)
VALUES (1,
 '{"title":"Original","classGroups":[{"overrides":{"1":{"text":"Old class"}},"lessonTimes":{"Fredag":["10:15"]}}]}'::jsonb,
 '{"title":"Original","classGroups":[{"overrides":{"1":{"text":"Old class"}},"lessonTimes":{"Fredag":["10:15"]}}]}'::jsonb);
UPDATE isolated_publication_snapshots SET draft =
 '{"title":"Draft changed","classGroups":[{"overrides":{"1":{"text":"New class"}},"lessonTimes":{"Fredag":["12:30"]}}]}'::jsonb
WHERE plan_id=1;
SELECT CASE WHEN
 (SELECT published_content #>> '{title}' FROM isolated_publication_snapshots WHERE plan_id=1)='Original'
 AND (SELECT published_content #>> '{classGroups,0,overrides,1,text}' FROM isolated_publication_snapshots WHERE plan_id=1)='Old class'
 AND (SELECT published_content #>> '{classGroups,0,lessonTimes,Fredag,0}' FROM isolated_publication_snapshots WHERE plan_id=1)='10:15'
THEN 'PASS: saved publication snapshot unchanged by draft edit'
ELSE 'FAIL: publication snapshot changed with draft' END AS result;
UPDATE isolated_publication_snapshots SET published_content=draft WHERE plan_id=1;
SELECT CASE WHEN
 (SELECT published_content #>> '{title}' FROM isolated_publication_snapshots WHERE plan_id=1)='Draft changed'
 AND (SELECT published_content #>> '{classGroups,0,overrides,1,text}' FROM isolated_publication_snapshots WHERE plan_id=1)='New class'
THEN 'PASS: explicit republish replaces saved snapshot'
ELSE 'FAIL: explicit republish did not replace snapshot' END AS result;
ROLLBACK;
