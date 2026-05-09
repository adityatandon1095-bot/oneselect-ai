-- =============================================================================
-- Talent Nurture Loop
-- Adds CRM tracking columns to talent_pool and schedules automated weekly
-- matching and 30-day re-engagement email runs.
-- =============================================================================

-- CRM tracking columns
ALTER TABLE public.talent_pool
  ADD COLUMN IF NOT EXISTS last_contacted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_matched_at     timestamptz,
  ADD COLUMN IF NOT EXISTS match_density       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reengagement_sent_at timestamptz;

-- Indexes to make CRM queries fast
CREATE INDEX IF NOT EXISTS idx_talent_pool_availability        ON public.talent_pool(availability);
CREATE INDEX IF NOT EXISTS idx_talent_pool_last_contacted      ON public.talent_pool(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_talent_pool_match_density       ON public.talent_pool(match_density DESC);

-- ── Cron wrappers ──────────────────────────────────────────────────────────
-- Both functions read the Supabase function URL + anon key from platform_settings,
-- which must be set once via the Supabase SQL Editor (same keys as interview cron):
--   UPDATE platform_settings SET value = 'https://[ref].supabase.co/functions/v1'
--     WHERE key = 'supabase_functions_url';
--   UPDATE platform_settings SET value = '[anon-key]'
--     WHERE key = 'supabase_anon_key';

CREATE OR REPLACE FUNCTION public.run_weekly_talent_match()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fn_url text; api_key text;
BEGIN
  SELECT value INTO fn_url  FROM public.platform_settings WHERE key = 'supabase_functions_url';
  SELECT value INTO api_key FROM public.platform_settings WHERE key = 'supabase_anon_key';
  IF COALESCE(fn_url,'') = '' OR COALESCE(api_key,'') = '' THEN
    RAISE NOTICE '[weekly-talent-match] skipped: platform_settings not configured'; RETURN;
  END IF;
  PERFORM net.http_post(
    url     := fn_url || '/weekly-talent-match',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key),
    body    := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_talent_reengagement()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fn_url text; api_key text;
BEGIN
  SELECT value INTO fn_url  FROM public.platform_settings WHERE key = 'supabase_functions_url';
  SELECT value INTO api_key FROM public.platform_settings WHERE key = 'supabase_anon_key';
  IF COALESCE(fn_url,'') = '' OR COALESCE(api_key,'') = '' THEN
    RAISE NOTICE '[talent-reengagement] skipped: platform_settings not configured'; RETURN;
  END IF;
  PERFORM net.http_post(
    url     := fn_url || '/talent-reengagement',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key),
    body    := '{}'::jsonb
  );
END;
$$;

-- Weekly match: every Monday at 09:00 UTC
SELECT cron.schedule(
  'weekly-talent-match',
  '0 9 * * 1',
  'SELECT public.run_weekly_talent_match()'
);

-- Re-engagement: daily at 07:30 UTC (fires email only if candidate is 30+ days inactive)
SELECT cron.schedule(
  'talent-reengagement',
  '30 7 * * *',
  'SELECT public.run_talent_reengagement()'
);
