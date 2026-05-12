-- get_sourcing_status(p_job_id, p_after)
-- Lets the frontend poll for sourcing completion without direct access to the
-- admin-only linkedin_sourcing_log table.
-- Returns {done, success, candidates_added, candidates_added_to_pipeline, candidates_added_to_pool}

CREATE OR REPLACE FUNCTION public.get_sourcing_status(
  p_job_id uuid,
  p_after  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text := get_my_role();
  v_rec  record;
BEGIN
  IF NOT (
       v_role = 'admin'
    OR (v_role = 'recruiter' AND is_my_client_job(p_job_id))
  ) THEN
    RETURN jsonb_build_object('done', false);
  END IF;

  SELECT status,
         COALESCE(candidates_added, 0)                  AS candidates_added,
         COALESCE(candidates_added_to_pipeline, 0)      AS candidates_added_to_pipeline,
         COALESCE(candidates_added_to_pool, 0)          AS candidates_added_to_pool
  INTO v_rec
  FROM public.linkedin_sourcing_log
  WHERE job_id      = p_job_id
    AND triggered_at > p_after
  ORDER BY triggered_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('done', false);
  END IF;

  RETURN jsonb_build_object(
    'done',                         v_rec.status IN ('success', 'failed'),
    'success',                      v_rec.status = 'success',
    'candidates_added',             v_rec.candidates_added,
    'candidates_added_to_pipeline', v_rec.candidates_added_to_pipeline,
    'candidates_added_to_pool',     v_rec.candidates_added_to_pool
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sourcing_status(uuid, timestamptz) TO authenticated;
