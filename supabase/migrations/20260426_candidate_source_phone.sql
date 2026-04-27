-- Add source column so manually-added candidates can be identified
alter table public.candidates add column if not exists source text default null;

-- Add phone column for manually-added candidates
alter table public.candidates add column if not exists phone text default null;
