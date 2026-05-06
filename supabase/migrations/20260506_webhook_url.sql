-- Add webhook URL to client profiles for HRIS integration
alter table public.profiles
  add column if not exists webhook_url text;
