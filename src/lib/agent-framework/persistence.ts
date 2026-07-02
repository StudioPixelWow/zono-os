// ============================================================================
// 🤖 Agent Framework — persistence (server-only). 29.2.
// Durable state for the agent framework: enabled flags, runs, inbox, memory and
// performance snapshots. All writes use the service-role client. Every function
// degrades gracefully when the tables are absent (run the 29.2 migration). No
// engine modified; nothing auto-executes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  AgentDefinition, AgentInboxItem, AgentRunResult, AgentActionRecord, AgentEventKind,
  AgentPerformance, InboxStatus, ProposalKind, Impact,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const n = (v: unknown, d = 0): number => { const x = typeof v === "number" ? v : Number(v); return Number.isFinite(x) ? x : d; };
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const db = () => createServiceRoleClient();
const AGENTS = "zono_agents", RUNS = "zono_agent_runs", INBOX = "zono_agent_inbox", MEM = "zono_agent_memory", PERF = "zono_agent_performance";

export function dedupeKey(agentId: string, kind: string, entity: string, recommendation: string): string {
  return `${agentId}|${kind}|${entity}|${recommendation}`.slice(0, 400);
}

/** Orgs that have any agent state (for the scheduled cron runner). */
export async function listOrgsWithAgents(): Promise<string[]> {
  try { const { data } = await db().from(AGENTS as never).select("organization_id").limit(5000); return [...new Set(((data ?? []) as Row[]).map((r) => s(r.organization_id)).filter((x): x is string => !!x))]; } catch { return []; }
}

/** Seed enabled rows for built-in agents (once). Never overrides existing enabled state. */
export async function ensureAgentsSeeded(orgId: string, defs: AgentDefinition[]): Promise<void> {
  try {
    const rows = defs.map((d) => ({ organization_id: orgId, agent_id: d.id, agent_type: d.type, name: d.name, enabled: true, schedule_mode: d.schedule.mode }));
    await db().from(AGENTS as never).upsert(rows as never, { onConflict: "organization_id,agent_id", ignoreDuplicates: true });
  } catch { /* table missing — caller defaults to enabled */ }
}

export async function getEnabledMap(orgId: string): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try { const { data } = await db().from(AGENTS as never).select("agent_id,enabled").eq("organization_id", orgId); for (const r of (data ?? []) as Row[]) { const id = s(r.agent_id); if (id) map.set(id, !!r.enabled); } } catch { /* none */ }
  return map;
}

export async function setEnabled(orgId: string, agentId: string, enabled: boolean, meta?: { type?: string; name?: string; scheduleMode?: string }): Promise<boolean> {
  try { await db().from(AGENTS as never).upsert({ organization_id: orgId, agent_id: agentId, enabled, agent_type: meta?.type, name: meta?.name, schedule_mode: meta?.scheduleMode, updated_at: new Date().toISOString() } as never, { onConflict: "organization_id,agent_id" }); return true; } catch { return false; }
}

export async function setTimings(orgId: string, agentId: string, lastRunAt: string | null, nextRunAt: string | null): Promise<void> {
  try { await db().from(AGENTS as never).update({ last_run_at: lastRunAt, next_run_at: nextRunAt, updated_at: new Date().toISOString() } as never).eq("organization_id", orgId).eq("agent_id", agentId); } catch { /* none */ }
}
export async function getTimings(orgId: string): Promise<Map<string, { lastRunAt: string | null; nextRunAt: string | null }>> {
  const map = new Map<string, { lastRunAt: string | null; nextRunAt: string | null }>();
  try { const { data } = await db().from(AGENTS as never).select("agent_id,last_run_at,next_run_at").eq("organization_id", orgId); for (const r of (data ?? []) as Row[]) { const id = s(r.agent_id); if (id) map.set(id, { lastRunAt: s(r.last_run_at), nextRunAt: s(r.next_run_at) }); } } catch { /* none */ }
  return map;
}

export async function insertRun(orgId: string, run: AgentRunResult, trigger: string): Promise<void> {
  try { await db().from(RUNS as never).insert({ organization_id: orgId, agent_id: run.agentId, ran_at: run.ranAt, proposals: run.proposals, blocked: run.blocked, skipped: run.skipped, skip_reason: run.skipReason, trigger } as never); } catch { /* none */ }
}
export async function listRuns(orgId: string, limit = 20): Promise<{ agentId: string; ranAt: string; proposals: number; blocked: number; skipped: boolean; trigger: string }[]> {
  try { const { data } = await db().from(RUNS as never).select("agent_id,ran_at,proposals,blocked,skipped,trigger").eq("organization_id", orgId).order("ran_at", { ascending: false }).limit(limit); return ((data ?? []) as Row[]).map((r) => ({ agentId: s(r.agent_id) ?? "", ranAt: s(r.ran_at) ?? "", proposals: n(r.proposals), blocked: n(r.blocked), skipped: !!r.skipped, trigger: s(r.trigger) ?? "manual" })); } catch { return []; }
}

/** Persist new pending inbox items (idempotent — existing decided items keep their status). */
export async function upsertInboxItems(orgId: string, items: AgentInboxItem[]): Promise<number> {
  if (!items.length) return 0;
  try {
    const rows = items.map((i) => ({
      organization_id: orgId, dedupe_key: dedupeKey(i.agentId, i.kind, i.entity, i.recommendation),
      agent_id: i.agentId, agent_name: i.agentName, kind: i.kind, entity: i.entity, recommendation: i.recommendation, reason: i.reason,
      evidence: i.evidence, confidence: i.confidence, impact: i.impact, urgency: i.urgency,
      mission_type: i.missionType ?? null, entity_type: i.entityType ?? null, entity_id: i.entityId ?? null, entity_name: i.entityName ?? null,
      requires_approval: i.requiresApproval, status: "pending", blocked: i.blocked, block_reason: i.blockReason, explain: i.explain,
    }));
    await db().from(INBOX as never).upsert(rows as never, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true });
    return rows.length;
  } catch { return 0; }
}

function rowToInbox(r: Row): AgentInboxItem {
  const ex = (r.explain && typeof r.explain === "object" ? r.explain : {}) as Row;
  return {
    id: String(r.id), agentId: s(r.agent_id) ?? "", agentName: s(r.agent_name) ?? "", kind: (s(r.kind) ?? "recommendation") as ProposalKind,
    entity: s(r.entity) ?? "", recommendation: s(r.recommendation) ?? "", reason: s(r.reason) ?? "", evidence: asArr(r.evidence),
    confidence: n(r.confidence), impact: (s(r.impact) ?? "medium") as Impact, urgency: n(r.urgency),
    missionType: s(r.mission_type) ?? undefined, entityType: s(r.entity_type) ?? undefined, entityId: s(r.entity_id), entityName: s(r.entity_name),
    requiresApproval: !!r.requires_approval, status: (s(r.status) ?? "pending") as InboxStatus,
    createdMissionId: s(r.created_mission_id), decisionReason: s(r.decision_reason),
    blocked: !!r.blocked, blockReason: s(r.block_reason),
    explain: { why: s(ex.why) ?? "", evidence: asArr(ex.evidence), recommends: s(ex.recommends) ?? "", ifIgnored: s(ex.ifIgnored) ?? "", confidence: n(ex.confidence), alternatives: asArr(ex.alternatives) },
  };
}
export async function listInbox(orgId: string, opts: { status?: InboxStatus; limit?: number } = {}): Promise<AgentInboxItem[]> {
  try {
    let q = db().from(INBOX as never).select("*").eq("organization_id", orgId) as unknown as { eq: (c: string, v: string) => unknown; order: (c: string, o: { ascending: boolean }) => unknown; limit: (n: number) => Promise<{ data: Row[] | null }> };
    if (opts.status) q = (q as { eq: (c: string, v: string) => typeof q }).eq("status", opts.status);
    const { data } = await (q as { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> } }).order("urgency", { ascending: false }).limit(opts.limit ?? 50);
    return ((data ?? []) as Row[]).map(rowToInbox);
  } catch { return []; }
}
export async function getInboxItem(orgId: string, itemId: string): Promise<AgentInboxItem | null> {
  try { const { data } = await db().from(INBOX as never).select("*").eq("organization_id", orgId).eq("id", itemId).maybeSingle(); return data ? rowToInbox(data as Row) : null; } catch { return null; }
}
export async function decideInbox(orgId: string, itemId: string, status: InboxStatus, reason: string | null, createdMissionId: string | null): Promise<boolean> {
  try { await db().from(INBOX as never).update({ status, decision_reason: reason, created_mission_id: createdMissionId, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("organization_id", orgId).eq("id", itemId); return true; } catch { return false; }
}

export async function recordMemory(orgId: string, agentId: string, kind: AgentEventKind, detail?: string): Promise<void> {
  try { await db().from(MEM as never).insert({ organization_id: orgId, agent_id: agentId, kind, detail: detail ?? null } as never); } catch { /* none */ }
}
export async function memoryRecords(orgId: string, agentId?: string): Promise<AgentActionRecord[]> {
  try {
    let q = db().from(MEM as never).select("agent_id,kind,at").eq("organization_id", orgId) as unknown as { eq: (c: string, v: string) => unknown; order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> } };
    if (agentId) q = (q as { eq: (c: string, v: string) => typeof q }).eq("agent_id", agentId);
    const { data } = await (q as { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null }> } }).order("at", { ascending: false }).limit(1000);
    return ((data ?? []) as Row[]).map((r) => ({ agentId: s(r.agent_id) ?? "", at: s(r.at) ?? "", kind: (s(r.kind) ?? "recommended") as AgentEventKind }));
  } catch { return []; }
}

export async function snapshotPerformance(orgId: string, agentId: string, perf: AgentPerformance): Promise<void> {
  try { await db().from(PERF as never).insert({ organization_id: orgId, agent_id: agentId, recommendations: perf.recommendations, approved: perf.approved, rejected: perf.rejected, completed: perf.completed, failed: perf.failed, ignored: perf.ignored, success_rate: perf.successRatePct, avg_impact: perf.avgImpact, false_positives: perf.falsePositives } as never); } catch { /* none */ }
}
export async function performanceHistory(orgId: string, agentId: string, limit = 14): Promise<{ capturedAt: string; recommendations: number; approved: number; rejected: number; successRate: number }[]> {
  try { const { data } = await db().from(PERF as never).select("captured_at,recommendations,approved,rejected,success_rate").eq("organization_id", orgId).eq("agent_id", agentId).order("captured_at", { ascending: false }).limit(limit); return ((data ?? []) as Row[]).map((r) => ({ capturedAt: s(r.captured_at) ?? "", recommendations: n(r.recommendations), approved: n(r.approved), rejected: n(r.rejected), successRate: n(r.success_rate) })); } catch { return []; }
}
