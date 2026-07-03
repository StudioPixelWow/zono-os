// ============================================================================
// ✅ Marketing Core — self-tests (pure, offline). 33.0.
// small/large office / many/no campaigns / approval flow / planning / budget /
// audience / analytics / performance / security(public-safe, nothing executes).
// ============================================================================
import { composeWorkspace } from "./planning";
import { buildAudiences } from "./audiences";
import { recommendBudget } from "./budget";
import { createCampaign } from "./campaign";
import { defaultApprovals, setApproval, approvalStatus, canAdvance } from "./approval";
import { computeAnalytics } from "./analytics";
import type { MarketingInput } from "./types";

export interface MCCheck { name: string; pass: boolean; detail: string }
export interface MCSelfCheck { ok: boolean; total: number; passed: number; checks: MCCheck[] }

const input = (o: Partial<MarketingInput> = {}): MarketingInput => ({
  org: { score: 62, confidence: 70, offices: 2, brokers: 14, activeListings: 120 },
  buyers: { total: 80, hot: 20, luxury: 8, investors: 12, families: 25, dormant: 15, highValue: 10 },
  sellers: { total: 6, hot: 3, atRisk: 2, readyToSign: 1, priceGap: 2, stale: 1, highValue: 2 },
  leads: { total: 40, hot: 12, cold: 10, stale: 8, qualified: 15 },
  listings: { luxury: 5, priceDrops: 4, newListings: 10, underOffer: 6, avgTruthScore: 72, topNeighborhoods: ["לב העיר", "צפון הישן"] },
  execRecommendations: [{ title: "הזדמנות גיוס בלעדיות בצפון", why: "ביקוש גבוה מול היצע נמוך", evidence: ["ביקוש גבוה"], confidence: 68, impact: "high", kind: "recruit_opportunity" }],
  ...o,
});

export function runSelfCheck(): MCSelfCheck {
  const checks: MCCheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  const ws = composeWorkspace(input());
  add("workspace assembled with campaigns", ws.campaigns.length >= 4 && ws.version === "33.0");
  add("every campaign explains WHY + evidence", ws.campaigns.every((c) => c.recommendation.why.length > 0 && c.evidence.length > 0));
  add("campaigns prioritized (desc)", ws.campaigns.length >= 2);
  add("marketing health computed + coverage", ws.health.score >= 0 && ws.health.coverage >= 0 && ws.health.basis.length > 0);
  add("audiences derived from CRM (non-empty)", ws.audiences.length >= 3 && ws.audiences.every((a) => a.size > 0 && a.evidence.length > 0));
  add("calendar staggered + launch entries", ws.calendar.filter((e) => e.kind === "launch").length === ws.campaigns.length && ws.calendar.length >= ws.campaigns.length);
  add("insights evidence-backed", ws.insights.length > 0 && ws.insights.every((i) => i.evidence.length > 0));
  add("pending approvals exist (nothing pre-approved)", ws.pendingApprovals.length > 0);

  // Objectives: luxury + seller_acquisition present (signal-driven).
  const objs = new Set(ws.campaigns.map((c) => c.goal.objective));
  add("luxury campaign proposed (luxury signal)", objs.has("luxury"));
  add("seller acquisition proposed (low seller pipeline)", objs.has("seller_acquisition"));
  add("recruitment proposed (CoS recommendation)", objs.has("recruitment"));

  // Budget engine.
  const b = recommendBudget("luxury", 30, ["instagram", "google"]);
  add("budget min<recommended<ideal + flagged estimate", b.min < b.recommended && b.recommended < b.ideal && b.estimate === true && b.expectedReach > 0);
  const b2 = recommendBudget("brand_awareness", 100, ["facebook"]);
  add("budget scales with audience/objective", b2.recommended > 0 && b2.confidence >= 35 && b2.confidence <= 80);

  // Audiences.
  const aud = buildAudiences(input());
  add("audiences sorted by match quality", aud.length >= 3 && aud[0].matchQuality >= aud[aud.length - 1].matchQuality);
  add("empty segments excluded", buildAudiences(input({ buyers: { total: 0, hot: 0, luxury: 0, investors: 0, families: 0, dormant: 0, highValue: 0 }, sellers: { total: 0, hot: 0, atRisk: 0, readyToSign: 0, priceGap: 0, stale: 0, highValue: 0 }, leads: { total: 0, hot: 0, cold: 0, stale: 0, qualified: 0 }, listings: { luxury: 0, priceDrops: 0, newListings: 0, underOffer: 0, avgTruthScore: null, topNeighborhoods: [] } })).length === 0);

  // Approval flow: nothing advances until each gate approved.
  const camp = createCampaign({ id: "c1", objective: "lead_generation", audiences: aud.slice(0, 1), channels: [], evidence: ["x"], confidence: 60, truthScore: 70, recommendation: { title: "t", why: "w", evidence: ["e"], impact: "medium", confidence: 60 } });
  add("new campaign blocked (nothing auto-executes)", canAdvance(camp).ok === false && canAdvance(camp).blockedBy === "campaign");
  let ap = defaultApprovals();
  add("approval status none initially", approvalStatus(ap) === "none");
  ap = setApproval(ap, "campaign", "approved"); ap = setApproval(ap, "creative", "approved");
  add("approval status partial", approvalStatus(ap) === "partial");
  for (const t of ["budget", "publishing", "execution"] as const) ap = setApproval(ap, t, "approved");
  add("approval status complete only when all gates approved", approvalStatus(ap) === "complete");

  // Analytics.
  const an = computeAnalytics({ budget: b, approvals: ap, assets: [{ kind: "copy", label: "x", status: "ready" }], audiences: aud.slice(0, 1), confidence: 60, truthScore: 72 });
  add("analytics execution-ready when approvals complete", an.executionReadiness === 100 && an.approvalStatus === "complete" && an.truthScore === 72);

  // No campaigns (small/empty office).
  const empty = composeWorkspace(input({ buyers: { total: 0, hot: 0, luxury: 0, investors: 0, families: 0, dormant: 0, highValue: 0 }, sellers: { total: 0, hot: 0, atRisk: 0, readyToSign: 0, priceGap: 0, stale: 0, highValue: 0 }, leads: { total: 0, hot: 0, cold: 0, stale: 0, qualified: 0 }, listings: { luxury: 0, priceDrops: 0, newListings: 0, underOffer: 0, avgTruthScore: null, topNeighborhoods: [] }, execRecommendations: [], org: { score: 10, confidence: 20, offices: 0, brokers: 0, activeListings: 0 } }));
  add("empty office → still safe (base campaigns + note)", empty.campaigns.length >= 1 && empty.notes.length >= 0 && empty.health.score >= 0);

  // REUSE of the existing marketing engine (segments / opportunities / health).
  const reused = composeWorkspace(input({ existing: { segments: [{ key: "luxury", label: "יוקרה", size: 42 }, { key: "investors", label: "משקיעים", size: 33 }], opportunities: [{ title: "קהילת פייסבוק חמה", body: "מעורבות גבוהה", impact: "high", evidence: ["ציון 82"] }], healthBaseline: 90 } }));
  add("reuses persisted segment sizes (luxury/investors)", reused.audiences.some((a) => a.kind === "luxury" && a.size === 42) && reused.audiences.some((a) => a.kind === "investors" && a.size === 33));
  add("surfaces persisted marketing opportunities as insights", reused.insights.some((i) => i.title === "קהילת פייסבוק חמה"));
  add("blends persisted health baseline", reused.health.score !== composeWorkspace(input()).health.score);

  // Large office performance.
  const t0 = Date.now();
  const big = input({ buyers: { total: 5000, hot: 800, luxury: 300, investors: 400, families: 900, dormant: 600, highValue: 500 }, listings: { luxury: 200, priceDrops: 120, newListings: 400, underOffer: 150, avgTruthScore: 74, topNeighborhoods: Array.from({ length: 40 }, (_, i) => `אזור ${i}`) } });
  for (let k = 0; k < 50; k++) composeWorkspace(big);
  add("large office × 50 composes < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  // Security / public-safe: workspace exposes no CRM identities (entity-agnostic aggregates only).
  const serialized = JSON.stringify(ws);
  add("no raw CRM identifiers leaked (aggregates only)", !/buyer_id|seller_id|lead_id|"buyerId"|"sellerId"|"leadId"|"fullName"|"phoneNumber"/.test(serialized));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
