-- ── 1. Client shortlist approval gate ────────────────────────────────────────
alter table public.candidates  add column if not exists client_approved boolean default null;
alter table public.job_matches add column if not exists client_approved boolean default null;

-- ── 2. Interview token expiry ─────────────────────────────────────────────────
alter table public.candidates  add column if not exists interview_token_expires_at timestamptz default null;
alter table public.job_matches add column if not exists interview_token_expires_at timestamptz default null;

-- ── 3. Candidate user linkage (for application status tracking) ───────────────
alter table public.candidates add column if not exists candidate_user_id uuid references auth.users(id) on delete set null;

-- Index for fast lookup
create index if not exists idx_candidates_candidate_user_id on public.candidates(candidate_user_id);

-- RLS: candidates can read their own rows via candidate_user_id
drop policy if exists "candidates_read_own" on public.candidates;
create policy "candidates_read_own" on public.candidates
  for select to authenticated
  using (candidate_user_id = auth.uid());

-- ── 4. HRIS webhook failure log ───────────────────────────────────────────────
create table if not exists public.webhook_failures (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs(id) on delete cascade,
  candidate_id uuid,
  error_message text,
  payload      jsonb,
  resolved     boolean default false,
  created_at   timestamptz default now()
);
alter table public.webhook_failures enable row level security;
drop policy if exists "admins_manage_webhook_failures" on public.webhook_failures;
create policy "admins_manage_webhook_failures" on public.webhook_failures
  for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and user_role in ('admin','recruiter'))
  );

-- ── 5. In-app notifications ───────────────────────────────────────────────────
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text,
  link         text,
  read         boolean default false,
  created_at   timestamptz default now()
);
alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

drop policy if exists "users_read_own_notifications"   on public.notifications;
drop policy if exists "users_update_own_notifications" on public.notifications;
drop policy if exists "authenticated_insert_notifications" on public.notifications;

create policy "users_read_own_notifications" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "users_update_own_notifications" on public.notifications
  for update to authenticated using (recipient_id = auth.uid());
create policy "authenticated_insert_notifications" on public.notifications
  for insert to authenticated with check (true);

-- ── 6. Real assessment tokens ─────────────────────────────────────────────────
create table if not exists public.assessment_tokens (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null default gen_random_uuid()::text,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  questions    jsonb not null,
  answers      jsonb,
  scored       boolean default false,
  expires_at   timestamptz default (now() + interval '72 hours'),
  submitted_at timestamptz,
  created_at   timestamptz default now()
);
alter table public.assessment_tokens enable row level security;

-- Anon can read a token by its value (for the public /assessment/:token page)
drop policy if exists "anon_read_assessment_token" on public.assessment_tokens;
create policy "anon_read_assessment_token" on public.assessment_tokens
  for select to anon, authenticated using (true);

-- Anon can submit answers once (update when answers is null and not expired)
drop policy if exists "anon_submit_assessment_answers" on public.assessment_tokens;
create policy "anon_submit_assessment_answers" on public.assessment_tokens
  for update to anon, authenticated
  using (answers is null and expires_at > now())
  with check (submitted_at is not null);

-- Recruiters/admins can read and manage all tokens
drop policy if exists "staff_manage_assessment_tokens" on public.assessment_tokens;
create policy "staff_manage_assessment_tokens" on public.assessment_tokens
  for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and user_role in ('admin','recruiter'))
  );

-- ── 7. Pipeline SLA timestamps ────────────────────────────────────────────────
alter table public.candidates
  add column if not exists screened_at   timestamptz default null,
  add column if not exists interviewed_at timestamptz default null,
  add column if not exists decided_at    timestamptz default null;
