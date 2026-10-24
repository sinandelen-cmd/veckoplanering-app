-- Read-only tests for automatic release and hideDate logic.
-- Synthetic fixtures; no production data is written.
-- Expected: nine rows with passed = true.
WITH cases(label,week_start,publish_date,hide_date,hidden,auto_release,expected) AS (
  VALUES
    ('future start','2026-11-09',NULL::text,NULL::text,false,true,false),
    ('future override','2026-10-19','2026-11-09',NULL,false,true,false),
    ('release today','2026-11-09','2026-10-24',NULL,false,true,true),
    ('release yesterday','2026-11-09','2026-10-23',NULL,false,true,true),
    ('manual future','2026-11-09',NULL,NULL,false,false,true),
    ('hidden override','2026-10-19','2026-10-20',NULL,true,true,false),
    ('expired','2026-10-19',NULL,'2026-10-23',false,true,false),
    ('expires tomorrow','2026-10-19',NULL,'2026-10-25',false,true,true),
    ('no end date','2026-10-19',NULL,NULL,false,true,true)
), tested AS (
  SELECT label, expected,
    NOT hidden
    AND (NOT auto_release OR (
      CASE WHEN publish_date ~ '^\d{4}-\d{2}-\d{2}$'
        THEN publish_date::date
        ELSE date_trunc('week',week_start::date::timestamp)::date
      END <= DATE '2026-10-24'
    ))
    AND (NOT coalesce(hide_date ~ '^\d{4}-\d{2}-\d{2}$',false)
      OR hide_date::date > DATE '2026-10-24') AS actual
  FROM cases
)
SELECT label,expected,actual,
       expected IS NOT DISTINCT FROM actual AS passed
FROM tested ORDER BY label;
