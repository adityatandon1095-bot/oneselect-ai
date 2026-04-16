-- =============================================================================
-- Role restructure: recruiter → client, new recruiter role for internal staff
--
-- Changes:
--   1. Rename existing user_role='recruiter' rows → 'client'
--   2. Create recruiter_clients junction table
--   3. Replace all RLS policies for the 3-role model
--      (admin / recruiter / client / candidate)
--      Non-recursive: profiles policies use only column checks, no functions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename existing role value
-- ---------------------------------------------------------------------------
UPDATE public.profiles SET user_role = 'client' WHERE user_role = 'recruiter';


-- ---------------------------------------------------------------------------
-- 2. recruiter_clients junction table
--    Links internal recruiters to the client accounts they manage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recruiter_clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_id, client_id)
);


-- ---------------------------------------------------------------------------
-- 3. Helper functions (idempotent)
-- ---------------------------------------------------------------------------

-- get_my_role: SECURITY DEFINER so it reads profiles without triggering
-- profiles RLS (profiles policies are now pure column checks, no recursion).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT user_role FROM public.profiles WHERE id = auth.uid()
$$;

-- is_admin: safe because profiles SELECT policy is a plain column check.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin'
  )
$$;

-- is_my_client_job: checks whether a job's client is assigned to the calling
-- recruiter. SECURITY DEFINER bypasses jobs RLS → breaks jobs↔candidates cycle.
CREATE OR REPLACE FUNCTION public.is_my_client_job(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.jobs j
    JOIN   public.recruiter_clients rc ON rc.client_id = j.recruiter_id
    WHERE  j.id = p_job_id
    AND    rc.recruiter_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_client_job(uuid)  TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. RLS — PROFILES
--    NO function calls here: pure uid/column checks only.
--    This prevents the get_my_role → profiles → get_my_role recursion.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

-- Everyone sees their own row.
-- Admin/recruiter also need to see client rows for dropdowns/pipeline.
-- Recruiter rows are visible to admin only (via own-row check for recruiters).
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR user_role = 'client'   -- admins list clients; recruiters see their clients
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- is_admin() reads profiles with SECURITY DEFINER; the simple SELECT policy
-- above means no recursive loop.
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (is_admin());


-- ---------------------------------------------------------------------------
-- 5. RLS — RECRUITER_CLIENTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.recruiter_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rc_select_admin"     ON public.recruiter_clients;
DROP POLICY IF EXISTS "rc_select_recruiter" ON public.recruiter_clients;
DROP POLICY IF EXISTS "rc_insert_admin"     ON public.recruiter_clients;
DROP POLICY IF EXISTS "rc_delete_admin"     ON public.recruiter_clients;

CREATE POLICY "rc_select_admin" ON public.recruiter_clients
  FOR SELECT USING (get_my_role() = 'admin');

CREATE POLICY "rc_select_recruiter" ON public.recruiter_clients
  FOR SELECT USING (recruiter_id = auth.uid());

CREATE POLICY "rc_insert_admin" ON public.recruiter_clients
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "rc_delete_admin" ON public.recruiter_clients
  FOR DELETE USING (get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 6. RLS — JOBS
-- ---------------------------------------------------------------------------
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_admin"     ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_recruiter" ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_client"    ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_candidate" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_admin"     ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_recruiter" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_client"    ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_admin"     ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_recruiter" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_client"    ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_admin"     ON public.jobs;

CREATE POLICY "jobs_select_admin" ON public.jobs
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiter sees jobs belonging to their assigned clients.
-- Uses a subquery on recruiter_clients (no jobs reference inside → no cycle).
CREATE POLICY "jobs_select_recruiter" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.recruiter_clients rc
      WHERE rc.recruiter_id = auth.uid() AND rc.client_id = jobs.recruiter_id
    )
  );

-- Client sees only their own jobs.
CREATE POLICY "jobs_select_client" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'client' AND recruiter_id = auth.uid()
  );

-- Candidate sees jobs they are being considered for.
-- The candidates/job_matches subqueries are safe: their recruiter policies
-- use is_my_client_job() (SECURITY DEFINER) → no jobs RLS → no cycle.
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

CREATE POLICY "jobs_insert_admin"  ON public.jobs FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "jobs_insert_client" ON public.jobs FOR INSERT WITH CHECK (
  get_my_role() = 'client' AND recruiter_id = auth.uid()
);
CREATE POLICY "jobs_update_admin"  ON public.jobs FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "jobs_update_client" ON public.jobs FOR UPDATE USING (
  get_my_role() = 'client' AND recruiter_id = auth.uid()
);
CREATE POLICY "jobs_delete_admin"  ON public.jobs FOR DELETE USING (get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 7. RLS — CANDIDATES
--    Recruiter policies use is_my_client_job() to avoid jobs↔candidates cycle.
-- ---------------------------------------------------------------------------
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_admin"     ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_recruiter" ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_client"    ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_candidate" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_admin"     ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_recruiter" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_admin"     ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_recruiter" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_candidate" ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_admin"     ON public.candidates;

CREATE POLICY "candidates_select_admin" ON public.candidates
  FOR SELECT USING (get_my_role() = 'admin');

-- is_my_client_job bypasses jobs RLS (SECURITY DEFINER) — no cycle.
CREATE POLICY "candidates_select_recruiter" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'recruiter' AND is_my_client_job(job_id)
  );

-- Client sees candidates for their own jobs.
CREATE POLICY "candidates_select_client" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM public.jobs j WHERE j.id = candidates.job_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "candidates_select_candidate" ON public.candidates
  FOR SELECT USING (get_my_role() = 'candidate' AND email = auth.email());

CREATE POLICY "candidates_insert_admin"     ON public.candidates FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "candidates_insert_recruiter" ON public.candidates FOR INSERT WITH CHECK (
  get_my_role() = 'recruiter' AND is_my_client_job(job_id)
);
CREATE POLICY "candidates_update_admin"     ON public.candidates FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "candidates_update_recruiter" ON public.candidates FOR UPDATE USING (
  get_my_role() = 'recruiter' AND is_my_client_job(job_id)
);
CREATE POLICY "candidates_update_candidate" ON public.candidates FOR UPDATE USING (
  get_my_role() = 'candidate' AND email = auth.email()
);
CREATE POLICY "candidates_delete_admin" ON public.candidates FOR DELETE USING (get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 8. RLS — TALENT_POOL
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_pool_select_admin"     ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_select_recruiter" ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_select_candidate" ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_insert_admin"     ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_insert_candidate" ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_update_admin"     ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_update_candidate" ON public.talent_pool;
DROP POLICY IF EXISTS "talent_pool_delete_admin"     ON public.talent_pool;

CREATE POLICY "talent_pool_select_admin"     ON public.talent_pool FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "talent_pool_select_recruiter" ON public.talent_pool FOR SELECT USING (get_my_role() = 'recruiter');
CREATE POLICY "talent_pool_select_candidate" ON public.talent_pool FOR SELECT USING (get_my_role() = 'candidate' AND email = auth.email());
CREATE POLICY "talent_pool_insert_admin"     ON public.talent_pool FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "talent_pool_insert_candidate" ON public.talent_pool FOR INSERT WITH CHECK (get_my_role() = 'candidate' AND email = auth.email());
CREATE POLICY "talent_pool_update_admin"     ON public.talent_pool FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "talent_pool_update_candidate" ON public.talent_pool FOR UPDATE USING (get_my_role() = 'candidate' AND email = auth.email());
CREATE POLICY "talent_pool_delete_admin"     ON public.talent_pool FOR DELETE USING (get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 9. RLS — JOB_MATCHES
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_matches_select_admin"     ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_recruiter" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_client"    ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_select_candidate" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_insert_admin"     ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_insert_recruiter" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_admin"     ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_recruiter" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_candidate" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_delete_admin"     ON public.job_matches;

CREATE POLICY "job_matches_select_admin" ON public.job_matches FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "job_matches_select_recruiter" ON public.job_matches FOR SELECT USING (
  get_my_role() = 'recruiter' AND is_my_client_job(job_id)
);
CREATE POLICY "job_matches_select_client" ON public.job_matches FOR SELECT USING (
  get_my_role() = 'client'
  AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_matches.job_id AND j.recruiter_id = auth.uid())
);
CREATE POLICY "job_matches_select_candidate" ON public.job_matches FOR SELECT USING (
  get_my_role() = 'candidate'
  AND EXISTS (SELECT 1 FROM public.talent_pool tp WHERE tp.id = job_matches.talent_id AND tp.email = auth.email())
);
CREATE POLICY "job_matches_insert_admin"     ON public.job_matches FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "job_matches_insert_recruiter" ON public.job_matches FOR INSERT WITH CHECK (
  get_my_role() = 'recruiter' AND is_my_client_job(job_id)
);
CREATE POLICY "job_matches_update_admin"     ON public.job_matches FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "job_matches_update_recruiter" ON public.job_matches FOR UPDATE USING (
  get_my_role() = 'recruiter' AND is_my_client_job(job_id)
);
CREATE POLICY "job_matches_update_candidate" ON public.job_matches FOR UPDATE USING (
  get_my_role() = 'candidate'
  AND EXISTS (SELECT 1 FROM public.talent_pool tp WHERE tp.id = job_matches.talent_id AND tp.email = auth.email())
);
CREATE POLICY "job_matches_delete_admin" ON public.job_matches FOR DELETE USING (get_my_role() = 'admin');
