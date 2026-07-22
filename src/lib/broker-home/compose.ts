// ============================================================================
// 👤 ZONO OS 2.0 — STAGE 6 · Batch 6.1 · BROKER WORKSPACE — compose (PURE).
//
// The ONLY logic the workspace adds — and none of it is business logic:
//   · ownedEntityIds / brokerPriorities: FILTER the canonical Broker
//     Intelligence queue to the broker's OWN entities (isolation). Filtering by
//     ownership is NOT reprioritization — order and priority are preserved
//     verbatim.
//   · buildBrokerMorningBrief: STITCHES already-fetched broker-scoped facts
//     into brief lines. No AI generation, no conclusions, no new numbers.
//   · brokerCoverage: surfaces the broker's inherited canonical-vs-fallback
//     record counts (the standing evidence-coverage ratio) — never a new score.
// Deterministic and side-effect free — safe to unit test offline.
// ============================================================================
import type { DailyOS, DailyAction } from "@/lib/daily-os/types";
import type { ScoredEntity } from "@/lib/broker-workspace/types";
import type { JourneyCenter } from "@/lib/journey-center/types";
import type { BrokerBriefPoint, BrokerCoverage, BrokerMorningBrief } from "./types";

/** The ids of the entities this broker OWNS, as surfaced by the broker-scoped
 *  Daily OS deals slice. Used to keep only the broker's own queue items. */
export function ownedEntityIds(os: DailyOS): Set<string> {
  const d = os.deals;
  const ids = [...d.hotBuyers, ...d.sellersAtRisk, ...d.criticalListings, ...d.leadFollowUps].map((e) => e.id);
  return new Set(ids);
}

/**
 * Today's Priorities = the canonical Broker Intelligence queue (Daily OS's
 * actionFeed) FILTERED to the broker's own entities, in the queue's own order.
 * Filtering by ownership only ever REMOVES other brokers' items — it can never
 * add or reorder, so priority/confidence stay verbatim and isolation holds.
 */
export function brokerPriorities(os: DailyOS): DailyAction[] {
  const owned = ownedEntityIds(os);
  return os.actionFeed.filter((a) => owned.has(a.entityId));
}

/** The broker's own entities with real recent activity, newest first. Inherited
 *  lastActivityAt only — no new event synthesis (the org-wide "since you were
 *  away" ledger is deliberately NOT used, to preserve broker isolation). */
export function recentActivity(os: DailyOS, limit = 6): ScoredEntity[] {
  const d = os.deals;
  return [...d.hotBuyers, ...d.sellersAtRisk, ...d.criticalListings, ...d.leadFollowUps]
    .filter((e) => !!e.lastActivityAt)
    .sort((a, b) => (a.lastActivityAt! < b.lastActivityAt! ? 1 : a.lastActivityAt! > b.lastActivityAt! ? -1 : 0))
    .slice(0, limit);
}

/** Broker journey coverage — inherited canonical/fallback record counts. */
export function brokerCoverage(journey: JourneyCenter | null): BrokerCoverage | null {
  if (!journey) return null;
  const canonicalRecords = journey.kpis.canonicalRecords ?? 0;
  const fallbackRecords = journey.kpis.fallbackRecords ?? 0;
  const total = canonicalRecords + fallbackRecords;
  // The standing definition of evidence coverage (canonical share of records) —
  // a display of two inherited counts, not a new KPI or confidence.
  const value = total > 0 ? Math.round((canonicalRecords / total) * 100) : null;
  return { canonicalRecords, fallbackRecords, total, value };
}

/**
 * The broker Morning Brief — composed ONLY from already-fetched broker-scoped
 * facts (Daily OS briefing summary · the broker's top queue priority · the
 * broker's own journey counts). Every `text` is a verbatim upstream string or a
 * factual count — never a generated conclusion.
 */
export function buildBrokerMorningBrief(
  os: DailyOS | null,
  journey: JourneyCenter | null,
  scopedPriorities: DailyAction[],
): BrokerMorningBrief {
  const points: BrokerBriefPoint[] = [];

  // 1) Daily OS — the broker's own briefing summary line, verbatim.
  if (os?.briefing?.aiSummary) {
    points.push({ source: "daily", label: "הבוקר שלך", text: os.briefing.aiSummary, href: null });
  }

  // 2) Broker Intelligence — the broker's top queue priority, title verbatim.
  const top = scopedPriorities[0];
  if (top) {
    points.push({ source: "priorities", label: "המשימה הראשונה בתור שלך", text: top.title, href: top.href });
  }

  // 3) Journey — the broker's own journey counts (factual, inherited numbers).
  if (journey) {
    const k = journey.kpis;
    points.push({
      source: "journey",
      label: "המסעות שלך",
      text: `${k.active} מסעות פעילים · ${k.waiting} ממתינים לך · ${k.stalled ?? 0} תקועים`,
      href: "/journeys",
    });
  }

  return { points, empty: points.length === 0 };
}
