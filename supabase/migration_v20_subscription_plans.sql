-- Migration v20: subscription_plans table — source of truth for plan pricing
-- Applied by: admin via Supabase SQL editor or CLI
-- Date: 2026-06-16

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('trial', 'silver', 'gold', 'platinum', 'diamond')),
  name text not null,
  description text not null,
  duration_days int not null,
  price_inr int not null,
  iap_product_id text,
  is_popular boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;

create policy "Anyone can read active plans" on public.subscription_plans
  for select using (is_active = true);

create policy "Admins can write plans" on public.subscription_plans
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

insert into public.subscription_plans (code, name, description, duration_days, price_inr, is_popular, sort_order) values
  ('trial',    'Trial',    'Quick trial',     2,   69,  false, 1),
  ('silver',   'Silver',   'Weekly access',   7,   129, false, 2),
  ('gold',     'Gold',     'Most popular',    30,  259, true,  3),
  ('platinum', 'Platinum', 'Best value',      180, 599, false, 4),
  ('diamond',  'Diamond',  'Maximum savings', 365, 899, false, 5)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  price_inr = excluded.price_inr,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order,
  updated_at = now();
