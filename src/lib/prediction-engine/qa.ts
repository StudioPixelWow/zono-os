// ============================================================================
// 🔮 ZONO — Prediction Engine — offline self-check (pure). PHASE 52.0.
// Spec QA: high data, low data, no data, conflicting signals, stale signals,
// prediction improves action, prediction does not auto-execute. Runs with tsx.
// ============================================================================
import { forecast, summarizePredictions } from "./forecast";
import type { PredictionSignals, SignalEntity } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

const ent = (kind: string, id: string, name: string, score: number | null, lastDays = 1): SignalEntity =>
  ({ kind, id, name, score, reason: "אות מהמנוע", riskLabel: kind === "seller" ? "churn risk" : null, href: `/${kind}/${id}`, lastActivityAt: daysAgo(lastDays) });

const EMPTY: PredictionSignals = {
  sellersAtRisk: [], hotBuyers: [], staleListings: [], leadFollowUps: [],
  performance: null, conversation: null, marketing: null, territory: null, orgScore: null, orgRiskCount: 0,
};
function sig(over: Partial<PredictionSignals> = {}): PredictionSignals { return { ...EMPTY, ...over }; }

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const byKind = (preds: ReturnType<typeof forecast>, k: string) => preds.find((p) => p.kind === k)!;

  // 1. High data → high sufficiency + real probability.
  const hi = forecast(sig({ sellersAtRisk: [ent("seller", "s1", "יוסי", 80), ent("seller", "s2", "רון", 72)] }), NOW);
  const churn = byKind(hi, "seller_churn");
  add("high data: seller_churn sufficiency high + probability", churn.dataSufficiency === "high" && churn.probability != null);

  // 2. Low data → sufficiency low (subjects without scores).
  const lo = forecast(sig({ sellersAtRisk: [ent("seller", "s1", "יוסי", null)] }), NOW);
  add("low data: sufficiency low", byKind(lo, "seller_churn").dataSufficiency === "low");

  // 3. No data → all 9 insufficient, null probability, confidence capped low.
  const none = forecast(EMPTY, NOW);
  add("no data: 9 predictions returned", none.length === 9);
  add("no data: all null probability + none sufficiency", none.every((p) => p.probability === null && p.dataSufficiency === "none" && p.confidence <= 20));

  // 4. Conflicting signals → churn AND buyer_close both surfaced (not merged).
  const conf = forecast(sig({ sellersAtRisk: [ent("seller", "s1", "יוסי", 85)], hotBuyers: [ent("buyer", "b1", "דנה", 88)] }), NOW);
  add("conflicting: churn + buyer_close both real", byKind(conf, "seller_churn").probability != null && byKind(conf, "buyer_close").probability != null);

  // 5. Stale signals → sufficiency downgraded + missingData flags staleness.
  const stale = forecast(sig({ sellersAtRisk: [ent("seller", "s1", "יוסי", 80, 60), ent("seller", "s2", "רון", 75, 90)] }), NOW);
  const sc = byKind(stale, "seller_churn");
  add("stale: sufficiency downgraded from high", sc.dataSufficiency !== "high" && sc.dataSufficiency !== "none");
  add("stale: missingData flags staleness", sc.missingData.some((m) => m.includes("ישנים")));

  // 6. Prediction improves action → every real prediction has an action.
  const rich = forecast(sig({
    sellersAtRisk: [ent("seller", "s1", "יוסי", 80)], hotBuyers: [ent("buyer", "b1", "דנה", 85)],
    leadFollowUps: [ent("lead", "l1", "עדי", 60)], staleListings: [ent("property", "p1", "דירה", 40)],
    marketing: { scheduledToday: 0, commentsWaiting: 5, leadApprovals: 1, groupsToPublish: 12 },
    performance: { daily: 60, weekly: 55, followUpRatePct: 40, conversionOpportunities: 3, weakSpots: [{ title: "x", detail: "y", impact: "high" }] },
    conversation: { whatsappUnread: 4, whatsappWaiting: 6, facebookComments: 2, facebookLeads: 1 },
    territory: { score: 44, growth: 40, band: "weak" },
  }), NOW);
  add("improves action: every real prediction has action", rich.filter((p) => p.probability != null).every((p) => p.action != null));

  // 7. No auto-execute → every action is approval-gated (never auto-runs).
  add("no auto-execute: all actions requireApproval", rich.every((p) => !p.action || p.action.requiresApproval === true));

  // 8. Every prediction carries a horizon + risk + outcome (no certainty theater fields).
  add("contract: horizon + risk + outcome present", rich.every((p) => p.horizonDays > 0 && !!p.risk.level && !!p.outcome));

  // 9. Summary counters correct.
  const sum = summarizePredictions(rich);
  add("summary: totals", sum.total === 9 && sum.actionable >= 5 && sum.insufficient === 0);

  // 10. Territory growth trend reflects the score direction.
  const grow = forecast(sig({ territory: { score: 80, growth: 78, band: "strong" } }), NOW);
  add("territory: up trend on strong growth", byKind(grow, "territory_growth").trend === "up");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
