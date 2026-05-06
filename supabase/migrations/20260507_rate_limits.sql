-- =============================================================================
-- Rate limits table for call-claude edge function
-- Replaces the unreliable in-memory counter that resets on cold start.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

-- Only the service role (edge functions) reads/writes this table.
-- No end-user should access it directly.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No authenticated or anon policies — edge functions use the service role key.

-- Index for the window lookup (user_id + window_start range scan)
CREATE INDEX IF NOT EXISTS rate_limits_user_window
  ON public.rate_limits (user_id, window_start DESC);

-- ---------------------------------------------------------------------------
-- RPC called by the edge function.
-- Atomically inserts or increments the counter for (user, window).
-- Returns TRUE if the request is within the limit, FALSE if over.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_user_id      uuid,
  p_window_start timestamptz,
  p_limit        integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limits (user_id, window_start, request_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(uuid, timestamptz, integer) FROM PUBLIC;
-- Edge functions call this as service role — no grant needed for authenticated.
