-- Add price_override to profiles so admins can set per-client custom pricing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS price_override numeric(10,2);

-- Index for plan lookups (plan_id FK already exists from 20260428_plans_billing)
CREATE INDEX IF NOT EXISTS idx_profiles_plan_id ON public.profiles(plan_id);
