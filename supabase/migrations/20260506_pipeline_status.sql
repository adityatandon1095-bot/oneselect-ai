alter table public.jobs
  add column if not exists pipeline_status text default 'awaiting_cvs';
