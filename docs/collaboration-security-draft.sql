-- Draft for review and isolated tests. Do not apply to production without approval.
-- The plan owner remains veckoplanering.user_id; collaborators cannot delegate access.
create table if not exists public.plan_collaborators (
  plan_id bigint not null references public.veckoplanering(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index if not exists plan_collaborators_user_idx on public.plan_collaborators(user_id);
alter table public.plan_collaborators enable row level security;
revoke all on public.plan_collaborators from anon;
grant select, insert, delete on public.plan_collaborators to authenticated;

-- The owner may invite or revoke; collaborators may only read their membership.
create policy "plan_collaborators_read" on public.plan_collaborators
for select to authenticated using (
  user_id = (select auth.uid()) or
  exists (select 1 from public.veckoplanering p where p.id = plan_id and p.user_id = (select auth.uid()))
);
create policy "plan_collaborators_owner_insert" on public.plan_collaborators
for insert to authenticated with check (
  invited_by = (select auth.uid()) and
  user_id <> (select auth.uid()) and
  exists (select 1 from public.veckoplanering p where p.id = plan_id and p.user_id = (select auth.uid()))
);
create policy "plan_collaborators_owner_delete" on public.plan_collaborators
for delete to authenticated using (
  exists (select 1 from public.veckoplanering p where p.id = plan_id and p.user_id = (select auth.uid()))
);

-- NOTE: Existing veckoplanering RLS policies must be inspected before extending
-- SELECT/UPDATE to collaborators. Never allow collaborators to modify user_id,
-- delete a plan, or change membership. Use a restricted RPC for shared edits
-- that locks the plan row, verifies current membership and preserves owner_id.
-- Publish must use the same membership check, including revocation.
