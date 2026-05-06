-- Add pipeline_stage so manually-allocated pool candidates carry their stage through
alter table public.candidates
  add column if not exists pipeline_stage text default null;
