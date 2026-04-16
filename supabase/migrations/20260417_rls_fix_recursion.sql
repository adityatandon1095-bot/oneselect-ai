-- =============================================================================
-- RLS recursion fix
--
-- Two cycles existed in the previous migration:
--
-- Cycle A (profiles ↔ get_my_role):
--   jobs policy → get_my_role() → SELECT profiles
--   → profiles_select_admin policy → get_my_role() → SELECT profiles → ∞
--
-- Cycle B (jobs ↔ candidates):
--   jobs_select_candidate → EXISTS on candidates
--   → candidates_select_recruiter → EXISTS on jobs
--   → jobs RLS fires again → ∞
--
-- Fixes:
--   1. profiles policies use ONLY auth.uid() / column checks — no functions.
--      get_my_role() can now safely read profiles because profiles policies
--      never call back into get_my_role().
--   2. A new SECURITY DEFINER helper is_recruiter_job() checks job ownership
--      by bypassing jobs RLS, breaking the candidates → jobs → candidates cycle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper functions
-- ---------------------------------------------------------------------------

-- Returns the current user's role. Reads profiles with SECURITY DEFINER so
-- it runs as the function owner (postgres) and skips RLS. Now safe because
-- profiles policies no longer call get_my_role().
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT user_role FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns true if the given job_id belongs to the calling user.
-- SECURITY DEFINER bypasses jobs RLS, breaking the candidates → jobs cycle.
CREATE OR REPLACE FUNCTION public.is_recruiter_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = p_job_id AND recruiter_id = auth.uid()
  )
$$;

-- Returns true if the calling user is an admin.
-- SECURITY DEFINER bypasses profiles RLS for the lookup; safe because
-- profiles SELECT policy is now a simple column/uid check with no functions.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recruiter_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()         TO authenticated;


-- =============================================================================
-- 1. PROFILES
-- No functions allowed here — only auth.uid() and column value checks.
-- This is what breaks Cycle A.
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"        ON public.profiles;

-- Every authenticated user can read their own row.
-- Any authenticated user can also read recruiter-role rows — this is what
-- lets the admin UI list clients and fill recruiter dropdowns, with no
-- function calls and therefore no recursion risk.
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR user_role = 'recruiter'
  );

-- Anyone can update only their own row (settings, first_login flag, etc.)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Admin can delete other profiles (AdminClients "Remove client").
-- is_admin() uses SECURITY DEFINER and the simple profiles SELECT policy
-- above, so there is no recursion.
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (is_admin());


-- =============================================================================
-- 2. JOBS
-- Uses get_my_role() — safe now that profiles policies have no functions.
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

CREATE POLICY "jobs_select_admin" ON public.jobs
  FOR SELECT USING (get_my_role() = 'admin');

CREATE POLICY "jobs_select_recruiter" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'recruiter' AND recruiter_id = auth.uid()
  );

-- Candidates see only jobs they appear in. The subqueries on candidates and
-- job_matches are safe: those tables' recruiter policies now use
-- is_recruiter_job() (SECURITY DEFINER) instead of querying jobs directly,
-- so there is no jobs → candidates → jobs cycle.
CREATE POLICY "jobs_select_candidate" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND (
      EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.job_id = jobs.id AND c.email = auth.email()
      )
      OR EXISTS (
        SELECT 1 FROM public.job_matches jm
        JOIN public.talent_pool tp ON tp.id = jm.talent_id
        WHERE jm.job_id = jobs.id AND tp.email = auth.email()
      )
    )
  );

CREATE POLICY "jobs_insert_admin" ON public.jobs
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "jobs_insert_recruiter" ON public.jobs
  FOR INSERT WITH CHECK (
    get_my_role() = 'recruiter' AND recruiter_id = auth.uid()
  );

CREATE POLICY "jobs_update_admin" ON public.jobs
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "jobs_update_recruiter" ON public.jobs
  FOR UPDATE USING (
    get_my_role() = 'recruiter' AND recruiter_id = auth.uid()
  );

CREATE POLICY "jobs_delete_admin" ON public.jobs
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 3. CANDIDATES
-- Recruiter policy uses is_recruiter_job() instead of a subquery on jobs.
-- This breaks Cycle B.
-- =============================================================================
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_recruiter"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_candidate"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_admin"      ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_candidate"  ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_admin"      ON public.candidates;

CREATE POLICY "candidates_select_admin" ON public.candidates
  FOR SELECT USING (get_my_role() = 'admin');

-- is_recruiter_job() bypasses jobs RLS via SECURITY DEFINER — no cross-table cycle.
CREATE POLICY "candidates_select_recruiter" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'recruiter' AND is_recruiter_job(job_id)
  );

CREATE POLICY "candidates_select_candidate" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'candidate' AND email = auth.email()
  );

CREATE POLICY "candidates_insert_admin" ON public.candidates
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "candidates_update_admin" ON public.candidates
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "candidates_update_candidate" ON public.candidates
  FOR UPDATE USING (
    get_my_role() = 'candidate' AND email = auth.email()
  );

CREATE POLICY "candidates_delete_admin" ON public.candidates
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 4. TALENT_POOL
-- No cross-table subqueries, so no cycle risk. Unchanged from v1.
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

CREATE POLICY "talent_pool_select_admin" ON public.talent_pool
  FOR SELECT USING (get_my_role() = 'admin');

CREATE POLICY "talent_pool_select_recruiter" ON public.talent_pool
  FOR SELECT USING (get_my_role() = 'recruiter');

CREATE POLICY "talent_pool_select_candidate" ON public.talent_pool
  FOR SELECT USING (
    get_my_role() = 'candidate' AND email = auth.email()
  );

CREATE POLICY "talent_pool_insert_admin" ON public.talent_pool
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "talent_pool_insert_candidate" ON public.talent_pool
  FOR INSERT WITH CHECK (
    get_my_role() = 'candidate' AND email = auth.email()
  );

CREATE POLICY "talent_pool_update_admin" ON public.talent_pool
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "talent_pool_update_candidate" ON public.talent_pool
  FOR UPDATE USING (
    get_my_role() = 'candidate' AND email = auth.email()
  );

CREATE POLICY "talent_pool_delete_admin" ON public.talent_pool
  FOR DELETE USING (get_my_role() = 'admin');


-- =============================================================================
-- 5. JOB_MATCHES
-- Recruiter policy uses is_recruiter_job() — same fix as candidates.
-- =============================================================================
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_matches_select_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_recruiter"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_candidate"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_insert_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_admin"      ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_candidate"  ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_delete_admin"      ON public.job_matches;

CREATE POLICY "job_matches_select_admin" ON public.job_matches
  FOR SELECT USING (get_my_role() = 'admin');

-- is_recruiter_job() bypasses jobs RLS — no cross-table cycle.
CREATE POLICY "job_matches_select_recruiter" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'recruiter' AND is_recruiter_job(job_id)
  );

CREATE POLICY "job_matches_select_candidate" ON public.job_matches
  FOR SELECT USING (
    get_my_role() = 'candidate'
    AND EXISTS (
      SELECT 1 FROM public.talent_pool tp
      WHERE tp.id = job_matches.talent_id AND tp.email = auth.email()
    )
  );

CREATE POLICY "job_matches_insert_admin" ON public.job_matches
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "job_matches_update_admin" ON public.job_matches
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "job_matches_update_candidate" ON public.job_matches
  FOR UPDATE USING (
    get_my_role() = 'candidate'
    AND EXISTS (
      SELECT 1 FROM public.talent_pool tp
      WHERE tp.id = job_matches.talent_id AND tp.email = auth.email()
    )
  );

CREATE POLICY "job_matches_delete_admin" ON public.job_matches
  FOR DELETE USING (get_my_role() = 'admin');
