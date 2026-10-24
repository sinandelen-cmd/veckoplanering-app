-- EPHEMERAL Supabase local-stack fixture ONLY. Never deploy this fixture.
-- Separate from the real production schema/RPC, which must be independently audited.
CREATE TABLE public.teacher_access (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','blocked','rejected')),
 timer_period text,
 expires_at timestamptz,
 extension_requested boolean DEFAULT false
);
CREATE TABLE public.veckoplanering (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL,
 content text NOT NULL DEFAULT '{}',
 week_start date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 subject text,
 school_year text,
 class_name text,
 start_date date,
 weeks integer,
 published boolean NOT NULL DEFAULT false,
 public_slug text UNIQUE,
 published_content jsonb
);
ALTER TABLE public.teacher_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veckoplanering ENABLE ROW LEVEL SECURITY;
CREATE POLICY teacher_access_owner_read ON public.teacher_access FOR SELECT TO authenticated
 USING ((select auth.uid()) = user_id);
CREATE POLICY teacher_plans_select ON public.veckoplanering FOR SELECT TO authenticated
 USING ((select auth.uid()) = user_id);
CREATE POLICY teacher_plans_insert ON public.veckoplanering FOR INSERT TO authenticated
 WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY teacher_plans_update ON public.veckoplanering FOR UPDATE TO authenticated
 USING ((select auth.uid()) = user_id)
 WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY teacher_plans_delete ON public.veckoplanering FOR DELETE TO authenticated
 USING ((select auth.uid()) = user_id);
REVOKE ALL ON public.teacher_access, public.veckoplanering FROM anon;
GRANT SELECT ON public.teacher_access TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.veckoplanering TO authenticated;
-- EXACT read-only production function with only NULL hideDate predicate patched in this disposable fixture.
CREATE OR REPLACE FUNCTION public.get_public_annual_plan(slug_value text)
 RETURNS TABLE(published_content text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with source as (
 select v.published_content::jsonb as doc,
        (now() at time zone 'Europe/Stockholm')::date as today
 from public.veckoplanering v
 where v.published = true and v.public_slug = slug_value and v.published_content is not null
 limit 1
), eligible as (
 select s.doc,s.today,w.week,w.ordinality,
        case when (w.week->>'publishDate') ~ '^\d{4}-\d{2}-\d{2}$' then (w.week->>'publishDate')::date
             else date_trunc('week', (w.week->>'weekStart')::date::timestamp)::date end as release_day
 from source s
 cross join lateral jsonb_array_elements(case when jsonb_typeof(s.doc->'weeksData')='array' then s.doc->'weeksData' else '[]'::jsonb end) with ordinality as w(week,ordinality)
 where (w.week->>'weekStart') ~ '^\d{4}-\d{2}-\d{2}$'
 and coalesce((w.week->>'hidden')::boolean,false)=false
 and (not coalesce((s.doc->>'autoReleaseWeeks')::boolean,false)
      or (case when (w.week->>'publishDate') ~ '^\d{4}-\d{2}-\d{2}$' then (w.week->>'publishDate')::date
             else date_trunc('week',(w.week->>'weekStart')::date::timestamp)::date end) <= s.today)
 and (not ((w.week->>'hideDate') ~ '^\d{4}-\d{2}-\d{2}$') or (w.week->>'hideDate')::date > s.today)
), chosen as (
 select e.* from eligible e
 where not coalesce((e.doc->>'autoReleaseWeeks')::boolean,false)
 or e.ordinality in (
   select z.ordinality from eligible z
   order by z.release_day desc,z.ordinality desc
   limit greatest(1,least(12,coalesce(nullif(e.doc->>'visibleWeekCount','')::integer,2)))
 )
), assembled as (
 select s.doc,
   coalesce((select jsonb_agg(c.week order by c.ordinality) from chosen c),'[]'::jsonb) as shown
 from source s
)
select jsonb_set(
 jsonb_set(a.doc,'{weeksData}',a.shown),
 '{schoolClosures}',
 coalesce((select jsonb_agg(c.closure order by c.ordinality)
 from jsonb_array_elements(case when jsonb_typeof(a.doc->'schoolClosures')='array' then a.doc->'schoolClosures' else '[]'::jsonb end) with ordinality as c(closure,ordinality)
 where exists (select 1 from jsonb_array_elements(a.shown) as w(week)
 where (c.closure->>'startDate') <= ((w.week->>'weekStart')::date+6)::text
 and (c.closure->>'endDate') >= (w.week->>'weekStart'))),'[]'::jsonb)
)::text from assembled a;
$function$


REVOKE ALL ON FUNCTION public.get_public_annual_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_annual_plan(text) TO anon,authenticated;
