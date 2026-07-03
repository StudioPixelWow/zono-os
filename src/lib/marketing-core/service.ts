// ============================================================================
// 📣 ZONO — Marketing Core™ — service (server-only). 33.0.
// Builds the MarketingInput by REUSING the existing engines (Chief of Staff,
// Buyer/Seller/Lead Digital Twins, Listing Agent) — no logic duplicated — then
// composes the Marketing Workspace with the pure engines. Ask reuses Ask ZONO.
// Nothing is persisted (no schema changes) and nothing auto-executes; campaign
// actions are returned as APPROVAL-GATED proposals only.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getBuyerTwins } from "@/lib/digital-twin/buyers/service";
import { getSellerTwins } from "@/lib/digital-twin/sellers/service";
import { getLeadTwins } from "@/lib/digital-twin/leads/service";
import { getListingScorecards } from "@/lib/listing-agent";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getMarketingBoard } from "@/lib/marketing/service";
import { askZono } from "@/lib/ask-zono";
import { composeWorkspace } from "./planning";
import type { MarketingInput, MarketingWorkspace, Impact, Campaign } from "./types";
import { OBJECTIVE_HE } from "./types";

async function buildInput(orgId: string | null): Promise<MarketingInput> {
  const [buyers, sellers, leads, listingsO, cos, board] = await Promise.all([
    getBuyerTwins(orgId).catch(() => null),
    getSellerTwins(orgId).catch(() => null),
    getLeadTwins(orgId).catch(() => null),
    getListingScorecards(orgId, 200).catch(() => null),
    getChiefOfStaff(orgId).catch(() => null),
    getMarketingBoard().catch(() => null),   // REUSE existing marketing engine
  ]);

  const bt = buyers?.totals, st = sellers?.totals, lt = leads?.totals;
  const cards = listingsO?.scorecards ?? [];
  const truths = cards.map((c) => c.truthScore).filter((t): t is number => t != null);
  const isLux = (c: (typeof cards)[number]) => c.classification.some((x) => x.includes("יוקרה"));
  const isDrop = (c: (typeof cards)[number]) => c.strategy.recommendedStrategy === "reduce_price" || (c.valuation.rangePosition === "above" && (c.valuation.priceGapPct ?? 0) > 0);

  const impactOf = (v: string): Impact => (v === "high" || v === "critical" ? "high" : v === "low" ? "low" : "medium");
  const recs = cos?.recommendations;
  const execRecommendations = [...(recs?.topOpportunities ?? []), ...(recs?.topPriorities ?? [])].slice(0, 6).map((r) => ({
    title: r.title, why: r.why, evidence: r.evidence, confidence: r.confidence, impact: impactOf(String(r.businessImpact)), kind: r.kind ?? r.sourceModule ?? "",
  }));

  return {
    org: { score: cos?.organizationScore.overall ?? 0, confidence: cos?.organizationScore.confidence ?? 0, offices: cos?.globalContext.organization.offices ?? 0, brokers: cos?.globalContext.organization.brokers ?? 0, activeListings: cos?.globalContext.organization.activeListings ?? cards.length },
    buyers: { total: bt?.buyers ?? 0, hot: bt?.hot ?? 0, luxury: bt?.luxury ?? 0, investors: bt?.investors ?? 0, families: bt?.families ?? 0, dormant: bt?.dormant ?? 0, highValue: bt?.highValue ?? 0 },
    sellers: { total: st?.sellers ?? 0, hot: st?.hot ?? 0, atRisk: st?.atRisk ?? 0, readyToSign: st?.readyToSign ?? 0, priceGap: st?.priceGap ?? 0, stale: st?.stale ?? 0, highValue: st?.highValue ?? 0 },
    leads: { total: lt?.leads ?? 0, hot: lt?.hot ?? 0, cold: lt?.cold ?? 0, stale: lt?.stale ?? 0, qualified: lt?.qualified ?? 0 },
    listings: { luxury: cards.filter(isLux).length, priceDrops: cards.filter(isDrop).length, newListings: 0, underOffer: 0, avgTruthScore: truths.length ? Math.round(truths.reduce((a, b) => a + b, 0) / truths.length) : null, topNeighborhoods: [] },
    execRecommendations,
    existing: board ? {
      segments: (board.segments ?? []).map((s) => ({ key: s.segment_key, label: s.label, size: s.segment_size })),
      opportunities: (board.opportunities ?? []).map((o) => ({ title: o.title, body: o.description ?? o.recommended_action ?? "", impact: (o.impact_score >= 70 ? "high" : o.impact_score >= 40 ? "medium" : "low") as Impact, evidence: [`ציון השפעה ${o.impact_score}`] })),
      healthBaseline: typeof board.health === "number" ? board.health : null,
    } : undefined,
  };
}

export async function getMarketingWorkspace(): Promise<MarketingWorkspace> {
  const { organization } = await getSessionContext();
  const orgId = organization?.id ?? null;
  const input = await buildInput(orgId);
  return composeWorkspace(input);
}

/** Marketing Ask — reuses Ask ZONO, scoped to marketing; public-safe subset. */
export async function askMarketing(query: string): Promise<{ answer: string; followUps: string[]; confidence: number }> {
  const { organization } = await getSessionContext();
  const q = (query ?? "").trim();
  if (!q) return { answer: "אנא כתבו שאלה שיווקית.", followUps: [], confidence: 0 };
  const scoped = `בהקשר שיווקי (קמפיינים, קהלים, תקציב, ערוצים, הזדמנויות שיווק) עבור הארגון: ${q}`;
  const r = await askZono(organization?.id ?? null, scoped).catch(() => null);
  if (!r) return { answer: "לא הצלחתי לענות כרגע — נסו שוב.", followUps: [], confidence: 0 };
  return { answer: r.answer.executiveAnswer, followUps: r.answer.followUps.slice(0, 4), confidence: r.answer.confidence };
}

/** APPROVAL-GATED proposal of downstream actions for a campaign. Returns what
 *  WOULD be created (missions / workflow / drafts) — nothing is created or run. */
export interface CampaignActionProposal {
  campaignId: string; requiresApproval: true;
  missions: { title: string; why: string }[];
  workflows: { name: string; why: string }[];
  drafts: { channel: string; purpose: string }[];
}
export async function proposeCampaignActions(campaignId: string): Promise<CampaignActionProposal | null> {
  const ws = await getMarketingWorkspace();
  const c: Campaign | undefined = ws.campaigns.find((x) => x.id === campaignId);
  if (!c) return null;
  const obj = OBJECTIVE_HE[c.goal.objective];
  return {
    campaignId, requiresApproval: true,
    missions: [{ title: `הכנת קמפיין: ${c.name}`, why: c.recommendation.why }, { title: `אישור תקציב ${c.budget.recommended.toLocaleString("he-IL")} ₪`, why: "נדרש אישור תקציב לפני הפעלה" }],
    workflows: [{ name: `זרימת ${obj}`, why: "תיאום נכסים, קריאייטיב ואישורים" }],
    drafts: c.channels.slice(0, 3).map((ch) => ({ channel: ch, purpose: `תוכן ל${obj}` })),
  };
}
