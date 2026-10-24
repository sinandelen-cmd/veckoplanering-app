-- Read-only regression scenarios for the date predicate in
-- public.get_public_annual_plan. No tables are written to.
-- Run as a SELECT; expected: all six checks return true.
WITH fixtures (scenario, week_start, publish_date, hide_date, hidden, auto_release, expected_visible) AS (
  VALUES
    ('current week', '2026-10-19', NULL::text, NULL::text, false, true, true),
    ('future week', '2026-11-02', NULL, NULL, false, true, false),
    ('future publishDate', '2026-10-19', '2026-11-02', NULL, false, true, false),
    ('hidden week', '2026-10-19', NULL, NULL, true, true, false),
    ('expired hideDate', '2026-10-19', NULL, '2026-10-23', false, true, false),
    ('manual publication', '2026-11-02', NULL, NULL, false, false, true)
), results AS (
  SELECT scenario, expected_visible,
    NOT hidden
    AND (NOT auto_release OR (
      CASE WHEN publish_date ~ '^\d{4}-\d{2}-\d{2}$'
        THEN publish_date::date
        ELSE date_trunc('week', week_start::date::timestamp)::date
      END <= DATE '2026-10-24'
    ))
    AND (NOT (hide_date ~ '^\d{4}-\d{2}-\d{2}$')
      OR hide_date::date > DATE '2026-10-24') AS actual_visible
  FROM fixtures
)
SELECT scenario, expected_visible, actual_visible,
       actual_visible IS NOT DISTINCT FROM expected_visible AS passed
FROM results ORDER BY scenario;
