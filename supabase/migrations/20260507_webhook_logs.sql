CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid        REFERENCES profiles(id)   ON DELETE SET NULL,
  candidate_id  uuid        REFERENCES candidates(id) ON DELETE SET NULL,
  webhook_url   text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}',
  success       boolean     NOT NULL DEFAULT false,
  attempts      integer     NOT NULL DEFAULT 1,
  error_message text,
  fired_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_logs_client_id_idx  ON public.webhook_logs(client_id);
CREATE INDEX IF NOT EXISTS webhook_logs_fired_at_idx   ON public.webhook_logs(fired_at DESC);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read webhook logs (internal operational table)
CREATE POLICY "webhook_logs_admin_select" ON public.webhook_logs FOR SELECT
  USING (get_my_role() = 'admin');

-- Edge function inserts via service role key — bypass RLS
CREATE POLICY "webhook_logs_service_insert" ON public.webhook_logs FOR INSERT
  WITH CHECK (true);
