-- Extend linkedin_sourcing_log with per-tier counts.
-- candidates_added keeps its original meaning (score ≥4, the "matched" stat shown
-- in the client's Sourcing Activity panel) so existing queries are unaffected.
ALTER TABLE public.linkedin_sourcing_log
  ADD COLUMN IF NOT EXISTS candidates_added_to_pipeline int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_added_to_pool     int NOT NULL DEFAULT 0;
