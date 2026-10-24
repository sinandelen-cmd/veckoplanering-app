-- Read-only boundary tests for optional hideDate.
-- Synthetic data; expected seven passed=true rows.
WITH cases(name,week_start,hide_date,hidden,expected) AS (
 VALUES
 ('no hideDate','2026-10-19',NULL::text,false,true),
 ('empty hideDate','2026-10-19','',false,true),
 ('invalid hideDate','2026-10-19','later',false,true),
 ('expired','2026-10-19','2026-10-23',false,false),
 ('expires today','2026-10-19','2026-10-24',false,false),
 ('expires tomorrow','2026-10-19','2026-10-25',false,true),
 ('hidden','2026-10-19',NULL,true,false)
), results AS (
 SELECT name,expected,
   (NOT hidden AND
    (NOT coalesce(hide_date ~ '^\d{4}-\d{2}-\d{2}$',false)
     OR hide_date::date > DATE '2026-10-24')) AS actual
 FROM cases
)
SELECT name,expected,actual,
       expected IS NOT DISTINCT FROM actual AS passed
FROM results ORDER BY name;
