-- Add questionnaire_responses JSONB column to candidates and job_matches.
-- Stores pre-interview questionnaire answers keyed by question ID.
-- NULL = questionnaire not yet completed.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS questionnaire_responses JSONB;

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS questionnaire_responses JSONB;
