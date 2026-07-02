// ============================================================================
// 🧠 Organizational Memory — Decision Improvement (pure). 27.8. Part 6.
// Maps real historical learnings onto Decision-Engine categories so future
// recommendations improve from OUTCOMES, never assumptions. This is an ADVISORY
// adapter — the Decision Engine itself is not modified; a consumer applies the
// nudges. Only category-level learnings (proven repetition) produce nudges.
// ============================================================================
import { clamp } from "./util";
import type { Learning, DecisionImprovement } from "./types";

// Mission/event category → Decision-Engine category (read-only mapping).
const CAT_MAP: Record<string, string> = {
  RECRUIT_BROKER: "BROKERAGE", BROKER_FOLLOWUP: "BROKER",
  EXPAND_TERRITORY: "TERRITORY", MARKETING_CAMPAIGN: "MARKETING",
  COMPETITIVE_RESPONSE: "COMPETITIVE", SELLER_OPPORTUNITY: "SELLER",
  BUYER_OPPORTUNITY: "BUYER", RECOVER_LISTINGS: "PROPERTY", PROPERTY_FOLLOWUP: "PROPERTY",
  OFFICE_CLEANUP: "OPERATIONS", MARKET_RESEARCH: "MARKET",
};

export function buildDecisionImprovements(learnings: Learning[]): DecisionImprovement[] {
  const out: DecisionImprovement[] = [];
  for (const l of learnings) {
    if (!l.key.startsWith("cat:")) continue;              // only proven category patterns steer decisions
    const missionCat = l.key.replace(/^cat:/, "");
    const category = CAT_MAP[missionCat];
    if (!category) continue;
    const magnitude = Math.min(15, l.occurrences * 3);
    out.push({
      category, learningKey: l.key,
      direction: l.kind === "success" ? "boost" : "caution",
      delta: l.kind === "success" ? magnitude : -magnitude,
      note: l.kind === "success"
        ? `היסטוריה: ${l.title} → העלה עדיפות ל-${category} (+${magnitude}).`
        : `היסטוריה: ${l.title} → הוסף זהירות ל-${category} (${-magnitude}).`,
      confidence: l.confidence, evidence: l.evidence,
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Apply the historical nudges to a set of decisions (advisory; DE untouched). */
export function applyImprovementsToDecisions<T extends { category: string; priorityScore: number }>(
  decisions: T[], improvements: DecisionImprovement[],
): (T & { adjustedPriority: number; memoryNote: string | null })[] {
  const byCat = new Map<string, DecisionImprovement>();
  for (const im of improvements) if (!byCat.has(im.category)) byCat.set(im.category, im);
  return decisions.map((d) => {
    const im = byCat.get(d.category);
    return {
      ...d,
      adjustedPriority: clamp(d.priorityScore + (im?.delta ?? 0)),
      memoryNote: im ? im.note : null,
    };
  });
}
