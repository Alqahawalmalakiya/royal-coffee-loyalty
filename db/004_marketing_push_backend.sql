-- The loyalty customer explicitly requested marketing booking reminders, not point-by-point alerts.
-- No subscription is added without a customer gesture and explicit marketing consent.
-- Tests run only for a bounded admin-activated window (max 30 minutes), then stop.

create or replace function public.enqueue_customer_message(
 p_customer_id uuid,p_kind text,p_title text,p_body text,p_dedupe text
) returns void
language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin
 -- Disable automatic point/reward transactional notifications: this app sends booking reminders only.
 if p_kind='transactional' then return; end if;
 select * into c from public.customers where id=p_customer_id;
 if not found then return; end if;
 insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
 values(c.business_id,c.id,p_kind,p_title,p_body,'/card',p_dedupe)
 on conflict(dedupe_key) do nothing;
end$$;

-- Existing point events were queued before marketing reminders were defined.
update public.notification_outbox
set status='skipped',finished_at=now(),claimed_at=null
where kind='transactional' and status in ('queued','processing');

create or replace function public.service_queue_scheduled() returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.businesses;local_now timestamp;wk text;bucket text;ct_weekly int:=0;ct_test int:=0;n int;
begin
 local_now:=now() at time zone 'Asia/Riyadh';
 wk:=to_char(local_now,'IYYY-IW');
 bucket:=to_char(local_now,'YYYYMMDDHH24')||lpad((floor(extract(minute from local_now)/5)::int*5)::text,2,'0');
 for b in select * from public.businesses loop
  if b.test_until is not null and b.test_until>now() then
   insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
   select b.id,c.id,'marketing','☕ عندكم مناسبة قريبة؟',
     'جمعتكم ومناسباتكم أحلى مع ضيافة القهوة الملكية. احجزوا ضيافتكم الآن!',
     '/card', 'test:'||b.id||':'||c.id||':'||bucket
   from public.customers c
   join public.card_notification_preferences p on p.customer_id=c.id and p.marketing_opt_in=true and p.privacy_accepted_at is not null
   where c.business_id=b.id and c.status='active'
   and exists(select 1 from public.push_subscriptions s where s.customer_id=c.id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics n=row_count;ct_test:=ct_test+n;
  elsif extract(dow from local_now)::int=b.weekly_weekday and local_now::time>=b.weekly_time then
   insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
   select b.id,c.id,'marketing','☕ عندكم جمعة أو مناسبة؟',
     'جهزوا جمعتكم على كيفكم، وضيافتها علينا. احجزوا مع القهوة الملكية!',
     '/card','weekly:'||b.id||':'||c.id||':'||wk
   from public.customers c
   join public.card_notification_preferences p on p.customer_id=c.id and p.marketing_opt_in=true and p.privacy_accepted_at is not null
   where c.business_id=b.id and c.status='active'
   and exists(select 1 from public.push_subscriptions s where s.customer_id=c.id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics n=row_count;ct_weekly:=ct_weekly+n;
  end if;
 end loop;
 return jsonb_build_object('weekly_queued',ct_weekly,'test_queued',ct_test);
end$$;

-- Only service_role can fetch the private key, and only after a 256-bit cron-secret comparison.
-- Secrets are encrypted at rest by Supabase Vault; never sent to the browser.
create or replace function public.service_get_push_config(p_cron_key text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare expected text; private_key text;
begin
 if p_cron_key is null or p_cron_key !~ '^[a-f0-9]{64}$' then return null; end if;
 select decrypted_secret into expected from vault.decrypted_secrets where name='royal_coffee_push_cron_secret' limit 1;
 if expected is null or expected is distinct from p_cron_key then return null; end if;
 select decrypted_secret into private_key from vault.decrypted_secrets where name='royal_coffee_vapid_private_jwk' limit 1;
 if private_key is null then raise exception 'Push configuration missing'; end if;
 return jsonb_build_object('vapid_private_jwk',private_key,'vapid_subject','mailto:bombastk10@gmail.com');
end$$;
revoke all on function public.service_get_push_config(text) from PUBLIC,anon,authenticated;
grant execute on function public.service_get_push_config(text) to service_role;

-- Keep existing service-only scheduling/grant boundaries intact.
revoke execute on function public.service_queue_scheduled() from PUBLIC,anon,authenticated;
grant execute on function public.service_queue_scheduled() to service_role;
revoke execute on function public.enqueue_customer_message(uuid,text,text,text,text) from PUBLIC,anon,authenticated;
