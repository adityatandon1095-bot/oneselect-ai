-- Client experience improvements

-- Notification preferences per client (stored as JSONB on profiles)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb
    DEFAULT '{"shortlisted":true,"interview_complete":true,"approval_reminder":true,"weekly_digest":true}'::jsonb;
