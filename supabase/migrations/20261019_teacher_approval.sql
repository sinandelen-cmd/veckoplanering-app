create table if not exists public.teacher_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now()
);
alter table public.teacher_access enable row level security;
revoke all on public.teacher_access from anon;
revoke update,delete on public.teacher_access from authenticated;
grant select,insert on public.teacher_access to authenticated;
drop policy if exists "read own approval" on public.teacher_access;
create policy "read own approval" on public.teacher_access for select to authenticated using (user_id=auth.uid());
drop policy if exists "request own approval" on public.teacher_access;
create policy "request own approval" on public.teacher_access for insert to authenticated with check (user_id=auth.uid() and status='pending');
insert into public.teacher_access(user_id,status) values ('fa85f509-bf1c-43c4-bc82-78777232a339','approved') on conflict (user_id) do update set status='approved';
create or replace function public.admin_list_teacher_requests()
returns table(user_id uuid,email text,status text,requested_at timestamptz)
language sql security definer set search_path='' as $$
select a.user_id,u.email::text,a.status,a.requested_at
from public.teacher_access a join auth.users u on u.id=a.user_id
where auth.uid()='fa85f509-bf1c-43c4-bc82-78777232a339'::uuid
order by a.requested_at desc
$$;
revoke all on function public.admin_list_teacher_requests() from public;
grant execute on function public.admin_list_teacher_requests() to authenticated;
create or replace function public.admin_review_teacher_request(p_user_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from 'fa85f509-bf1c-43c4-bc82-78777232a339'::uuid then raise exception 'Only admin may approve'; end if;
 if p_user_id='fa85f509-bf1c-43c4-bc82-78777232a339'::uuid then raise exception 'Cannot modify admin'; end if;
 update public.teacher_access set status=case when p_approve then 'approved' else 'rejected' end where user_id=p_user_id;
 if not found then raise exception 'Application not found'; end if;
end $$;
revoke all on function public.admin_review_teacher_request(uuid,boolean) from public;
grant execute on function public.admin_review_teacher_request(uuid,boolean) to authenticated;

drop policy if exists "Users can view their own weekly plans" on public.veckoplanering;
drop policy if exists "approved teachers select" on public.veckoplanering;
create policy "approved teachers select" on public.veckoplanering for select to authenticated using (user_id=auth.uid() and exists(select 1 from public.teacher_access where user_id=auth.uid() and status='approved'));

drop policy if exists "Users can insert their own weekly plans" on public.veckoplanering;
drop policy if exists "approved teachers insert" on public.veckoplanering;
create policy "approved teachers insert" on public.veckoplanering for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.teacher_access where user_id=auth.uid() and status='approved'));

drop policy if exists "Users can update their own weekly plans" on public.veckoplanering;
drop policy if exists "approved teachers update" on public.veckoplanering;
create policy "approved teachers update" on public.veckoplanering for update to authenticated using (user_id=auth.uid() and exists(select 1 from public.teacher_access where user_id=auth.uid() and status='approved')) with check (user_id=auth.uid() and exists(select 1 from public.teacher_access where user_id=auth.uid() and status='approved'));

drop policy if exists "Users can delete their own weekly plans" on public.veckoplanering;
drop policy if exists "approved teachers delete" on public.veckoplanering;
create policy "approved teachers delete" on public.veckoplanering for delete to authenticated using (user_id=auth.uid() and exists(select 1 from public.teacher_access where user_id=auth.uid() and status='approved'));
