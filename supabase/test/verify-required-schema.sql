-- Skrivskyddad kontroll av att en databas innehåller det appen anropar.
-- Kör mot en ISOLERAD testdatabas. Skriver inget. Returnerar en rad per saknat objekt.
-- Körning: psql "$TEST_DATABASE_URL" -f supabase/test/verify-required-schema.sql

with required(kind, name) as (values
  ('table', 'veckoplanering'),
  ('table', 'teacher_access'),
  ('table', 'planning_visit_events'),
  ('table', 'app_update_notices'),
  ('table', 'app_update_acknowledgements'),
  ('function', 'get_public_annual_plan'),
  ('function', 'register_teacher_application'),
  ('function', 'admin_list_teacher_accounts'),
  ('function', 'admin_review_teacher_request'),
  ('function', 'admin_set_teacher_access'),
  ('function', 'admin_set_teacher_expiry'),
  ('function', 'request_teacher_extension'),
  ('function', 'supports_automatic_week_release'),
  ('function', 'create_plan_share_invite'),
  ('function', 'claim_plan_share_invite')
),
present as (
  select 'table' as kind, tablename as name from pg_tables where schemaname = 'public'
  union all
  select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
)
select r.kind, r.name as saknas
from required r
left join present p on p.kind = r.kind and p.name = r.name
where p.name is null
union all
select 'bucket', 'planning-materials'
where not exists (select 1 from storage.buckets where id = 'planning-materials');
