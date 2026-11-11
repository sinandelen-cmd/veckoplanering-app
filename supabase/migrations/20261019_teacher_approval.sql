-- Lärarbehörighet: tabell, RLS och grants. Inga användare är hårdkodade här.
-- Produktionens kolumner (timer_period, expires_at, extension_requested) och statusen 'blocked' finns med,
-- så att en ny databas byggs med samma struktur som produktion.
create table if not exists public.teacher_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','approved','rejected','blocked')),
 requested_at timestamptz not null default now(),
 timer_period text not null default 'none' check (timer_period in ('none','month','year')),
 expires_at timestamptz,
 extension_requested boolean not null default false
);
alter table public.teacher_access enable row level security;
revoke all on public.teacher_access from anon;
revoke update,delete on public.teacher_access from authenticated;
grant select,insert on public.teacher_access to authenticated;
drop policy if exists "read own approval" on public.teacher_access;
create policy "read own approval" on public.teacher_access for select to authenticated using (user_id=auth.uid());
drop policy if exists "request own approval" on public.teacher_access;
create policy "request own approval" on public.teacher_access for insert to authenticated with check (user_id=auth.uid() and status='pending');

-- Plattformsadministratörer. Schemat är här. Vilka konton som är administratörer är miljödata:
-- lokalt sätts det av testskriptet, i produktion krävs en separat, godkänd engångsåtgärd (se ops/).
create table if not exists public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Planeringar (veckoplanering): endast godkända och giltiga lärarkonton får läsa och ändra sina egna planeringar.
-- De gamla "Users can ..."-policyerna från den första grundmigrationen tas bort, så att ingen utgången
-- eller väntande användare kan komma åt data via en permissiv policy. Definitionerna motsvarar produktionen.
drop policy if exists "Users can view their own weekly plans" on public.veckoplanering;
drop policy if exists "Users can insert their own weekly plans" on public.veckoplanering;
drop policy if exists "Users can update their own weekly plans" on public.veckoplanering;
drop policy if exists "Users can delete their own weekly plans" on public.veckoplanering;
drop policy if exists "approved teachers select" on public.veckoplanering;
drop policy if exists "approved teachers insert" on public.veckoplanering;
drop policy if exists "approved teachers update" on public.veckoplanering;
drop policy if exists "approved teachers delete" on public.veckoplanering;
create policy "approved teachers select" on public.veckoplanering for select to authenticated
 using (user_id = auth.uid() and exists (select 1 from public.teacher_access t where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())));
create policy "approved teachers insert" on public.veckoplanering for insert to authenticated
 with check (user_id = auth.uid() and exists (select 1 from public.teacher_access t where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())));
create policy "approved teachers update" on public.veckoplanering for update to authenticated
 using (user_id = auth.uid() and exists (select 1 from public.teacher_access t where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())))
 with check (user_id = auth.uid() and exists (select 1 from public.teacher_access t where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())));
create policy "approved teachers delete" on public.veckoplanering for delete to authenticated
 using (user_id = auth.uid() and exists (select 1 from public.teacher_access t where t.user_id = auth.uid() and t.status = 'approved' and (t.expires_at is null or t.expires_at > now())));
