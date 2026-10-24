-- PostgreSQL 16 isolated JSONB snapshot regression; no Supabase credentials or production.
WITH samples(name, original_snapshot, changed_draft, expected) AS (
 VALUES
 ('published title stays frozen',
  '{"weeksData":[{"title":"Original"}]}'::jsonb,
  '{"weeksData":[{"title":"Draft edit"}]}'::jsonb,
  'Original'::text),
 ('published class override stays frozen',
  '{"classGroups":[{"overrides":{"1":{"text":"Old class"}}}]}'::jsonb,
  '{"classGroups":[{"overrides":{"1":{"text":"New draft"}}}]}'::jsonb,
  'Old class'::text),
 ('published lesson time stays frozen',
  '{"classGroups":[{"lessonTimes":{"Fredag":["10:15"]}}]}'::jsonb,
  '{"classGroups":[{"lessonTimes":{"Fredag":["12:30"]}}]}'::jsonb,
  '10:15'::text),
 ('explicit replacement creates new snapshot',
  '{"weeksData":[{"title":"Original"}]}'::jsonb,
  '{"weeksData":[{"title":"Republished"}]}'::jsonb,
  'Republished'::text)
),
tested AS (
 SELECT name, original_snapshot, changed_draft, expected,
 CASE name
  WHEN 'published title stays frozen' THEN original_snapshot #>> '{weeksData,0,title}'
  WHEN 'published class override stays frozen' THEN original_snapshot #>> '{classGroups,0,overrides,1,text}'
  WHEN 'published lesson time stays frozen' THEN original_snapshot #>> '{classGroups,0,lessonTimes,Fredag,0}'
  ELSE changed_draft #>> '{weeksData,0,title}'
 END AS actual
 FROM samples
),
results AS (
 SELECT name, expected, actual, actual IS NOT DISTINCT FROM expected AS passed FROM tested
)
SELECT name, expected, actual, passed FROM results ORDER BY name;
