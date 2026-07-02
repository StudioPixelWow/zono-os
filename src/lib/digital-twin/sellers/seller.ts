// ============================================================================
// 🏷️ Seller Digital Twin — profile · learning · decisions · missions · classify.
// 28.2. Parts 1–6. Evidence-only: sparse data → conservative profile + low
// confidence (never fabricated). Reuses the framework primitives.
// ============================================================================
import { clamp } from "../core";
import type { TwinActivity, TwinDecisionSignal, TwinMissionSignal, TwinLearning } from "../types";
import type { SellerSeed, SellerActivityInput, SellerProfile, SellerBehavior, ExpectedWindow } from "./types";

const DAY = 86400000;
const HIGH_VALUE = 4_000_000;

const KIND_MAP: Record<string, string> = {
  call: "call", phone: "call", meeting: "meeting", meet: "meeting",
  message: "message", whatsapp: "message", sms: "message", email: "message",
  valuation: "valuation_sent", cma: "valuation_sent", appraisal: "valuation_sent",
  price: "price_discussion", objection: "objection", document: "document", doc: "document",
  visit: "visit", showing: "visit", tour: "visit",
  agreement: "agreement", listing: "agreement", contract: "agreement",
  status: "status_change", followup: "follow_up", "follow-up": "follow_up", reminder: "follow_up",
};
export function canonicalSellerKind(raw: string): string {
  const k = (raw || "").toLowerCase();
  for (const key of Object.keys(KIND_MAP)) if (k.includes(key)) return KIND_MAP[key];
  return "other";
}
export function toTwinActivities(acts: SellerActivityInput[]): TwinActivity[] {
  return acts.map((a) => { const kind = canonicalSellerKind(a.kind); return { id: a.id, kind, at: a.at, summary: a.summary || kind, weight: kind === "agreement" || kind === "valuation_sent" ? 3 : kind === "meeting" || kind === "call" ? 2 : 1 }; });
}

function behaviorFrom(acts: TwinActivity[]): SellerBehavior {
  const c = (k: string) => acts.filter((a) => a.kind === k).length;
  return {
    calls: c("call"), meetings: c("meeting"), messages: c("message"), valuationsSent: c("valuation_sent"),
    priceDiscussions: c("price_discussion"), objections: c("objection"), documents: c("document"),
    visits: c("visit"), agreements: c("agreement"), statusChanges: c("status_change"), followUps: c("follow_up"),
  };
}

const URGENCY_MAP: Record<string, number> = { urgent: 90, high: 80, medium: 50, low: 30, none: 15 };

/** Part 1 — compute the Seller profile from real seed + activities (evidence-only). */
export function computeSellerProfile(seed: SellerSeed, activities: TwinActivity[], now: number = Date.now()): SellerProfile {
  const b = behaviorFrom(activities);
  const ats = activities.map((a) => a.at).sort();
  const lastAt = ats.length ? ats[ats.length - 1] : null;
  const daysSinceLast = lastAt ? (now - new Date(lastAt).getTime()) / DAY : null;
  const recency = daysSinceLast == null ? 0 : daysSinceLast <= 3 ? 100 : daysSinceLast <= 14 ? 75 : daysSinceLast <= 30 ? 45 : daysSinceLast <= 90 ? 20 : 5;

  const fields = [seed.desiredPrice != null, !!seed.motivationLabel || !!seed.urgencyLevel, seed.hasPhone || seed.hasEmail, seed.propertyId != null, !!seed.decisionStyle];
  const completeness = clamp((fields.filter(Boolean).length / fields.length) * 100);

  const urgencyBase = URGENCY_MAP[(seed.urgencyLevel ?? "").toLowerCase()] ?? 40;
  const mustSellSoon = seed.mustSellBy ? (new Date(seed.mustSellBy).getTime() - now) / DAY : null;
  const urgency = clamp(urgencyBase * 0.6 + recency * 0.2 + (mustSellSoon != null && mustSellSoon <= 60 ? 30 : mustSellSoon != null && mustSellSoon <= 120 ? 15 : 0) + seed.timeSensitivity * 0.1);

  const engagement = clamp(Math.min(100, activities.length * 9) + b.meetings * 6 + b.valuationsSent * 8);
  const motivation = clamp(urgencyBase * 0.4 + engagement * 0.25 + seed.timeSensitivity * 0.2 + (seed.motivationLabel ? 15 : 0) - Math.min(20, b.objections * 5));
  const trust = clamp(35 + seed.trustSensitivity * 0.25 + seed.cooperation * 0.2 + (seed.hasPhone ? 10 : 0) + Math.min(20, (b.calls + b.meetings) * 4) - Math.min(20, b.objections * 4));
  const communicationHealth = clamp(Math.min(100, (b.calls + b.meetings + b.messages + b.followUps) * 12) * 0.7 + recency * 0.3);

  const priceExpectation = seed.desiredPrice ?? seed.dreamPrice ?? null;
  let priceGap: number | null = null, priceGapPct: number | null = null;
  if (priceExpectation != null && seed.estimatedValue != null && seed.estimatedValue > 0) {
    priceGap = priceExpectation - seed.estimatedValue;
    priceGapPct = Math.round((priceGap / seed.estimatedValue) * 100);
  }

  const priceResistance = clamp(seed.priceSensitivity * 0.5 + (priceGapPct != null && priceGapPct > 10 ? Math.min(40, priceGapPct) : 0) + b.priceDiscussions * 6 + b.objections * 6);
  const readinessToSign = seed.hasSignedAgreement ? 100 : clamp(motivation * 0.35 + trust * 0.2 + engagement * 0.2 + seed.cooperation * 0.15 + (b.agreements > 0 ? 20 : 0) - priceResistance * 0.15);
  const churnRisk = clamp((100 - recency) * 0.35 + priceResistance * 0.3 + (100 - trust) * 0.2 + Math.min(30, b.objections * 8) * 0.15 + (seed.hasSignedAgreement ? -40 : 0));
  const sellerConfidence = clamp(motivation * 0.35 + readinessToSign * 0.3 + trust * 0.2 + (100 - churnRisk) * 0.15);

  const expectedWindow: ExpectedWindow = urgency >= 70 ? "0-1m" : urgency >= 45 ? "1-3m" : urgency >= 25 ? "3-6m" : "6m+";
  const timeline = { "0-1m": "0–1 חודשים", "1-3m": "1–3 חודשים", "3-6m": "3–6 חודשים", "6m+": "מעל 6 חודשים" }[expectedWindow];

  const objections: string[] = [];
  if (seed.mainObjection) objections.push(seed.mainObjection);
  if (b.objections >= 2) objections.push(`${b.objections} התנגדויות חוזרות`);
  if (priceGapPct != null && priceGapPct > 10) objections.push(`ציפיית מחיר גבוהה ב-${priceGapPct}%`);

  const nextBestAction =
    completeness < 50 ? "אסוף מידע חסר / הכן CMA"
    : readinessToSign >= 70 && !seed.hasSignedAgreement ? "שלח הסכם התקשרות"
    : priceGapPct != null && priceGapPct > 10 ? "הצע עדכון מחיר עם CMA"
    : churnRisk >= 60 ? "פעולת שימור — התקשר למוכר"
    : motivation >= 55 ? "קבע פגישה / שלח הערכת שווי"
    : "טפח את המוכר — מעקב";

  return {
    motivation, trust, priceExpectation, priceGap, priceGapPct, urgency, readinessToSign, churnRisk,
    sellerConfidence, communicationHealth, propertyLink: seed.propertyId, valuationLink: seed.valuationId,
    timeline, expectedWindow, decisionStyle: seed.decisionStyle ?? "טרם ידוע",
    objections, nextBestAction, behavior: b, completeness,
  };
}

// ── Part 3 — learning / drift detection ──────────────────────────────────────
let _l = 0;
const lid = () => `sl-${++_l}`;
export function detectSellerLearning(seed: SellerSeed, profile: SellerProfile, activities: TwinActivity[], now: number = Date.now()): TwinLearning[] {
  _l = 0;
  const out: TwinLearning[] = [];
  const b = profile.behavior;
  const recent14 = activities.filter((a) => a.at && (now - new Date(a.at).getTime()) / DAY <= 14).length;

  if (profile.priceGapPct != null && profile.priceGapPct > 10) out.push({ id: lid(), type: "price_resistance", note: `ציפיית מחיר מעל השווי ב-${profile.priceGapPct}% — התנגדות מחיר`, confidence: 75, evidence: [`ציפייה ${profile.priceExpectation} מול שווי ${seed.estimatedValue}`] });
  if (b.priceDiscussions >= 2 || b.objections >= 2) out.push({ id: lid(), type: "repeated_objections", note: `${b.priceDiscussions + b.objections} דיוני מחיר/התנגדויות חוזרים`, confidence: 65, evidence: [`${b.priceDiscussions} דיוני מחיר · ${b.objections} התנגדויות`] });
  if (recent14 === 0 && activities.length > 0) out.push({ id: lid(), type: "stale_followup", note: "אין פעילות ב-14 יום — מעקב מתיישן", confidence: 65, evidence: [`${activities.length} פעילויות היסטוריות`] });
  if (profile.churnRisk >= 55) out.push({ id: lid(), type: "churn_risk", note: `סיכון נטישה גבוה (${profile.churnRisk}) — נדרש שימור`, confidence: 70, evidence: [`אמון ${profile.trust} · התנגדויות ${b.objections}`] });
  if (profile.trust < 40) out.push({ id: lid(), type: "trust_decline", note: `אמון נמוך (${profile.trust}) — חזק קשר לפני חתימה`, confidence: 60, evidence: [`שיתוף פעולה ${seed.cooperation}`] });
  if (b.valuationsSent > 0 && b.agreements === 0 && profile.readinessToSign < 50) out.push({ id: lid(), type: "valuation_mismatch", note: "נשלחה הערכה אך אין התקדמות — ייתכן פער ציפיות", confidence: 60, evidence: [`${b.valuationsSent} הערכות נשלחו`] });
  if (b.agreements > 0 || profile.readinessToSign >= 70) out.push({ id: lid(), type: "readiness_up", note: "מוכנות לחתימה עולה", confidence: 78, evidence: [`מוכנות ${profile.readinessToSign}`] });
  return out;
}

// ── Part 4 — decision signals ────────────────────────────────────────────────
let _d = 0;
const did = () => `sd-${++_d}`;
export function sellerDecisionSignals(seed: SellerSeed, profile: SellerProfile, recencyScore: number): TwinDecisionSignal[] {
  _d = 0;
  const out: TwinDecisionSignal[] = [];
  const b = profile.behavior;
  if (profile.completeness < 50) out.push({ id: did(), action: "אסוף מידע חסר", priority: clamp(65 + (50 - profile.completeness)), reason: `שלמות פרופיל ${profile.completeness}%`, evidence: ["חסרים שדות מפתח"], readiness: "needs_info" });
  if (b.valuationsSent === 0 || seed.estimatedValue == null) out.push({ id: did(), action: "הכן CMA ושלח הערכת שווי", priority: 68, reason: "אין הערכה עדכנית", evidence: [`${b.valuationsSent} הערכות נשלחו`], readiness: "ready" });
  if (profile.priceGapPct != null && profile.priceGapPct > 10) out.push({ id: did(), action: "הצע עדכון מחיר", priority: clamp(60 + Math.min(30, profile.priceGapPct)), reason: `פער מחיר ${profile.priceGapPct}%`, evidence: [`ציפייה ${profile.priceExpectation}`], readiness: "ready" });
  if (profile.churnRisk >= 55) out.push({ id: did(), action: "פעולת שימור — התקשר למוכר", priority: clamp(70 + profile.churnRisk * 0.2), reason: `סיכון נטישה ${profile.churnRisk}`, evidence: [`אמון ${profile.trust}`], readiness: "ready" });
  if (profile.motivation >= 55) out.push({ id: did(), action: recencyScore <= 45 ? "התקשר / קבע פגישה עם המוכר" : "קבע פגישה / שלח הערכת שווי", priority: clamp(52 + profile.motivation * 0.3), reason: "מוכר מוטיבציוני", evidence: [`מוטיבציה ${profile.motivation}`], readiness: "ready" });
  if (profile.readinessToSign >= 60 && !seed.hasSignedAgreement) out.push({ id: did(), action: "שלח הסכם התקשרות", priority: clamp(72 + profile.readinessToSign * 0.2), reason: "מוכנות גבוהה לחתימה", evidence: [`מוכנות ${profile.readinessToSign}`], readiness: "ready" });
  if (profile.motivation < 40 && profile.urgency < 40) out.push({ id: did(), action: "המתן — טפח את המוכר", priority: 30, reason: "מוטיבציה ודחיפות נמוכות", evidence: [`מוטיבציה ${profile.motivation}`], readiness: "wait" });
  return out.sort((a, b2) => b2.priority - a.priority);
}

// ── Part 5 — mission signals ─────────────────────────────────────────────────
let _m = 0;
const mid = () => `sm-${++_m}`;
export function sellerMissionSignals(seed: SellerSeed, profile: SellerProfile): TwinMissionSignal[] {
  _m = 0;
  const out: TwinMissionSignal[] = [];
  const b = profile.behavior;
  out.push({ id: mid(), missionType: "SELLER_FOLLOWUP", title: "מעקב מוכר", priority: clamp(45 + profile.motivation * 0.3), reason: "שמירה על קשר" });
  if (b.valuationsSent === 0 || seed.estimatedValue == null) out.push({ id: mid(), missionType: "VALUATION_REVIEW", title: "סקירת הערכת שווי", priority: 66, reason: "הכנת CMA" });
  if (profile.readinessToSign >= 60 && !seed.hasSignedAgreement) out.push({ id: mid(), missionType: "LISTING_AGREEMENT", title: "החתמת הסכם", priority: 78, reason: "מוכנות לחתימה" });
  if (profile.priceGapPct != null && profile.priceGapPct > 10) out.push({ id: mid(), missionType: "PRICE_REDUCTION", title: "עדכון מחיר", priority: clamp(60 + Math.min(25, profile.priceGapPct)), reason: "פער ציפיות מחיר" });
  if (profile.churnRisk >= 55) out.push({ id: mid(), missionType: "SELLER_RECOVERY", title: "שימור מוכר", priority: 74, reason: "סיכון נטישה" });
  if (seed.hasSignedAgreement) { out.push({ id: mid(), missionType: "PROPERTY_PREPARATION", title: "הכנת הנכס", priority: 62, reason: "לאחר חתימה" }); out.push({ id: mid(), missionType: "MARKETING_LAUNCH", title: "השקת שיווק", priority: 60, reason: "נכס מוכן לשיווק" }); }
  return out.sort((a, b2) => b2.priority - a.priority);
}

// ── Part 6 — Chief-of-Staff classification ──────────────────────────────────
export function classifySeller(seed: SellerSeed, profile: SellerProfile, recencyScore: number, totalActivities: number): string[] {
  const tags: string[] = [];
  if (profile.motivation >= 65 && profile.churnRisk < 55) tags.push("מוכר חם");
  if (profile.churnRisk >= 55) tags.push("בסיכון נטישה");
  if (profile.priceGapPct != null && profile.priceGapPct > 10) tags.push("פער מחיר");
  if (profile.readinessToSign >= 60 && !seed.hasSignedAgreement) tags.push("מוכן לחתימה");
  if (totalActivities > 0 && recencyScore <= 10) tags.push("מתיישן");
  if ((seed.desiredPrice ?? seed.estimatedValue ?? 0) >= HIGH_VALUE) tags.push("ערך גבוה");
  if (seed.hasSignedAgreement) tags.push("חתום");
  return [...new Set(tags)];
}
