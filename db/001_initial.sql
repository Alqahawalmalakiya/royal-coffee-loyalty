-- Loyalty Card PWA v1, standalone Supabase project only.
-- Requires a fresh project. Never execute against an existing unrelated project.
-- Run in Supabase SQL editor as a single transaction. Keep all secrets out of this file.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.businesses (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
 name text not null check (char_length(name) between 2 and 100),
 reward_threshold integer not null default 6 check (reward_threshold between 1 and 50),
 reward_description text not null default 'قهوتان مجانًا' check (char_length(reward_description) between 1 and 160),
 weekly_weekday integer not null default 4 check (weekly_weekday between 0 and 6),
 weekly_time time not null default '17:00',
 test_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.businesses (slug,name) values ('default','بطاقتي');

create table public.staff_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 business_id uuid not null references public.businesses(id),
 role text not null check (role in ('admin')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index staff_roles_business on public.staff_roles(business_id);

create table public.customers (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 member_code text not null unique check (member_code ~ '^LC-[0-9A-F]{12}$'),
 name text not null check (char_length(btrim(name)) between 2 and 120),
 contact text check (contact is null or char_length(contact) <= 140),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 privacy_accepted_at timestamptz,
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index customers_business_created on public.customers(business_id,created_at desc);

create table public.invitation_tokens (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id) on delete cascade,
 token_hash text not null unique check (char_length(token_hash)=64),
 purpose text not null check(purpose in ('activate','recover')),
 expires_at timestamptz not null,
 used_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index invitation_tokens_customer on public.invitation_tokens(customer_id,created_at desc);

create table public.hospitality_events (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 business_id uuid not null references public.businesses(id),
 request_id uuid not null,
 request_index integer not null check (request_index between 1 and 50),
 title text not null check(char_length(title) between 2 and 150),
 occurred_on date not null,
 status text not null default 'approved' check(status in ('approved','reversed')),
 approved_by uuid not null references auth.users(id),
 reversed_by uuid references auth.users(id),
 reversed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(request_id,request_index)
);
create index events_customer_status on public.hospitality_events(customer_id,status,created_at desc);
-- Same customer's repeated same-day event/title/sequence is rejected even with a new request ID.
create unique index events_no_accidental_duplicate on public.hospitality_events(customer_id,occurred_on,title,request_index) where status='approved';

create table public.rewards (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 business_id uuid not null references public.businesses(id),
 reward_index integer not null check(reward_index>0),
 description text not null,
 status text not null default 'available' check(status in ('available','redeemed','voided')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(customer_id,reward_index)
);
create index rewards_customer_status on public.rewards(customer_id,status);

create table public.reward_redemptions (
 id uuid primary key default gen_random_uuid(),
 reward_id uuid not null unique references public.rewards(id),
 business_id uuid not null references public.businesses(id),
 redeemed_by uuid not null references auth.users(id),
 redeemed_at timestamptz not null default now()
);

create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 marketing_opt_in boolean not null default false,
 marketing_updated_at timestamptz not null default now()
);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check (length(endpoint) between 20 and 2048),
 p256dh text not null check (length(p256dh) between 40 and 200),
 auth text not null check (length(auth) between 10 and 100),
 disabled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index subs_user_active on public.push_subscriptions(user_id,disabled_at);

create table public.notification_campaigns (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 created_by uuid not null references auth.users(id),
 title text not null check(length(title) between 2 and 90),
 body text not null check(length(body) between 2 and 240),
 scheduled integer not null default 0,
 created_at timestamptz not null default now()
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid references public.notification_campaigns(id),
 kind text not null check(kind in ('transactional','marketing','test')),
 title text not null, body text not null, path text not null default '/',
 dedupe_key text not null unique,
 status text not null default 'queued' check(status in ('queued','processing','accepted','failed','skipped')),
 claimed_at timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), finished_at timestamptz
);
create index outbox_status_created on public.notification_outbox(status,claimed_at,created_at);
create table public.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.notification_outbox(id),
 subscription_id uuid not null references public.push_subscriptions(id),
 status text not null check(status in ('accepted','failed')),
 http_status integer, last_error text, attempts integer not null default 1,
 attempted_at timestamptz not null default now(),
 unique(job_id,subscription_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 actor_id uuid references auth.users(id),
 action text not null, target_id uuid,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index audit_business_created on public.audit_logs(business_id,created_at desc);

-- All public tables have RLS, including those only used by the server.
do $$declare t text;begin
 foreach t in array array['businesses','staff_roles','customers','invitation_tokens','hospitality_events','rewards','reward_redemptions','notification_preferences','push_subscriptions','notification_campaigns','notification_outbox','notification_deliveries','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles where user_id = (select auth.uid()) and role='admin' and active=true);
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

create policy customer_own_or_admin on public.customers for select to authenticated
 using (auth_user_id=(select auth.uid()) or (select public.is_admin()));
create policy events_own_or_admin on public.hospitality_events for select to authenticated
 using (exists(select 1 from public.customers c where c.id=customer_id and (c.auth_user_id=(select auth.uid()) or (select public.is_admin()))));
create policy rewards_own_or_admin on public.rewards for select to authenticated
 using (exists(select 1 from public.customers c where c.id=customer_id and (c.auth_user_id=(select auth.uid()) or (select public.is_admin()))));
create policy prefs_own on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy subs_own on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
-- Explicit SELECT grants, still restricted by RLS. No direct modifications granted.
grant select on public.customers,public.hospitality_events,public.rewards,public.notification_preferences,public.push_subscriptions to authenticated;

create function public.my_role() returns text language plpgsql stable security definer set search_path = '' as $$
begin
 if (select public.is_admin()) then return 'admin'; end if;
 if exists (select 1 from public.customers where auth_user_id=(select auth.uid()) and status='active') then return 'customer'; end if;
 return null;
end$$;

create function public.require_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_business uuid;
begin
 select business_id into v_business from public.staff_roles where user_id=(select auth.uid()) and role='admin' and active=true;
 if v_business is null then raise exception 'Not authorized as administrator' using errcode='42501'; end if;
 return v_business;
end$$;

create function public.admin_create_customer(p_name text,p_contact text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid; c public.customers; token text; code text;
begin
 bid := public.require_admin();
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Customer name must be 2-120 characters'; end if;
 if p_contact is not null and length(p_contact)>140 then raise exception 'Contact details too long'; end if;
 code := 'LC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 insert into public.customers(business_id,member_code,name,contact) values(bid,code,btrim(p_name),nullif(btrim(p_contact),'')) returning * into c;
 token := encode(extensions.gen_random_bytes(32),'hex');
 insert into public.invitation_tokens(customer_id,token_hash,purpose,expires_at,created_by)
 values(c.id,encode(extensions.digest(token,'sha256'),'hex'),'activate',now()+interval '7 days',(select auth.uid()));
 insert into public.audit_logs(business_id,actor_id,action,target_id,details) values(bid,(select auth.uid()),'customer_created',c.id,jsonb_build_object('name',c.name));
 return jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'member_code',c.member_code),'token',token);
end$$;

create function public.admin_issue_link(p_customer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid;c public.customers;token text;pur text;
begin
 bid:=public.require_admin();
 select * into c from public.customers where id=p_customer_id and business_id=bid for update;
 if not found then raise exception 'Customer not found'; end if;
 pur:=case when c.auth_user_id is null then 'activate' else 'recover' end;
 update public.invitation_tokens set used_at=now() where customer_id=c.id and used_at is null;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.invitation_tokens(customer_id,token_hash,purpose,expires_at,created_by)
 values(c.id,encode(extensions.digest(token,'sha256'),'hex'),pur,now()+interval '7 days',(select auth.uid()));
 insert into public.audit_logs(business_id,actor_id,action,target_id) values(bid,(select auth.uid()),'new_'||pur||'_link',c.id);
 return jsonb_build_object('token',token,'purpose',pur);
end$$;

create function public.service_invitation_lookup(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invitation_tokens;c public.customers;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite token'; end if;
 select * into i from public.invitation_tokens where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and expires_at>now();
 if not found then raise exception 'Invitation invalid or expired'; end if;
 select * into c from public.customers where id=i.customer_id and status='active';
 if not found then raise exception 'Customer disabled'; end if;
 if (i.purpose='activate' and c.auth_user_id is not null) or (i.purpose='recover' and c.auth_user_id is null) then raise exception 'Invitation purpose mismatch'; end if;
 return jsonb_build_object('customer_id',c.id,'member_code',c.member_code,'auth_user_id',c.auth_user_id,'purpose',i.purpose);
end$$;

create function public.service_attach_customer(p_token text,p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invitation_tokens;c public.customers;
begin
 select * into i from public.invitation_tokens where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and expires_at>now() for update;
 if not found or i.purpose<>'activate' then raise exception 'Invalid or used activation link'; end if;
 select * into c from public.customers where id=i.customer_id and status='active' for update;
 if not found or c.auth_user_id is not null then raise exception 'Membership already activated'; end if;
 update public.customers set auth_user_id=p_user_id,privacy_accepted_at=now(),updated_at=now() where id=c.id;
 insert into public.notification_preferences(user_id) values(p_user_id) on conflict do nothing;
 update public.invitation_tokens set used_at=now() where id=i.id;
 update public.invitation_tokens set used_at=now() where customer_id=c.id and used_at is null;
 insert into public.audit_logs(business_id,actor_id,action,target_id) values(c.business_id,p_user_id,'customer_activated',c.id);
 return c.member_code;
end$$;

create function public.service_complete_recovery(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare i public.invitation_tokens;
begin
 select * into i from public.invitation_tokens where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and expires_at>now() and purpose='recover' for update;
 if not found then raise exception 'Invalid or used recovery link'; end if;
 update public.invitation_tokens set used_at=now() where customer_id=i.customer_id and used_at is null;
 insert into public.audit_logs(business_id,actor_id,action,target_id) select business_id,auth_user_id,'password_recovered',id from public.customers where id=i.customer_id;
 return true;
end$$;

create function public.enqueue_customer_message(p_customer_id uuid,p_kind text,p_title text,p_body text,p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers;
begin
 select * into c from public.customers where id=p_customer_id;
 if c.auth_user_id is null then return; end if;
 insert into public.notification_outbox(business_id,user_id,kind,title,body,dedupe_key)
 values(c.business_id,c.auth_user_id,p_kind,p_title,p_body,p_dedupe)
 on conflict(dedupe_key) do nothing;
end$$;

create function public.sync_customer_rewards(p_customer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;thr int;des text;count_events int;target int;valid_count int;redeemed_count int;reward_row public.rewards;
begin
 select business_id into bid from public.customers where id=p_customer_id for update;
 if not found then raise exception 'Customer not found'; end if;
 select reward_threshold,reward_description into thr,des from public.businesses where id=bid;
 select count(*) into count_events from public.hospitality_events where customer_id=p_customer_id and status='approved';
 target:=floor(count_events::numeric/thr)::int;
 select count(*) filter(where status<>'voided'),count(*) filter(where status='redeemed') into valid_count,redeemed_count from public.rewards where customer_id=p_customer_id;
 if redeemed_count>target then raise exception 'Cannot remove earned history below already redeemed rewards'; end if;
 while valid_count<target loop
   select * into reward_row from public.rewards where customer_id=p_customer_id and status='voided' order by reward_index asc limit 1 for update;
   if found then
    update public.rewards set status='available',description=des,updated_at=now() where id=reward_row.id;
   else
    insert into public.rewards(customer_id,business_id,reward_index,description)
    values(p_customer_id,bid,coalesce((select max(reward_index)+1 from public.rewards where customer_id=p_customer_id),1),des) returning * into reward_row;
   end if;
   perform public.enqueue_customer_message(p_customer_id,'transactional','🎁 هديتك جاهزة!','استحققت '||des||'، افتح بطاقتك لمعرفة التفاصيل.','reward:'||reward_row.id||':'||reward_row.updated_at::text);
   valid_count:=valid_count+1;
 end loop;
 while valid_count>target loop
   select * into reward_row from public.rewards where customer_id=p_customer_id and status='available' order by reward_index desc limit 1 for update;
   if not found then raise exception 'Cannot void redeemed reward'; end if;
   update public.rewards set status='voided',updated_at=now() where id=reward_row.id;
   valid_count:=valid_count-1;
 end loop;
end$$;

create function public.admin_grant_stamps(p_customer_id uuid,p_count int,p_title text,p_occurred_on date,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid;c public.customers;i integer;prior_count integer;current_count integer;
begin
 bid:=public.require_admin();
 if p_count not between 1 and 6 or char_length(btrim(coalesce(p_title,''))) not between 2 and 150 or p_occurred_on is null or p_request_id is null then raise exception 'Invalid event details'; end if;
 if p_occurred_on > (now() at time zone 'Asia/Riyadh')::date then raise exception 'Cannot approve a future event'; end if;
 select * into c from public.customers where id=p_customer_id and business_id=bid and status='active' for update;
 if not found then raise exception 'Customer not found or suspended'; end if;
 if exists(select 1 from public.hospitality_events where request_id=p_request_id) then
  return jsonb_build_object('added',0,'duplicate',true);
 end if;
 for i in 1..p_count loop
  insert into public.hospitality_events(customer_id,business_id,request_id,request_index,title,occurred_on,approved_by)
  values(c.id,bid,p_request_id,i,btrim(p_title),p_occurred_on,(select auth.uid()));
 end loop;
 perform public.sync_customer_rewards(c.id);
 select count(*) into current_count from public.hospitality_events where customer_id=c.id and status='approved';
 insert into public.audit_logs(business_id,actor_id,action,target_id,details) values(bid,(select auth.uid()),'stamps_added',c.id,jsonb_build_object('count',p_count,'request_id',p_request_id,'occurred_on',p_occurred_on));
 perform public.enqueue_customer_message(c.id,'transactional','☕ تمت إضافة نقاطك','تم اعتماد '||p_count||' من مناسباتك. إجمالي المناسبات: '||current_count,'stamps:'||p_request_id);
 return jsonb_build_object('added',p_count,'total_events',current_count,'duplicate',false);
end$$;

create function public.admin_reverse_event(p_event_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare bid uuid;e public.hospitality_events;
begin
 bid:=public.require_admin();
 select * into e from public.hospitality_events where id=p_event_id and business_id=bid for update;
 if not found then raise exception 'Event not found'; end if;
 if e.status='reversed' then return false; end if;
 perform 1 from public.customers where id=e.customer_id for update;
 update public.hospitality_events set status='reversed',reversed_by=(select auth.uid()),reversed_at=now() where id=e.id;
 perform public.sync_customer_rewards(e.customer_id);
 insert into public.audit_logs(business_id,actor_id,action,target_id,details) values(bid,(select auth.uid()),'event_reversed',e.id,jsonb_build_object('customer_id',e.customer_id));
 return true;
end$$;

create function public.admin_redeem_reward(p_reward_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare bid uuid;r public.rewards;
begin
 bid:=public.require_admin();
 select * into r from public.rewards where id=p_reward_id and business_id=bid for update;
 if not found then raise exception 'Reward not found'; end if;
 if r.status<>'available' then raise exception 'Reward is not available for redemption'; end if;
 update public.rewards set status='redeemed',updated_at=now() where id=r.id;
 insert into public.reward_redemptions(reward_id,business_id,redeemed_by) values(r.id,bid,(select auth.uid()));
 insert into public.audit_logs(business_id,actor_id,action,target_id) values(bid,(select auth.uid()),'reward_redeemed',r.id);
 perform public.enqueue_customer_message(r.customer_id,'transactional','☕ تم استبدال هديتك','تم تسجيل استلام هديتك: '||r.description,'redeemed:'||r.id);
 return true;
end$$;

create function public.admin_update_settings(p_name text,p_reward_threshold int,p_reward_description text,p_weekly_weekday int,p_weekly_time time) returns boolean
language plpgsql security definer set search_path = '' as $$
declare bid uuid;c record;
begin
 bid:=public.require_admin();
 if length(btrim(coalesce(p_name,''))) not between 2 and 100 or p_reward_threshold not between 1 and 50 or length(btrim(coalesce(p_reward_description,''))) not between 1 and 160 or p_weekly_weekday not between 0 and 6 or p_weekly_time is null then raise exception 'Invalid settings'; end if;
 update public.businesses set name=btrim(p_name),reward_threshold=p_reward_threshold,reward_description=btrim(p_reward_description),weekly_weekday=p_weekly_weekday,weekly_time=p_weekly_time,updated_at=now() where id=bid;
 -- Reconcile available rewards. A forbidden change affecting redeemed rewards aborts the entire transaction.
 for c in select id from public.customers where business_id=bid order by id loop perform public.sync_customer_rewards(c.id); end loop;
 insert into public.audit_logs(business_id,actor_id,action,details) values(bid,(select auth.uid()),'settings_changed',jsonb_build_object('threshold',p_reward_threshold,'name',p_name));
 return true;
end$$;

create function public.admin_set_test_mode(p_minutes int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
 bid:=public.require_admin();
 if p_minutes not between 0 and 30 then raise exception 'Test mode limit is 30 minutes'; end if;
 update public.businesses set test_until=case when p_minutes=0 then null else now()+make_interval(mins=>p_minutes) end,updated_at=now() where id=bid;
 insert into public.audit_logs(business_id,actor_id,action,details) values(bid,(select auth.uid()),'test_mode_changed',jsonb_build_object('minutes',p_minutes));
 return true;
end$$;

create function public.set_my_preferences(p_marketing boolean,p_privacy_accepted boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
 uid:=(select auth.uid());if uid is null then raise exception 'Sign-in required';end if;
 if not exists(select 1 from public.customers where auth_user_id=uid and status='active') then raise exception 'Customer account required'; end if;
 insert into public.notification_preferences(user_id,marketing_opt_in,marketing_updated_at) values(uid,coalesce(p_marketing,false),now())
 on conflict(user_id) do update set marketing_opt_in=excluded.marketing_opt_in,marketing_updated_at=excluded.marketing_updated_at;
 if p_privacy_accepted then update public.customers set privacy_accepted_at=coalesce(privacy_accepted_at,now()) where auth_user_id=uid; end if;
 return true;
end$$;

create function public.register_my_push(p_endpoint text,p_p256dh text,p_auth text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
 uid:=(select auth.uid());
 if uid is null or not exists(select 1 from public.customers where auth_user_id=uid and status='active') then raise exception 'Customer account required'; end if;
 if p_endpoint !~ '^https://[^ ]+$' or char_length(p_endpoint)>2048 or length(p_p256dh) not between 40 and 200 or length(p_auth) not between 10 and 100 then raise exception 'Invalid push subscription'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(uid,p_endpoint,p_p256dh,p_auth)
 on conflict (endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,disabled_at=null,updated_at=now()
 where public.push_subscriptions.user_id=uid;
 if not found then raise exception 'Subscription endpoint belongs to another account'; end if;
 return true;
end$$;

create function public.remove_my_push(p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 update public.push_subscriptions set disabled_at=now() where user_id=(select auth.uid()) and endpoint=p_endpoint;
 return found;
end$$;

create function public.admin_create_campaign(p_title text,p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid;camp public.notification_campaigns;ct int;
begin
 bid:=public.require_admin();
 if length(btrim(coalesce(p_title,''))) not between 2 and 90 or length(btrim(coalesce(p_body,''))) not between 2 and 240 then raise exception 'Invalid campaign message'; end if;
 insert into public.notification_campaigns(business_id,created_by,title,body) values(bid,(select auth.uid()),btrim(p_title),btrim(p_body)) returning * into camp;
 insert into public.notification_outbox(business_id,user_id,campaign_id,kind,title,body,dedupe_key)
 select bid,c.auth_user_id,camp.id,'marketing',camp.title,camp.body,'campaign:'||camp.id||':'||c.auth_user_id
 from public.customers c join public.notification_preferences p on p.user_id=c.auth_user_id and p.marketing_opt_in=true
 where c.business_id=bid and c.status='active' and exists(select 1 from public.push_subscriptions s where s.user_id=c.auth_user_id and s.disabled_at is null)
 on conflict(dedupe_key) do nothing;
 get diagnostics ct = row_count;
 update public.notification_campaigns set scheduled=ct where id=camp.id;
 insert into public.audit_logs(business_id,actor_id,action,target_id,details) values(bid,(select auth.uid()),'campaign_created',camp.id,jsonb_build_object('scheduled',ct));
 return jsonb_build_object('scheduled',ct,'id',camp.id);
end$$;

create function public.my_card() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.customers;b public.businesses;cnt int;avail int;marketing boolean;
begin
 select * into c from public.customers where auth_user_id=(select auth.uid()) and status='active';
 if not found then return null; end if;
 select * into b from public.businesses where id=c.business_id;
 select count(*) into cnt from public.hospitality_events where customer_id=c.id and status='approved';
 select count(*) into avail from public.rewards where customer_id=c.id and status='available';
 select marketing_opt_in into marketing from public.notification_preferences where user_id=(select auth.uid());
 return jsonb_build_object('id',c.id,'name',c.name,'business_name',b.name,'member_code',c.member_code,'total_events',cnt,'threshold',b.reward_threshold,'progress',mod(cnt,b.reward_threshold),'available_rewards',avail,'reward_description',b.reward_description,'updated_at',greatest(c.updated_at,b.updated_at,coalesce((select max(created_at) from public.hospitality_events where customer_id=c.id),c.created_at)), 'marketing_opt_in',coalesce(marketing,false),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'occurred_on',e.occurred_on,'status',e.status) order by e.created_at desc) from public.hospitality_events e where e.customer_id=c.id),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'description',r.description,'status',r.status,'created_at',r.created_at) order by r.created_at desc) from public.rewards r where r.customer_id=c.id),'[]'::jsonb));
end$$;

create function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare bid uuid;b public.businesses;
begin
 bid:=public.require_admin();select * into b from public.businesses where id=bid;
 return jsonb_build_object(
 'settings',jsonb_build_object('name',b.name,'reward_threshold',b.reward_threshold,'reward_description',b.reward_description,'weekly_weekday',b.weekly_weekday,'weekly_time',to_char(b.weekly_time,'HH24:MI'),'test_until',b.test_until),
 'stats',jsonb_build_object('customers',(select count(*) from public.customers where business_id=bid),'events',(select count(*) from public.hospitality_events where business_id=bid and status='approved'),'available',(select count(*) from public.rewards where business_id=bid and status='available'),'redeemed',(select count(*) from public.rewards where business_id=bid and status='redeemed')),
 'customers',coalesce((select jsonb_agg(t order by t.created_at desc) from (select c.id,c.name,c.member_code,c.contact,c.created_at,(c.auth_user_id is not null) as activated,(select count(*) from public.hospitality_events e where e.customer_id=c.id and e.status='approved') as total_events,mod((select count(*)::int from public.hospitality_events e where e.customer_id=c.id and e.status='approved'),b.reward_threshold) as progress,(select count(*) from public.rewards r where r.customer_id=c.id and r.status='available') as available_rewards from public.customers c where c.business_id=bid) t),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(t order by t.created_at desc) from (select e.id,e.customer_id,e.title,e.occurred_on,e.status,e.created_at from public.hospitality_events e where e.business_id=bid order by e.created_at desc limit 300) t),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(t order by t.created_at desc) from (select r.id,r.customer_id,r.description,r.status,r.created_at,c.name as customer_name from public.rewards r join public.customers c on c.id=r.customer_id where r.business_id=bid order by r.created_at desc limit 300) t),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(t order by t.created_at desc) from (select nc.id,nc.title,nc.scheduled,nc.created_at,
  (select count(*) from public.notification_outbox o where o.campaign_id=nc.id and o.status='accepted') as accepted,
  (select count(*) from public.notification_outbox o where o.campaign_id=nc.id and o.status='failed') as failed
 from public.notification_campaigns nc where nc.business_id=bid order by nc.created_at desc limit 30) t),'[]'::jsonb),
 'notification_stats',jsonb_build_object('queued',(select count(*) from public.notification_outbox where business_id=bid and status='queued'),'provider_accepted',(select count(*) from public.notification_deliveries d join public.notification_outbox o on o.id=d.job_id where o.business_id=bid and d.status='accepted'),'provider_failed',(select count(*) from public.notification_deliveries d join public.notification_outbox o on o.id=d.job_id where o.business_id=bid and d.status='failed'))
 );
end$$;

-- Only the secret-key backend may call dispatch and invitation functions.
create function public.service_queue_scheduled() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.businesses;local_now timestamp;wk text;bucket text;ct_weekly int:=0;ct_test int:=0;
begin
 local_now:=now() at time zone 'Asia/Riyadh';wk:=to_char(local_now,'IYYY-IW');bucket:=to_char(local_now,'YYYYMMDDHH24')||lpad((floor(extract(minute from local_now)/5)::int*5)::text,2,'0');
 for b in select * from public.businesses loop
  if extract(dow from local_now)::int=b.weekly_weekday and local_now::time>=b.weekly_time then
   insert into public.notification_outbox(business_id,user_id,kind,title,body,dedupe_key)
   select b.id,c.auth_user_id,'marketing','☕ مناسبتك الجاية علينا!','لا تنسى ضيافتك الجاية، نحن جاهزين لخدمتك.','weekly:'||b.id||':'||c.auth_user_id||':'||wk
   from public.customers c join public.notification_preferences p on p.user_id=c.auth_user_id and p.marketing_opt_in=true
   where c.business_id=b.id and c.status='active' and exists(select 1 from public.push_subscriptions s where s.user_id=c.auth_user_id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics ct_weekly=row_count;
  end if;
  if b.test_until is not null and b.test_until>now() then
   insert into public.notification_outbox(business_id,user_id,kind,title,body,dedupe_key)
   select b.id,c.auth_user_id,'test','🧪 اختبار إشعارات بطاقتي','هذا إشعار تجريبي يُرسل كل ٥ دقائق خلال فترة الاختبار.','test:'||b.id||':'||c.auth_user_id||':'||bucket
   from public.customers c join public.notification_preferences p on p.user_id=c.auth_user_id and p.marketing_opt_in=true
   where c.business_id=b.id and c.status='active' and exists(select 1 from public.push_subscriptions s where s.user_id=c.auth_user_id and s.disabled_at is null)
   on conflict(dedupe_key) do nothing;
   get diagnostics ct_test=row_count;
  end if;
 end loop;
 return jsonb_build_object('weekly_queued',ct_weekly,'test_queued',ct_test);
end$$;

create function public.service_claim_jobs(p_limit int default 8) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
 with picked as (
  select id from public.notification_outbox where status='queued' or (status='processing' and claimed_at<now()-interval '12 minutes')
  order by created_at limit least(greatest(p_limit,1),15) for update skip locked
 ), updated as (
  update public.notification_outbox j set status='processing',claimed_at=now(),attempts=attempts+1
  from picked where j.id=picked.id returning j.id,j.user_id,j.kind,j.title,j.body,j.path,j.attempts
 ) select coalesce(jsonb_agg(to_jsonb(updated)),'[]'::jsonb) into out from updated;
 return out;
end$$;

create function public.service_get_job_subscriptions(p_job_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]'::jsonb)
 from public.notification_outbox j join public.push_subscriptions s on s.user_id=j.user_id and s.disabled_at is null
 left join public.notification_preferences p on p.user_id=j.user_id
 where j.id=p_job_id and j.status='processing' and (j.kind='transactional' or p.marketing_opt_in=true)
 and not exists(select 1 from public.notification_deliveries d where d.job_id=j.id and d.subscription_id=s.id and d.status='accepted');
$$;

create function public.service_record_delivery(p_job_id uuid,p_subscription_id uuid,p_ok boolean,p_http_status integer,p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.notification_deliveries(job_id,subscription_id,status,http_status,last_error)
 values(p_job_id,p_subscription_id,case when p_ok then 'accepted' else 'failed' end,p_http_status,substr(p_error,1,500))
 on conflict(job_id,subscription_id) do update set status=excluded.status,http_status=excluded.http_status,last_error=excluded.last_error,attempts=public.notification_deliveries.attempts+1,attempted_at=now();
 if p_http_status in (404,410) then update public.push_subscriptions set disabled_at=now() where id=p_subscription_id; end if;
 return true;
end$$;

create function public.service_finish_job(p_job_id uuid,p_ok boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 update public.notification_outbox set status=case when p_ok then 'accepted' when attempts>=3 then 'failed' else 'queued' end,claimed_at=null,finished_at=case when p_ok or attempts>=3 then now() else null end where id=p_job_id and status='processing';
 return found;
end$$;

-- Secure default function privileges; sensitive APIs explicitly restricted to service_role.
do $$declare f record;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('my_role','require_admin','admin_create_customer','admin_issue_link','service_invitation_lookup','service_attach_customer','service_complete_recovery','enqueue_customer_message','sync_customer_rewards','admin_grant_stamps','admin_reverse_event','admin_redeem_reward','admin_update_settings','admin_set_test_mode','set_my_preferences','register_my_push','remove_my_push','admin_create_campaign','my_card','admin_dashboard','service_queue_scheduled','service_claim_jobs','service_get_job_subscriptions','service_record_delivery','service_finish_job') loop
  execute format('revoke all on function %s from PUBLIC,anon,authenticated',f.oid::regprocedure);
 end loop;
end$$;
grant execute on function public.my_role() to authenticated;
grant execute on function public.admin_create_customer(text,text),public.admin_issue_link(uuid),public.admin_grant_stamps(uuid,integer,text,date,uuid),public.admin_reverse_event(uuid),public.admin_redeem_reward(uuid),public.admin_update_settings(text,integer,text,integer,time),public.admin_set_test_mode(integer),public.admin_create_campaign(text,text),public.admin_dashboard() to authenticated;
grant execute on function public.set_my_preferences(boolean,boolean),public.register_my_push(text,text,text),public.remove_my_push(text),public.my_card() to authenticated;
grant execute on function public.service_invitation_lookup(text),public.service_attach_customer(text,uuid),public.service_complete_recovery(text),public.service_queue_scheduled(),public.service_claim_jobs(integer),public.service_get_job_subscriptions(uuid),public.service_record_delivery(uuid,uuid,boolean,integer,text),public.service_finish_job(uuid,boolean) to service_role;
commit;

-- NOTE: apply the companion migration 002_skip_jobs.sql as well before enabling cron.
