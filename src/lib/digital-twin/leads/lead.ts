// ============================================================================
// 🎯 Lead Digital Twin — profile · learning · decisions · missions · classify.
// 28.3. Evidence-only: sparse data → conservative profile + low confidence
// (never fabricated). Reuses the framework primitives.
// ============================================================================
import { clamp } from "../core";
import type { TwinActivity, TwinDecisionSignal, TwinMissionSignal, TwinLearning } from "../types";
import type { LeadSeed, LeadActivityInput, LeadProfile, LeadBehavior, LeadIntent } from "./types";

const DAY = 86400000;

const SOURCE_QUALITY: Record<string, number> = {
  referral: 90, partner: 85, open_house: 80, sign_call: 75, website: 60, portal: 55,
  yad2: 60, madlan: 60, cold_outreach: 35, facebook: 45, instagram: 45, other: 40,
};
const STAGE_SCORE: Record<string, number> = {
  new: 20, contacted: 45, qualified: 70, nurturing: 55, converted: 100, lost: 5, disqualified: 0,
};
const INTENT_HE: Record<LeadIntent, string> = {
  buyer: "קונה", seller: "מוכר", both: "קונה+מוכר", investor: "משקיע", renter: "שוכר", unknown: "לא ידוע",
};

const KIND_MAP: Record<string, string> = {
  call: "call", phone: "call", message: "message", whatsapp: "message", sms: "message",
  email: "email", mail: "email", meeting: "meeting", meet: "meeting",
  visit: "visit", showing: "visit", status: "status_change", followup: "follow_up", "follow-up": "follow_up", reminder: "follow_up",
};
export function canonicalLeadKind(raw: string): string {
  const k = (raw || "").toLowerCase();
  for (const key of Object.keys(KIND_MAP)) if (k.includes(key)) return KIND_MAP[key];
  return "other";
}
export function toTwinActivities(acts: LeadActivityInput[]): TwinActivity[] {
  return acts.map((a) => { const kind = canonicalLeadKind(a.kind); return { id: a.id, kind, at: a.at, summary: a.summary || kind, weight: kind === "meeting" || kind === "call" ? 2 : 1 }; });
}
function behaviorFrom(acts: TwinActivity[]): LeadBehavior {
  const c = (k: string) => acts.filter((a) => a.kind === k).length;
  return { calls: c("call"), messages: c("message"), emails: c("email"), meetings: c("meeting"), visits: c("visit"), statusChanges: c("status_change"), followUps: c("follow_up") };
}

const BUY_RE = /(buy|purchase|looking to buy|קונה|לקנות|לרכוש|מחפש דירה|מעוניין לקנות)/i;
const SELL_RE = /(sell|listing|מוכר|למכור|נכס למכירה|רוצה למכור)/i;

/** Part 1 — compute the Lead profile from real seed + activities (evidence-only). */
export function computeLeadProfile(seed: LeadSeed, activities: TwinActivity[], now: number = Date.now()): LeadProfile {
  const b = behaviorFrom(activities);
  const lastRef = seed.lastActivityAt ?? (activities.length ? activities.map((a) => a.at).sort()[activities.length - 1] : null);
  const daysSinceLast = lastRef ? (now - new Date(lastRef).getTime()) / DAY : null;
  const recency = daysSinceLast == null ? 0 : daysSinceLast <= 3 ? 100 : daysSinceLast <= 14 ? 75 : daysSinceLast <= 30 ? 45 : daysSinceLast <= 90 ? 20 : 5;

  const sourceQuality = SOURCE_QUALITY[(seed.source ?? "").toLowerCase()] ?? (seed.source ? 50 : 30);
  const stageScore = STAGE_SCORE[(seed.stage ?? "").toLowerCase()] ?? 20;
  const engagement = clamp(Math.min(100, activities.length * 12) + b.meetings * 8);

  const fields = [seed.hasPhone || seed.hasEmail, seed.source != null, seed.intent !== "unknown", seed.score != null];
  const completeness = clamp((fields.filter(Boolean).length / fields.length) * 100);

  // Intent — from the lead record, inferred from the message when unknown.
  let intent: LeadIntent = seed.intent;
  let intentConfidence: number;
  if (seed.convertedBuyerId) { intent = "buyer"; intentConfidence = 95; }
  else if (seed.convertedSellerId) { intent = "seller"; intentConfidence = 95; }
  else if (seed.intent !== "unknown") intentConfidence = 75;
  else {
    const msg = seed.message ?? "";
    if (BUY_RE.test(msg) && SELL_RE.test(msg)) { intent = "both"; intentConfidence = 55; }
    else if (BUY_RE.test(msg)) { intent = "buyer"; intentConfidence = 55; }
    else if (SELL_RE.test(msg)) { intent = "seller"; intentConfidence = 55; }
    else intentConfidence = 20;
  }

  const leadQuality = clamp((seed.score != null ? seed.score * 0.4 : sourceQuality * 0.4) + sourceQuality * 0.25 + engagement * 0.2 + completeness * 0.15);
  const urgencyBoost = /sign_call|open_house/.test((seed.source ?? "").toLowerCase()) ? 20 : 0;
  const urgency = clamp(stageScore * 0.35 + recency * 0.35 + urgencyBoost + engagement * 0.15);

  const conversionProbability = (seed.stage === "lost" || seed.stage === "disqualified") ? clamp(stageScore)
    : seed.stage === "converted" ? 100
    : clamp(stageScore * 0.4 + leadQuality * 0.25 + urgency * 0.15 + intentConfidence * 0.1 + engagement * 0.1);

  const duplicateRisk = clamp(seed.duplicateContacts >= 2 ? 90 : seed.duplicateContacts === 1 ? 60 : 5);
  const contactRisk = clamp((!seed.hasPhone && !seed.hasEmail ? 90 : seed.hasPhone && seed.hasEmail ? 15 : 40) + (recency <= 10 && activities.length === 0 ? 10 : 0));
  const communicationHealth = clamp(Math.min(100, (b.calls + b.messages + b.emails + b.followUps) * 14) * 0.7 + recency * 0.3);

  const relationshipPath: string[] = [];
  if (seed.propertyId) relationshipPath.push(`נכס ${seed.propertyId.slice(0, 8)}`);
  if (seed.projectId) relationshipPath.push(`פרויקט ${seed.projectId.slice(0, 8)}`);
  if (seed.convertedBuyerId) relationshipPath.push("הומר לקונה");
  if (seed.convertedSellerId) relationshipPath.push("הומר למוכר");

  const nextBestAction =
    seed.stage === "converted" ? "הועבר ל-Twin קונה/מוכר — המשך שם"
    : seed.stage === "lost" || seed.stage === "disqualified" ? "סגור/העבר לטיפוח ארוך-טווח"
    : contactRisk >= 70 ? "אסוף פרטי קשר"
    : duplicateRisk >= 60 ? "בדוק/מזג כפילות"
    : seed.stage === "new" ? "צור קשר ראשוני"
    : intent === "unknown" ? "הסמך ליד — ברר כוונה"
    : intent === "buyer" ? "המר לקונה + שלח נכסים"
    : intent === "seller" ? "המר למוכר + הצע הערכת שווי"
    : "טפח ליד ומעקב";

  return {
    source: seed.source, sourceQuality, leadQuality, intent, intentConfidence,
    buyerSellerFit: INTENT_HE[intent], urgency, conversionProbability, duplicateRisk, contactRisk,
    communicationHealth, relationshipPath, stage: seed.stage, nextBestAction, behavior: b, completeness,
  };
}

// ── Part 3 — learning / drift detection ──────────────────────────────────────
let _l = 0;
const lid = () => `ll-${++_l}`;
export function detectLeadLearning(seed: LeadSeed, profile: LeadProfile, activities: TwinActivity[], now: number = Date.now()): TwinLearning[] {
  _l = 0;
  const out: TwinLearning[] = [];
  const recent14 = activities.filter((a) => a.at && (now - new Date(a.at).getTime()) / DAY <= 14).length;
  if (profile.intent !== "unknown" && seed.intent === "unknown") out.push({ id: lid(), type: "intent_detected", note: `כוונה זוהתה מהמסר: ${profile.buyerSellerFit}`, confidence: profile.intentConfidence, evidence: [seed.message ?? "מסר הליד"] });
  if (profile.duplicateRisk >= 60) out.push({ id: lid(), type: "duplicate_risk", note: `סיכון כפילות (${seed.duplicateContacts} התאמות קשר)`, confidence: 70, evidence: [`${seed.duplicateContacts} לידים עם אותו טלפון/מייל`] });
  if (profile.contactRisk >= 70) out.push({ id: lid(), type: "low_contactability", note: "חסרים פרטי קשר — קושי ליצירת קשר", confidence: 65, evidence: ["אין טלפון/מייל"] });
  if (recent14 === 0 && (activities.length > 0 || seed.lastActivityAt)) out.push({ id: lid(), type: "going_cold", note: "אין פעילות ב-14 יום — הליד מתקרר", confidence: 65, evidence: [`שלב ${profile.stage}`] });
  if (["qualified", "nurturing"].includes(seed.stage)) out.push({ id: lid(), type: "qualification_progress", note: "הליד עבר הסמכה", confidence: 72, evidence: [`שלב ${profile.stage}`] });
  if (seed.stage === "converted") out.push({ id: lid(), type: "converted", note: "הליד הומר — הצלחה", confidence: 90, evidence: profile.relationshipPath });
  if (profile.conversionProbability >= 65) out.push({ id: lid(), type: "high_conversion", note: `סיכוי המרה גבוה (${profile.conversionProbability}%)`, confidence: 78, evidence: [`איכות ${profile.leadQuality}`] });
  return out;
}

// ── Part 4 — decision signals ────────────────────────────────────────────────
let _d = 0;
const did = () => `ld-${++_d}`;
export function leadDecisionSignals(seed: LeadSeed, profile: LeadProfile): TwinDecisionSignal[] {
  _d = 0;
  const out: TwinDecisionSignal[] = [];
  if (profile.contactRisk >= 70) out.push({ id: did(), action: "אסוף פרטי קשר", priority: 75, reason: "אין טלפון/מייל", evidence: ["פרטי קשר חסרים"], readiness: "needs_info" });
  if (profile.duplicateRisk >= 60) out.push({ id: did(), action: "בדוק/מזג כפילות", priority: 72, reason: `${seed.duplicateContacts} התאמות קשר`, evidence: ["חשד לכפילות"], readiness: "ready" });
  if (seed.stage === "new") out.push({ id: did(), action: "צור קשר ראשוני", priority: clamp(60 + profile.urgency * 0.3), reason: "ליד חדש", evidence: [`מקור ${profile.source ?? "לא ידוע"}`], readiness: "ready" });
  if (profile.intent === "unknown" && seed.stage !== "new") out.push({ id: did(), action: "הסמך ליד — ברר כוונה", priority: 62, reason: "כוונה לא ידועה", evidence: ["intent=unknown"], readiness: "needs_info" });
  if (profile.intent === "buyer" && ["contacted", "qualified", "nurturing"].includes(seed.stage)) out.push({ id: did(), action: "המר לקונה ושלח נכסים", priority: clamp(65 + profile.conversionProbability * 0.2), reason: "כוונת קנייה", evidence: [`המרה ${profile.conversionProbability}%`], readiness: "ready" });
  if (profile.intent === "seller" && ["contacted", "qualified", "nurturing"].includes(seed.stage)) out.push({ id: did(), action: "המר למוכר והצע הערכת שווי", priority: clamp(65 + profile.conversionProbability * 0.2), reason: "כוונת מכירה", evidence: [`המרה ${profile.conversionProbability}%`], readiness: "ready" });
  if (seed.stage === "nurturing") out.push({ id: did(), action: "טפח ליד — מעקב", priority: 48, reason: "בטיפוח", evidence: [`שלב ${profile.stage}`], readiness: "ready" });
  if (seed.stage === "lost" || seed.stage === "disqualified") out.push({ id: did(), action: "המתן — טיפוח ארוך-טווח", priority: 25, reason: "ליד אבוד", evidence: [seed.lostReason ?? "נסגר"], readiness: "wait" });
  return out.sort((a, b) => b.priority - a.priority);
}

// ── Part 5 — mission signals ─────────────────────────────────────────────────
let _m = 0;
const mid = () => `lm-${++_m}`;
export function leadMissionSignals(seed: LeadSeed, profile: LeadProfile): TwinMissionSignal[] {
  _m = 0;
  const out: TwinMissionSignal[] = [];
  if (!["converted", "lost", "disqualified"].includes(seed.stage)) out.push({ id: mid(), missionType: "LEAD_FOLLOWUP", title: "מעקב ליד", priority: clamp(45 + profile.urgency * 0.3), reason: "שמירה על קשר" });
  if (profile.intent === "unknown" || seed.stage === "new" || seed.stage === "contacted") out.push({ id: mid(), missionType: "LEAD_QUALIFICATION", title: "הסמכת ליד", priority: 64, reason: "בירור כוונה ואיכות" });
  if (profile.duplicateRisk >= 60) out.push({ id: mid(), missionType: "LEAD_DEDUPLICATION", title: "טיפול בכפילות", priority: 68, reason: "חשד לכפילות" });
  if (profile.intent === "buyer" && profile.conversionProbability >= 50) out.push({ id: mid(), missionType: "LEAD_CONVERT_BUYER", title: "המרה לקונה", priority: 74, reason: "כוונת קנייה" });
  if (profile.intent === "seller" && profile.conversionProbability >= 50) out.push({ id: mid(), missionType: "LEAD_CONVERT_SELLER", title: "המרה למוכר", priority: 74, reason: "כוונת מכירה" });
  if (seed.stage === "nurturing") out.push({ id: mid(), missionType: "LEAD_NURTURE", title: "טיפוח ליד", priority: 50, reason: "בטיפוח" });
  return out.sort((a, b) => b.priority - a.priority);
}

// ── Part 6 — Chief-of-Staff classification ──────────────────────────────────
export function classifyLead(seed: LeadSeed, profile: LeadProfile, recencyScore: number, totalActivities: number): string[] {
  const tags: string[] = [];
  if (profile.conversionProbability >= 65 && seed.stage !== "converted") tags.push("ליד חם");
  if (profile.conversionProbability < 30 || seed.stage === "lost" || seed.stage === "disqualified") tags.push("ליד קר");
  if (profile.intent === "buyer") tags.push("ליד קונה");
  if (profile.intent === "seller") tags.push("ליד מוכר");
  if (profile.duplicateRisk >= 60) tags.push("כפילות");
  if ((totalActivities > 0 || seed.lastActivityAt) && recencyScore <= 10 && seed.stage !== "converted") tags.push("מתיישן");
  if (["qualified", "nurturing"].includes(seed.stage)) tags.push("מוסמך");
  if (seed.stage === "converted") tags.push("הומר");
  if (profile.leadQuality >= 75) tags.push("איכות גבוהה");
  return [...new Set(tags)];
}
