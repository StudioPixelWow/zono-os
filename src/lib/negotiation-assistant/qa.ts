// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — offline self-check (pure). PHASE 59.0.
// Spec QA: low offer, seller price resistance, buyer urgency, multiple offers,
// missing valuation, legal question handoff, draft only.
// ============================================================================
import { assembleNegotiationPlan, compareOffers, detectLegal, detectObjections } from "./engine";
import type { NegotiationInput, OfferInput } from "./types";

const offer = (over: Partial<OfferInput> = {}): OfferInput =>
  ({ id: over.id ?? "o1", buyerName: over.buyerName ?? "דנה", amount: over.amount ?? 1_900_000, hasFinancing: over.hasFinancing ?? true, preapproved: over.preapproved ?? false, contingencies: over.contingencies ?? [], submittedAt: "2026-07-01T00:00:00.000Z" });

function input(over: Partial<NegotiationInput> = {}): NegotiationInput {
  return {
    property: { id: "p1", title: "דירה בתל אביב", askingPrice: 2_000_000, city: "תל אביב" },
    valuation: { estimated: 1_950_000, low: 1_850_000, high: 2_050_000, confidence: 70 },
    offers: [offer()],
    sellerSignals: { flexibility: 50, daysOnMarket: 30, priceReductions: 0 },
    buyerSignals: { urgency: 50, readiness: 60, competingInterest: false },
    notes: [],
    ...over,
  };
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Low offer → counter (with gap), talking points present.
  const p1 = assembleNegotiationPlan(input({ offers: [offer({ amount: 1_700_000 })], sellerSignals: { flexibility: 60, daysOnMarket: 30, priceReductions: 0 } }));
  add("low offer → counter strategy + gap", p1.strategy.stance === "counter" && (p1.offers[0].gapToAskingPct ?? 0) < 0 && p1.talkingPoints.length > 0);

  // 2. Seller price resistance (low flexibility) → hold.
  const p2 = assembleNegotiationPlan(input({ offers: [offer({ amount: 1_800_000 })], sellerSignals: { flexibility: 25, daysOnMarket: 10, priceReductions: 0 } }));
  add("seller resistance → hold", p2.strategy.stance === "hold" && p2.sellerFlexibility.label === "נוקשה");

  // 3. Buyer urgency → surfaced; near-asking offer → accept leverage.
  const p3 = assembleNegotiationPlan(input({ offers: [offer({ amount: 1_960_000 })], buyerSignals: { urgency: 80, readiness: 80, competingInterest: true } }));
  add("buyer urgency + near-asking → accept", p3.strategy.stance === "accept" && p3.buyerUrgency.label === "גבוהה");

  // 4. Multiple offers → ranked + gather.
  const p4 = assembleNegotiationPlan(input({ offers: [offer({ id: "a", amount: 1_850_000, preapproved: true }), offer({ id: "b", amount: 1_950_000, hasFinancing: false, contingencies: ["מכירת נכס"] })] }));
  add("multiple offers → ranked + gather", p4.offers.length === 2 && p4.offers[0].rank === 1 && p4.strategy.stance === "gather");

  // 5. Missing valuation → NO fabricated number, lower confidence, flagged.
  const p5 = assembleNegotiationPlan(input({ valuation: null, offers: [offer({ amount: 1_700_000 })] }));
  add("missing valuation → not used, capped confidence, flagged", p5.strategy.usesValuation === false && p5.strategy.confidence <= 55 && p5.risk.missingData.some((m) => m.includes("הערכת שווי")));

  // 6. Legal question → HANDOFF, no legal advice given.
  const p6 = assembleNegotiationPlan(input({ notes: ["הקונה שאל על סעיף בחוזה ומיסוי מס שבח"] }));
  add("legal question → handoff triggered", p6.legalHandoff.triggered && p6.legalHandoff.evidence.length > 0);
  add("legal question → talking points suppressed to handoff", p6.talkingPoints.length === 1 && p6.talkingPoints[0].includes("עורך דין"));

  // 7. Draft only — every draft is approval-gated + never auto-sent + hedged.
  add("draft only: all drafts require approval, no auto-send", p1.drafts.length >= 1 && p1.drafts.every((d) => d.requiresApproval === true && d.autoSend === false && d.disclaimer.length > 0));

  // 8. Objection detection.
  const objs = detectObjections(["הלקוח אמר שהמחיר יקר מדי וצריך זמן לחשוב"]);
  add("objections: price + time detected", objs.some((o) => o.kind === "price_too_high") && objs.some((o) => o.kind === "needs_time"));

  // 9. Offer comparison certainty rewards preapproval.
  const cmp = compareOffers([offer({ id: "x", amount: 1_900_000, preapproved: true }), offer({ id: "y", amount: 1_900_000, hasFinancing: false, contingencies: ["a", "b"] })], 2_000_000, 1_950_000);
  add("offers: preapproved ranked higher at equal price", cmp[0].id === "x" && cmp[0].certainty > cmp[1].certainty);

  // 10. Legal detector negative case.
  add("legal: none detected on neutral notes", detectLegal(["דיברנו על מחיר ומועד מסירה"]).triggered === false);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
