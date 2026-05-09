-- Add show_company_name flag to jobs table.
-- When false, the company name is hidden from candidates in public-facing views.
-- Defaults to true so existing jobs are unaffected.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS show_company_name boolean NOT NULL DEFAULT true;
