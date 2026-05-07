-- Workflow fix migrations

-- 0. Job context fields (shown on public job board)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS industry     text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_size text;

-- 1. Track when a recruiter was nudged about a stale client approval
ALTER TABLE candidates  ADD COLUMN IF NOT EXISTS client_approval_nudge_sent_at timestamptz;
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS client_approval_nudge_sent_at timestamptz;

-- 2. offer_status 'rejected' is a valid text value — no enum constraint to update.
--    This comment documents the expected values:
--    candidates.offer_status: NULL | 'sent' | 'rejected'
--    candidates.final_decision: NULL | 'hired' | 'rejected'

-- 3. Cron: run client-approval-nudge every 6 hours
--    Requires pg_cron extension (enable in Supabase Dashboard → Database → Extensions).
--    After enabling, run:
--
--    SELECT cron.schedule(
--      'client-approval-nudge',
--      '0 */6 * * *',
--      $$
--        SELECT net.http_post(
--          url := current_setting('app.supabase_url') || '/functions/v1/client-approval-nudge',
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--          ),
--          body := '{}'::jsonb
--        )
--      $$
--    );
