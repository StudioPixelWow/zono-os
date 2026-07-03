// ============================================================================
// 📣 Marketing Core — marketing planner (pure). 33.0.
// The AI planner scans the REAL org signals and proposes a prioritized campaign
// SEQUENCE — each with objective, audience, channels, budget, timeline and a WHY.
// Evidence-only: a campaign is proposed only when a real signal supports it.
// ============================================================================
import { createCampaign, priorityScore, type CampaignSeed } from "./campaign";
import { audiencesFor, buildAudiences } from "./audiences";
import { buildCalendar, withProposedDates } from "./calendar";
import { marketingHealth } from "./analytics";
import { pendingGates } from "./approval";
import type { Campaign, MarketingInput, MarketingInsight, MarketingWorkspace, CampaignObjective, AudienceKind, Impact } from "./types";
import { MARKETING_CORE_VERSION } from "./types";

interface Rule {
  objective: CampaignObjective; audience: AudienceKind[]; when: (i: MarketingInput) => boolean;
  why: (i: MarketingInput) => string; evidence: (i: MarketingInput) => string[]; impact: Impact; confidence: (i: MarketingInput) => number;
}

const RULES: Rule[] = [
  { objective: "luxury", audience: ["luxury", "high_value"], when: (i) => i.listings.luxury > 0 || i.buyers.luxury > 0,
    why: (i) => `יש ${i.listings.luxury} נכסי יוקרה ו-${i.buyers.luxury} קונים בפרופיל יוקרה — קמפיין ממוקד ימקסם חשיפה.`, evidence: (i) => [`${i.listings.luxury} נכסי יוקרה`, `${i.buyers.luxury} קונים יוקרה`], impact: "high", confidence: (i) => Math.min(85, 55 + i.buyers.luxury * 3) },
  { objective: "price_reduction", audience: ["buyers", "dormant"], when: (i) => i.listings.priceDrops > 0,
    why: (i) => `${i.listings.priceDrops} נכסים עם ירידת מחיר — קמפיין הזדמנות לקונים מגדיל פניות.`, evidence: (i) => [`${i.listings.priceDrops} ירידות מחיר`], impact: "medium", confidence: () => 60 },
  { objective: "seller_acquisition", audience: ["sellers", "high_value"], when: (i) => i.sellers.total < i.buyers.total || i.sellers.total < 10,
    why: (i) => `מלאי המוכרים (${i.sellers.total}) נמוך יחסית לביקוש — קמפיין גיוס מוכרים יאזן את הצנרת.`, evidence: (i) => [`${i.sellers.total} מוכרים`, `${i.buyers.total} קונים`], impact: "high", confidence: () => 65 },
  { objective: "buyer_acquisition", audience: ["buyers", "leads"], when: (i) => i.buyers.total < i.listings.newListings * 3 || i.listings.newListings > 0,
    why: (i) => `${i.listings.newListings} נכסים חדשים דורשים קונים תואמים — קמפיין גיוס קונים.`, evidence: (i) => [`${i.listings.newListings} נכסים חדשים`, `${i.buyers.total} קונים`], impact: "medium", confidence: () => 58 },
  { objective: "remarketing", audience: ["dormant", "leads"], when: (i) => i.buyers.dormant + i.leads.stale >= 5,
    why: (i) => `${i.buyers.dormant} קונים רדומים ו-${i.leads.stale} לידים ישנים — רימרקטינג להחזרתם למעורבות.`, evidence: (i) => [`${i.buyers.dormant} רדומים`, `${i.leads.stale} לידים ישנים`], impact: "medium", confidence: () => 55 },
  { objective: "recruitment", audience: ["high_value"], when: (i) => i.execRecommendations.some((r) => r.kind.includes("recruit") || r.title.includes("גיוס")),
    why: () => `זוהתה הזדמנות גיוס בהמלצות ה-Chief of Staff — קמפיין גיוס מתווכים/בלעדיות.`, evidence: (i) => i.execRecommendations.find((r) => r.title.includes("גיוס"))?.evidence ?? ["המלצת מנהל"], impact: "high", confidence: () => 62 },
  { objective: "lead_generation", audience: ["buyers", "leads"], when: () => true,
    why: (i) => `בסיס קמפיין תמידי ליצירת לידים על מלאי של ${i.org.activeListings} נכסים.`, evidence: (i) => [`${i.org.activeListings} נכסים פעילים`], impact: "medium", confidence: () => 60 },
  { objective: "brand_awareness", audience: ["neighborhood", "buyers"], when: (i) => i.org.brokers > 0,
    why: (i) => `חיזוק המותג באזורי הפעילות (${i.listings.topNeighborhoods.slice(0, 2).join(", ") || "העיר"}).`, evidence: (i) => [`${i.org.brokers} מתווכים`, ...i.listings.topNeighborhoods.slice(0, 2)], impact: "low", confidence: () => 50 },
];

export function buildPlan(input: MarketingInput): Campaign[] {
  const seeds: CampaignSeed[] = [];
  let n = 0;
  for (const r of RULES) {
    if (!r.when(input)) continue;
    const audiences = audiencesFor(r.audience, input);
    if (audiences.length === 0 && r.objective !== "lead_generation" && r.objective !== "brand_awareness") continue;
    seeds.push({
      id: `camp-${++n}-${r.objective}`, objective: r.objective, audiences, channels: [],
      evidence: r.evidence(input), confidence: r.confidence(input), truthScore: input.listings.avgTruthScore,
      businessImpact: r.impact,
      recommendation: { title: `קמפיין ${r.objective}`, why: r.why(input), evidence: r.evidence(input), impact: r.impact, confidence: r.confidence(input) },
    });
  }
  return seeds.map(createCampaign).sort((a, b) => priorityScore(b) - priorityScore(a));
}

/** Evidence-backed marketing insights (opportunities / gaps / weak areas). */
export function buildInsights(input: MarketingInput, campaigns: Campaign[]): MarketingInsight[] {
  const out: MarketingInsight[] = [];
  const covered = new Set(campaigns.map((c) => c.goal.objective));

  // REUSE: surface the existing marketing engine's curated opportunity signals
  // instead of re-deriving them here.
  for (const o of (input.existing?.opportunities ?? []).slice(0, 4)) out.push({ kind: "opportunity", title: o.title, body: o.body, evidence: o.evidence, impact: o.impact, confidence: 65, suggestedObjective: null });

  if (input.listings.luxury > 0 && !covered.has("luxury")) out.push({ kind: "luxury", title: "הזדמנות יוקרה", body: `${input.listings.luxury} נכסי יוקרה ללא קמפיין ייעודי.`, evidence: [`${input.listings.luxury} נכסי יוקרה`], impact: "high", confidence: 70, suggestedObjective: "luxury" });
  if (input.sellers.total < 10) out.push({ kind: "opportunity", title: "חיזוק גיוס מוכרים", body: `רק ${input.sellers.total} מוכרים — קמפיין גיוס יאזן את הצנרת מול הביקוש.`, evidence: [`${input.sellers.total} מוכרים`, `${input.buyers.total} קונים`], impact: "high", confidence: 65, suggestedObjective: "seller_acquisition" });
  if (input.buyers.dormant + input.leads.stale >= 5) out.push({ kind: "opportunity", title: "החזרת רדומים", body: `${input.buyers.dormant + input.leads.stale} אנשי קשר רדומים ניתנים להחזרה ברימרקטינג.`, evidence: [`${input.buyers.dormant} קונים רדומים`, `${input.leads.stale} לידים ישנים`], impact: "medium", confidence: 58, suggestedObjective: "remarketing" });
  for (const c of campaigns) if (c.analytics.health < 40) out.push({ kind: "weak_campaign", title: `קמפיין חלש: ${c.name}`, body: `בריאות ${c.analytics.health}/100 — חסרים נכסים/קהל או אישורים.`, evidence: c.evidence, impact: "medium", confidence: c.confidence, suggestedObjective: c.goal.objective });
  const missing: [CampaignObjective, string][] = [["lead_generation", "יצירת לידים"], ["property_exposure", "חשיפת נכסים"], ["brand_awareness", "מודעות למותג"]];
  for (const [obj, label] of missing) if (!covered.has(obj)) out.push({ kind: "missing_campaign", title: `חסר קמפיין: ${label}`, body: `אין כרגע קמפיין ל${label}.`, evidence: ["ניתוח כיסוי יעדים"], impact: "low", confidence: 50, suggestedObjective: obj });

  // Chief-of-Staff sourced opportunities (reused, evidence-backed).
  for (const r of input.execRecommendations.slice(0, 3)) out.push({ kind: "opportunity", title: r.title, body: r.why, evidence: r.evidence, impact: r.impact, confidence: r.confidence, suggestedObjective: null });

  return out.slice(0, 10);
}

/** Compose the full Marketing Workspace from a normalized input (pure). */
export function composeWorkspace(input: MarketingInput): MarketingWorkspace {
  const planned = buildPlan(input);
  const calendar = buildCalendar(planned);
  const campaigns = withProposedDates(planned, calendar);
  const insights = buildInsights(input, campaigns);
  const audiences = buildAudiences(input);
  const pendingApprovals = campaigns.flatMap((c) => pendingGates(c).map((approval) => ({ campaignId: c.id, campaignName: c.name, approval })));
  const health = marketingHealth(campaigns, pendingApprovals.length, input.existing?.healthBaseline ?? null);
  const notes = campaigns.length === 0 ? ["אין עדיין מספיק אותות לבניית תוכנית שיווק — הוסיפו קונים, מוכרים ונכסים."] : [];
  return { version: MARKETING_CORE_VERSION, generatedAt: new Date().toISOString(), health, campaigns, audiences, calendar, insights, pendingApprovals, notes };
}
