-- Royal Coffee Loyalty v8 — weekly marketing reminders and secure per-customer archive.
-- The scheduler remains polled every minute, but at most one booking reminder
-- per consented customer per calendar week is queued. No 5-minute marketing tests.

alter table public.businesses
  add column if not exists reminder_title text not null default '☕ عندكم جمعة أو مناسبة؟',
  add column if not exists reminder_body text not null default 'جهزوا جمعتكم على كيفكم، وضيافتها علينا. احجزوا مع القهوة الملكية!';

alter table public.businesses drop constraint if exists businesses_reminder_title_length;
alter table public.businesses add constraint businesses_reminder_title_length
  check (char_length(btrim(reminder_title)) between 2 and 90);
alter table public.businesses drop constraint if exists businesses_reminder_body_length;
alter table public.businesses add constraint businesses_reminder_body_length
  check (char_length(btrim(reminder_body)) between 2 and 240);

alter table public.customers add column if not exists deleted_at timestamptz;
create index if not exists customers_business_live on public.customers(business_id,created_at desc) where deleted_at is null;

-- Explicitly stop testing across the whole loyalty business.
update public.businesses set test_until=null where test_until is not null;
update public.notification_outbox
 set status='skipped', claimed_at=null, finished_at=now()
 where status in ('queued','processing') and dedupe_key like 'test:%';
drop trigger if exists royal_first_marketing_test on public.push_subscriptions;
revoke execute on function public.admin_set_test_mode(integer) from PUBLIC,anon,authenticated;

create or replace function public.admin_save_weekly_reminder(
 p_weekday integer, p_time time without time zone, p_title text, p_body text
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare bid uuid; outrow public.businesses;
begin
 bid:=public.require_admin();
 if p_weekday is null or p_weekday not between 0 and 6
    or p_time is null or p_title is null or char_length(btrim(p_title)) not between 2 and 90
    or p_body is null or char_length(btrim(p_body)) not between 2 and 240 then
   raise exception 'Invalid weekly reminder settings' using errcode='22023';
 end if;
 update public.businesses
    set weekly_weekday=p_weekday,weekly_time=p_time,
        reminder_title=btrim(p_title),reminder_body=btrim(p_body),
        test_until=null,updated_at=now()
  where id=bid returning * into outrow;
 insert into public.audit_logs(business_id,actor_id,action,details)
 values(bid,(select auth.uid()),'weekly_reminder_saved',
        jsonb_build_object('weekday',p_weekday,'time',to_char(p_time,'HH24:MI')));
 return jsonb_build_object('weekday',outrow.weekly_weekday,'time',to_char(outrow.weekly_time,'HH24:MI'),
                           'title',outrow.reminder_title,'body',outrow.reminder_body);
end $fn$;
revoke execute on function public.admin_save_weekly_reminder(integer,time without time zone,text,text)
 from PUBLIC,anon,authenticated;
grant execute on function public.admin_save_weekly_reminder(integer,time without time zone,text,text)
 to authenticated;

create or replace function public.admin_delete_customer(p_customer_id uuid) returns boolean
language plpgsql security definer set search_path='' as $fn$
declare bid uuid; c public.customers;
begin
 bid:=public.require_admin();
 select * into c from public.customers where id=p_customer_id and business_id=bid for update;
 if not found then raise exception 'Customer not found' using errcode='22023'; end if;
 if c.deleted_at is not null then return false; end if;
 -- Cancel access, marketing permissions and pending notification work.
 delete from public.customer_card_links where customer_id=c.id;
 delete from public.invitation_tokens where customer_id=c.id;
 update public.push_subscriptions set disabled_at=coalesce(disabled_at,now()) where customer_id=c.id;
 update public.card_notification_preferences set marketing_opt_in=false,marketing_updated_at=now()
  where customer_id=c.id;
 update public.notification_outbox set status='skipped',claimed_at=null,finished_at=now()
  where customer_id=c.id and status in ('queued','processing');
 -- Preserve non-personal historical loyalty ledger; erase direct contact + name.
 update public.customers set status='suspended',name='عميل محذوف',contact=null,
    auth_user_id=null,privacy_accepted_at=null,deleted_at=now(),updated_at=now()
  where id=c.id;
 insert into public.audit_logs(business_id,actor_id,action,target_id,details)
 values(bid,(select auth.uid()),'customer_deleted',c.id,
        jsonb_build_object('member_code',c.member_code));
 return true;
end $fn$;
revoke execute on function public.admin_delete_customer(uuid) from PUBLIC,anon,authenticated;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

-- Tenant-scoped dashboard: only live customers. Keep historical audit totals.
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare bid uuid;b public.businesses;
begin
 bid:=public.require_admin();
 select * into b from public.businesses where id=bid;
 return jsonb_build_object(
  'settings',jsonb_build_object(
   'name',b.name,'reward_threshold',b.reward_threshold,'reward_description',b.reward_description,
   'weekly_weekday',b.weekly_weekday,'weekly_time',to_char(b.weekly_time,'HH24:MI'),
   'reminder_title',b.reminder_title,'reminder_body',b.reminder_body,'test_until',null),
  'stats',jsonb_build_object(
   'customers',(select count(*) from public.customers where business_id=bid and deleted_at is null and status='active'),
   'events',(select count(*) from public.hospitality_events where business_id=bid and status='approved'),
   'available',(select count(*) from public.rewards where business_id=bid and status='available'),
   'redeemed',(select count(*) from public.rewards where business_id=bid and status='redeemed')),
  'customers',coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select c.id,c.name,c.member_code,c.contact,c.created_at,(c.auth_user_id is not null) as activated,
    (select count(*) from public.hospitality_events e where e.customer_id=c.id and e.status='approved') as total_events,
    mod((select count(*)::int from public.hospitality_events e where e.customer_id=c.id and e.status='approved'),b.reward_threshold) as progress,
    (select count(*) from public.rewards r where r.customer_id=c.id and r.status='available') as available_rewards
    from public.customers c where c.business_id=bid and c.deleted_at is null and c.status='active'
  ) t),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select e.id,e.customer_id,e.title,e.occurred_on,e.status,e.created_at
    from public.hospitality_events e join public.customers c on c.id=e.customer_id
    where e.business_id=bid and c.deleted_at is null order by e.created_at desc limit 300
  ) t),'[]'::jsonb),
  'rewards',coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select r.id,r.customer_id,r.description,r.status,r.created_at,c.name as customer_name
    from public.rewards r join public.customers c on c.id=r.customer_id
    where r.business_id=bid and c.deleted_at is null order by r.created_at desc limit 300
  ) t),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select nc.id,nc.title,nc.scheduled,nc.created_at,
    (select count(*) from public.notification_outbox o where o.campaign_id=nc.id and o.status='accepted') as accepted,
    (select count(*) from public.notification_outbox o where o.campaign_id=nc.id and o.status='failed') as failed
    from public.notification_campaigns nc where nc.business_id=bid order by nc.created_at desc limit 30
  ) t),'[]'::jsonb),
  'notification_stats',jsonb_build_object(
   'queued',(select count(*) from public.notification_outbox where business_id=bid and status='queued'),
   'provider_accepted',(select count(*) from public.notification_deliveries d join public.notification_outbox o on o.id=d.job_id where o.business_id=bid and d.status='accepted'),
   'provider_failed',(select count(*) from public.notification_deliveries d join public.notification_outbox o on o.id=d.job_id where o.business_id=bid and d.status='failed'))
 );
end $fn$;
revoke execute on function public.admin_dashboard() from PUBLIC,anon,authenticated;
grant execute on function public.admin_dashboard() to authenticated;

create or replace function public.service_queue_scheduled() returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare b public.businesses;local_now timestamp;wk text;enqueued int:=0;n int;
begin
 local_now:=now() at time zone 'Asia/Riyadh';
 wk:=to_char(local_now,'IYYY-IW');
 for b in select * from public.businesses loop
   if extract(dow from local_now)::integer=b.weekly_weekday
      and local_now::time>=b.weekly_time then
    insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
    select b.id,c.id,'marketing',b.reminder_title,b.reminder_body,
           '/card','weekly:'||b.id||':'||c.id||':'||wk
    from public.customers c
      join public.card_notification_preferences p
       on p.customer_id=c.id and p.marketing_opt_in=true and p.privacy_accepted_at is not null
    where c.business_id=b.id and c.status='active' and c.deleted_at is null
      and exists(select 1 from public.push_subscriptions s
                 where s.customer_id=c.id and s.disabled_at is null)
    on conflict(dedupe_key) do nothing;
    get diagnostics n=row_count;
    enqueued:=enqueued+n;
   end if;
 end loop;
 return jsonb_build_object('weekly_queued',enqueued,'test_queued',0);
end $fn$;
revoke execute on function public.service_queue_scheduled() from PUBLIC,anon,authenticated;
grant execute on function public.service_queue_scheduled() to service_role;
