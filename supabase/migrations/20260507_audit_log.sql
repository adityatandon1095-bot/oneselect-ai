CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  text        NOT NULL,
  action      text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   text,
  job_id      uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_job_id_idx     ON audit_log(job_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_insert_audit" ON audit_log;
DROP POLICY IF EXISTS "staff_read_audit"  ON audit_log;
DROP POLICY IF EXISTS "client_read_audit" ON audit_log;

-- Anyone authenticated can insert
CREATE POLICY "auth_insert_audit" ON audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admins and recruiters can read all audit logs
CREATE POLICY "staff_read_audit" ON audit_log FOR SELECT
  USING (get_my_role() IN ('admin', 'recruiter'));

-- Clients can read audit logs only for their own jobs
CREATE POLICY "client_read_audit" ON audit_log FOR SELECT
  USING (
    get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = audit_log.job_id
        AND j.recruiter_id = auth.uid()
    )
  );
