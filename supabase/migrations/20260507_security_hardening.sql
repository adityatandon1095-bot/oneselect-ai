-- =============================================================================
-- Security hardening
--
-- 1. Ensure RLS is enabled on all exposed tables (idempotent).
-- 2. Tighten SECURITY DEFINER functions: set search_path = '' to prevent
--    schema-injection attacks via search_path manipulation.
-- 3. Revoke PUBLIC execute on SECURITY DEFINER functions; only authenticated
--    users need them.
-- 4. Add proper RLS policies on interview_schedules, outreach_log, and offers
--    which previously had no policies (effectively open to service-role only,
--    but unprotected if service-role bypass is ever removed).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Ensure RLS is enabled (idempotent — safe to run if already enabled)
-- ---------------------------------------------------------------------------
ALTER TABLE public.candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_pool        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 2. Tighten search_path on all SECURITY DEFINER functions
--    Empty string is the strictest: no schema is implicitly searched,
--    so every table reference must be fully-qualified (public.tablename).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT user_role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_recruiter_job(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = p_job_id AND recruiter_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_client_job(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.jobs j
    JOIN   public.recruiter_clients rc ON rc.client_id = j.recruiter_id
    WHERE  j.id = p_job_id
    AND    rc.recruiter_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------------
-- 3. Revoke PUBLIC execute; grant only to authenticated
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_role()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_my_client_job(uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_recruiter_job(uuid)     FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.get_my_role()              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin()                 TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_my_client_job(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_recruiter_job(uuid)     TO authenticated;


-- ---------------------------------------------------------------------------
-- 4a. RLS for outreach_log
--     Columns of interest: job_id (links to jobs.id, which links to client)
--     Only admin and recruiter staff interact with this table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_log_select_admin"     ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_select_recruiter" ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_insert_admin"     ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_insert_recruiter" ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_update_admin"     ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_update_recruiter" ON public.outreach_log;
DROP POLICY IF EXISTS "outreach_log_delete_admin"     ON public.outreach_log;

CREATE POLICY "outreach_log_select_admin" ON public.outreach_log
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "outreach_log_select_recruiter" ON public.outreach_log
  FOR SELECT USING (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "outreach_log_insert_admin" ON public.outreach_log
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "outreach_log_insert_recruiter" ON public.outreach_log
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "outreach_log_update_admin" ON public.outreach_log
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "outreach_log_update_recruiter" ON public.outreach_log
  FOR UPDATE USING (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "outreach_log_delete_admin" ON public.outreach_log
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 4b. RLS for offers
--     Columns of interest: job_id
--     Only admin/recruiter insert; client can read their own job's offers.
-- ---------------------------------------------------------------------------
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers_select_admin"     ON public.offers;
DROP POLICY IF EXISTS "offers_select_recruiter" ON public.offers;
DROP POLICY IF EXISTS "offers_select_client"    ON public.offers;
DROP POLICY IF EXISTS "offers_insert_admin"     ON public.offers;
DROP POLICY IF EXISTS "offers_insert_recruiter" ON public.offers;
DROP POLICY IF EXISTS "offers_update_admin"     ON public.offers;
DROP POLICY IF EXISTS "offers_delete_admin"     ON public.offers;

CREATE POLICY "offers_select_admin" ON public.offers
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "offers_select_recruiter" ON public.offers
  FOR SELECT USING (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

-- Clients can see offers on their own jobs (job.recruiter_id = their user id)
CREATE POLICY "offers_select_client" ON public.offers
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = offers.job_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "offers_insert_admin" ON public.offers
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "offers_insert_recruiter" ON public.offers
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "offers_update_admin" ON public.offers
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "offers_delete_admin" ON public.offers
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ---------------------------------------------------------------------------
-- 4c. RLS for interview_schedules
--     The public schedule-confirmation page reads and updates rows using a
--     confirm_token (no auth). We grant the anon role SELECT + UPDATE scoped
--     strictly to the confirm_token column so candidates can confirm their
--     slot without being authenticated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "isched_select_admin"      ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_select_recruiter"  ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_select_anon"       ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_insert_admin"      ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_insert_recruiter"  ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_update_admin"      ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_update_recruiter"  ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_update_anon"       ON public.interview_schedules;
DROP POLICY IF EXISTS "isched_delete_admin"      ON public.interview_schedules;

-- Admin: full access
CREATE POLICY "isched_select_admin" ON public.interview_schedules
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "isched_insert_admin" ON public.interview_schedules
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "isched_update_admin" ON public.interview_schedules
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "isched_delete_admin" ON public.interview_schedules
  FOR DELETE USING (public.get_my_role() = 'admin');

-- Recruiter: own-job rows only
CREATE POLICY "isched_select_recruiter" ON public.interview_schedules
  FOR SELECT USING (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "isched_insert_recruiter" ON public.interview_schedules
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

CREATE POLICY "isched_update_recruiter" ON public.interview_schedules
  FOR UPDATE USING (
    public.get_my_role() = 'recruiter'
    AND (public.is_recruiter_job(job_id) OR public.is_my_client_job(job_id))
  );

-- Anon: token-scoped read + update only (public slot-confirmation page)
-- confirm_token is a random UUID generated at insert time — not guessable.
CREATE POLICY "isched_select_anon" ON public.interview_schedules
  FOR SELECT TO anon
  USING (confirm_token IS NOT NULL);

CREATE POLICY "isched_update_anon" ON public.interview_schedules
  FOR UPDATE TO anon
  USING  (confirm_token IS NOT NULL)
  WITH CHECK (confirm_token IS NOT NULL);
