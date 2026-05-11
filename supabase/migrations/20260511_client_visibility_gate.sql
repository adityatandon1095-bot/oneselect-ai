-- =============================================================================
-- Client visibility gate: enforce two-tier candidate visibility model
--
-- PROBLEM:
--   candidates_select_client currently grants clients SELECT on any candidate
--   with job_id → one of their jobs. This exposes:
--     • CV uploads that have not yet been screened by the recruiter
--     • LinkedIn-sourced profiles moved into a pipeline but not reviewed
--   Neither of these should be visible until a recruiter has taken an action.
--
-- RULE (enforced here):
--   A client can only see a candidate when:
--     1. The candidate is assigned to one of the client's jobs
--        (is_recruiter_job() — SECURITY DEFINER, no RLS cycle risk)
--     2. AI screening has completed  (match_pass IS NOT NULL)
--
--   match_pass IS NOT NULL means the recruiter ran the AI screening step,
--   which is the deliberate action that makes a candidate "recruiter-reviewed".
--   This is the single, clear recruiter → client visibility trigger.
--
-- ALSO FIXED:
--   • candidates_update_client was never created — client dismiss/approve/offer
--     actions silently failed because RLS blocked every UPDATE from clients.
--     Added here, scoped to screened candidates in their own jobs.
--
--   • job_matches_select_client is revoked. Clients have no legitimate reason
--     to read raw talent pool match rows. All shortlisted pool candidates are
--     copied into the candidates table before the recruiter sends them to interview,
--     and that table is governed by candidates_select_client (above).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tighten candidates_select_client: add screening gate
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "candidates_select_client" ON public.candidates;
CREATE POLICY "candidates_select_client" ON public.candidates
  FOR SELECT USING (
    get_my_role() = 'client'
    AND is_recruiter_job(job_id)
    AND match_pass IS NOT NULL   -- screening has been run; this is the visibility gate
  );


-- ---------------------------------------------------------------------------
-- 2. Add missing candidates_update_client
--    Without this, client dismiss / approve / offer_status updates are silently
--    rejected by RLS. Scope: screened candidates in their own jobs only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "candidates_update_client" ON public.candidates;
CREATE POLICY "candidates_update_client" ON public.candidates
  FOR UPDATE USING (
    get_my_role() = 'client'
    AND is_recruiter_job(job_id)
    AND match_pass IS NOT NULL
  );


-- ---------------------------------------------------------------------------
-- 3. Revoke job_matches read access for clients
--    Clients currently have SELECT on all job_match rows for their jobs.
--    The client portal UI never queries this table, but the open policy is a
--    security hole (direct API access exposes raw, unreviewed talent pool data).
--    Locking it to FALSE; if a future feature needs it, add a scoped policy then.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_matches_select_client" ON public.job_matches;
CREATE POLICY "job_matches_select_client" ON public.job_matches
  FOR SELECT USING (FALSE);
