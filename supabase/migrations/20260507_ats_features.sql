-- Recruiter and client annotation fields
ALTER TABLE candidates  ADD COLUMN IF NOT EXISTS recruiter_notes text;
ALTER TABLE candidates  ADD COLUMN IF NOT EXISTS client_notes    text;
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS recruiter_notes text;
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS client_notes    text;

-- GDPR / DPDPA application withdrawal
ALTER TABLE candidates  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

-- Salary range (stored as integers, currency separate)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min      integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max      integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_currency text    DEFAULT 'GBP';

-- Custom interview questions per job
-- Array of {q: string, type: "technical"|"behavioral", seconds: number}
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS interview_questions jsonb;

-- SLA target in calendar days (default 30)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_days integer NOT NULL DEFAULT 30;
