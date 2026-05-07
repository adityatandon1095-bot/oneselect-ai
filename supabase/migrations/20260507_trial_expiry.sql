-- Trial expiry support
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Backfill: set trial_ends_at for existing trial users that don't have it
UPDATE profiles
SET trial_ends_at = created_at + interval '14 days'
WHERE subscription_status = 'trial'
  AND trial_ends_at IS NULL;
