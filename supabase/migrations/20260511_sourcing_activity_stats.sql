-- =============================================================================
-- get_sourcing_stats(p_job_id)
--
-- Returns aggregate sourcing numbers for a job so clients can see AI sourcing
-- activity without being granted direct access to linkedin_sourcing_log or any
-- unscreened candidate rows.
--
-- Stats returned:
--   profiles_scanned  — total LinkedIn profiles the AI evaluated for this job
--                       (SUM of candidates_found across all sourcing runs)
--   profiles_matched  — profiles that scored well enough to enter the review pool
--                       (SUM of candidates_added across all sourcing runs)
--   shortlisted       — LinkedIn candidates a recruiter has screened and made
--                       visible to the client (source='linkedin', match_pass IS NOT NULL)
--
-- Access: admin · recruiter assigned to this job · client who owns this job
-- All other callers receive NULL (empty result set).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_sourcing_stats(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role        text := get_my_role();
  v_scanned     int  := 0;
  v_matched     int  := 0;
  v_shortlisted int  := 0;
BEGIN
  -- Gate: only authorised callers may see stats for this job
  IF NOT (
       v_role = 'admin'
    OR (v_role = 'recruiter' AND is_my_client_job(p_job_id))
    OR (v_role = 'client'    AND is_recruiter_job(p_job_id))
  ) THEN
    RETURN NULL;
  END IF;

  -- Sourcing log aggregates (admin-only table; bypassed here via SECURITY DEFINER)
  SELECT
    COALESCE(SUM(candidates_found)::int, 0),
    COALESCE(SUM(candidates_added)::int, 0)
  INTO v_scanned, v_matched
  FROM public.linkedin_sourcing_log
  WHERE job_id = p_job_id
    AND status  = 'success';

  -- Shortlisted: LinkedIn candidates the recruiter screened for this job
  -- (match_pass IS NOT NULL means screening ran — this is the client-visibility gate)
  SELECT COUNT(*)::int INTO v_shortlisted
  FROM public.candidates
  WHERE job_id     = p_job_id
    AND source     = 'linkedin'
    AND match_pass IS NOT NULL;

  RETURN jsonb_build_object(
    'profiles_scanned', v_scanned,
    'profiles_matched', v_matched,
    'shortlisted',      v_shortlisted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sourcing_stats(uuid) TO authenticated;
