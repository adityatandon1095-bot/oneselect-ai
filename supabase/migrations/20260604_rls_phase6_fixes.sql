-- =============================================================================
-- Phase 6 RLS fixes: talent_pool recruiter write access
--
-- Gap: talent_pool_insert_recruiter and talent_pool_update_recruiter were never
-- created across the entire migration chain. Recruiters could SELECT all talent
-- pool entries (talent_pool_select_recruiter) but any INSERT or UPDATE from the
-- recruiter role was silently blocked by RLS.
-- =============================================================================

-- Talent pool: grant recruiters INSERT
DROP POLICY IF EXISTS "talent_pool_insert_recruiter" ON public.talent_pool;
CREATE POLICY "talent_pool_insert_recruiter" ON public.talent_pool
  FOR INSERT WITH CHECK (get_my_role() = 'recruiter');

-- Talent pool: grant recruiters UPDATE
DROP POLICY IF EXISTS "talent_pool_update_recruiter" ON public.talent_pool;
CREATE POLICY "talent_pool_update_recruiter" ON public.talent_pool
  FOR UPDATE USING (get_my_role() = 'recruiter');
