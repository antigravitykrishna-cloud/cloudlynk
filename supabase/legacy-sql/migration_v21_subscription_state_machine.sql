-- Migration v21: subscription state machine on profiles + subscription_requests table
-- Applied by: admin via Supabase SQL editor or CLI
-- Date: 2026-06-16

alter table public.profiles
  add column if not exists plan_status text not null default 'free'
    check (plan_status in ('free', 'pending', 'active', 'expired', 'cancelled', 'lifetime')),
  add column if not exists plan_expires_at timestamptz,
  add column if not exists plan_started_at timestamptz,
  add column if not exists plan_cancelled_at timestamptz,
  add column if not exists iap_purchase_token text,
  add column if not exists iap_product_id text;

update public.profiles
  set plan_status = 'active',
      plan_started_at = now(),
      plan_expires_at = now() + interval '30 days'
  where plan = 'standard' and plan_status = 'free';

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  amount_inr int not null,
  upi_transaction_id text,
  screenshot_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_requests_user_idx on public.subscription_requests (user_id, created_at desc);
create index if not exists subscription_requests_status_idx on public.subscription_requests (status, created_at desc);

alter table public.subscription_requests enable row level security;

create policy "Users read own requests" on public.subscription_requests
  for select using (user_id = auth.uid());

create policy "Users insert own requests" on public.subscription_requests
  for insert with check (user_id = auth.uid());

create policy "Admins manage all requests" on public.subscription_requests
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
