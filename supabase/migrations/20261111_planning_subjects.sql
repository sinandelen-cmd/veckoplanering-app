-- Ämnen (inklusive tomma och arkiverade) sparas på servern, kopplade till lärarens konto.
-- Skapar endast en ny tabell med policies. Inga befintliga tabeller, planeringar, scheman eller konton ändras.
-- Samma behörighetskrav som för planeringar: godkänt och giltigt lärarkonto.

create table if not exists public.planning_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  school_form text not null check (school_form in ('Grundskola', 'Gymnasiet')),
  name text not null check (length(btrim(name)) between 1 and 120),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint planning_subjects_unique_per_teacher unique (user_id, school_form, name)
);

alter table public.planning_subjects enable row level security;

create policy "Approved teachers read own subjects"
  on public.planning_subjects for select to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.teacher_access t
    where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())
  ));

create policy "Approved teachers add own subjects"
  on public.planning_subjects for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.teacher_access t
    where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())
  ));

create policy "Approved teachers update own subjects"
  on public.planning_subjects for update to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.teacher_access t
    where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())
  ))
  with check (user_id = auth.uid());

create policy "Approved teachers delete own subjects"
  on public.planning_subjects for delete to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.teacher_access t
    where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())
  ));

grant select, insert, update, delete on public.planning_subjects to authenticated;
