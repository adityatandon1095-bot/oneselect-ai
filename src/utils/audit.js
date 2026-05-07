export async function logAudit(supabase, { actorId, actorRole, action, entityType, entityId, jobId, metadata = {} }) {
  try {
    await supabase.from('audit_log').insert({
      actor_id:    actorId ?? null,
      actor_role:  actorRole,
      action,
      entity_type: entityType,
      entity_id:   entityId != null ? String(entityId) : null,
      job_id:      jobId ?? null,
      metadata,
    })
  } catch { /* audit is best-effort */ }
}
