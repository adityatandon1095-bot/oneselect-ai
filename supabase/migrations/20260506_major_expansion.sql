-- Candidate portal: allow 'candidate' as user_role
alter table profiles
  drop constraint if exists profiles_user_role_check;
alter table profiles
  add constraint profiles_user_role_check
  check (user_role in ('admin', 'recruiter', 'client', 'candidate'));

-- Talent pool: source, linkedin_url, visibility, candidate_user_id
alter table talent_pool
  add column if not exists source         text    default 'uploaded',
  add column if not exists linkedin_url   text,
  add column if not exists visibility     text    default 'all',
  add column if not exists candidate_user_id uuid;

-- Candidates: assessment columns + stage
alter table candidates
  add column if not exists assessment_score int,
  add column if not exists assessment_data  jsonb,
  add column if not exists stage            text    default 'uploaded';

-- Jobs: compliance + assessment toggles
alter table jobs
  add column if not exists compliance_signed   boolean default false,
  add column if not exists assessment_enabled  boolean default false;

-- Profiles: plan + billing notes
alter table profiles
  add column if not exists plan          text    default 'starter',
  add column if not exists billing_notes text;

-- RLS: candidates can read their own talent_pool entry
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'talent_pool'
    and policyname = 'candidates_read_own_pool_entry'
  ) then
    create policy "candidates_read_own_pool_entry"
      on public.talent_pool for select
      to authenticated
      using (candidate_user_id = auth.uid());
  end if;
end $$;

-- RLS: candidates can update their own talent_pool entry
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'talent_pool'
    and policyname = 'candidates_update_own_pool_entry'
  ) then
    create policy "candidates_update_own_pool_entry"
      on public.talent_pool for update
      to authenticated
      using (candidate_user_id = auth.uid())
      with check (candidate_user_id = auth.uid());
  end if;
end $$;

-- RLS: candidates can insert their own pool entry on registration
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'talent_pool'
    and policyname = 'candidates_insert_own_pool_entry'
  ) then
    create policy "candidates_insert_own_pool_entry"
      on public.talent_pool for insert
      to authenticated
      with check (candidate_user_id = auth.uid());
  end if;
end $$;

-- RLS: candidates can read job_matches for their own pool entry
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_matches'
    and policyname = 'candidates_read_own_matches'
  ) then
    create policy "candidates_read_own_matches"
      on public.job_matches for select
      to authenticated
      using (
        talent_pool_id in (
          select id from talent_pool where candidate_user_id = auth.uid()
        )
      );
  end if;
end $$;

-- RLS: candidates can read active jobs (same as anon — to see matched job titles)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs'
    and policyname = 'candidates_read_active_jobs'
  ) then
    create policy "candidates_read_active_jobs"
      on public.jobs for select
      to authenticated
      using (
        auth.uid() in (
          select tp.candidate_user_id
          from talent_pool tp
          join job_matches jm on jm.talent_pool_id = tp.id
          where jm.job_id = id
        )
        or status = 'active'
      );
  end if;
end $$;
