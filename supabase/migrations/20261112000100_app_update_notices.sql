-- Uppdateringsnotiser till lärare. Tabellerna fanns i produktion men saknades i migrationskedjan.
-- Denna fil matchar produktionens definition (kolumner, nycklar, RLS och policyer) och är idempotent,
-- så den kan köras lokalt utan att ändra befintliga data. Ingen körning mot produktion görs av denna fil.

create table if not exists public.app_update_notices (
  id uuid primary key default gen_random_uuid(),
  version text not null constraint app_update_notices_version_check check (length(version) >= 1 and length(version) <= 80),
  description text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  test_recipient_id uuid references auth.users(id),
  recipient_ids uuid[]
);

create table if not exists public.app_update_acknowledgements (
  notice_id uuid not null references public.app_update_notices(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

alter table public.app_update_notices enable row level security;
alter table public.app_update_acknowledgements enable row level security;

drop policy if exists "admin sends update notices" on public.app_update_notices;
create policy "admin sends update notices" on public.app_update_notices
  for insert to authenticated
  with check (
    auth.uid() = 'fa85f509-bf1c-43c4-bc82-78777232a339'::uuid
    and created_by = auth.uid()
    and (test_recipient_id is null or exists (select 1 from public.teacher_access ta where ta.user_id = app_update_notices.test_recipient_id and ta.status = 'approved'))
    and (recipient_ids is null or (cardinality(recipient_ids) between 1 and 1000 and not exists (
      select 1 from unnest(app_update_notices.recipient_ids) as selected(user_id)
      where selected.user_id = auth.uid() or not exists (select 1 from public.teacher_access ta where ta.user_id = selected.user_id and ta.status = 'approved')
    )))
  );

drop policy if exists "approved teachers read targeted notices" on public.app_update_notices;
create policy "approved teachers read targeted notices" on public.app_update_notices
  for select to authenticated
  using (
    auth.uid() = 'fa85f509-bf1c-43c4-bc82-78777232a339'::uuid
    or (
      exists (select 1 from public.teacher_access ta where ta.user_id = auth.uid() and ta.status = 'approved')
      and (test_recipient_id is null or test_recipient_id = auth.uid())
      and (recipient_ids is null or auth.uid() = any(recipient_ids))
    )
  );

drop policy if exists "teachers acknowledge own updates" on public.app_update_acknowledgements;
create policy "teachers acknowledge own updates" on public.app_update_acknowledgements
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.app_update_notices n where n.id = app_update_acknowledgements.notice_id)
  );

drop policy if exists "teachers read own update receipts" on public.app_update_acknowledgements;
create policy "teachers read own update receipts" on public.app_update_acknowledgements
  for select to authenticated
  using (user_id = auth.uid());
