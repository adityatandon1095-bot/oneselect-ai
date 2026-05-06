alter table public.candidates
  add column if not exists client_dismissed boolean default false;
