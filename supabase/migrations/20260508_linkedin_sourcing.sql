-- LinkedIn columns on candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS linkedin_data jsonb;

-- Ensure source column defaults to 'manual' for all new candidates
ALTER TABLE public.candidates
  ALTER COLUMN source SET DEFAULT 'manual';

-- LinkedIn sourcing activity log
CREATE TABLE IF NOT EXISTS public.linkedin_sourcing_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  triggered_at     timestamptz DEFAULT now(),
  candidates_found int  DEFAULT 0,
  candidates_added int  DEFAULT 0,
  status           text NOT NULL DEFAULT 'success',
  error_message    text
);

ALTER TABLE public.linkedin_sourcing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read linkedin_sourcing_log"
  ON public.linkedin_sourcing_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin'
  ));

-- Platform-wide settings (non-sensitive keys readable by admins;
-- sensitive keys like *_key are write-only from frontend — only service role reads them)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read non-secret keys
CREATE POLICY "Admin read non-secret platform_settings"
  ON public.platform_settings FOR SELECT
  USING (
    key NOT LIKE '%\_key' ESCAPE '\'
    AND key NOT LIKE '%\_secret' ESCAPE '\'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin')
  );

-- Admins can upsert any key (including secrets — but never fetched back to frontend)
CREATE POLICY "Admin upsert platform_settings"
  ON public.platform_settings FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin'))
  WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin'));

-- Seed defaults
INSERT INTO public.platform_settings (key, value) VALUES
  ('linkedin_sourcing_enabled', 'true'),
  ('linkedin_max_profiles', '20')
ON CONFLICT (key) DO NOTHING;
