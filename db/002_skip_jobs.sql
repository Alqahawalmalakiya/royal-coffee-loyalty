-- Only the backend service role can mark jobs with no eligible subscriptions as skipped.
create or replace function public.service_skip_job(p_job_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 update public.notification_outbox set status=case when exists(select 1 from public.notification_deliveries d where d.job_id=p_job_id and d.status='accepted') then 'accepted' else 'skipped' end,claimed_at=null,finished_at=now()
 where id=p_job_id and status='processing';
 return found;
end$$;
revoke all on function public.service_skip_job(uuid) from public,anon,authenticated;
grant execute on function public.service_skip_job(uuid) to service_role;
