// ============================================================================
// ZONO — Distribution AUTOMATION repository (server-only). Org-scoped CRUD over
// distribution_automations (both user-created RULES and engine-GENERATED signals
// live here, distinguished by metadata.source). Also creates REAL tasks in the
// tasks table for actionable signals. No mock data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { DIST, type DistAutomationRow } from "./db-types";
import type { AutomationSignal, AutomationType } from "./automation-rules";

type DB = Awaited<ReturnType<typeof createClient>>;
async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export interface AutomationMeta {
  source: "user" | "generated"; signature?: string; reason?: string; propertyId?: string | null;
  priority?: string; nextAction?: string; category?: string; refKind?: string | null; refId?: string | null;
  handled?: boolean; taskId?: string | null;
}

export const distributionAutomationRepository = {
  async listAll(): Promise<DistAutomationRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.automations as never).select("*").eq("org_id", s.orgId).order("created_at", { ascending: false }).limit(500);
    return list<DistAutomationRow>(data);
  },
  async getById(id: string): Promise<DistAutomationRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.automations as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as DistAutomationRow) ?? null;
  },

  /** Create a user automation RULE. */
  async createRule(input: { name: string; automationType: AutomationType; campaignId?: string | null; config?: Record<string, unknown>; enabled?: boolean }): Promise<DistAutomationRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST.automations as never).insert({
      org_id: s.orgId, name: input.name, automation_type: input.automationType, campaign_id: input.campaignId ?? null,
      config_json: input.config ?? {}, status: input.enabled === false ? "paused" : "active", is_enabled: input.enabled ?? true,
      created_by: s.userId, metadata: { source: "user" } as AutomationMeta,
    } as never).select("*").single();
    if (error) { console.error("[distribution.automation] createRule:", error.message); return null; }
    return data as unknown as DistAutomationRow;
  },

  async update(id: string, patch: { name?: string; enabled?: boolean; status?: string; config?: Record<string, unknown> }): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.enabled !== undefined) { row.is_enabled = patch.enabled; row.status = patch.enabled ? "active" : "paused"; }
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.config !== undefined) row.config_json = patch.config;
    const { error } = await s.db.from(DIST.automations as never).update(row as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** Mark a generated signal handled (merges metadata.handled = true). */
  async markHandled(id: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const row = await this.getById(id);
    const meta = { ...((row?.metadata ?? {}) as unknown as AutomationMeta), handled: true };
    const { error } = await s.db.from(DIST.automations as never)
      .update({ status: "handled", metadata: meta } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** Signatures of already-generated signals (for dedupe). */
  async existingSignatures(): Promise<Set<string>> {
    const s = await scope(); if (!s) return new Set();
    const { data } = await s.db.from(DIST.automations as never).select("metadata").eq("org_id", s.orgId);
    const sigs = new Set<string>();
    for (const r of list<{ metadata: AutomationMeta | null }>(data)) if (r.metadata?.signature) sigs.add(r.metadata.signature);
    return sigs;
  },

  /** Persist newly-generated signals (caller already filtered out existing ones). */
  async insertGenerated(signals: (AutomationSignal & { taskId?: string | null })[]): Promise<DistAutomationRow[]> {
    const s = await scope(); if (!s || !signals.length) return [];
    const rows = signals.map((sig) => ({
      org_id: s.orgId, name: sig.title, automation_type: sig.type, campaign_id: sig.campaignId,
      config_json: {}, status: sig.category === "recommendation" ? "suggested" : "alert", is_enabled: false,
      next_run_at: sig.nextRunAt, created_by: s.userId,
      metadata: {
        source: "generated", signature: sig.signature, reason: sig.reason, propertyId: sig.propertyId,
        priority: sig.priority, nextAction: sig.nextAction, category: sig.category, refKind: sig.refKind,
        refId: sig.refId, handled: false, taskId: sig.taskId ?? null,
      } as AutomationMeta,
    }));
    const { data, error } = await s.db.from(DIST.automations as never).insert(rows as never).select("*");
    if (error) { console.error("[distribution.automation] insertGenerated:", error.message); return []; }
    return list<DistAutomationRow>(data);
  },

  /** Create a REAL task for an actionable signal. Returns the task id or null. */
  async createTask(input: { title: string; description: string; priority: "high" | "medium" | "low"; propertyId: string | null; entityKind: string | null; entityId: string | null; dueInHours?: number }): Promise<string | null> {
    const s = await scope(); if (!s) return null;
    const due = input.dueInHours ? new Date(Date.now() + input.dueInHours * 3_600_000).toISOString() : null;
    const { data, error } = await s.db.from("tasks").insert({
      org_id: s.orgId, created_by: s.userId, assignee_id: s.userId, title: input.title, description: input.description,
      status: "todo", priority: input.priority, due_at: due, property_id: input.propertyId,
      entity_type: input.entityKind, entity_id: input.entityId, intelligence_source: "distribution_automation",
    } as never).select("id").single();
    if (error) { console.error("[distribution.automation] createTask:", error.message); return null; }
    return (data as { id: string }).id;
  },

  /** Touch last_run_at on the org's run marker (best-effort, on any user rule). */
  async stampRun(): Promise<void> {
    const s = await scope(); if (!s) return;
    await s.db.from(DIST.automations as never).update({ last_run_at: new Date().toISOString() } as never)
      .eq("org_id", s.orgId).eq("status", "active");
  },
};
