-- Switch default currency from GBP to INR
-- salary_min/salary_max store "human-friendly" units:
--   INR → Lakhs per annum (e.g. 18 = ₹18L)
--   USD/GBP/EUR → Thousands (e.g. 90 = $90k)

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS salary_min      integer,
  ADD COLUMN IF NOT EXISTS salary_max      integer,
  ADD COLUMN IF NOT EXISTS salary_currency text NOT NULL DEFAULT 'INR';

-- Backfill existing rows that still have GBP default
UPDATE jobs SET salary_currency = 'INR'
WHERE salary_currency = 'GBP' OR salary_currency IS NULL;
