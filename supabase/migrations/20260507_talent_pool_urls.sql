alter table public.talent_pool
  add column if not exists github_url    text default null,
  add column if not exists portfolio_url text default null;
