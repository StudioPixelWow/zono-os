// ============================================================================
// 🕸️ Multi-Agent Orchestrator — Priority Engine + Conflict Resolution (pure).
// 29.8. Parts 5 + 7. Prioritizes competing actions by impact/urgency/truth/
// confidence/dependencies, and detects + resolves conflicting recommendations
// on the same property (buyer WAIT vs seller SELL_NOW vs listing REDUCE_PRICE).
// Evidence-only; resolution is explained (recommendation-only, approval-gated).
// ============================================================================
import { impactWeight } from "./chains";
import type { OrchestratorInput, OpportunityChain, PriorityItem, Conflict, ConflictPosition, AgentId, Stance, Impact } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Part 5 — priority engine ────────────────────────────────────────────────
export function buildPriorityQueue(chains: OpportunityChain[], input: OrchestratorInput): PriorityItem[] {
  const items: PriorityItem[] = [];

  for (const c of chains) {
    const urgency = c.type === "potential_deal" ? 90 : c.type === "buyer_listing_match" ? 78 : c.type === "defend_market" ? 80 : 55;
    const deps = c.type === "potential_deal" ? ["זמינות נכס", "אישור מוכר"] : c.type === "buyer_listing_match" ? ["הסכמת מוכר לתמחור"] : [];
    const priorityScore = clamp(impactWeight(c.businessImpact) * 0.4 + urgency * 0.25 + c.confidence * 0.2 + c.opportunityScore * 0.15 - deps.length * 3);
    items.push({ id: `pq:${c.id}`, kind: "opportunity", title: c.title, sources: [...new Set(c.links.map((l) => l.agent))], impact: c.businessImpact, urgency, truth: c.confidence, confidence: c.confidence, dependencies: deps, priorityScore, why: c.why });
  }

  // Office decisions enter the queue as recommendations.
  for (const d of input.office?.decisions ?? []) {
    const urgency = d.impact === "high" ? 74 : d.impact === "medium" ? 55 : 38;
    const priorityScore = clamp(impactWeight(d.impact) * 0.45 + urgency * 0.3 + (input.office?.confidence ?? 55) * 0.25);
    items.push({ id: `pq:dec:${d.type}`, kind: "recommendation", title: d.title, sources: ["office"], impact: d.impact, urgency, truth: input.office?.confidence ?? 55, confidence: input.office?.confidence ?? 55, dependencies: [], priorityScore, why: d.why });
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore);
}

// ── Part 7 — conflict resolution ────────────────────────────────────────────
const STANCE_ACTION: Record<Stance, string> = {
  wait: "המתן", proceed: "התקדם לעסקה", hold: "החזק מחיר", sell_now: "מכור עכשיו", reduce_price: "הורד מחיר", keep: "שמור מחיר",
};
// Conflicting stance pairs on the same property.
const CONFLICTS: [Stance, Stance][] = [
  ["wait", "sell_now"], ["wait", "proceed"], ["hold", "reduce_price"], ["keep", "reduce_price"], ["hold", "sell_now"],
];
const isConflict = (a: Stance, b: Stance) => CONFLICTS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

function weight(agent: AgentId, impact: Impact, confidence: number, truth: number): number {
  const authority: Record<AgentId, number> = { chief_of_staff: 12, office: 10, seller: 8, listing: 7, buyer: 6, lead: 4 };
  return clamp(impactWeight(impact) * 0.4 + confidence * 0.25 + truth * 0.2 + authority[agent]);
}

export function detectConflicts(input: OrchestratorInput): Conflict[] {
  const out: Conflict[] = [];
  const listingById = new Map(input.listings.map((l) => [l.id, l]));

  // Gather every agent position touching a given property.
  const byProperty = new Map<string, ConflictPosition[]>();
  const add = (pid: string, pos: ConflictPosition) => { (byProperty.get(pid) ?? byProperty.set(pid, []).get(pid)!).push(pos); };

  for (const s of input.sellers) if (s.propertyId) add(s.propertyId, { agent: "seller", stance: s.stance, action: STANCE_ACTION[s.stance], why: `אסטרטגיית מוכר: ${s.strategy}`, weight: weight("seller", s.impact, s.confidence, s.truth) });
  for (const l of input.listings) add(l.id, { agent: "listing", stance: l.stance, action: STANCE_ACTION[l.stance], why: `אסטרטגיית נכס: ${l.strategy}`, weight: weight("listing", l.impact, l.confidence, l.truth) });
  for (const b of input.buyers) for (const pid of b.matchListingIds) if (listingById.has(pid)) add(pid, { agent: "buyer", stance: b.stance, action: STANCE_ACTION[b.stance], why: `אסטרטגיית קונה: ${b.strategy}`, weight: weight("buyer", b.impact, b.confidence, b.truth) });

  for (const [pid, positions] of byProperty) {
    if (positions.length < 2) continue;
    const conflicting = positions.some((p, i) => positions.slice(i + 1).some((q) => isConflict(p.stance, q.stance)));
    if (!conflicting) continue;
    const uniq = [...new Map(positions.map((p) => [`${p.agent}:${p.stance}`, p])).values()];
    const winner = [...uniq].sort((a, b) => b.weight - a.weight)[0];
    const name = listingById.get(pid)?.name ?? pid;
    out.push({
      id: `conflict:${pid}`, entityLabel: name, propertyId: pid, positions: uniq,
      resolution: { winner: winner.agent, action: winner.action, why: `הוכרע לפי משקל (השפעה·ביטחון·אמון·סמכות): ${winner.action}. ${winner.why}` },
      confidence: clamp(winner.weight),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
