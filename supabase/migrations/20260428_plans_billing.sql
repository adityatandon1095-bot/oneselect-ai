-- Plans table
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  price_monthly  numeric(10,2),
  max_jobs       int,
  max_candidates int,
  max_recruiters int,
  created_at     timestamptz default now()
);

alter table public.plans enable row level security;

create policy "Admin can manage plans" on public.plans
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and user_role = 'admin')
  );

create policy "Authenticated can read plans" on public.plans
  for select using (auth.role() = 'authenticated');

-- Billing columns on profiles
alter table public.profiles
  add column if not exists plan_id                uuid references public.plans(id) on delete set null,
  add column if not exists subscription_status    text default 'trial',
  add column if not exists subscription_started_at timestamptz,
  add column if not exists trial_ends_at          timestamptz;
