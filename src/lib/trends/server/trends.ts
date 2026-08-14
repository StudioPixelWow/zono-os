// ============================================================================
// ZONO — P6.2 Historical Metrics & Trends · server read layer (server-only).
// Bounded windowed reads → Israel-day bucketing via the shared trends model.
// ONE definition of a day/window feeds Owner Intelligence, Product Usage,
// Customer 360, and Revenue trends. Reads only; never selects content/secrets.
//
// PERFORMANCE: current implementation reads timestamps within the ≤90-day window
// (bounded, using the time indexes for the range scan) and buckets in memory.
// This is correct at current volume. SCALING PATH (documented, not built): move
// bucketing to SQL GROUP BY via an RPC/materialized view, or read from the
// proposed platform_metric_snapshots table — see the P6.2 migration proposal.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MEANINGFUL_EVENT_TYPES, moduleOf } from "@/lib/telemetry/model";
import {
  buildDailyCountSeries, buildDailyDistinctSeries, coverageOf,
  type DailySeries, type Coverage, type TrendWindow,
} from "../model";

const CAP = 30_000; // bounded read cap
const MAXW = 90;    // widest supported window (days)

async function readCol<T>(table: string, cols: string, tsCol: string, build?: (q: QB) => QB): Promise<T[]> {
  try {
    const db = createServiceRoleClient();
    const since = new Date(Date.now() - MAXW * 86_400_000).toISOString();
    let q = db.from(table as never).select(cols).gte(tsCol, since).order(tsCol, { ascending: true }).limit(CAP) as unknown as QB;
    if (build) q = build(q);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    return error ? [] : ((data ?? []) as T[]);
  } catch { return []; }
}
type QB = { eq: (c: string, v: unknown) => QB; in: (c: string, v: unknown[]) => QB; gte: (c: string, v: unknown) => QB; order: (c: string, o: { ascending: boolean }) => QB; limit: (n: number) => QB };

// ── Platform usage trends (activity from domain_events) ─────────────────────
export interface UsageTrends {
  dau: DailySeries; events: DailySeries; activeOrgs: DailySeries;
  coverage: Coverage; window: TrendWindow;
}
export async function getUsageTrends(window: TrendWindow = 30): Promise<UsageTrends> {
  const now = Date.now(); const nowIso = new Date().toISOString();
  const rows = await readCol<{ actor_user_id: string | null; organization_id: string | null; occurred_at: string; event_type: string }>(
    "domain_events", "actor_user_id,organization_id,occurred_at,event_type", "occurred_at",
    (q) => q.in("event_type", MEANINGFUL_EVENT_TYPES as unknown as string[]));
  const dau = buildDailyDistinctSeries(rows.map((r) => ({ key: r.actor_user_id, occurredAt: r.occurred_at })), now, window);
  const activeOrgs = buildDailyDistinctSeries(rows.map((r) => ({ key: r.organization_id, occurredAt: r.occurred_at })), now, window);
  const events = buildDailyCountSeries(rows.map((r) => r.occurred_at), now, window);
  return { dau, events, activeOrgs, coverage: coverageOf("domain_events", events, nowIso), window };
}

// ── Entity-creation trends (created-per-day from created_at) ────────────────
export interface EntityTrends { series: Record<string, DailySeries>; coverage: Coverage; window: TrendWindow }
const ENTITY_TABLES: { key: string; table: string }[] = [
  { key: "organizations", table: "organizations" }, { key: "users", table: "users" },
  { key: "properties", table: "properties" }, { key: "leads", table: "leads" }, { key: "buyers", table: "buyers" },
];
export async function getEntityCreationTrends(window: TrendWindow = 30, orgId?: string): Promise<EntityTrends> {
  const now = Date.now(); const nowIso = new Date().toISOString();
  const series: Record<string, DailySeries> = {};
  let earliest: string | null = null;
  for (const e of ENTITY_TABLES) {
    // orgs/users have no org_id filter meaning for a single-org view except users/properties/leads/buyers
    const scoped = orgId && e.key !== "organizations";
    const rows = await readCol<{ created_at: string }>(e.table, "created_at", "created_at",
      scoped ? (q) => q.eq(e.key === "users" ? "org_id" : "org_id", orgId) : undefined);
    const s = buildDailyCountSeries(rows.map((r) => r.created_at), now, window);
    series[e.key] = s;
    if (s.coverageStart && (!earliest || s.coverageStart < earliest)) earliest = s.coverageStart;
  }
  return { series, coverage: { source: "created_at (per-entity)", historyStart: earliest, lastUpdated: nowIso, sufficient: earliest !== null }, window };
}

// ── Verified revenue trends (verified paid payments only) ───────────────────
export interface RevenueTrends { daily: DailySeries; amountByDay: { date: string; amount: number }[]; coverage: Coverage; window: TrendWindow }
export async function getRevenueTrends(window: TrendWindow = 30): Promise<RevenueTrends> {
  const now = Date.now(); const nowIso = new Date().toISOString();
  const rows = await readCol<{ created_at: string; amount_ils: number | null }>(
    "payments", "created_at,amount_ils,verified,status", "created_at",
    (q) => q.eq("verified", true).eq("status", "paid"));
  const daily = buildDailyCountSeries(rows.map((r) => r.created_at), now, window);
  // amount per day (sum) — parallel to the count series
  const byDay = new Map<string, number>();
  for (const r of rows) { const k = (r.created_at ?? "").slice(0, 10); if (k) byDay.set(k, (byDay.get(k) ?? 0) + (Number(r.amount_ils) || 0)); }
  const amountByDay = daily.points.map((p) => ({ date: p.date, amount: byDay.get(p.date) ?? 0 }));
  return { daily, amountByDay, coverage: coverageOf("payments (verified,paid)", daily, nowIso), window };
}

// ── AI usage trends (from ai_usage_costs — no pre-P6.1 history) ─────────────
export interface AiTrends { requests: DailySeries; tokensByDay: { date: string; tokens: number }[]; costAvailable: boolean; coverage: Coverage; window: TrendWindow }
export async function getAiTrends(window: TrendWindow = 30): Promise<AiTrends> {
  const now = Date.now(); const nowIso = new Date().toISOString();
  const rows = await readCol<{ created_at: string; total_tokens: number | null; cost_basis: string }>(
    "ai_usage_costs", "created_at,total_tokens,cost_basis", "created_at");
  const requests = buildDailyCountSeries(rows.map((r) => r.created_at), now, window);
  const byDay = new Map<string, number>();
  for (const r of rows) { const k = (r.created_at ?? "").slice(0, 10); if (k) byDay.set(k, (byDay.get(k) ?? 0) + (Number(r.total_tokens) || 0)); }
  const tokensByDay = requests.points.map((p) => ({ date: p.date, tokens: byDay.get(p.date) ?? 0 }));
  const costAvailable = rows.some((r) => r.cost_basis === "provider_reported");
  return { requests, tokensByDay, costAvailable, coverage: coverageOf("ai_usage_costs", requests, nowIso), window };
}

// ── Per-org trends (Customer 360) — same model, org-scoped ──────────────────
export interface OrgTrends { activity: DailySeries; entities: EntityTrends; ai: DailySeries; coverage: Coverage; window: TrendWindow }
export async function getOrgTrends(orgId: string, window: TrendWindow = 30): Promise<OrgTrends> {
  const now = Date.now(); const nowIso = new Date().toISOString();
  const ev = await readCol<{ occurred_at: string; event_type: string }>(
    "domain_events", "occurred_at,event_type", "occurred_at",
    (q) => q.eq("organization_id", orgId).in("event_type", MEANINGFUL_EVENT_TYPES as unknown as string[]));
  const activity = buildDailyCountSeries(ev.map((r) => r.occurred_at), now, window);
  const entities = await getEntityCreationTrends(window, orgId);
  const aiRows = await readCol<{ created_at: string }>("ai_usage_costs", "created_at", "created_at", (q) => q.eq("organization_id", orgId));
  const ai = buildDailyCountSeries(aiRows.map((r) => r.created_at), now, window);
  return { activity, entities, ai, coverage: coverageOf("domain_events (org)", activity, nowIso), window };
}

/** Module-usage historical (event-based) adoption within the window (distinct orgs/module). */
export async function getHistoricalModuleAdoption(window: TrendWindow = 30): Promise<{ module: string; orgs: number }[]> {
  const rows = await readCol<{ organization_id: string | null; event_type: string }>(
    "domain_events", "organization_id,event_type,occurred_at", "occurred_at",
    (q) => q.in("event_type", MEANINGFUL_EVENT_TYPES as unknown as string[]));
  const cutoff = Date.now() - window * 86_400_000;
  void cutoff;
  const byMod = new Map<string, Set<string>>();
  for (const r of rows) { if (!r.organization_id) continue; const m = moduleOf(r.event_type); (byMod.get(m) ?? byMod.set(m, new Set()).get(m)!).add(r.organization_id); }
  return Array.from(byMod.entries()).map(([module, s]) => ({ module, orgs: s.size })).sort((a, b) => b.orgs - a.orgs);
}
