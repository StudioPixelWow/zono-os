// ============================================================================
// 🧭 ZONO — Journey Center derivation (pure). Maps the EXISTING digital twins
// (buyer/seller/lead) and listing scorecards into the unified journey shape.
// Stages are derived from REAL signals only (behaviour counts, lead.stage,
// property.status) using ZONO's existing stage vocabulary. Next action / risk /
// priority come from the twins' own decisions — no new recommendation engine.
// ============================================================================
import type { BuyerTwin } from "@/lib/digital-twin/buyers/types";
import type { SellerTwin } from "@/lib/digital-twin/sellers/types";
import type { LeadTwin } from "@/lib/digital-twin/leads/types";
import type { PropertyScorecard } from "@/lib/listing-agent/types";
import type { TwinDecisionSignal } from "@/lib/digital-twin/types";
import { STAGE_LABELS, STAGE_ORDER, type JourneyEntityType, type JourneyFlag, type JourneyKpis, type JourneyLinked, type UnifiedJourney } from "./types";

/** Explicit per-stage progress (avoids "off-track last stage = 100%" pitfalls). */
const PROGRESS: Record<JourneyEntityType, Record<string, number>> = {
  buyer: { new: 8, qualification: 25, matching: 45, viewing: 65, negotiation: 85, deal: 100, inactive: 15 },
  seller: { new: 8, valuation: 25, pricing: 40, signing: 60, marketing: 75, negotiation: 88, deal: 100, churn_risk: 20 },
  lead: { new: 10, contacted: 30, qualified: 55, nurturing: 45, converted: 100, lost: 0, disqualified: 0 },
  property: { draft: 8, preparation: 22, ready: 38, marketed: 55, active: 60, under_offer: 80, negotiation: 88, sold: 100, stale: 20 },
  // Deals have no DERIVED model — they only ever existed canonically, so this
  // fallback table has nothing to say about them. Progress comes from the machine.
  deal: {},
};
const TERMINAL_GOOD = new Set(["deal", "converted", "sold"]);
const TERMINAL_BAD = new Set(["lost", "disqualified"]);
const OFF_TRACK = new Set(["inactive", "churn_risk", "stale"]);

export interface JourneyExtras { openTasks: number; upcomingMeetingAt: string | null; linked?: JourneyLinked[] }

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const daysSince = (iso: string | null, nowMs: number): number | null => (iso ? Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 86_400_000)) : null);

function topDecision(decisions: TwinDecisionSignal[]): { action: string | null; reason: string | null; priority: number; ready: boolean } {
  const d = [...decisions].sort((a, b) => b.priority - a.priority)[0];
  return d ? { action: d.action, reason: d.reason, priority: d.priority, ready: d.readiness === "ready" } : { action: null, reason: null, priority: 0, ready: false };
}

function assemble(
  entityType: JourneyEntityType, entityId: string, entityName: string, stage: string,
  opts: { healthScore: number; healthLabel: string; risk: number; priorityHint: number; lastActivityAt: string | null; next: { action: string | null; reason: string | null; ready: boolean }; evidence: string[]; extras: JourneyExtras; nowMs: number },
): UnifiedJourney {
  const order = STAGE_ORDER[entityType];
  const stageIndex = Math.max(0, order.indexOf(stage));
  const stageLabel = STAGE_LABELS[entityType][stage] ?? stage;
  const progress = PROGRESS[entityType][stage] ?? clamp((stageIndex / Math.max(1, order.length - 1)) * 100);
  const dsa = daysSince(opts.lastActivityAt, opts.nowMs);
  const closed = TERMINAL_GOOD.has(stage) || TERMINAL_BAD.has(stage);

  const flags: JourneyFlag[] = [];
  const atRisk = opts.risk >= 60 || OFF_TRACK.has(stage) || opts.healthLabel === "בסיכון" || opts.healthLabel === "קריטי";
  if (closed) flags.push("closed");
  if (atRisk && !closed) flags.push("at_risk");
  if (dsa != null && dsa >= 14 && !closed) flags.push("no_activity");
  if (!closed && (opts.next.ready || opts.extras.openTasks > 0)) flags.push("waiting");
  if (!closed && dsa != null && dsa <= 3) flags.push("advancing");
  if (!closed && flags.length === 0) flags.push("active");
  if (!closed && !flags.includes("active") && !atRisk) flags.push("active");

  const priority = clamp(Math.max(opts.priorityHint, atRisk ? 65 : 0, opts.next.ready ? 55 : 0, opts.extras.openTasks > 0 ? 40 : 0));

  return {
    journeyId: `${entityType}:${entityId}`, entityType, entityId, entityName,
    href: `/${entityType === "buyer" ? "buyers" : entityType === "seller" ? "sellers" : entityType === "lead" ? "leads" : "properties"}/${entityId}`,
    currentStage: stage, stageLabel, stageIndex, stageTotal: order.length, progress,
    healthScore: clamp(opts.healthScore), healthLabel: opts.healthLabel, risk: clamp(opts.risk), priority,
    flags, lastActivityAt: opts.lastActivityAt, daysSinceActivity: dsa,
    nextAction: opts.next.action, nextActionReason: opts.next.reason,
    openTasks: opts.extras.openTasks, upcomingMeetingAt: opts.extras.upcomingMeetingAt,
    linked: opts.extras.linked ?? [], evidence: opts.evidence.slice(0, 4),
  };
}

// ── Buyer ─────────────────────────────────────────────────────────────────────
export function fromBuyerTwin(t: BuyerTwin, extras: JourneyExtras, nowMs: number): UnifiedJourney {
  const p = t.profile, b = p.behavior;
  const stage =
    b.offers > 0 ? "negotiation" :
    b.visits > 0 || b.meetings > 0 ? "viewing" :
    b.saves > 0 || b.views >= 3 ? "matching" :
    p.readiness >= 50 || p.completeness >= 60 ? "qualification" : "new";
  const dec = topDecision(t.decisions);
  const ev = [`מוכנות ${clamp(p.readiness)}`, `סבירות רכישה ${clamp(p.probabilityToBuy)}%`, ...(dec.reason ? [dec.reason] : [])];
  return assemble("buyer", t.identity.id, t.identity.name, stage, {
    healthScore: t.health.score, healthLabel: t.health.label, risk: p.risk, priorityHint: dec.priority,
    lastActivityAt: t.memory.lastActivityAt, next: dec, evidence: ev, extras, nowMs,
  });
}

// ── Seller ────────────────────────────────────────────────────────────────────
export function fromSellerTwin(t: SellerTwin, extras: JourneyExtras, nowMs: number): UnifiedJourney {
  const p = t.profile, b = p.behavior;
  const stage =
    b.agreements > 0 ? "marketing" :
    b.valuationsSent > 0 && b.priceDiscussions > 0 ? "pricing" :
    b.valuationsSent > 0 || b.meetings > 0 ? "valuation" : "new";
  const churn = p.churnRisk >= 60;
  const finalStage = churn && b.agreements === 0 ? "churn_risk" : stage;
  const dec = topDecision(t.decisions);
  const next = { action: dec.action ?? p.nextBestAction ?? null, reason: dec.reason ?? null, ready: dec.ready };
  const ev = [`מוכנות לחתימה ${clamp(p.readinessToSign)}`, ...(p.priceGapPct != null ? [`פער מחיר ${Math.round(p.priceGapPct)}%`] : []), ...(dec.reason ? [dec.reason] : [])];
  return assemble("seller", t.identity.id, t.identity.name, finalStage, {
    healthScore: t.health.score, healthLabel: t.health.label, risk: p.churnRisk, priorityHint: dec.priority,
    lastActivityAt: t.memory.lastActivityAt, next, evidence: ev, extras, nowMs,
  });
}

// ── Lead ──────────────────────────────────────────────────────────────────────
export function fromLeadTwin(t: LeadTwin, extras: JourneyExtras, nowMs: number): UnifiedJourney {
  const p = t.profile;
  const key = String(p.stage || "").toLowerCase();
  const stage = STAGE_ORDER.lead.includes(key) ? key : "new";
  const dec = topDecision(t.decisions);
  const next = { action: dec.action ?? p.nextBestAction ?? null, reason: dec.reason ?? null, ready: dec.ready };
  const risk = clamp(100 - p.conversionProbability);
  const ev = [`מקור: ${p.source ?? "לא ידוע"}`, `סבירות המרה ${clamp(p.conversionProbability)}%`, ...(dec.reason ? [dec.reason] : [])];
  return assemble("lead", t.identity.id, t.identity.name, stage, {
    healthScore: t.health.score, healthLabel: t.health.label, risk, priorityHint: dec.priority,
    lastActivityAt: t.memory.lastActivityAt, next, evidence: ev, extras, nowMs,
  });
}

// ── Property ──────────────────────────────────────────────────────────────────
const PROP_STATUS_STAGE: Record<string, string> = {
  draft: "draft", ready: "ready", published: "marketed", active: "active",
  under_offer: "under_offer", in_contract: "negotiation", sold: "sold", rented: "sold",
  withdrawn: "stale", archived: "stale", paused: "stale",
};
export function fromScorecard(s: PropertyScorecard, extras: JourneyExtras, nowMs: number): UnifiedJourney {
  const stage = PROP_STATUS_STAGE[s.status] ?? "active";
  const label = s.health?.label ?? "";
  const risk = label === "קריטי" ? 85 : label === "בסיכון" ? 65 : (s.risks?.length ?? 0) > 1 ? 55 : 20;
  const rec = s.recommendations?.[0];
  const lastAt = s.timeline?.[0]?.at ?? null;
  const ev = [...(s.classification ?? []).slice(0, 2), ...(s.opportunities ?? []).slice(0, 1).map((o) => o.title)].filter(Boolean) as string[];
  return assemble("property", s.id, s.title, stage, {
    healthScore: s.health?.listingHealth ?? 50, healthLabel: label, risk,
    priorityHint: rec ? (rec.priority ?? 40) : 0,
    lastActivityAt: lastAt, next: { action: rec?.action ?? null, reason: rec?.reason ?? null, ready: false }, evidence: ev, extras, nowMs,
  });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
export function computeKpis(journeys: UnifiedJourney[]): JourneyKpis {
  const has = (j: UnifiedJourney, f: JourneyFlag) => j.flags.includes(f);
  return {
    active: journeys.filter((j) => !has(j, "closed")).length,
    atRisk: journeys.filter((j) => has(j, "at_risk")).length,
    waiting: journeys.filter((j) => has(j, "waiting")).length,
    advancing: journeys.filter((j) => has(j, "advancing")).length,
    noActivity: journeys.filter((j) => has(j, "no_activity")).length,
    upcomingMeetings: journeys.filter((j) => !!j.upcomingMeetingAt).length,
  };
}
