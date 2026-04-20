-- Allow admin to UPDATE any profile row.
-- This is needed so the frontend can correct user_role immediately after
-- calling invite-user (in case the deployed edge function is stale).

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE
  USING    (is_admin())
  WITH CHECK (is_admin());
