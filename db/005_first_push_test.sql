-- Enable the requested 5-minute booking-reminder test on the first opted-in device only.
-- The test automatically expires after 30 minutes; later subscriptions never restart it.
create table if not exists public.push_test_first_use (
 key text primary key check(key='first_marketing_subscription'),
 started_at timestamptz not null default now()
);
alter table public.push_test_first_use enable row level security;
revoke all on public.push_test_first_use from anon,authenticated;

create or replace function public.trigger_first_marketing_test() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if new.customer_id is null or new.disabled_at is not null then return new; end if;
 if not exists (
   select 1 from public.card_notification_preferences p
   where p.customer_id=new.customer_id and p.marketing_opt_in=true and p.privacy_accepted_at is not null
 ) then return new; end if;
 insert into public.push_test_first_use(key) values('first_marketing_subscription') on conflict do nothing;
 if found then
   select business_id into bid from public.customers where id=new.customer_id;
   update public.businesses set test_until=now()+interval '30 minutes',updated_at=now() where id=bid;
 end if;
 return new;
end$$;
revoke all on function public.trigger_first_marketing_test() from PUBLIC,anon,authenticated;
drop trigger if exists royal_first_marketing_test on public.push_subscriptions;
create trigger royal_first_marketing_test after insert or update of disabled_at on public.push_subscriptions
for each row execute function public.trigger_first_marketing_test();
