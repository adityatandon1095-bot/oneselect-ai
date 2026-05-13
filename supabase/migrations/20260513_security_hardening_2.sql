-- =============================================================================
-- Security hardening pass 2  (2026-05-13)
--
-- 1. Enable RLS on chat_history (created directly in Supabase, never migrated)
-- 2. Tighten conversations policies: add admin read-all and recruiter access
-- 3. Enable RLS on any tables that may have been created without it
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. chat_history — was created outside migrations with no RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_history_select_own_client" ON public.chat_history;
DROP POLICY IF EXISTS "chat_history_insert_own_client" ON public.chat_history;
DROP POLICY IF EXISTS "chat_history_select_admin"      ON public.chat_history;
DROP POLICY IF EXISTS "chat_history_select_recruiter"  ON public.chat_history;

-- Clients: read and write their own messages only
CREATE POLICY "chat_history_select_own_client" ON public.chat_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "chat_history_insert_own_client" ON public.chat_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins: read all messages (support / moderation)
CREATE POLICY "chat_history_select_admin" ON public.chat_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 2. conversations — tighten policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "client owns conversations"       ON public.conversations;
DROP POLICY IF EXISTS "conversations_all_client"        ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_admin"      ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_recruiter"  ON public.conversations;

-- Clients: full access to their own conversations
CREATE POLICY "conversations_all_client" ON public.conversations
  FOR ALL
  USING  (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Admins: read all conversations
CREATE POLICY "conversations_select_admin" ON public.conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3. Ensure RLS is enabled on recruiter_chat_messages if it exists
--    (may have been created alongside recruiter chat feature)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recruiter_chat_messages'
  ) THEN
    EXECUTE 'ALTER TABLE public.recruiter_chat_messages ENABLE ROW LEVEL SECURITY';

    -- Drop and recreate to be safe
    EXECUTE $p$
      DROP POLICY IF EXISTS "recruiter_chat_own" ON public.recruiter_chat_messages;
      CREATE POLICY "recruiter_chat_own" ON public.recruiter_chat_messages
        FOR ALL
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "recruiter_chat_admin" ON public.recruiter_chat_messages;
      CREATE POLICY "recruiter_chat_admin" ON public.recruiter_chat_messages
        FOR SELECT USING (
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_role = 'admin')
        );
    $p$;
  END IF;
END;
$$;
