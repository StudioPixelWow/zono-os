// ============================================================================
// 🕸️ Multi-Agent Orchestrator — Orchestrated (merged) Playbooks (pure). 29.8.
// Part 6. Merges the playbooks of the agents involved in an opportunity chain
// into ONE ordered execution plan (dedup by mission, union of approvals).
// Recommendation-only — the plan is a proposal; nothing executes automatically.
// ============================================================================
import type { OpportunityChain, ExecutionPlan, PlanStep, AgentId, ChainType } from "./types";

// Canonical step templates per agent role (mission mapping mirrors the agents).
const DEAL_STEPS: { owner: AgentId; action: string; missionType: string; durationDays: number }[] = [
  { owner: "buyer", action: "אשר כוונת קונה ותקציב", missionType: "BUYER_QUALIFICATION", durationDays: 1 },
  { owner: "seller", action: "אשר מוכנות מוכר ותנאים", missionType: "SELLER_MEETING", durationDays: 1 },
  { owner: "listing", action: "ודא זמינות ותמחור הנכס", missionType: "LISTING_REVIEW", durationDays: 1 },
  { owner: "buyer", action: "קבע ביקור/הצעה", missionType: "BOOK_VISIT", durationDays: 3 },
  { owner: "seller", action: "נהל משא ומתן להסכם", missionType: "NEGOTIATE", durationDays: 5 },
  { owner: "office", action: "פתח תיק עסקה ומעקב", missionType: "OFFICE_DEAL", durationDays: 2 },
];
const STALE_MATCH_STEPS: { owner: AgentId; action: string; missionType: string; durationDays: number }[] = [
  { owner: "buyer", action: "הצג את הנכס לקונה החם", missionType: "SEND_PROPERTIES", durationDays: 1 },
  { owner: "seller", action: "המלץ הורדת/יישור מחיר", missionType: "PRICE_REDUCTION", durationDays: 3 },
  { owner: "buyer", action: "קבע ביקור", missionType: "BOOK_VISIT", durationDays: 3 },
];
const REENGAGE_STEPS: { owner: AgentId; action: string; missionType: string; durationDays: number }[] = [
  { owner: "office", action: "הפעל קמפיין שיווק לנכס", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 14 },
  { owner: "seller", action: "בחן תמחור מחדש", missionType: "VALUATION_UPDATE", durationDays: 5 },
  { owner: "buyer", action: "חפש קונים תואמים חדשים", missionType: "SEND_PROPERTIES", durationDays: 7 },
];
const DEFEND_STEPS: { owner: AgentId; action: string; missionType: string; durationDays: number }[] = [
  { owner: "office", action: "הפעל אסטרטגיית הגנת טריטוריה", missionType: "OFFICE_RETENTION", durationDays: 14 },
  { owner: "office", action: "בַּדֵּל מול מתחרים צומחים", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 21 },
];
const CAPACITY_STEPS: { owner: AgentId; action: string; missionType: string; durationDays: number }[] = [
  { owner: "office", action: "הקצה מלאי מתיישן למתווכים פנויים", missionType: "OFFICE_REALLOCATE", durationDays: 7 },
];
const TEMPLATE: Record<ChainType, { owner: AgentId; action: string; missionType: string; durationDays: number }[]> = {
  potential_deal: DEAL_STEPS, buyer_listing_match: STALE_MATCH_STEPS, reengage_stale: REENGAGE_STEPS, defend_market: DEFEND_STEPS, capacity_reallocation: CAPACITY_STEPS,
};

export function buildExecutionPlans(chains: OpportunityChain[]): ExecutionPlan[] {
  const out: ExecutionPlan[] = [];
  for (const c of chains) {
    const tmpl = TEMPLATE[c.type];
    // Merge + dedup by missionType (multiple agents can contribute the same step).
    const seen = new Set<string>();
    const steps: PlanStep[] = [];
    tmpl.forEach((st) => {
      if (seen.has(st.missionType)) return;
      seen.add(st.missionType);
      steps.push({ order: steps.length + 1, action: st.action, missionType: st.missionType, owner: st.owner, durationDays: st.durationDays, why: steps.length === 0 ? c.why : "" });
    });
    out.push({ id: `plan:${c.id}`, chainId: c.id, title: `תוכנית מאוחדת: ${c.title}`, steps, requiredApprovals: c.requiredApprovals, note: "תוכנית מאוחדת מכמה סוכנים — הצעה לאישור בלבד, ללא ביצוע אוטומטי." });
  }
  return out;
}
