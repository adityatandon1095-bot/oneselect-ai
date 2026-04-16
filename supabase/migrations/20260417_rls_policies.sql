-- =============================================================================
-- Row Level Security — One Select Hiring Engine
-- Run once in the Supabase SQL editor (safe to re-run: uses IF NOT EXISTS /
-- OR REPLACE, and drops+recreates policies).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: get the current user's role from profiles
--    SECURITY DEFINER so it reads profiles without triggering profiles RLS.
--    STABLE so it is evaluated once per query, not once per row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT user_role FROM public.profiles WHERE id = auth.uid()
$$;

-- Give every authenticated user execute permission on the helper
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;


-- =============================================================================
-- 1. PROFILES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies so this script is idempotent
DROP POLICY IF EXISTS "profiles_select_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"  ON public.profiles;

-- Every user can read their own profile (needed by AuthContext on login)
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Admin can read all profiles (client list, pipeline client dropdown, dashboard counts)
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (get_my_role() = 'admin');

-- Any user can update only their own profile (first_login flag, settings)
-- INSERT is intentionally absent — only service-role edge functions create profiles
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Admin can delete profiles (remove client/recruiter from AdminClients)
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 2. JOBS
-- =============================================================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_admin"       ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_recruiter"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_candidate"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_admin"       ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_recruiter"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_admin"       ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_recruiter"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_admin"       ON public.jobs;

-- Admin sees all jobs
CREATE POLICY "jobs_select_admin" ON public.jobs
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiter sees only their own jobs
CREATE POLICY "jobs_select_recruiter" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND recruiter_id = auth.uid()
  );

-- Candidate sees only jobs they are being considered for
-- (via CV upload → candidates table, or pool matching → job_matches)
CREATE POLICY "jobs_select_candidate" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND (
      EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.job_id = jobs.id
          AND c.email = auth.email()
      )
      OR EXISTS (
        SELECT 1 FROM public.job_matches jm
        JOIN public.talent_pool tp ON tp.id = jm.talent_id
        WHERE jm.job_id = jobs.id
          AND tp.email = auth.email()
      )
    )
  );

-- Admin can create jobs (AdminJobs, AdminPipeline)
CREATE POLICY "jobs_insert_admin" ON public.jobs
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- Recruiter can create their own jobs (RecruiterJobs wizard / InstantPost)
CREATE POLICY "jobs_insert_recruiter" ON public.jobs
  FOR INSERT WITH CHECK (
    get_my_role() = 'recruiter'
    AND recruiter_id = auth.uid()
  );

-- Admin can update any job (status toggles, etc.)
CREATE POLICY "jobs_update_admin" ON public.jobs
  FOR UPDATE USING (get_my_role() = 'admin');

-- Recruiter can update their own jobs
CREATE POLICY "jobs_update_recruiter" ON public.jobs
  FOR UPDATE USING (
    get_my_role() = 'recruiter'
    AND recruiter_id = auth.uid()
  );

-- Admin can delete jobs
CREATE POLICY "jobs_delete_admin" ON public.jobs
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 3. CANDIDATES
-- =============================================================================
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_recruiter"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_candidate"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_candidate"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_admin"      ON public.candidates;

-- Admin sees all candidates (AdminPipeline, AdminDashboard counts)
CREATE POLICY "candidates_select_admin" ON public.candidates
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiter sees candidates for their own jobs (RecruiterCandidates, RecruiterReports)
CREATE POLICY "candidates_select_recruiter" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = candidates.job_id
        AND j.recruiter_id = auth.uid()
    )
  );

-- Candidate sees their own application rows (CandidateDashboard)
CREATE POLICY "candidates_select_candidate" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND email = auth.email()
  );

-- Admin inserts candidates (AdminPipeline CV parse + save)
CREATE POLICY "candidates_insert_admin" ON public.candidates
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- Admin updates candidates (screening scores, interview scores)
CREATE POLICY "candidates_update_admin" ON public.candidates
  FOR UPDATE USING (get_my_role() = 'admin');

-- Candidate updates their own row (video_urls, integrity_score, integrity_flags
-- written by VideoInterview after recording)
CREATE POLICY "candidates_update_candidate" ON public.candidates
  FOR UPDATE USING (
    get_my_role() = 'candidate'
    AND email = auth.email()
  );

-- Admin can delete candidates
CREATE POLICY "candidates_delete_admin" ON public.candidates
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 4. TALENT_POOL
-- =============================================================================
ALTER TABLE public.talent_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_pool_select_admin"      ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_select_recruiter"  ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_select_candidate"  ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_insert_admin"      ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_insert_candidate"  ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_update_admin"      ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_update_candidate"  ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_delete_admin"      ON public.talent_pool;

-- Admin sees all talent pool entries (AdminTalentPool)
CREATE POLICY "talent_pool_select_admin" ON public.talent_pool
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiter sees all available pool entries (triggerTalentPoolMatch scoring loop)
CREATE POLICY "talent_pool_select_recruiter" ON public.talent_pool
  FOR SELECT USING (get_my_role() = 'recruiter');

-- Candidate sees only their own pool record (CandidateProfile, CandidateDashboard)
CREATE POLICY "talent_pool_select_candidate" ON public.talent_pool
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND email = auth.email()
  );

-- Admin inserts talent pool entries (AdminTalentPool manual add)
CREATE POLICY "talent_pool_insert_admin" ON public.talent_pool
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- Candidate can create their own pool record (CandidateProfile first save)
CREATE POLICY "talent_pool_insert_candidate" ON public.talent_pool
  FOR INSERT WITH CHECK (
    get_my_role() = 'candidate'
    AND email = auth.email()
  );

-- Admin updates any pool entry (availability toggle, AdminTalentPool)
CREATE POLICY "talent_pool_update_admin" ON public.talent_pool
  FOR UPDATE USING (get_my_role() = 'admin');

-- Candidate updates their own pool record (CandidateProfile edits)
CREATE POLICY "talent_pool_update_candidate" ON public.talent_pool
  FOR UPDATE USING (
    get_my_role() = 'candidate'
    AND email = auth.email()
  );

-- Admin can delete pool entries
CREATE POLICY "talent_pool_delete_admin" ON public.talent_pool
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 5. JOB_MATCHES
-- =============================================================================
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_matches_select_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_recruiter"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_candidate"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_insert_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_candidate"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_delete_admin"      ON public.job_matches;

-- Admin sees all matches (AdminPipeline pool mode)
CREATE POLICY "job_matches_select_admin" ON public.job_matches
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiter sees matches for their own jobs (RecruiterCandidates pool view)
CREATE POLICY "job_matches_select_recruiter" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_matches.job_id
        AND j.recruiter_id = auth.uid()
    )
  );

-- Candidate sees their own matches (CandidateDashboard via talent_pool join)
CREATE POLICY "job_matches_select_candidate" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND EXISTS (
      SELECT 1 FROM public.talent_pool tp
      WHERE tp.id = job_matches.talent_id
        AND tp.email = auth.email()
    )
  );

-- Admin inserts/upserts matches (triggerTalentPoolMatch, run from AdminPipeline)
CREATE POLICY "job_matches_insert_admin" ON public.job_matches
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- Admin updates matches (interview transcript, scores via AdminPipeline)
CREATE POLICY "job_matches_update_admin" ON public.job_matches
  FOR UPDATE USING (get_my_role() = 'admin');

-- Candidate updates their own match row (video_urls, integrity fields from VideoInterview)
CREATE POLICY "job_matches_update_candidate" ON public.job_matches
  FOR UPDATE USING (
    get_my_role() = 'candidate'
    AND EXISTS (
      SELECT 1 FROM public.talent_pool tp
      WHERE tp.id = job_matches.talent_id
        AND tp.email = auth.email()
    )
  );

-- Admin can delete matches
CREATE POLICY "job_matches_delete_admin" ON public.job_matches
  FOR DELETE USING (get_my_role() = 'admin');
