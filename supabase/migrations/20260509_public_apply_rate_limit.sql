-- =============================================================================
-- IP-based rate limit table for the public-apply edge function.
-- Limits: 5 applications per IP per hour to prevent bot flooding.
-- Rows are pruned by the edge function after 2 hours; no accumulation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_rate_limits (
  ip_key        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_key, window_start)
);

ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;
-- No end-user policies — only the service role (edge function) accesses this table.

CREATE INDEX IF NOT EXISTS ip_rate_limits_window_idx
  ON public.ip_rate_limits (ip_key, window_start DESC);

-- Atomic increment function, mirrors the pattern used for call-claude rate limits.
CREATE OR REPLACE FUNCTION public.increment_ip_rate_limit(
  p_ip_key      text,
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
  INSERT INTO public.ip_rate_limits (ip_key, window_start, request_count)
  VALUES (p_ip_key, p_window_start, 1)
  ON CONFLICT (ip_key, window_start)
  DO UPDATE SET request_count = public.ip_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;
