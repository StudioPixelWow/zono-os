/**
 * decisionIntelligenceService — ZONO's Executive Brain (server-only).
 *
 * Aggregates Property Intelligence + Seller Intelligence + activity/commitment
 * signals into ranked attention items, opportunities, a priority queue and
 * recommendations, plus an org-level decision profile. Fully deterministic.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  calculateAttentionScore,
  calculateChurnImpactScore,
  calculateImpactScore,
  calculateRelationshipImpactScore,
  calculateRevenueImpactScore,
  calculateUrgencyScore,
} from "./scoring";
import {
  attentionRepository,
  decisionIntelligenceRepository,
  decisionQueueRepository,
  opportunityRepository,
  recommendationRepository,
  type AttentionItemRow,
  type DecisionProfileRow,
  type OpportunityRow,
  type QueueRow,
  type RecommendationRow,
} from "./repository";

type AttentionInsert = Database["public"]["Tables"]["attention_items"]["Insert"];
type OppInsert = Database["public"]["Tables"]["opportunity_signals"]["Insert"];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ACTIVE = ["active", "published", "ready", "under_offer", "in_contract"];

async function currentOrgId(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

interface OrgData {
  propProfiles: { property_id: string; health_score: number; success_score: number; risk_score: number; marketing_score: number; exposure_score: number; momentum_score: number }[];
  propMap: Map<string, { title: string; price: number | null; status: string; seller_id: string | null }>;
  sellerProfiles: { seller_id: string; seller_trust_score: number; seller_churn_risk_score: number; seller_health_score: number; days_since_last_contact: number | null }[];
  sellerMap: Map<string, string>;
  activePropCountBySeller: Map<string, number>;
  buyerProfiles: { buyer_id: string; buyer_health_score: number; buyer_conversion_probability: number; buyer_readiness_score: number; buyer_engagement_score: number; buyer_financing_score: number; days_since_activity: number | null; current_stage: string }[];
  buyerMap: Map<string, string>;
  buyerCriteria: { budgetMin: number | null; budgetMax: number | null; roomsMin: number | null; roomsMax: number | null; areas: string[] }[];
  matchProfiles: { id: string; buyer_id: string; property_id: string; closing_probability: number; risk_score: number; opportunity_score: number; revenue_score: number; urgency_score: number; match_stage: string; match_status: string }[];
  overdueTasks: number;
  overdueCommitments: { seller_id: string; title: string }[];
  externalListings: { id: string; title: string | null; city: string | null; price: number | null; sqm: number | null; rooms: number | null; has_agent: boolean | null; opportunity_score: number; published_at: string | null }[];
  externalPriceDrops: Set<string>;
  externalDuplicates: Set<string>;
  externalCityAvgSqm: Map<string, number>;
}

const EXT_DAY = 86_400_000;

async function gatherOrgData(): Promise<OrgData> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const priceDropSince = new Date(Date.now() - 14 * EXT_DAY).toISOString();
  const [pp, props, sp, sellers, tasks, commits, bp, buyers, mp, extL, extH, extD] = await Promise.all([
    supabase.from("property_intelligence_profiles").select("property_id,health_score,success_score,risk_score,marketing_score,exposure_score,momentum_score"),
    supabase.from("properties").select("id,title,price,status,seller_id").neq("status", "archived"),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score,seller_health_score,days_since_last_contact"),
    supabase.from("sellers").select("id,full_name"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done").not("due_at", "is", null).lt("due_at", nowIso),
    supabase.from("seller_commitments").select("seller_id,title,due_date").eq("status", "open").not("due_date", "is", null).lt("due_date", nowIso),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_health_score,buyer_conversion_probability,buyer_readiness_score,buyer_engagement_score,buyer_financing_score,days_since_activity,current_stage"),
    supabase.from("buyers").select("id,full_name,budget_min,budget_max,rooms_min,rooms_max,preferred_areas"),
    supabase.from("match_intelligence_profiles").select("id,buyer_id,property_id,closing_probability,risk_score,opportunity_score,revenue_score,urgency_score,match_stage,match_status"),
    supabase.from("external_listings").select("id,title,city,price,sqm,rooms,has_agent,opportunity_score,published_at").eq("status", "active").is("promoted_property_id", null).order("opportunity_score", { ascending: false }).limit(60),
    supabase.from("external_listing_history").select("listing_id").eq("change_type", "price_changed").gte("created_at", priceDropSince).limit(500),
    supabase.from("external_listing_duplicates").select("listing_id").eq("status", "suspected").limit(500),
  ]);

  const propMap = new Map((props.data ?? []).map((p) => [p.id, { title: p.title, price: p.price, status: p.status as string, seller_id: p.seller_id }]));
  const activePropCountBySeller = new Map<string, number>();
  for (const p of props.data ?? []) {
    if (p.seller_id && ACTIVE.includes(p.status as string)) activePropCountBySeller.set(p.seller_id, (activePropCountBySeller.get(p.seller_id) ?? 0) + 1);
  }

  const externalListings = extL.data ?? [];
  const cityAccum = new Map<string, { sum: number; n: number }>();
  for (const l of externalListings) {
    if (l.city && l.price && l.sqm) {
      const a = cityAccum.get(l.city) ?? { sum: 0, n: 0 };
      a.sum += l.price / l.sqm; a.n += 1; cityAccum.set(l.city, a);
    }
  }
  const externalCityAvgSqm = new Map([...cityAccum].map(([c, a]) => [c, a.n ? a.sum / a.n : 0]));

  return {
    propProfiles: pp.data ?? [],
    propMap,
    sellerProfiles: sp.data ?? [],
    sellerMap: new Map((sellers.data ?? []).map((s) => [s.id, s.full_name])),
    activePropCountBySeller,
    buyerProfiles: bp.data ?? [],
    buyerMap: new Map((buyers.data ?? []).map((b) => [b.id, b.full_name])),
    buyerCriteria: (buyers.data ?? []).map((b) => ({ budgetMin: b.budget_min, budgetMax: b.budget_max, roomsMin: b.rooms_min, roomsMax: b.rooms_max, areas: b.preferred_areas ?? [] })),
    matchProfiles: mp.data ?? [],
    overdueTasks: tasks.count ?? 0,
    overdueCommitments: (commits.data ?? []).map((c) => ({ seller_id: c.seller_id, title: c.title })),
    externalListings,
    externalPriceDrops: new Set((extH.data ?? []).map((h) => h.listing_id)),
    externalDuplicates: new Set((extD.data ?? []).map((dd) => dd.listing_id)),
    externalCityAvgSqm,
  };
}

// ── Attention ────────────────────────────────────────────────────────────────
function buildAttentionRows(orgId: string, d: OrgData): AttentionInsert[] {
  const rows: AttentionInsert[] = [];

  for (const p of d.propProfiles) {
    const info = d.propMap.get(p.property_id);
    if (!info) continue;
    const seller = info.seller_id ? d.sellerProfiles.find((s) => s.seller_id === info.seller_id) : undefined;
    let severity = "low", urgency = 0, reason = "", action = "";
    if (p.risk_score >= 60) { severity = "high"; urgency = 78; reason = "סיכונים פעילים בנכס"; action = "טפל בסיכונים במרכז ניהול הנכס"; }
    else if (p.momentum_score < 40) { severity = "medium"; urgency = 70; reason = "מומנטום נמוך — אין מספיק פעילות"; action = "בצע מנוף צמיחה או קדם שלב"; }
    else if (p.marketing_score < 45) { severity = "medium"; urgency = 48; reason = "ציון שיווק נמוך"; action = "השלם חומרי שיווק"; }
    else continue;

    const revenueImpact = calculateRevenueImpactScore({ price: info.price });
    const relationshipImpact = calculateRelationshipImpactScore({ trust: seller?.seller_trust_score, churn: seller?.seller_churn_risk_score });
    const churnImpact = calculateChurnImpactScore({ churnRisk: seller?.seller_churn_risk_score });
    const urgencyScore = calculateUrgencyScore({ overdue: p.momentum_score < 40, churnRisk: seller?.seller_churn_risk_score, severity });
    const u = clamp((urgency + urgencyScore) / 2);
    const impact = calculateImpactScore({ revenueImpact, relationshipImpact, churnImpact });
    rows.push({
      org_id: orgId, entity_type: "property", entity_id: p.property_id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 75 }),
      urgency_score: u, impact_score: impact, confidence_score: 75,
      revenue_impact_score: revenueImpact, relationship_impact_score: relationshipImpact, churn_impact_score: churnImpact,
      title: info.title, reason, recommended_action: action, expected_outcome: "האצת המכירה והקטנת סיכון", status: "open",
    });
  }

  for (const s of d.sellerProfiles) {
    const churn = s.seller_churn_risk_score;
    const trust = s.seller_trust_score;
    const days = s.days_since_last_contact;
    if (!(churn >= 50 || trust < 45 || (days ?? 0) >= 21)) continue;
    const severity = churn >= 75 ? "critical" : churn >= 50 ? "high" : "medium";
    const revenueImpact = calculateRevenueImpactScore({ activeProperties: d.activePropCountBySeller.get(s.seller_id) ?? 0 });
    const relationshipImpact = calculateRelationshipImpactScore({ trust, churn });
    const u = calculateUrgencyScore({ daysSinceActivity: days, churnRisk: churn, severity });
    const impact = calculateImpactScore({ revenueImpact, relationshipImpact, churnImpact: churn });
    rows.push({
      org_id: orgId, entity_type: "seller", entity_id: s.seller_id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 80 }),
      urgency_score: u, impact_score: impact, confidence_score: 80,
      revenue_impact_score: revenueImpact, relationship_impact_score: relationshipImpact, churn_impact_score: churn,
      title: d.sellerMap.get(s.seller_id) ?? "מוכר",
      reason: churn >= 50 ? `סיכון נטישה ${churn}` : trust < 45 ? `אמון נמוך ${trust}` : `אין קשר ${days} ימים`,
      recommended_action: "התקשר למוכר / שלח דוח עדכון", expected_outcome: "שימור בלעדיות וחיזוק אמון", status: "open",
    });
  }

  for (const c of d.overdueCommitments) {
    rows.push({
      org_id: orgId, entity_type: "seller", entity_id: c.seller_id,
      attention_score: 82, urgency_score: 88, impact_score: 70, confidence_score: 90,
      revenue_impact_score: 50, relationship_impact_score: 80, churn_impact_score: 60,
      title: `${d.sellerMap.get(c.seller_id) ?? "מוכר"} · התחייבות באיחור`,
      reason: `התחייבות לא קוימה: ${c.title}`, recommended_action: "השלם את ההתחייבות מיד", expected_outcome: "מניעת ירידת אמון", status: "open",
    });
  }

  for (const bu of d.buyerProfiles) {
    const conv = bu.buyer_conversion_probability;
    const days = bu.days_since_activity;
    const closeToPurchase = conv >= 65;
    const atRisk = bu.buyer_health_score < 45 || (days ?? 0) >= 14;
    if (!closeToPurchase && !atRisk) continue;
    const severity = closeToPurchase ? "high" : (days ?? 0) >= 21 ? "high" : "medium";
    const revenueImpact = clamp(conv);
    const relationshipImpact = clamp(100 - bu.buyer_health_score);
    const u = closeToPurchase
      ? clamp(60 + conv * 0.3)
      : calculateUrgencyScore({ daysSinceActivity: days, severity });
    const impact = calculateImpactScore({ revenueImpact, relationshipImpact, churnImpact: 0 });
    rows.push({
      org_id: orgId, entity_type: "buyer", entity_id: bu.buyer_id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 78 }),
      urgency_score: u, impact_score: impact, confidence_score: 78,
      revenue_impact_score: revenueImpact, relationship_impact_score: relationshipImpact, churn_impact_score: 0,
      title: d.buyerMap.get(bu.buyer_id) ?? "קונה",
      reason: closeToPurchase ? `קרוב לסגירה (${conv}%)` : bu.buyer_health_score < 45 ? `בריאות נמוכה ${bu.buyer_health_score}` : `אין פעילות ${days} ימים`,
      recommended_action: closeToPurchase ? "לקדם לסגירה / לתאם ביקור" : "שיחת מעקב עם הקונה",
      expected_outcome: closeToPurchase ? "מימוש עסקה" : "החזרת הקונה למסלול", status: "open",
    });
  }

  const matchTitle = (mm: OrgData["matchProfiles"][number]) =>
    `${d.buyerMap.get(mm.buyer_id) ?? "קונה"} ← ${d.propMap.get(mm.property_id)?.title ?? "נכס"}`;
  for (const mm of d.matchProfiles) {
    if (mm.match_status !== "active" || mm.match_stage === "closed" || mm.match_stage === "lost") continue;
    const atRisk = mm.risk_score >= 55;
    const urgentNeg = mm.match_stage === "negotiation" || mm.match_stage === "offer_submitted";
    const highValue = mm.opportunity_score >= 70;
    if (!atRisk && !urgentNeg && !highValue) continue;
    const u = clamp(mm.urgency_score * 0.6 + (urgentNeg ? 30 : 0) + (atRisk ? 20 : 0));
    const impact = calculateImpactScore({ revenueImpact: mm.revenue_score, relationshipImpact: 50, churnImpact: 0 });
    rows.push({
      org_id: orgId, entity_type: "match", entity_id: mm.id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 80 }),
      urgency_score: u, impact_score: impact, confidence_score: 80,
      revenue_impact_score: mm.revenue_score, relationship_impact_score: 50, churn_impact_score: mm.risk_score,
      title: matchTitle(mm),
      reason: atRisk ? `עסקה בסיכון ${mm.risk_score}` : urgentNeg ? "עסקה במשא ומתן" : `הזדמנות גבוהה ${mm.opportunity_score}`,
      recommended_action: atRisk ? "לטפל בסיכוני העסקה" : "לקדם את העסקה לסגירה",
      expected_outcome: "מימוש עסקה והגדלת הכנסה", status: "open",
    });
  }

  return rows.sort((a, b) => (b.attention_score ?? 0) - (a.attention_score ?? 0));
}

function buildOpportunityRows(orgId: string, d: OrgData): OppInsert[] {
  const rows: OppInsert[] = [];
  for (const p of d.propProfiles) {
    const info = d.propMap.get(p.property_id);
    if (!info) continue;
    const revenue = calculateRevenueImpactScore({ price: info.price });
    if (p.marketing_score < 60)
      rows.push({ org_id: orgId, entity_type: "property", entity_id: p.property_id, opportunity_score: clamp((100 - p.marketing_score) * 0.6 + revenue * 0.4), impact_score: revenue, confidence_score: 75, title: `${info.title} · רענון שיווק`, description: "הוספת וידאו / תמונות / תיאור משפרת פניות.", recommended_action: "הוסף וידאו ורענן חומרי שיווק", status: "open" });
    if (p.exposure_score < 50)
      rows.push({ org_id: orgId, entity_type: "property", entity_id: p.property_id, opportunity_score: clamp((100 - p.exposure_score) * 0.5 + revenue * 0.5), impact_score: revenue, confidence_score: 70, title: `${info.title} · הרחבת חשיפה`, description: "פרסום בערוץ נוסף יגדיל פניות.", recommended_action: "הוסף ערוץ חשיפה חדש", status: "open" });
  }
  for (const s of d.sellerProfiles) {
    if (s.seller_trust_score >= 70 && (d.activePropCountBySeller.get(s.seller_id) ?? 0) > 0)
      rows.push({ org_id: orgId, entity_type: "seller", entity_id: s.seller_id, opportunity_score: 60, impact_score: 60, confidence_score: 70, title: `${d.sellerMap.get(s.seller_id) ?? "מוכר"} · חיזוק שותפות`, description: "מוכר באמון גבוה — הזדמנות להרחבת שיתוף פעולה.", recommended_action: "קבע פגישת אסטרטגיה לשימור", status: "open" });
  }
  for (const bu of d.buyerProfiles) {
    const name = d.buyerMap.get(bu.buyer_id) ?? "קונה";
    if (bu.buyer_readiness_score >= 70)
      rows.push({ org_id: orgId, entity_type: "buyer", entity_id: bu.buyer_id, opportunity_score: clamp(bu.buyer_readiness_score), impact_score: clamp(bu.buyer_conversion_probability), confidence_score: 80, title: `${name} · קונה מוכן`, description: "קונה במוכנות גבוהה לרכישה.", recommended_action: "להציג נכסים מתאימים ולתאם ביקור", status: "open" });
    else if (bu.buyer_financing_score >= 70)
      rows.push({ org_id: orgId, entity_type: "buyer", entity_id: bu.buyer_id, opportunity_score: 65, impact_score: clamp(bu.buyer_conversion_probability), confidence_score: 75, title: `${name} · מימון מוכן`, description: "מימון מאושר — הזדמנות לקדם עסקה.", recommended_action: "לקדם הצגת נכסים וביקורים", status: "open" });
    else if (bu.buyer_engagement_score >= 70)
      rows.push({ org_id: orgId, entity_type: "buyer", entity_id: bu.buyer_id, opportunity_score: 58, impact_score: 55, confidence_score: 70, title: `${name} · מעורבות גבוהה`, description: "קונה מעורב מאוד — לנצל את התנופה.", recommended_action: "לתאם ביקור / שיחת המשך", status: "open" });
  }
  for (const mm of d.matchProfiles) {
    if (mm.match_status === "active" && mm.match_stage !== "closed" && mm.match_stage !== "lost" && mm.closing_probability >= 65) {
      rows.push({ org_id: orgId, entity_type: "match", entity_id: mm.id, opportunity_score: clamp(mm.opportunity_score), impact_score: mm.revenue_score, confidence_score: mm.closing_probability, title: `${d.buyerMap.get(mm.buyer_id) ?? "קונה"} ← ${d.propMap.get(mm.property_id)?.title ?? "נכס"} · עסקה קרובה לסגירה`, description: `הסתברות סגירה ${mm.closing_probability}%.`, recommended_action: "לקדם לסגירה — ביקור/הצעה", status: "open" });
    }
  }
  // External listings — opportunity signals only (NEVER auto-promoted to CRM).
  // A signal is generated when ANY interesting condition holds — not a single
  // score gate — so relevant external listings always surface in the brain.
  const HIGH_OPP = 60;
  const buyerMatch = (l: OrgData["externalListings"][number]): boolean => {
    if (!d.buyerCriteria.length) return false;
    return d.buyerCriteria.some((b) => {
      const cityOk = !b.areas.length || (l.city != null && b.areas.some((a) => a && l.city != null && (a === l.city || a.includes(l.city!) || l.city!.includes(a))));
      const priceOk = l.price == null || ((b.budgetMin == null || l.price >= b.budgetMin) && (b.budgetMax == null || l.price <= b.budgetMax));
      const roomsOk = l.rooms == null || ((b.roomsMin == null || l.rooms >= b.roomsMin) && (b.roomsMax == null || l.rooms <= b.roomsMax));
      // Require at least a budget or area match to count (avoid matching everyone).
      const hasCriteria = b.areas.length > 0 || b.budgetMin != null || b.budgetMax != null;
      return hasCriteria && cityOk && priceOk && roomsOk;
    });
  };
  for (const l of d.externalListings) {
    const sqmP = l.price && l.sqm ? l.price / l.sqm : null;
    const cityAvg = l.city ? d.externalCityAvgSqm.get(l.city) ?? 0 : 0;
    const belowAvg = sqmP != null && cityAvg > 0 && sqmP <= cityAvg * 0.9;
    const privateOwner = l.has_agent === false;
    const priceDrop = d.externalPriceDrops.has(l.id);
    const isDup = d.externalDuplicates.has(l.id);
    const highScore = l.opportunity_score >= HIGH_OPP;
    const fitsBuyer = buyerMatch(l);
    // Only generate a signal if the listing is actually interesting.
    if (!(belowAvg || privateOwner || priceDrop || isDup || highScore || fitsBuyer)) continue;
    const reasons: string[] = [];
    if (belowAvg) reasons.push("מתחת לממוצע השוק");
    if (priceDrop) reasons.push("ירידת מחיר לאחרונה");
    if (privateOwner) reasons.push("בעלים פרטי (ללא תיווך)");
    if (fitsBuyer) reasons.push("תואם קונה פעיל");
    if (isDup) reasons.push("חשד לכפילות");
    if (!reasons.length && highScore) reasons.push("ציון הזדמנות גבוה");
    // Potential double-side (דו״צ): we have a matching buyer AND can plausibly
    // win the seller side (private owner) or the listing is below market.
    const doubleSide = fitsBuyer && (privateOwner || belowAvg);
    if (doubleSide) reasons.unshift("פוטנציאל עסקת דו״צ");
    // Boost the stored score: double-side > buyer-fit > below-avg.
    const score = clamp(Math.max(l.opportunity_score, doubleSide ? 82 : 0, fitsBuyer ? 70 : 0, belowAvg ? 75 : 0));
    rows.push({
      org_id: orgId, entity_type: "external_listing", entity_id: l.id,
      opportunity_score: score, impact_score: clamp(l.opportunity_score),
      confidence_score: isDup ? 55 : 70,
      title: `${doubleSide ? "דו״צ פוטנציאלי · " : ""}${l.title ?? "מודעה חיצונית"}${l.city ? ` · ${l.city}` : ""}`,
      description: `מודעה חיצונית: ${reasons.join(" · ")}.`,
      recommended_action: doubleSide ? "פעולת דו״צ: גייס את הבעלים והצג לקונה התואם" : fitsBuyer ? "התאם לקונה הפעיל ותאם הצגה" : privateOwner ? "צור קשר עם הבעלים לבדיקת בלעדיות" : "בדוק את המודעה ושקול יצירת קשר",
      status: "open",
    });
  }
  return rows.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)).slice(0, 50);
}

// ── Orchestration ────────────────────────────────────────────────────────────
export async function recalculateOrganizationDecisionBrain(): Promise<void> {
  const orgId = await currentOrgId();
  await decisionIntelligenceRepository.ensure(orgId);
  const d = await gatherOrgData();

  const attentionRows = buildAttentionRows(orgId, d);
  const oppRows = buildOpportunityRows(orgId, d);

  await attentionRepository.clearOpen(orgId);
  await attentionRepository.insertMany(attentionRows);
  await opportunityRepository.clear(orgId);
  await opportunityRepository.insertMany(oppRows);

  // Priority queue: attention items + (discounted) opportunities, ranked.
  type Cand = { entity_type: string; entity_id: string; priority: number; title: string; reason: string; action_type: string; impact: string };
  const cands: Cand[] = [
    ...attentionRows.map((a) => ({ entity_type: a.entity_type, entity_id: a.entity_id, priority: a.attention_score ?? 0, title: a.title, reason: a.reason ?? "", action_type: "attention", impact: a.recommended_action ?? "" })),
    ...oppRows.map((o) => ({ entity_type: o.entity_type, entity_id: o.entity_id, priority: clamp((o.opportunity_score ?? 0) * 0.8), title: o.title, reason: o.description ?? "", action_type: "opportunity", impact: o.recommended_action ?? "" })),
  ].sort((x, y) => y.priority - x.priority).slice(0, 25);

  await decisionQueueRepository.clear(orgId);
  await decisionQueueRepository.insertMany(cands.map((c, i) => ({
    org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, priority_score: c.priority, rank_position: i + 1,
    title: c.title, reason: c.reason, action_type: c.action_type, action_payload: {} as never, expected_impact: c.impact, status: "open",
  })));

  await recommendationRepository.clear(orgId);
  await recommendationRepository.insertMany(cands.slice(0, 8).map((c) => ({
    org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, recommendation_type: c.action_type,
    title: c.impact || c.title, description: c.reason, urgency_score: c.priority, impact_score: c.priority, confidence_score: 75,
    expected_result: c.action_type === "opportunity" ? "הגדלת פוטנציאל הכנסה" : "הקטנת סיכון והאצת ביצוע",
  })));

  // Org scores + metrics + decision outputs.
  const activeProperties = [...d.propMap.values()].filter((p) => ACTIVE.includes(p.status)).length;
  const highRiskProperties = d.propProfiles.filter((p) => p.risk_score >= 60).length;
  const stalledProperties = d.propProfiles.filter((p) => p.momentum_score < 40).length;
  const highRiskSellers = d.sellerProfiles.filter((s) => s.seller_churn_risk_score >= 60).length;
  const stalledSellers = d.sellerProfiles.filter((s) => (s.days_since_last_contact ?? 0) >= 21).length;
  const activeSellers = d.sellerProfiles.length;

  const health = clamp(avg([avg(d.propProfiles.map((p) => p.success_score)), avg(d.sellerProfiles.map((s) => s.seller_health_score))].filter((n) => n > 0)));
  const risk = clamp(avg([avg(d.propProfiles.map((p) => p.risk_score)), avg(d.sellerProfiles.map((s) => s.seller_churn_risk_score))]));
  const growth = clamp(avg([avg(d.propProfiles.map((p) => p.momentum_score)), avg(d.propProfiles.map((p) => p.exposure_score))]));
  const execution = clamp(100 - Math.min(100, d.overdueTasks * 10 + d.overdueCommitments.length * 15));
  const attentionScore = clamp(avg(attentionRows.slice(0, 5).map((a) => a.attention_score ?? 0)));
  const revenue = clamp(avg([...d.propMap.values()].filter((p) => ACTIVE.includes(p.status)).map((p) => calculateRevenueImpactScore({ price: p.price }))));

  const top = cands[0];
  await decisionIntelligenceRepository.update(orgId, {
    organization_health_score: health, organization_risk_score: risk, organization_growth_score: growth,
    organization_execution_score: execution, organization_attention_score: attentionScore, organization_revenue_score: revenue,
    active_properties: activeProperties, active_sellers: activeSellers,
    high_risk_properties: highRiskProperties, high_risk_sellers: highRiskSellers,
    stalled_properties: stalledProperties, stalled_sellers: stalledSellers,
    overdue_tasks: d.overdueTasks, overdue_commitments: d.overdueCommitments.length,
    top_priority_entity_id: top?.entity_id ?? null, top_priority_entity_type: top?.entity_type ?? null, top_priority_reason: top?.reason ?? null,
    executive_summary: `${activeProperties} נכסים פעילים · ${highRiskProperties} בסיכון · ${attentionRows.length} פריטים דורשים תשומת לב.`,
    risk_summary: `${highRiskProperties} נכסים ו-${highRiskSellers} מוכרים בסיכון גבוה · ${d.overdueCommitments.length} התחייבויות באיחור.`,
    growth_summary: oppRows[0] ? `הזדמנות מובילה: ${oppRows[0].title}.` : "אין הזדמנויות פתוחות כרגע.",
    next_best_business_action: top?.impact || top?.title || "אין פעולה דחופה",
    last_calculated_at: new Date().toISOString(),
  });
}

export async function initializeOrganizationDecisionBrain(): Promise<void> {
  const orgId = await currentOrgId();
  await decisionIntelligenceRepository.ensure(orgId);
  await recalculateOrganizationDecisionBrain();
}

// individual generators (exposed per spec; recalc runs them together)
export async function generateAttentionItems(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateOpportunitySignals(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateDecisionQueue(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateRecommendations(): Promise<void> { await recalculateOrganizationDecisionBrain(); }

// ── Read models ──────────────────────────────────────────────────────────────
export interface ExecutiveCommandCenter {
  profile: DecisionProfileRow | null;
  attention: AttentionItemRow[];
  opportunities: OpportunityRow[];
  queue: QueueRow[];
  recommendations: RecommendationRow[];
  upcomingCommitments: { id: string; title: string; due: string | null; sellerName: string }[];
  revenuePipeline: number;
  /** Debug counters for the External Listings → Decision Brain integration. */
  externalDebug: { listingsLoaded: number; opportunities: number; inQueue: number; inRecommendations: number };
}

export async function getExecutiveCommandCenter(): Promise<ExecutiveCommandCenter> {
  const orgId = await currentOrgId();
  const supabase = await createClient();
  const [profile, attention, opportunities, queue, recommendations, commitsRes, sellersRes, revRes, extCountRes] = await Promise.all([
    decisionIntelligenceRepository.get(orgId),
    attentionRepository.listOpen(),
    opportunityRepository.list(),
    decisionQueueRepository.list(),
    recommendationRepository.list(),
    supabase.from("seller_commitments").select("id,seller_id,title,due_date").eq("status", "open").order("due_date", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("sellers").select("id,full_name"),
    supabase.from("revenue_signals").select("probability_weighted_revenue").limit(1000),
    supabase.from("external_listings").select("id", { count: "exact", head: true }).eq("status", "active").is("promoted_property_id", null),
  ]);
  const names = new Map((sellersRes.data ?? []).map((s) => [s.id, s.full_name]));
  const revenuePipeline = (revRes.data ?? []).reduce((s, r) => s + (r.probability_weighted_revenue ?? 0), 0);
  const isExt = (t: string) => t === "external_listing";
  return {
    profile,
    attention,
    opportunities,
    queue,
    recommendations,
    upcomingCommitments: (commitsRes.data ?? []).map((c) => ({ id: c.id, title: c.title, due: c.due_date, sellerName: names.get(c.seller_id) ?? "מוכר" })),
    revenuePipeline,
    externalDebug: {
      listingsLoaded: extCountRes.count ?? 0,
      opportunities: opportunities.filter((o) => isExt(o.entity_type)).length,
      inQueue: queue.filter((q) => isExt(q.entity_type)).length,
      inRecommendations: recommendations.filter((r) => r.entity_type != null && isExt(r.entity_type)).length,
    },
  };
}

export interface FocusItem {
  entityType: string;
  entityId: string;
  title: string;
  why: string;
  action: string;
  priority: number;
}

export async function getTodaysFocus(): Promise<FocusItem[]> {
  const queue = await decisionQueueRepository.list();
  return queue.slice(0, 5).map((q) => ({
    entityType: q.entity_type,
    entityId: q.entity_id,
    title: q.title,
    why: q.reason ?? "",
    action: q.expected_impact ?? "",
    priority: q.priority_score,
  }));
}
