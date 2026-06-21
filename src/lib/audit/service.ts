/**
 * Central Audit Log service (server-only). `logAudit` is best-effort and never
 * throws — it records a sensitive action under the current user's org via the
 * service role. `getAuditLog` reads recent entries (manager+).
 */
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

export type AuditCategory =
  | "assignment" | "approval" | "recommendation" | "routing" | "pricing"
  | "deal" | "permission" | "configuration" | "system" | "area";

export interface AuditInput {
  action: string;
  category: AuditCategory;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const { user, profile } = await getSessionContext();
    if (!user || !profile) return;
    const admin = createServiceRoleClient();
    await admin.from("audit_log").insert({
      organization_id: profile.org_id, actor_id: user.id, actor_name: profile.full_name,
      action: input.action, category: input.category,
      entity_type: input.entityType ?? null, entity_id: input.entityId ?? null,
      summary: input.summary ?? null, metadata: (input.metadata ?? {}) as never,
    } as never);
  } catch { /* audit is best-effort — never block the underlying action */ }
}

export type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

export async function getAuditLog(opts: { category?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.category) q = q.eq("category", opts.category);
  const { data } = await q;
  return (data ?? []) as AuditRow[];
}
