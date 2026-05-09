-- Schedule the interview-expiry-reminder edge function to run daily at 08:00 UTC.
--
-- The function is called via pg_net → HTTP POST to the Supabase Functions endpoint.
-- Two platform_settings keys must be configured by an admin after this migration runs:
--
--   supabase_functions_url  → e.g. https://abcdefghij.supabase.co/functions/v1
--   supabase_anon_key       → your project's anon/public key (safe to store here;
--                             the edge function uses the service role key internally)
--
-- To set them, run in Supabase SQL Editor:
--   UPDATE public.platform_settings
--     SET value = 'https://[your-project-ref].supabase.co/functions/v1'
--     WHERE key = 'supabase_functions_url';
--
--   UPDATE public.platform_settings
--     SET value = '[your-anon-key]'
--     WHERE key = 'supabase_anon_key';

INSERT INTO public.platform_settings (key, value) VALUES
  ('supabase_functions_url', ''),
  ('supabase_anon_key',      '')
ON CONFLICT (key) DO NOTHING;

-- Wrapper function that pg_cron calls.
-- Reads settings at call time so updates take effect without rescheduling.
CREATE OR REPLACE FUNCTION public.run_interview_expiry_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url  text;
  api_key text;
BEGIN
  SELECT value INTO fn_url  FROM public.platform_settings WHERE key = 'supabase_functions_url';
  SELECT value INTO api_key FROM public.platform_settings WHERE key = 'supabase_anon_key';

  IF COALESCE(fn_url, '') = '' OR COALESCE(api_key, '') = '' THEN
    RAISE NOTICE '[interview-expiry-reminder] skipped: supabase_functions_url or supabase_anon_key not set in platform_settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := fn_url || '/interview-expiry-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || api_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Daily at 08:00 UTC — catches anyone whose token expires within the next 48 hours.
SELECT cron.schedule(
  'interview-expiry-reminders',
  '0 8 * * *',
  'SELECT public.run_interview_expiry_reminders()'
);
