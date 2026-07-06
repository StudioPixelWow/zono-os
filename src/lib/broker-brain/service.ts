// ============================================================================
// 🧠 ZONO — AI Broker Brain — service (server-only). PHASE 50.0.
// Classifies the broker's strategic goal, gathers a MINIMAL context from the
// EXISTING engines (Chief-of-Staff, Daily OS, Territory OS, Calendar OS) — never
// recomputing — and composes an evidence-backed plan. It then resolves approval-
// gated action bundles from the EXISTING Approval Bundle Engine (44.0). Nothing
// auto-executes: every action requires explicit approval.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getDailyOS } from "@/lib/daily-os/service";
import { getTerritoryOS } from "@/lib/territory-os/service";
import { getDayPlan } from "@/lib/calendar-os/service";
import { buildBundleForEvent } from "@/lib/approval-bundle/service";
import type { BundleEntityType, BundleEventType } from "@/lib/approval-bundle/types";
import { classifyGoal } from "./router";
import { assembleBrokerPlan } from "./planner";
import type { BrokerBrainContext, BrokerPlan, CtxEntity, CtxRec, Impact, ResolvedBundle } from "./types";

// ── Engine → normalized-context mappers (defensive; degrade gracefully) ───────
type ScoredLike = { kind: string; id: string; name: string; score: number | null; reason: string | null; riskLabel: string | null; href: string };
const KINDS = new Set(["buyer", "seller", "lead", "property"]);
function mapEntities(list: unknown): CtxEntity[] {
  if (!Array.isArray(list)) return [];
  return (list as ScoredLike[])
    .filter((e) => e && KINDS.has(e.kind))
    .map((e) => ({ kind: e.kind as CtxEntity["kind"], id: String(e.id), name: e.name ?? "—", score: e.score ?? null, reason: e.reason ?? null, riskLabel: e.riskLabel ?? null, href: e.href ?? "#" }));
}
type RecLike = { id?: string; title: string; why: string; evidence: string[]; confidence?: number; businessImpact?: Impact; impact?: Impact; urgency?: number; sourceModule?: string };
function mapRecs(list: unknown, source: string): CtxRec[] {
  if (!Array.isArray(list)) return [];
  return (list as RecLike[]).map((r, i) => ({
    id: r.id ?? `${source}:${i}`, title: r.title, why: r.why, evidence: Array.isArray(r.evidence) ? r.evidence : [],
    confidence: r.confidence ?? 65, impact: (r.businessImpact ?? r.impact ?? "medium"), urgency: r.urgency ?? 60, source: r.sourceModule ?? source,
  }));
}

async function buildContext(intent: string, city: string | null): Promise<BrokerBrainContext> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);

  // Minimal context planner: pull only what the intent needs.
  const wantTerritory = intent === "territory_domination" || intent === "exclusive_listings";
  const wantCalendar = intent === "free_time" || intent === "close_deal" || intent === "general";

  const [chief, daily, territory, dayPlan] = await Promise.all([
    getChiefOfStaff(orgId).catch(() => null),
    getDailyOS().catch(() => null),
    wantTerritory ? getTerritoryOS(city ?? undefined).catch(() => null) : Promise.resolve(null),
    wantCalendar ? getDayPlan(today).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    orgScore: chief?.organizationScore?.overall ?? null,
    hotBuyers: mapEntities(daily?.deals?.hotBuyers),
    sellersAtRisk: mapEntities(daily?.deals?.sellersAtRisk),
    staleListings: mapEntities(daily?.deals?.criticalListings),
    leadFollowUps: mapEntities(daily?.deals?.leadFollowUps),
    priorities: mapRecs(chief?.briefing?.todaysPriorities, "chief"),
    risks: mapRecs(chief?.recommendations?.topRisks, "chief"),
    opportunities: mapRecs(chief?.recommendations?.topOpportunities, "chief"),
    territory: territory
      ? {
          city: territory.city ?? city ?? null,
          score: territory.score?.overall ?? null,
          band: territory.score?.band ?? null,
          acquisition: (territory.acquisitionPlan ?? []).map((a) => ({ kind: a.kind, label: a.label, city: a.city, score: a.score, priority: a.priority as Impact, why: a.why, evidence: a.evidence ?? [], href: a.ctaHref, ctaLabel: a.ctaLabel })),
          recommendations: (territory.recommendations ?? []).map((r, i) => ({ id: `terr:${i}`, title: r.title, why: r.why, evidence: r.evidence ?? [], confidence: 70, impact: r.impact as Impact, urgency: 60, source: "territory" })),
        }
      : null,
    calendar: dayPlan
      ? {
          date: dayPlan.date,
          freeAfter: dayPlan.summary?.freeAfter ?? null,
          overdue: dayPlan.summary?.overdue ?? 0,
          slots: (dayPlan.slots ?? []).slice(0, 6).map((s) => ({ title: s.event?.title ?? "משימה", when: s.suggestedStart, reason: s.reason })),
        }
      : null,
    marketing: daily?.marketing
      ? { scheduledToday: daily.marketing.scheduledToday, commentsWaiting: daily.marketing.commentsWaiting, leadApprovals: daily.marketing.leadApprovals, groupsToPublish: daily.marketing.groupsToPublish }
      : null,
  };
}

/** Compose the AI Broker Brain plan for a strategic goal (approval-gated actions resolved). */
export async function getBrokerBrainPlan(goalText: string): Promise<BrokerPlan> {
  const goal = classifyGoal(goalText);
  const ctx = await buildContext(goal.intent, goal.city);
  const plan = assembleBrokerPlan(goal, ctx);
  plan.generatedAt = new Date().toISOString();

  // Resolve approval bundles for the top executable actions (reuse 44.0). Bounded.
  const executable = plan.actions.filter((a) => a.bundleRequest).slice(0, 5);
  await Promise.all(
    executable.map(async (a) => {
      try {
        const b = await buildBundleForEvent(a.bundleRequest!.eventType as BundleEventType, a.bundleRequest!.entityType as BundleEntityType, a.bundleRequest!.entityId);
        const resolved: ResolvedBundle = {
          bundleId: b.bundleId, title: b.title, priority: b.priority, status: b.status,
          actions: b.actions.map((x) => ({ type: x.type, label: x.label, requiresApproval: x.requiresApproval, canExecute: x.canExecute, reason: x.reason })),
        };
        a.bundle = resolved;
      } catch {
        a.canExecute = false; // couldn't resolve a bundle → downgrade to suggestion
      }
    }),
  );
  return plan;
}
