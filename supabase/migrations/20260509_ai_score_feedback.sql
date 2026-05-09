-- Stores recruiter thumbs-up/down feedback on AI candidate scores.
-- Used to calibrate scoring over time. No RLS complexity needed — recruiters
-- insert their own feedback; admins read all.

CREATE TABLE IF NOT EXISTS public.ai_score_feedback (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid        REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id        uuid        REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  score_given   integer     NOT NULL,
  feedback_type text        NOT NULL
    CHECK (feedback_type IN ('positive', 'score_too_high', 'score_too_low', 'wrong_skills', 'good_candidate_missed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_score_feedback_candidate_idx ON public.ai_score_feedback(candidate_id);
CREATE INDEX IF NOT EXISTS ai_score_feedback_recruiter_idx ON public.ai_score_feedback(recruiter_id);
CREATE INDEX IF NOT EXISTS ai_score_feedback_created_idx   ON public.ai_score_feedback(created_at DESC);

ALTER TABLE public.ai_score_feedback ENABLE ROW LEVEL SECURITY;

-- Recruiters and admins can insert
CREATE POLICY "staff_insert_feedback" ON public.ai_score_feedback
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'recruiter'));

-- Admins can read all feedback (for calibration)
CREATE POLICY "admin_read_feedback" ON public.ai_score_feedback
  FOR SELECT USING (get_my_role() = 'admin');

-- Recruiters can read their own feedback
CREATE POLICY "recruiter_read_own_feedback" ON public.ai_score_feedback
  FOR SELECT USING (get_my_role() = 'recruiter' AND recruiter_id = auth.uid());
