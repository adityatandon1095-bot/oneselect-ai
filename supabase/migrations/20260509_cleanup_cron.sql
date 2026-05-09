-- =============================================================================
-- Schedule the cleanup-stale-data edge function to run monthly.
--
-- cleanup-stale-data nulls raw_text on candidates/talent_pool entries older
-- than 12 months, fulfilling the data-minimisation commitment in the privacy
-- policy (DPDPA / GDPR). Without this schedule the cleanup never runs.
--
-- The function validates the caller via the service role key, so we store it
-- in platform_settings under 'supabase_service_role_key'. Set it once after
-- running this migration (never put the real value in a committed file):
--
--   UPDATE public.platform_settings
--     SET value = '[your-service-role-key]'
--     WHERE key = 'supabase_service_role_key';
--
-- supabase_functions_url and supabase_anon_key are already seeded by
-- 20260509_interview_expiry_cron.sql — no need to re-insert them.
-- =============================================================================

INSERT INTO public.platform_settings (key, value) VALUES
  ('supabase_service_role_key', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_cleanup_stale_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fn_url      text;
  service_key text;
BEGIN
  SELECT value INTO fn_url      FROM public.platform_settings WHERE key = 'supabase_functions_url';
  SELECT value INTO service_key FROM public.platform_settings WHERE key = 'supabase_service_role_key';

  IF COALESCE(fn_url, '') = '' OR COALESCE(service_key, '') = '' THEN
    RAISE NOTICE '[cleanup-stale-data] skipped: supabase_functions_url or supabase_service_role_key not set in platform_settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := fn_url || '/cleanup-stale-data',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Monthly on the 1st at 03:00 UTC — low-traffic window, well before business hours.
SELECT cron.schedule(
  'cleanup-stale-data',
  '0 3 1 * *',
  'SELECT public.run_cleanup_stale_data()'
);
