-- =============================================================================
-- Multi-stakeholder client access
--
-- A client can invite colleagues (e.g. hiring managers) to a read-only view of
-- their pipeline. The invited user is stored with user_role='client' and
-- stakeholder_of pointing to the parent client's profile id.
--
-- RLS changes:
--   • New helper get_effective_client_id(): returns stakeholder_of ?? auth.uid()
--   • is_recruiter_job() updated to use get_effective_client_id() so that
--     candidates_select_client and job_matches_select_client automatically
--     grant stakeholders the same read access as their parent client.
--   • jobs_select_client updated to use get_effective_client_id().
--   • INSERT/UPDATE policies remain as auth.uid() — stakeholders are read-only.
-- =============================================================================

-- Add stakeholder_of column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stakeholder_of uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Helper: returns the effective client id for RLS checks.
-- For a normal client: returns auth.uid().
-- For a stakeholder:   returns their parent client's id.
-- SECURITY DEFINER so it reads profiles without triggering profiles RLS.
CREATE OR REPLACE FUNCTION public.get_effective_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(stakeholder_of, id)
  FROM   public.profiles
  WHERE  id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_client_id() TO authenticated;

-- Update is_recruiter_job() so stakeholders inherit the parent client's job access.
-- This automatically fixes candidates_select_client and job_matches_select_client
-- (both call is_recruiter_job) without touching those policies.
CREATE OR REPLACE FUNCTION public.is_recruiter_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE  j.id         = p_job_id
      AND  j.recruiter_id = get_effective_client_id()
  )
$$;

-- Update jobs_select_client to allow stakeholders to see the parent client's jobs.
-- INSERT/UPDATE policies are deliberately left unchanged (auth.uid()) — stakeholders
-- can't create or modify jobs.
DROP POLICY IF EXISTS "jobs_select_client" ON public.jobs;
CREATE POLICY "jobs_select_client" ON public.jobs
  FOR SELECT USING (
    get_my_role() = 'client'
    AND recruiter_id = get_effective_client_id()
  );
