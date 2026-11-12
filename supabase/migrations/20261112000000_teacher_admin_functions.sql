-- Administratörsfunktioner och förlängning för lärarkonton. Behörighet kontrolleras via public.platform_admins,
-- inte via hårdkodade användar-id. Ändrar inga befintliga konton.
create or replace function public.admin_list_teacher_accounts()
returns table(user_id uuid, email text, status text, requested_at timestamptz, timer_period text, expires_at timestamptz, extension_requested boolean)
language sql security definer set search_path = '' as $$
 select a.user_id, u.email::text, a.status, a.requested_at, a.timer_period, a.expires_at, a.extension_requested
 from public.teacher_access a join auth.users u on u.id = a.user_id
 where public.is_platform_admin()
 order by a.requested_at desc
$$;

create or replace function public.admin_list_teacher_requests()
returns table(user_id uuid, email text, status text, requested_at timestamptz)
language sql security definer set search_path = '' as $$
 select a.user_id, u.email::text, a.status, a.requested_at
 from public.teacher_access a join auth.users u on u.id = a.user_id
 where public.is_platform_admin()
 order by a.requested_at desc
$$;

create or replace function public.admin_review_teacher_request(p_user_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_platform_admin() then raise exception 'Only admin may approve'; end if;
 if exists (select 1 from public.platform_admins where user_id = p_user_id) then raise exception 'Cannot modify admin'; end if;
 update public.teacher_access set status = case when p_approve then 'approved' else 'rejected' end where user_id = p_user_id;
 if not found then raise exception 'Application not found'; end if;
end $$;

create or replace function public.admin_set_teacher_access(p_user_id uuid, p_action text, p_period text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_platform_admin() then raise exception 'Admin only'; end if;
 if exists (select 1 from public.platform_admins where user_id = p_user_id) then raise exception 'Cannot modify admin'; end if;
 if p_action = 'block' then update public.teacher_access set status = 'blocked' where user_id = p_user_id;
 elsif p_action = 'activate' then update public.teacher_access set status = 'approved', extension_requested = false, expires_at = case when timer_period = 'month' then now() + interval '1 month' when timer_period = 'year' then now() + interval '1 year' else null end where user_id = p_user_id;
 elsif p_action = 'timer' and p_period in ('none','month','year') then update public.teacher_access set timer_period = p_period, expires_at = case when p_period = 'month' then now() + interval '1 month' when p_period = 'year' then now() + interval '1 year' else null end, extension_requested = false where user_id = p_user_id;
 elsif p_action = 'extend' then update public.teacher_access set status = 'approved', expires_at = (greatest(coalesce(expires_at, now()), now()) at time zone 'Europe/Stockholm' + interval '1 year') at time zone 'Europe/Stockholm', extension_requested = false where user_id = p_user_id and timer_period in ('month','year');
 else raise exception 'Invalid action'; end if;
 if not found then raise exception 'Teacher not found'; end if;
end $$;

create or replace function public.admin_set_teacher_expiry(p_user_id uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_platform_admin() then raise exception 'Admin only'; end if;
 if exists (select 1 from public.platform_admins where user_id = p_user_id) then raise exception 'Cannot modify admin'; end if;
 if p_date is null or p_date < current_date or p_date > current_date + 3650 then raise exception 'Invalid expiry date'; end if;
 update public.teacher_access set expires_at = (p_date + 1)::timestamp at time zone 'Europe/Stockholm', extension_requested = false where user_id = p_user_id and status = 'approved' and timer_period in ('month','year');
 if not found then raise exception 'Active timed teacher not found'; end if;
end $$;

create or replace function public.request_teacher_extension()
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.teacher_access set extension_requested = true where user_id = auth.uid() and timer_period <> 'none' and expires_at is not null and expires_at <= now() + interval '30 days';
end $$;

revoke all on function public.admin_list_teacher_accounts() from public;
revoke all on function public.admin_list_teacher_requests() from public;
revoke all on function public.admin_review_teacher_request(uuid, boolean) from public;
revoke all on function public.admin_set_teacher_access(uuid, text, text) from public;
revoke all on function public.admin_set_teacher_expiry(uuid, date) from public;
revoke all on function public.request_teacher_extension() from public;
grant execute on function public.admin_list_teacher_accounts() to authenticated;
grant execute on function public.admin_list_teacher_requests() to authenticated;
grant execute on function public.admin_review_teacher_request(uuid, boolean) to authenticated;
grant execute on function public.admin_set_teacher_access(uuid, text, text) to authenticated;
grant execute on function public.admin_set_teacher_expiry(uuid, date) to authenticated;
grant execute on function public.request_teacher_extension() to authenticated;
