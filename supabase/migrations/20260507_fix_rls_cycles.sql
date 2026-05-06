-- =============================================================================
-- Comprehensive RLS cycle fix
--
-- Cycles being fixed:
--
-- CYCLE A (causes "infinite recursion" for ALL users on jobs SELECT/INSERT):
--   jobs SELECT → candidates_read_active_jobs (uses job_matches subquery)
--   → job_matches RLS → job_matches_select_client (uses direct EXISTS on jobs)
--   → jobs RLS → candidates_read_active_jobs → ∞
--
-- CYCLE B (same path, different link):
--   The job_matches_select_recruiter policy was incorrectly rewritten in
--   20260507_fix_job_matches_recursion.sql to use is_recruiter_job() instead of
--   is_my_client_job(). is_recruiter_job checks recruiter_id = auth.uid(), which
--   is the CLIENT's uid — always false for actual recruiters. This broke
--   recruiter access to job_matches AND didn't actually fix the real cycle.
--
-- CYCLE C (latent — via jobs_select_candidate → candidates → candidates_select_client):
--   jobs SELECT → jobs_select_candidate → candidates RLS
--   → candidates_select_client (direct EXISTS on jobs) → jobs RLS → ∞
--   (Currently masked by short-circuit but not guaranteed)
--
-- Fixes applied:
--   1. candidates_read_active_jobs: remove job_matches subquery → just status = 'active'
--   2. job_matches_select_recruiter: restore is_my_client_job() (correct SECURITY DEFINER)
--   3. job_matches_select_client: use is_recruiter_job() (SECURITY DEFINER, no direct jobs)
--   4. job_matches_insert/update_recruiter: same — already correct but re-asserting
--   5. candidates_select_client: use is_recruiter_job() instead of direct EXISTS on jobs
--   6. Add jobs_insert_recruiter + jobs_update_recruiter (dropped in add_client_role, never restored)
--   7. Fix profiles_select to expose recruiter rows to admins (admin dropdown was broken)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Fix candidates_read_active_jobs: drop the job_matches subquery entirely.
--    The "OR jobs.status = 'active'" part is the only thing needed — it gives
--    all authenticated users read access to active jobs without any cross-table
--    lookup. The matched-jobs access for candidates is covered by jobs_select_candidate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "candidates_read_active_jobs" ON public.jobs;
CREATE POLICY "candidates_read_active_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (status = 'active');


-- ---------------------------------------------------------------------------
-- 2. Restore job_matches_select_recruiter with is_my_client_job() (correct).
--    is_my_client_job() checks recruiter_clients: is the calling user a recruiter
--    assigned to the job's client? That's the right check for a recruiter.
--    is_recruiter_job() checks jobs.recruiter_id = auth.uid() — that's the CLIENT
--    uid, always false for actual recruiters.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_matches_select_recruiter" ON public.job_matches;
CREATE POLICY "job_matches_select_recruiter" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND is_my_client_job(job_id)
  );


-- ---------------------------------------------------------------------------
-- 3. Fix job_matches_select_client: replace direct EXISTS(SELECT FROM jobs)
--    with is_recruiter_job(job_id) which is SECURITY DEFINER (bypasses jobs RLS).
--    For a client, jobs.recruiter_id = auth.uid() is exactly the right check,
--    and is_recruiter_job() does exactly that — safely.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_matches_select_client" ON public.job_matches;
CREATE POLICY "job_matches_select_client" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'client'
    AND is_recruiter_job(job_id)
  );


-- ---------------------------------------------------------------------------
-- 4. Re-assert job_matches INSERT/UPDATE for recruiter (ensure is_my_client_job).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_matches_insert_recruiter" ON public.job_matches;
CREATE POLICY "job_matches_insert_recruiter" ON public.job_matches
  FOR INSERT WITH CHECK (
    get_my_role() = 'recruiter'
    AND is_my_client_job(job_id)
  );

DROP POLICY IF EXISTS "job_matches_update_recruiter" ON public.job_matches;
CREATE POLICY "job_matches_update_recruiter" ON public.job_matches
  FOR UPDATE USING (
    get_my_role() = 'recruiter'
    AND is_my_client_job(job_id)
  );


-- ---------------------------------------------------------------------------
-- 5. Fix candidates_select_client: replace direct EXISTS(SELECT FROM jobs)
--    with is_recruiter_job(job_id) (SECURITY DEFINER, no jobs RLS triggered).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "candidates_select_client" ON public.candidates;
CREATE POLICY "candidates_select_client" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'client'
    AND is_recruiter_job(job_id)
  );


-- ---------------------------------------------------------------------------
-- 6. Restore recruiter INSERT + UPDATE on jobs.
--    These were dropped in 20260417_add_client_role.sql but never recreated.
--    A recruiter inserts a job on behalf of a client, so recruiter_id (the
--    inserted value) must be a client the recruiter is assigned to.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "jobs_insert_recruiter" ON public.jobs;
CREATE POLICY "jobs_insert_recruiter" ON public.jobs
  FOR INSERT WITH CHECK (
    get_my_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.recruiter_clients rc
      WHERE rc.recruiter_id = auth.uid()
        AND rc.client_id = recruiter_id
    )
  );

DROP POLICY IF EXISTS "jobs_update_recruiter" ON public.jobs;
CREATE POLICY "jobs_update_recruiter" ON public.jobs
  FOR UPDATE USING (
    get_my_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.recruiter_clients rc
      WHERE rc.recruiter_id = auth.uid()
        AND rc.client_id = jobs.recruiter_id
    )
  );


-- ---------------------------------------------------------------------------
-- 7. Fix profiles_select to let admin see recruiter profiles.
--    The current policy (user_role = 'client' only) hides recruiter rows from
--    admins, breaking the recruiter dropdown in AdminJobs/JDWizard.
--    Adding user_role = 'recruiter' to the column check is safe — no functions,
--    no cross-table subqueries, no recursion risk.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR user_role IN ('client', 'recruiter')
  );
