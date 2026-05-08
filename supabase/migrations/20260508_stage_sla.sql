-- Stage entered timestamp for SLA tracking
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT NULL;

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT NULL;

-- Column to track whether a 48h interview expiry reminder was sent
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_expiry_reminder_sent_at timestamptz DEFAULT NULL;

-- Unique index to prevent duplicate public job applications (email + job)
-- Uses partial index on source = 'applied' so it doesn't affect internal CV uploads
CREATE UNIQUE INDEX IF NOT EXISTS candidates_public_apply_unique
  ON public.candidates (job_id, lower(email))
  WHERE source = 'applied';
