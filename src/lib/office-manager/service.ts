// ============================================================================
// 🏢 ZONO — Office AI Manager — service (server-only). PHASE 55.0.
// Composes the manager command center from EXISTING engines — never recomputing:
//   • Calendar team availability (workload state, today events, vacation)
//   • Executive OS (per-broker score/label, approval center, losing-money signals)
//   • CRM ownership counts (buyers/sellers/leads by owner) — real load per broker
//   • Daily OS (team follow-up rate)
// Read-only; org-scoped via RLS; compute-cache. Nothing is auto-assigned.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTeamAvailability } from "@/lib/calendar-os/service";
import { getExecutiveOS } from "@/lib/executive-os/service";
import { getDailyOS } from "@/lib/daily-os/service";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import type { Json } from "@/lib/supabase/types";
import { composeOfficeManager } from "./compose";
import { OFFICE_MANAGER_VERSION } from "./types";
import type { OfficeManagerReport, BrokerInput, AvailabilityState } from "./types";

const AVAIL = new Set<AvailabilityState>(["free", "busy", "meeting", "field", "vacation", "offline"]);
const asState = (s: string | null | undefined): AvailabilityState => (s && AVAIL.has(s as AvailabilityState) ? (s as AvailabilityState) : "offline");

type OwnerRow = { owner_id: string | null; stage?: string | null };
const OPEN_LEAD_STAGES = new Set(["new", "contacted", "qualified", "nurturing"]);

async function countByOwner(): Promise<{ buyers: Map<string, number>; sellers: Map<string, number>; leads: Map<string, number> }> {
  const supabase = await createClient();
  const [b, s, l] = await Promise.all([
    supabase.from("buyers").select("owner_id").limit(3000),
    supabase.from("sellers").select("owner_id").limit(3000),
    supabase.from("leads").select("owner_id,stage").limit(4000),
  ]);
  const tally = (rows: unknown, open = false) => {
    const m = new Map<string, number>();
    for (const r of (rows ?? []) as OwnerRow[]) {
      if (!r.owner_id) continue;
      if (open && r.stage && !OPEN_LEAD_STAGES.has(r.stage)) continue;
      m.set(r.owner_id, (m.get(r.owner_id) ?? 0) + 1);
    }
    return m;
  };
  return { buyers: tally(b.data), sellers: tally(s.data), leads: tally(l.data, true) };
}

/** Compose the Office AI Manager report (cached). */
export async function getOfficeManager(): Promise<OfficeManagerReport> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;
  if (orgId) {
    const hit = await getCache<OfficeManagerReport>(orgId, "office_manager_report", []).catch(() => null);
    if (hit) return hit.value;
  }

  const [team, exec, daily, owners] = await Promise.all([
    getTeamAvailability().catch(() => []),
    getExecutiveOS().catch(() => null),
    getDailyOS().catch(() => null),
    countByOwner().catch(() => ({ buyers: new Map(), sellers: new Map(), leads: new Map() })),
  ]);

  const compareById = new Map((exec?.brokerComparison ?? []).map((r) => [r.brokerId, r]));

  const brokers: BrokerInput[] = (team ?? []).map((t) => {
    const cmp = compareById.get(t.brokerId);
    return {
      id: t.brokerId, name: t.name ?? cmp?.name ?? "סוכן",
      score: cmp?.score ?? null, scoreLabel: cmp?.label ?? null, note: cmp?.note ?? null,
      state: asState(t.state), todayEvents: t.todayEvents ?? 0, nextFreeAt: t.nextFreeAt ?? null,
      activeBuyers: owners.buyers.get(t.brokerId) ?? 0, activeSellers: owners.sellers.get(t.brokerId) ?? 0, openLeads: owners.leads.get(t.brokerId) ?? 0,
      sellersAtRisk: 0, hotBuyers: 0,   // per-broker deal-risk attribution not yet available (see limitations)
      lastActiveAt: t.nextFreeAt ?? null,
    };
  });

  const losingMoney = (exec?.risks ?? []).slice(0, 5).map((r) => r.title)
    .concat((daily?.performance?.weakSpots ?? []).map((w) => w.title))
    .filter(Boolean).slice(0, 5);

  const report = composeOfficeManager({
    brokers,
    teamFollowUpRatePct: daily?.performance?.followUpRatePct ?? null,
    losingMoney,
    orgScore: exec?.score?.overall ?? null,
    approvals: {
      count: exec?.approvalCenter?.count ?? 0,
      bundles: (exec?.approvalCenter?.bundles ?? []).map((x) => ({ title: x.title, priority: x.priority, href: x.entityHref })),
    },
    generatedAt: new Date().toISOString(),
  });

  if (orgId) await setCache(orgId, "office_manager_report", [], report as unknown as Json, { ttlSeconds: 300, version: OFFICE_MANAGER_VERSION }).catch(() => {});
  return report;
}
