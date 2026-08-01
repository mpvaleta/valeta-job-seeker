import type { SupabaseClient } from '@supabase/supabase-js';

// Records an admin action. Best-effort: never blocks the main operation.
export async function audit(
  supabase: SupabaseClient,
  params: { actor_id: string; action: string; entity: string; entity_id?: string; detail?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      actor_id: params.actor_id,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id ?? null,
      detail: params.detail ?? {}
    });
  } catch {
    /* audit failures must not break the action */
  }
}
