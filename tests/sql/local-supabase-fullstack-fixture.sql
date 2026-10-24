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
CREATE OR REPLACE FUNCTION public.get_public_annual_plan(slug_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
 SELECT jsonb_set(p.published_content,'{weeksData}',
   COALESCE((
     SELECT jsonb_agg(w.value ORDER BY w.ordinality)
     FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(p.published_content->'weeksData')='array'
            THEN p.published_content->'weeksData' ELSE '[]'::jsonb END
     ) WITH ORDINALITY w(value,ordinality)
     WHERE COALESCE((w.value->>'hidden')::boolean,false)=false
       AND (
         NOT coalesce((w.value->>'hideDate') ~ '^\\d{4}-\\d{2}-\\d{2}$',false)
         OR (w.value->>'hideDate')::date > current_date
       )
       AND (
         NOT coalesce((p.published_content->>'autoReleaseWeeks')::boolean,false)
         OR (
           CASE WHEN (w.value->>'publishDate') ~ '^\\d{4}-\\d{2}-\\d{2}$'
             THEN (w.value->>'publishDate')::date
             ELSE (w.value->>'weekStart')::date END
           <= current_date
         )
       )
   ),'[]'::jsonb))
 FROM public.veckoplanering p
 WHERE p.public_slug=slug_value AND p.published IS TRUE
   AND p.published_content IS NOT NULL
 LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.get_public_annual_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_annual_plan(text) TO anon,authenticated;
