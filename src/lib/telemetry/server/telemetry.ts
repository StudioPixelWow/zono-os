// ============================================================================
// ZONO — P6.0 Product Telemetry · server read layer (server-only).
// Bounded, honest aggregates over the CANONICAL source `domain_events`. The
// single read layer behind Platform Usage, Customer 360 usage, and Owner
// Intelligence activity — so all three share one definition (src/lib/telemetry/
// model.ts). Pattern mirrors the P5.10 intel DAL: BOUNDED windowed reads →
// grouped-in-memory → pure model → DTO.
//
// HARD RULES:
//   · Reads only. NEVER selects secret/token columns or message content
//     (domain_events.payload/metadata are not read into these DTOs).
//   · NO N+1: one bounded windowed read, tallied in memory.
//   · Org identity for the per-org call is bound with .eq("organization_id") —
//     platform read context (service-role), never trusts a client org id.
//   · Meaningful-activity filter + DAU/WAU/MAU boundaries come from the pure
//     model, never redefined here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  MEANINGFUL_EVENT_TYPES, TELEMETRY_MODULES, moduleLabel,
  computeActiveCounts, moduleUsage, moduleOf, actionOf, isMeaningfulEvent,
  type MeaningfulEvent, type ActiveCounts,
} from "../model";

const WINDOW = 30_000;        // bounded read cap (rows)
const RETENTION_DAYS = 35;    // read horizon covering the MAU window + margin

type Row = { organization_id: string | null; actor_user_id: string | null; event_type: string; occurred_at: string };

/** One bounded read of recent meaningful events. Optionally org-scoped. */
async function readRecentEvents(orgId?: string): Promise<Row[]> {
  try {
    const db = createServiceRoleClient();
    const sinceIso = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    let q = db
      .from("domain_events" as never)
      .select("organization_id,actor_user_id,event_type,occurred_at")
      .gte("occurred_at", sinceIso)
      .in("event_type", MEANINGFUL_EVENT_TYPES as unknown as string[])
      .order("occurred_at", { ascending: false })
      .limit(WINDOW) as unknown as Promise<{ data: unknown; error: unknown }> & {
        eq: (c: string, v: unknown) => typeof q;
      };
    if (orgId) q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq("organization_id", orgId);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    return error ? [] : ((data ?? []) as Row[]);
  } catch {
    return [];
  }
}

// ── Platform-wide usage telemetry (Platform Usage surface) ──────────────────
export interface ModuleUsageRow { key: string; label: string; events7d: number; events30d: number }
export interface UsageTelemetry {
  hasData: boolean;
  counts: ActiveCounts;
  modules: ModuleUsageRow[];
  windowRows: number;         // how many event rows the window read returned (bounded)
  oldestInWindow: string | null;
  newestInWindow: string | null;
  generatedAt: string;
  source: string;
}

export async function getUsageTelemetry(): Promise<UsageTelemetry> {
  const nowMs = Date.now();
  const rows = await readRecentEvents();
  const events: MeaningfulEvent[] = rows;
  const counts = computeActiveCounts(events, nowMs);
  const u7 = moduleUsage(events, nowMs, 7);
  const u30 = moduleUsage(events, nowMs, 30);
  const modules: ModuleUsageRow[] = TELEMETRY_MODULES
    .map((m) => ({ key: m, label: moduleLabel(m), events7d: u7.get(m) ?? 0, events30d: u30.get(m) ?? 0 }))
    .filter((r) => r.events30d > 0)
    .sort((a, b) => b.events30d - a.events30d);
  const times = rows.map((r) => r.occurred_at).filter(Boolean).sort();
  return {
    hasData: rows.length > 0,
    counts, modules,
    windowRows: rows.length,
    oldestInWindow: times[0] ?? null,
    newestInWindow: times[times.length - 1] ?? null,
    generatedAt: new Date().toISOString(),
    source: "domain_events (טלמטריית מוצר קנונית · חלון 30 יום)",
  };
}

// ── Per-organization usage telemetry (Customer 360 usage tab) ───────────────
export interface OrgUsageEventRow { eventType: string; module: string; action: string; occurredAt: string }
export interface OrgUsageTelemetry {
  hasData: boolean;
  lastMeaningfulActivity: string | null;
  activeUsers30d: number;
  events7d: number;
  events30d: number;
  modulesUsed: { key: string; label: string; events30d: number }[];
  modulesNotUsed: { key: string; label: string }[];
  recentEvents: OrgUsageEventRow[];   // metadata-free: name + timestamp only
  generatedAt: string;
  source: string;
}

export async function getOrgUsageTelemetry(orgId: string): Promise<OrgUsageTelemetry> {
  const nowMs = Date.now();
  const rows = await readRecentEvents(orgId);
  const events: MeaningfulEvent[] = rows;
  const counts = computeActiveCounts(events, nowMs);
  const u30 = moduleUsage(events, nowMs, 30);
  const usedKeys = new Set(u30.keys());
  const modulesUsed = TELEMETRY_MODULES
    .filter((m) => usedKeys.has(m))
    .map((m) => ({ key: m, label: moduleLabel(m), events30d: u30.get(m) ?? 0 }))
    .sort((a, b) => b.events30d - a.events30d);
  const modulesNotUsed = TELEMETRY_MODULES
    .filter((m) => !usedKeys.has(m))
    .map((m) => ({ key: m, label: moduleLabel(m) }));
  // recent meaningful events — name + time ONLY (never payload/metadata/content)
  const recentEvents: OrgUsageEventRow[] = rows
    .filter((r) => isMeaningfulEvent(r.event_type))
    .slice(0, 15)
    .map((r) => ({ eventType: r.event_type, module: moduleOf(r.event_type), action: actionOf(r.event_type), occurredAt: r.occurred_at }));
  const last = rows.map((r) => r.occurred_at).filter(Boolean).sort();
  return {
    hasData: rows.length > 0,
    lastMeaningfulActivity: last[last.length - 1] ?? null,
    activeUsers30d: counts.mau,
    events7d: counts.events7d,
    events30d: counts.events30d,
    modulesUsed, modulesNotUsed, recentEvents,
    generatedAt: new Date().toISOString(),
    source: "domain_events (טלמטריית מוצר קנונית)",
  };
}
