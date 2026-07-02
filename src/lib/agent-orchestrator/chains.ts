// ============================================================================
// 🕸️ Multi-Agent Orchestrator — Cross-Agent Reasoning + Opportunity Chains
// (pure). 29.8. Parts 3 + 4 + 8. Links entities ACROSS agents into chains
// (hot buyer + ready seller + healthy listing = potential deal) and scores each.
// Evidence-only: a chain is emitted only from real links between scorecards.
// ============================================================================
import type { OrchestratorInput, OpportunityChain, ChainLink, Impact, OBuyer } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const impactWeight = (i: Impact) => (i === "high" ? 100 : i === "medium" ? 60 : 30);
const toImpact = (n: number): Impact => (n >= 75 ? "high" : n >= 50 ? "medium" : "low");

function score(parts: { impact: Impact; confidence: number; truth: number }[], bonus = 0): number {
  if (!parts.length) return 0;
  const impact = parts.reduce((n, p) => n + impactWeight(p.impact), 0) / parts.length;
  const confidence = parts.reduce((n, p) => n + p.confidence, 0) / parts.length;
  const truth = parts.reduce((n, p) => n + p.truth, 0) / parts.length;
  return clamp(impact * 0.45 + confidence * 0.3 + truth * 0.25 + bonus);
}

export function buildOpportunityChains(input: OrchestratorInput): OpportunityChain[] {
  const out: OpportunityChain[] = [];
  const buyerById = new Map(input.buyers.map((b) => [b.id, b]));
  const listingById = new Map(input.listings.map((l) => [l.id, l]));

  // ── Part 4 — Potential Deal: ready seller + healthy listing + matching hot buyer ──
  for (const s of input.sellers) {
    if (!s.propertyId) continue;
    const listing = listingById.get(s.propertyId);
    const listingHealthy = listing ? listing.healthy : s.propertyHealthy;
    if (!(s.ready || s.stance === "sell_now")) continue;
    const matchedHotBuyers: OBuyer[] = s.matchingBuyerIds.map((id) => buyerById.get(id)).filter((b): b is OBuyer => !!b && (b.hot || b.closing));
    const buyer = matchedHotBuyers[0];
    if (buyer && listingHealthy) {
      const links: ChainLink[] = [
        { agent: "buyer", role: "קונה חם", entityType: "buyer", entityId: buyer.id, entityName: buyer.name },
        { agent: "listing", role: "נכס בריא", entityType: "property", entityId: s.propertyId, entityName: listing?.name ?? s.propertyId },
        { agent: "seller", role: "מוכר מוכן", entityType: "seller", entityId: s.id, entityName: s.name },
        { agent: "office", role: "הזדמנות עסקית", entityType: "office", entityId: "office", entityName: "המשרד" },
      ];
      const sc = score([{ impact: "high", confidence: buyer.confidence, truth: buyer.truth }, { impact: s.impact, confidence: s.confidence, truth: s.truth }, ...(listing ? [{ impact: listing.impact, confidence: listing.confidence, truth: listing.truth }] : [])], 8);
      out.push({ id: `deal:${s.id}:${buyer.id}`, type: "potential_deal", title: `עסקה פוטנציאלית: ${buyer.name} ↔ ${s.name}`, links,
        opportunityScore: sc, confidence: clamp((buyer.confidence + s.confidence) / 2), businessImpact: "high",
        requiredApprovals: ["מתווך", "מנהל משרד"],
        why: "קונה חם + מוכר מוכן לחתימה + נכס בריא — שרשרת סגירה מלאה.",
        evidence: [`קונה: ${buyer.strategy}`, `מוכר: ${s.strategy}`, `נכס: ${listing?.name ?? s.propertyId}`] });
    }
  }

  // ── Part 3 — Hot buyer + stale/critical listing (act-now leverage) ─────────
  for (const b of input.buyers) {
    if (!(b.hot || b.closing)) continue;
    for (const pid of b.matchListingIds.slice(0, 3)) {
      const l = listingById.get(pid);
      if (l && (l.stale || l.critical)) {
        const links: ChainLink[] = [
          { agent: "buyer", role: "קונה חם", entityType: "buyer", entityId: b.id, entityName: b.name },
          { agent: "listing", role: l.critical ? "נכס קריטי" : "נכס מתיישן", entityType: "property", entityId: l.id, entityName: l.name },
          { agent: "seller", role: "מנוף להורדת מחיר", entityType: "property", entityId: l.id, entityName: l.name },
        ];
        out.push({ id: `blm:${b.id}:${l.id}`, type: "buyer_listing_match", title: `קונה חם לנכס ${l.critical ? "קריטי" : "מתיישן"}: ${b.name} → ${l.name}`, links,
          opportunityScore: score([{ impact: "high", confidence: b.confidence, truth: b.truth }, { impact: l.impact, confidence: l.confidence, truth: l.truth }], 4),
          confidence: clamp((b.confidence + l.confidence) / 2), businessImpact: "high",
          requiredApprovals: ["מתווך"],
          why: "קונה חם מתעניין בנכס מתיישן — הזדמנות להאיץ מכירה ולמנף הורדת מחיר.",
          evidence: [`קונה: ${b.strategy}`, `נכס: ${l.strategy}`] });
      }
    }
  }

  // ── Reengage: stale listing with no matched hot buyer → nurture demand ─────
  for (const l of input.listings) {
    if (!(l.stale || l.critical)) continue;
    const hasHotBuyer = input.buyers.some((b) => (b.hot || b.closing) && b.matchListingIds.includes(l.id));
    if (!hasHotBuyer) {
      out.push({ id: `reengage:${l.id}`, type: "reengage_stale", title: `הפעל ביקוש לנכס: ${l.name}`, links: [
        { agent: "listing", role: l.critical ? "נכס קריטי" : "נכס מתיישן", entityType: "property", entityId: l.id, entityName: l.name },
        { agent: "buyer", role: "חיפוש קונים", entityType: "property", entityId: l.id, entityName: l.name },
        { agent: "office", role: "שיווק/תמחור", entityType: "office", entityId: "office", entityName: "המשרד" },
      ], opportunityScore: score([{ impact: l.impact, confidence: l.confidence, truth: l.truth }]), confidence: l.confidence, businessImpact: toImpact(impactWeight(l.impact)),
        requiredApprovals: [], why: "נכס מתיישן ללא קונה חם תואם — הפעל שיווק/תמחור לייצור ביקוש.", evidence: [`נכס: ${l.strategy}`] });
    }
  }

  // ── Defend market / capacity (office-level chains) ─────────────────────────
  const o = input.office;
  if (o) {
    if (o.marketShiftPct < -5) out.push({ id: "defend:market", type: "defend_market", title: "הגן על נתח שוק", links: [
      { agent: "office", role: "אסטרטגיית הגנה", entityType: "office", entityId: "office", entityName: o.name },
      { agent: "chief_of_staff", role: "תעדוף ארגוני", entityType: "org", entityId: "org", entityName: o.name },
    ], opportunityScore: clamp(70 + Math.min(20, -o.marketShiftPct)), confidence: o.confidence, businessImpact: "high", requiredApprovals: ["מנהל משרד"],
      why: `שוק מתכווץ (${o.marketShiftPct}%) — הפעל אסטרטגיית ${o.strategyHe} להגנה.`, evidence: [`תזוזת שוק ${o.marketShiftPct}%`] });
    if (o.inactiveBrokers.length && input.listings.some((l) => l.stale || l.critical)) out.push({ id: "capacity:realloc", type: "capacity_reallocation", title: "הקצה מלאי למתווכים פנויים", links: [
      { agent: "office", role: "הקצאה מחדש", entityType: "office", entityId: "office", entityName: o.name },
      { agent: "listing", role: "נכסים מתיישנים", entityType: "property", entityId: "listings", entityName: "מלאי" },
    ], opportunityScore: 62, confidence: o.confidence, businessImpact: "medium", requiredApprovals: [], why: "מתווכים לא פעילים לצד נכסים מתיישנים — הקצאה תשחרר תפוקה.", evidence: [`לא פעילים: ${o.inactiveBrokers.slice(0, 3).join(", ")}`] });
  }

  return out.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export { impactWeight, toImpact };
