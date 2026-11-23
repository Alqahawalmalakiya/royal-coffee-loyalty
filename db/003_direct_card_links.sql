-- Direct, read-only customer cards. Tokens are 256-bit secrets stored only as SHA-256 hashes.
-- This migration is ADDITIVE and applies only to the NEW loyalty Supabase project.
create table public.customer_card_links (
 customer_id uuid primary key references public.customers(id) on delete cascade,
 business_id uuid not null references public.businesses(id),
 token_hash text not null unique check(length(token_hash)=64),
 created_at timestamptz not null default now(),
 rotated_at timestamptz not null default now()
);
create table public.card_notification_preferences (
 customer_id uuid primary key references public.customers(id) on delete cascade,
 marketing_opt_in boolean not null default false,
 marketing_updated_at timestamptz not null default now(),
 privacy_accepted_at timestamptz
);
-- Existing OAuth/legacy push subscribers continue to function, while new card subscribers
-- are associated with membership rather than Supabase Auth user IDs.
alter table public.push_subscriptions alter column user_id drop not null;
alter table public.push_subscriptions add column customer_id uuid references public.customers(id) on delete cascade;
alter table public.push_subscriptions add constraint push_has_exactly_one_owner check(num_nonnulls(user_id,customer_id)=1);
create index push_card_active on public.push_subscriptions(customer_id,disabled_at);
alter table public.notification_outbox alter column user_id drop not null;
alter table public.notification_outbox add column customer_id uuid references public.customers(id) on delete cascade;
alter table public.notification_outbox add constraint notification_has_exactly_one_owner check(num_nonnulls(user_id,customer_id)=1);
create index notification_customer_status on public.notification_outbox(customer_id,status);
alter table public.customer_card_links enable row level security;
alter table public.card_notification_preferences enable row level security;
revoke all on public.customer_card_links,public.card_notification_preferences from anon,authenticated;

create function public.require_active_card(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid card link' using errcode='22023'; end if;
 select c.id into result from public.customer_card_links l
 join public.customers c on c.id=l.customer_id and c.business_id=l.business_id
 where l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and c.status='active';
 if result is null then raise exception 'Card unavailable or link revoked' using errcode='22023'; end if;
 return result;
end $$;

create function public.admin_create_customer_card(p_name text,p_contact text default null,p_initial_count integer default 0,p_occurred_on date default null,p_event_title text default 'مناسبة ضيافة') returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid;c public.customers;secret text;code text;
begin
 bid:=public.require_admin();
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Invalid customer name'; end if;
 if p_contact is not null and length(p_contact)>140 then raise exception 'Contact too long'; end if;
 if p_initial_count is null or p_initial_count<0 or p_initial_count>6 then raise exception 'Initial stamps must be 0 through 6'; end if;
 if p_initial_count>0 and p_occurred_on is null then raise exception 'Event date required'; end if;
 code:='LC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 insert into public.customers(business_id,member_code,name,contact)
 values(bid,code,btrim(p_name),nullif(btrim(p_contact),'')) returning * into c;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.customer_card_links(customer_id,business_id,token_hash)
 values(c.id,bid,encode(extensions.digest(secret,'sha256'),'hex'));
 insert into public.card_notification_preferences(customer_id) values(c.id);
 if p_initial_count>0 then
  perform public.admin_grant_stamps(c.id,p_initial_count,coalesce(nullif(btrim(p_event_title),''),'مناسبة ضيافة'),p_occurred_on,gen_random_uuid());
 end if;
 insert into public.audit_logs(business_id,actor_id,action,target_id,details)
 values(bid,(select auth.uid()),'direct_card_created',c.id,jsonb_build_object('name',c.name,'initial_stamps',p_initial_count));
 return jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'member_code',c.member_code),'token',secret);
end $$;

create function public.admin_rotate_card_link(p_customer_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid; c public.customers;secret text;
begin
 bid:=public.require_admin();
 select * into c from public.customers where id=p_customer_id and business_id=bid for update;
 if not found then raise exception 'Customer not found';end if;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.customer_card_links(customer_id,business_id,token_hash)
 values(c.id,bid,encode(extensions.digest(secret,'sha256'),'hex'))
 on conflict(customer_id) do update set token_hash=excluded.token_hash,rotated_at=now();
 insert into public.card_notification_preferences(customer_id) values(c.id) on conflict(customer_id) do nothing;
 -- A formerly shared link can no longer see the card. Existing devices cannot
 -- receive notifications without a fresh link; invalidate their subscriptions too.
 update public.push_subscriptions set disabled_at=now() where customer_id=c.id;
 insert into public.audit_logs(business_id,actor_id,action,target_id)
 values(bid,(select auth.uid()),'card_link_rotated',c.id);
 return jsonb_build_object('token',secret,'customer',jsonb_build_object('id',c.id,'name',c.name,'member_code',c.member_code));
end $$;

create function public.service_card_by_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;c public.customers;b public.businesses;v_events int;v_available int;v_redeemed int;
begin
 cid:=public.require_active_card(p_token);
 select * into c from public.customers where id=cid;
 select * into b from public.businesses where id=c.business_id;
 select count(*) into v_events from public.hospitality_events where customer_id=cid and status='approved';
 select count(*) filter(where status='available'),count(*) filter(where status='redeemed')
 into v_available,v_redeemed from public.rewards where customer_id=cid;
 return jsonb_build_object(
  'name',c.name,'business_name',b.name,'member_code',c.member_code,
  'total_events',v_events,'progress',mod(v_events,b.reward_threshold),'threshold',b.reward_threshold,
  'available_rewards',v_available,'redeemed_rewards',v_redeemed,'reward_description',b.reward_description,
  'updated_at',greatest(c.updated_at,b.updated_at,coalesce((select max(created_at) from public.hospitality_events where customer_id=cid),c.updated_at)),
  'marketing_opt_in',coalesce((select marketing_opt_in from public.card_notification_preferences where customer_id=cid),false)
 );
end $$;

create function public.service_card_subscribe(p_token text,p_endpoint text,p_p256dh text,p_auth text,p_privacy_accepted boolean,p_marketing boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare cid uuid;other_id uuid;sub_count integer;
begin
 cid:=public.require_active_card(p_token);
 if p_privacy_accepted is distinct from true then raise exception 'Privacy acceptance required';end if;
 if p_endpoint is null or p_endpoint !~ '^https://[^ ]+$' or length(p_endpoint)>2048 or
    length(coalesce(p_p256dh,'')) not between 40 and 200 or length(coalesce(p_auth,'')) not between 10 and 100 then
    raise exception 'Invalid push subscription';end if;
 select customer_id into other_id from public.push_subscriptions where endpoint=p_endpoint;
 if found and other_id is distinct from cid then raise exception 'Subscription belongs to another account';end if;
 select count(*) into sub_count from public.push_subscriptions where customer_id=cid and disabled_at is null;
 if sub_count>=5 and not exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and customer_id=cid) then
   raise exception 'Maximum active devices reached';end if;
 insert into public.card_notification_preferences(customer_id,marketing_opt_in,marketing_updated_at,privacy_accepted_at)
 values(cid,coalesce(p_marketing,false),now(),now())
 on conflict(customer_id) do update set marketing_opt_in=excluded.marketing_opt_in,
 marketing_updated_at=now(),privacy_accepted_at=coalesce(public.card_notification_preferences.privacy_accepted_at,now());
 insert into public.push_subscriptions(customer_id,endpoint,p256dh,auth)
 values(cid,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,disabled_at=null,updated_at=now()
 where public.push_subscriptions.customer_id=cid;
 if not found then raise exception 'Subscription conflict';end if;
 return true;
end $$;

create function public.service_card_opt_out(p_token text,p_endpoint text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid:=public.require_active_card(p_token);
 update public.card_notification_preferences set marketing_opt_in=false,marketing_updated_at=now() where customer_id=cid;
 if p_endpoint is null then
  update public.push_subscriptions set disabled_at=now() where customer_id=cid;
 else
  update public.push_subscriptions set disabled_at=now() where customer_id=cid and endpoint=p_endpoint;
 end if;
 return true;
end $$;

create function public.service_card_update_marketing(p_token text,p_marketing boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid:=public.require_active_card(p_token);
 -- Never enable marketing without prior privacy consent and at least one subscription.
 if p_marketing is true and not exists(select 1 from public.card_notification_preferences where customer_id=cid and privacy_accepted_at is not null) then
  raise exception 'Notification setup required';end if;
 insert into public.card_notification_preferences(customer_id,marketing_opt_in,marketing_updated_at)
 values(cid,coalesce(p_marketing,false),now())
 on conflict(customer_id) do update set marketing_opt_in=excluded.marketing_opt_in,marketing_updated_at=now();
 return true;
end $$;

-- Transactional notifications use a membership recipient even without Auth registration.
create or replace function public.enqueue_customer_message(p_customer_id uuid,p_kind text,p_title text,p_body text,p_dedupe text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin
 select * into c from public.customers where id=p_customer_id;
 if not found then return;end if;
 insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
 values(c.business_id,c.id,p_kind,p_title,p_body,'/card',p_dedupe) on conflict(dedupe_key) do nothing;
end $$;

create or replace function public.service_queue_scheduled() returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.businesses;local_now timestamp;wk text;bucket text;ct_weekly int:=0;ct_test int:=0;n int;
begin
 local_now:=now() at time zone 'Asia/Riyadh';
 wk:=to_char(local_now,'IYYY-IW');
 bucket:=to_char(local_now,'YYYYMMDDHH24')||lpad((floor(extract(minute from local_now)/5)::int*5)::text,2,'0');
 for b in select * from public.businesses loop
  if extract(dow from local_now)::int=b.weekly_weekday and local_now::time>=b.weekly_time then
   insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
   select b.id,c.id,'marketing','☕ مناسبتك الجاية علينا!','لا تنسى ضيافتك الجاية، نحن جاهزين لخدمتك.','/card','weekly:'||b.id||':'||c.id||':'||wk
   from public.customers c join public.card_notification_preferences p on p.customer_id=c.id and p.marketing_opt_in=true
   where c.business_id=b.id and c.status='active' and exists(select 1 from public.push_subscriptions s where s.customer_id=c.id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics n=row_count;ct_weekly:=ct_weekly+n;
  end if;
  if b.test_until is not null and b.test_until>now() then
   insert into public.notification_outbox(business_id,customer_id,kind,title,body,path,dedupe_key)
   select b.id,c.id,'marketing','🧪 اختبار إشعارات ضيافة القهوة الملكية','هذا إشعار تجريبي يُرسل كل ٥ دقائق خلال فترة الاختبار.','/card','test:'||b.id||':'||c.id||':'||bucket
   from public.customers c join public.card_notification_preferences p on p.customer_id=c.id and p.marketing_opt_in=true
   where c.business_id=b.id and c.status='active' and exists(select 1 from public.push_subscriptions s where s.customer_id=c.id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics n=row_count;ct_test:=ct_test+n;
  end if;
 end loop;
 return jsonb_build_object('weekly_queued',ct_weekly,'test_queued',ct_test);
end $$;

create or replace function public.service_get_job_subscriptions(p_job_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]'::jsonb)
from public.notification_outbox j join public.push_subscriptions s on s.disabled_at is null and (
  (j.customer_id is not null and s.customer_id=j.customer_id) or (j.user_id is not null and s.user_id=j.user_id))
left join public.notification_preferences lp on lp.user_id=j.user_id
left join public.card_notification_preferences cp on cp.customer_id=j.customer_id
where j.id=p_job_id and j.status='processing'
and (j.kind='transactional' or (j.customer_id is not null and cp.marketing_opt_in=true) or (j.user_id is not null and lp.marketing_opt_in=true))
and not exists(select 1 from public.notification_deliveries d where d.job_id=j.id and d.subscription_id=s.id and d.status='accepted');
$$;

create or replace function public.admin_create_campaign(p_title text,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid;camp public.notification_campaigns;ct int;
begin
 bid:=public.require_admin();
 if length(btrim(coalesce(p_title,''))) not between 2 and 90 or length(btrim(coalesce(p_body,''))) not between 2 and 240 then raise exception 'Invalid campaign message';end if;
 insert into public.notification_campaigns(business_id,created_by,title,body) values(bid,(select auth.uid()),btrim(p_title),btrim(p_body)) returning * into camp;
 insert into public.notification_outbox(business_id,customer_id,campaign_id,kind,title,body,path,dedupe_key)
 select bid,c.id,camp.id,'marketing',camp.title,camp.body,'/card','campaign:'||camp.id||':'||c.id
 from public.customers c join public.card_notification_preferences p on p.customer_id=c.id and p.marketing_opt_in=true
 where c.business_id=bid and c.status='active' and exists(select 1 from public.push_subscriptions s where s.customer_id=c.id and s.disabled_at is null)
 on conflict(dedupe_key) do nothing;
 get diagnostics ct=row_count;
 update public.notification_campaigns set scheduled=ct where id=camp.id;
 insert into public.audit_logs(business_id,actor_id,action,target_id,details) values(bid,(select auth.uid()),'campaign_created',camp.id,jsonb_build_object('scheduled',ct));
 return jsonb_build_object('scheduled',ct,'id',camp.id);
end $$;

-- No token is accessible to an anonymous database role. Only a server-side
-- trusted Edge Function may call these guarded token RPCs.
revoke execute on function public.require_active_card(text),public.admin_create_customer_card(text,text,integer,date,text),
 public.admin_rotate_card_link(uuid),public.service_card_by_token(text),public.service_card_subscribe(text,text,text,text,boolean,boolean),
 public.service_card_opt_out(text,text),public.service_card_update_marketing(text,boolean) from PUBLIC,anon,authenticated;
grant execute on function public.admin_create_customer_card(text,text,integer,date,text),public.admin_rotate_card_link(uuid) to authenticated;
grant execute on function public.service_card_by_token(text),public.service_card_subscribe(text,text,text,text,boolean,boolean),
 public.service_card_opt_out(text,text),public.service_card_update_marketing(text,boolean) to service_role;
