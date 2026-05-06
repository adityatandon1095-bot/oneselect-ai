alter table public.candidates
  add column if not exists linkedin_url  text default null,
  add column if not exists github_url    text default null,
  add column if not exists portfolio_url text default null;
