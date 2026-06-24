/**
 * System / Recompute Center service (server-only).
 *
 * A single registry of every intelligence engine with its UPSTREAM dependencies,
 * a staleness threshold, and a deterministic org-level "recompute" runner that
 * calls the engine's EXISTING service function (no engine logic is changed). The
 * Recompute Center reads the engine_runs log to show what is fresh / stale /
 * failing and can recompute one engine, all engines, or an engine + its
 * dependencies — always in correct dependency order. Manager+ only.
 */
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

// Existing per-engine recompute entry points (unchanged).
import { recomputeDerivedIntelligence, recomputePipelineResearch, ensureNationalNeighborhoods } from "@/lib/transactions/service";
import { generateMarketSnapshotsForOrganization } from "@/lib/market/service";
import { generateForecastsForOrg, generatePipelineSnapshot } from "@/lib/forecast/service";
import { recomputeRevenueIntelligence } from "@/lib/revenue/service";
import { recomputeAgentTwinsForOrg } from "@/lib/routing/service";
import { recomputeTeamIntelligence } from "@/lib/team/service";
import { recomputeCompetitorsForOrg } from "@/lib/competitor/service";
import { recomputeAcquisitionForOrg } from "@/lib/acquisition/service";
import { runBrokerDetectionForOrg } from "@/lib/broker/service";
import { generateKnowledgeGraph } from "@/lib/graph/service";
import { recalculateOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";
import { recomputeMarketingIntelligence } from "@/lib/marketing/service";
import { recomputeDistributionIntelligence } from "@/lib/distribution/service";
import { recomputeSocialLeads } from "@/lib/social/service";

type DB = Database["public"]["Tables"];
const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, agent: 40, viewer: 20 };
const HOUR = 3_600_000;
const sum = (o: Record<string, unknown>) => Object.values(o).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0);

export interface EngineDef {
  key: string;
  label: string;
  category: string;
  deps: string[];
  stalenessHours: number;
  run?: () => Promise<{ rows: number; summary: Record<string, unknown> }>;
  note?: string;
}

/** The engine registry + dependency graph. Order here is the canonical
 *  dependency chain: geo → transactions → market → recommendations → forecast →
 *  revenue → decision brain (with the other engines slotted by their deps). */
export const ENGINES: EngineDef[] = [
  { key: "geo", label: "מודיעין גאוגרפי", category: "geo", deps: [], stalenessHours: 168,
    run: async () => { const cities = await orgCities(); const r = await ensureNationalNeighborhoods(cities); return { rows: r.reduce((a, x) => a + Math.max(0, x.discovered), 0), summary: { cities: cities.length } }; } },
  { key: "transactions", label: "מודיעין עסקאות", category: "transactions", deps: ["geo"], stalenessHours: 24,
    run: async () => { const d = await recomputeDerivedIntelligence(); const p = await recomputePipelineResearch(); return { rows: d.buildings + d.streets + p.reports, summary: { ...d, ...p } }; } },
  { key: "market", label: "מודיעין שוק / מפת ביקוש", category: "market", deps: ["transactions"], stalenessHours: 24,
    run: async () => { const r = await generateMarketSnapshotsForOrganization(); return { rows: r.snapshots, summary: { ...r } }; } },
  { key: "broker", label: "זיהוי מתווכים", category: "broker", deps: [], stalenessHours: 24,
    run: async () => { const r = await runBrokerDetectionForOrg(); return { rows: r.matched, summary: { ...r } }; } },
  { key: "competitors", label: "מודיעין מתחרים", category: "competitors", deps: ["broker"], stalenessHours: 48,
    run: async () => { const r = await recomputeCompetitorsForOrg(); return { rows: r.competitors, summary: { ...r } }; } },
  { key: "acquisition", label: "מודיעין גיוס", category: "acquisition", deps: ["transactions", "market"], stalenessHours: 24,
    run: async () => { const r = await recomputeAcquisitionForOrg(); return { rows: r.profiles, summary: { ...r } }; } },
  { key: "routing", label: "ניתוב לידים", category: "routing", deps: [], stalenessHours: 24,
    run: async () => { const r = await recomputeAgentTwinsForOrg(); return { rows: r.agents, summary: { ...r } }; } },
  { key: "team", label: "מודיעין צוות", category: "team", deps: ["routing"], stalenessHours: 24,
    run: async () => { const r = await recomputeTeamIntelligence(); return { rows: r.agents, summary: { ...r } }; } },
  { key: "graph", label: "קשרים עסקיים", category: "graph", deps: ["transactions"], stalenessHours: 24,
    run: async () => { const r = await generateKnowledgeGraph(); return { rows: r.nodes, summary: { ...r } }; } },
  { key: "marketing", label: "מודיעין שיווק", category: "marketing", deps: [], stalenessHours: 48,
    run: async () => { const r = await recomputeMarketingIntelligence(); return { rows: sum(r as unknown as Record<string, unknown>), summary: { ...r } }; } },
  { key: "distribution", label: "הפצה", category: "marketing", deps: ["marketing"], stalenessHours: 48,
    run: async () => { const r = await recomputeDistributionIntelligence(); return { rows: sum(r as unknown as Record<string, unknown>), summary: { ...r } }; } },
  { key: "social", label: "לידים מרשתות", category: "social", deps: [], stalenessHours: 24,
    run: async () => { const r = await recomputeSocialLeads(); return { rows: sum(r as unknown as Record<string, unknown>), summary: { ...r } }; } },
  { key: "recommendations", label: "המלצות", category: "recommendations", deps: ["market"], stalenessHours: 24,
    note: "נוצרות כחלק ממוח ההחלטות — אין חישוב נפרד." },
  { key: "forecast", label: "תחזית עסקאות", category: "forecast", deps: ["market", "transactions"], stalenessHours: 24,
    run: async () => { const r = await generateForecastsForOrg(); await generatePipelineSnapshot(); return { rows: r.forecasts, summary: { ...r } }; } },
  { key: "revenue", label: "מודיעין הכנסות", category: "revenue", deps: ["forecast", "team"], stalenessHours: 24,
    run: async () => { const r = await recomputeRevenueIntelligence(); return { rows: 1, summary: { ...r } }; } },
  { key: "decision_brain", label: "מוח ההחלטות", category: "decision", deps: ["forecast", "revenue", "acquisition", "competitors", "team", "graph", "market", "transactions", "social", "marketing", "distribution"], stalenessHours: 12,
    run: async () => { await recalculateOrganizationDecisionBrain(); return { rows: 1, summary: { ok: true } }; } },
];

const BY_KEY = new Map(ENGINES.map((e) => [e.key, e]));

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data: role } = await supabase.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = role?.key ?? "agent";
  }
  return { userId: user.id, orgId: profile.org_id, rank: ROLE_RANK[roleKey] ?? 0 };
}

async function requireManager() {
  const c = await ctx();
  if (c.rank < ROLE_RANK.manager) throw new Error("נדרשת הרשאת מנהל לצפייה/הרצת מנועי חישוב.");
  return c;
}

/** Active operating cities for the org (for the geo engine). */
async function orgCities(): Promise<string[]> {
  const admin = createServiceRoleClient();
  const { orgId } = await ctx();
  const { data } = await admin.from("user_operating_localities").select("city_name").eq("organization_id", orgId).eq("is_active", true);
  const cities = [...new Set((data ?? []).map((r) => r.city_name).filter((c): c is string => !!c))];
  if (cities.length) return cities;
  const { data: org } = await admin.from("organizations").select("operating_cities").eq("id", orgId).maybeSingle();
  return (org?.operating_cities as string[] | null) ?? [];
}

// ── Dependency ordering (topological) ────────────────────────────────────────
function topoOrder(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (k: string, stack: Set<string>) => {
    if (seen.has(k) || !BY_KEY.has(k)) return;
    if (stack.has(k)) return; // cycle guard (shouldn't happen)
    stack.add(k);
    for (const d of BY_KEY.get(k)!.deps) visit(d, stack);
    stack.delete(k);
    seen.add(k);
    out.push(k);
  };
  for (const k of keys) visit(k, new Set());
  return out;
}

// ── Read model ───────────────────────────────────────────────────────────────
export type EngineState = "fresh" | "stale" | "error" | "running" | "never" | "embedded";
export interface EngineHealth {
  key: string; label: string; category: string; deps: string[]; runnable: boolean; note?: string;
  state: EngineState; lastRunAt: string | null; durationMs: number | null; rowsProcessed: number | null;
  error: string | null; stalenessHours: number;
}
export interface SystemHealth {
  engines: EngineHealth[];
  freshnessScore: number; // 0..100
  counts: { fresh: number; stale: number; error: number; never: number; total: number };
  coverage: { transactions: number; neighborhoods: number; activeAreas: number };
  canManage: boolean;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const c = await requireManager();
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("engine_runs").select("engine_key,status,started_at,finished_at,duration_ms,rows_processed,error_message")
    .eq("organization_id", c.orgId).order("started_at", { ascending: false }).limit(800);
  const latest = new Map<string, DB["engine_runs"]["Row"]>();
  for (const r of (runs ?? []) as DB["engine_runs"]["Row"][]) if (!latest.has(r.engine_key)) latest.set(r.engine_key, r);

  const now = Date.now();
  const ordered = topoOrder(ENGINES.map((e) => e.key));
  const engines: EngineHealth[] = ordered.map((key) => {
    const def = BY_KEY.get(key)!;
    const run = latest.get(key);
    let state: EngineState;
    if (!def.run) state = "embedded";
    else if (!run) state = "never";
    else if (run.status === "running") state = "running";
    else if (run.status === "error") state = "error";
    else {
      const age = run.finished_at ? now - new Date(run.finished_at).getTime() : Infinity;
      state = age > def.stalenessHours * HOUR ? "stale" : "fresh";
    }
    return {
      key, label: def.label, category: def.category, deps: def.deps, runnable: !!def.run, note: def.note,
      state, lastRunAt: run?.finished_at ?? run?.started_at ?? null, durationMs: run?.duration_ms ?? null,
      rowsProcessed: run?.rows_processed ?? null, error: run?.error_message ?? null, stalenessHours: def.stalenessHours,
    };
  });

  const runnable = engines.filter((e) => e.runnable);
  const counts = {
    fresh: runnable.filter((e) => e.state === "fresh").length,
    stale: runnable.filter((e) => e.state === "stale").length,
    error: runnable.filter((e) => e.state === "error").length,
    never: runnable.filter((e) => e.state === "never").length,
    total: runnable.length,
  };
  const freshnessScore = runnable.length ? Math.round((counts.fresh / runnable.length) * 100) : 0;

  // Light coverage signals.
  const [txn, hoods, areas] = await Promise.all([
    supabase.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", c.orgId),
    supabase.from("israel_neighborhoods").select("id", { count: "exact", head: true }),
    supabase.from("user_operating_localities").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return {
    engines, freshnessScore, counts,
    coverage: { transactions: txn.count ?? 0, neighborhoods: hoods.count ?? 0, activeAreas: areas.count ?? 0 },
    canManage: true,
  };
}

// ── Recompute ────────────────────────────────────────────────────────────────
export interface RunResult { key: string; ok: boolean; rows: number; durationMs: number; error: string | null }

async function runOne(key: string, orgId: string, userId: string): Promise<RunResult> {
  const def = BY_KEY.get(key);
  if (!def?.run) return { key, ok: false, rows: 0, durationMs: 0, error: "engine not runnable" };
  const admin = createServiceRoleClient();
  const startedAt = new Date();
  const { data: row } = await admin.from("engine_runs").insert({
    organization_id: orgId, engine_key: key, status: "running", started_at: startedAt.toISOString(), triggered_by: userId,
  } as never).select("id").maybeSingle();
  const runId = row?.id as string | undefined;
  try {
    const res = await def.run();
    const durationMs = Date.now() - startedAt.getTime();
    if (runId) await admin.from("engine_runs").update({
      status: "success", finished_at: new Date().toISOString(), duration_ms: durationMs,
      rows_processed: res.rows, result_summary: res.summary as never,
    } as never).eq("id", runId);
    return { key, ok: true, rows: res.rows, durationMs, error: null };
  } catch (e) {
    const durationMs = Date.now() - startedAt.getTime();
    const error = e instanceof Error ? e.message : "recompute failed";
    if (runId) await admin.from("engine_runs").update({
      status: "error", finished_at: new Date().toISOString(), duration_ms: durationMs, error_message: error,
    } as never).eq("id", runId);
    return { key, ok: false, rows: 0, durationMs, error };
  }
}

/** Recompute a single engine (no dependencies). */
export async function recomputeEngine(key: string): Promise<RunResult> {
  const c = await requireManager();
  return runOne(key, c.orgId, c.userId);
}

/** Recompute an engine AND its upstream dependencies, in correct order. */
export async function recomputeWithDependencies(key: string): Promise<RunResult[]> {
  const c = await requireManager();
  const order = topoOrder([key]).filter((k) => BY_KEY.get(k)?.run);
  const out: RunResult[] = [];
  for (const k of order) out.push(await runOne(k, c.orgId, c.userId));
  return out;
}

/** Recompute every runnable engine in full dependency order. */
export async function recomputeAllEngines(): Promise<RunResult[]> {
  const c = await requireManager();
  const order = topoOrder(ENGINES.map((e) => e.key)).filter((k) => BY_KEY.get(k)?.run);
  const out: RunResult[] = [];
  for (const k of order) out.push(await runOne(k, c.orgId, c.userId));
  return out;
}
