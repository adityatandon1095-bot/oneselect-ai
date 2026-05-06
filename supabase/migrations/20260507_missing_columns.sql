-- Add columns referenced in app code that were never migrated
-- All use IF NOT EXISTS — safe to run on databases that already have them

-- profiles: contact_name (client display name), first_login_at (track first session)
alter table public.profiles
  add column if not exists contact_name    text    default null,
  add column if not exists first_login_at  timestamptz default null;

-- jobs: work_mode (WFO / WFH / Hybrid — from JD parse)
alter table public.jobs
  add column if not exists work_mode  text default null;

-- candidates: offer / decision fields used in client offer flow
alter table public.candidates
  add column if not exists offer_status    text    default null,
  add column if not exists decision_notes  text    default null,
  add column if not exists final_decision  text    default null;

-- job_matches: same offer / decision fields (AdminPipeline writes to both tables
-- depending on whether the candidate came from the talent pool or was uploaded)
alter table public.job_matches
  add column if not exists offer_status    text    default null,
  add column if not exists decision_notes  text    default null,
  add column if not exists final_decision  text    default null;
