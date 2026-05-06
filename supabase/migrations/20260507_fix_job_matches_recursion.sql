-- Fix infinite recursion: jobs ↔ job_matches cycle
--
-- Cycle introduced by candidates_read_active_jobs (20260506_major_expansion):
--   jobs SELECT policy subqueries job_matches
--   → job_matches_select_recruiter subqueries jobs directly
--   → jobs RLS fires again → ∞
--
-- Fix: replace the direct EXISTS(SELECT FROM jobs) with is_recruiter_job(),
-- which is SECURITY DEFINER and bypasses jobs RLS, breaking the cycle.

DROP POLICY IF EXISTS "job_matches_select_recruiter" ON public.job_matches;

CREATE POLICY "job_matches_select_recruiter" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND is_recruiter_job(job_id)
  );
