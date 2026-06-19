/**
 * Communication & Relationship Intelligence — pure, deterministic, client-safe.
 * No server imports, no LLM calls. Turns communication signals into scores,
 * impacts, follow-up risk and AI-ready text. Future AI will enhance the text
 * generators without changing these signatures.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type Channel = "phone" | "whatsapp" | "email" | "meeting" | "note" | "system";
export type Direction = "inbound" | "outbound";
export type Sentiment = "positive" | "neutral" | "negative" | "urgent";

export const CHANNEL_LABELS: Record<string, string> = {
  phone: "שיחה", whatsapp: "וואטסאפ", email: "אימייל", meeting: "פגישה", note: "הערה", system: "מערכת",
};
export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "חיובי", neutral: "ניטרלי", negative: "שלילי", urgent: "דחוף",
};
const SENTIMENT_VALUE: Record<string, number> = { positive: 85, neutral: 55, negative: 20, urgent: 35 };

export interface CommunicationSignals {
  daysSinceContact: number | null;
  daysSinceInbound: number | null;
  unansweredMessages: number; // outbound with no inbound reply
  missedFollowups: number; // overdue follow-ups
  openCommitments: number;
  overdueCommitments: number;
  brokenCommitments: number;
  fulfilledCommitments: number;
  recentSentiments: string[]; // newest last
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  /** Days the relationship is allowed to go quiet before it's a concern. */
  contactThresholdDays: number;
}

// ── Scores ───────────────────────────────────────────────────────────────────
export function calculateResponsivenessScore(s: CommunicationSignals): number {
  if (s.totalMessages === 0) return 50;
  const replyRatio = s.outboundMessages > 0 ? s.inboundMessages / s.outboundMessages : s.inboundMessages > 0 ? 1 : 0;
  let v = 40 + Math.min(1, replyRatio) * 45;
  v -= Math.min(30, s.unansweredMessages * 8);
  if (s.daysSinceInbound != null) v -= Math.min(20, s.daysSinceInbound * 1.2);
  return clamp(v);
}

export function calculateSentimentScore(s: CommunicationSignals): number {
  if (!s.recentSentiments.length) return 55;
  // Weight recent sentiments more heavily (newest last).
  let weighted = 0, wsum = 0;
  s.recentSentiments.slice(-5).forEach((sent, i) => {
    const w = i + 1;
    weighted += (SENTIMENT_VALUE[sent] ?? 55) * w;
    wsum += w;
  });
  return clamp(wsum ? weighted / wsum : 55);
}

export function calculateFollowupRiskScore(s: CommunicationSignals): number {
  let v = 0;
  v += Math.min(40, s.missedFollowups * 20);
  v += Math.min(30, s.overdueCommitments * 15);
  v += Math.min(20, s.brokenCommitments * 20);
  v += Math.min(20, s.unansweredMessages * 7);
  if (s.daysSinceContact != null && s.daysSinceContact > s.contactThresholdDays)
    v += Math.min(25, (s.daysSinceContact - s.contactThresholdDays) * 2);
  return clamp(v);
}

export function calculateCommunicationHealthScore(s: CommunicationSignals): number {
  const responsiveness = calculateResponsivenessScore(s);
  const sentiment = calculateSentimentScore(s);
  const risk = calculateFollowupRiskScore(s);
  // Recency component
  let recency = 70;
  if (s.daysSinceContact == null) recency = 40; // never contacted
  else if (s.daysSinceContact > s.contactThresholdDays * 2) recency = 20;
  else if (s.daysSinceContact > s.contactThresholdDays) recency = 45;
  else recency = 85;
  return clamp(responsiveness * 0.3 + sentiment * 0.25 + recency * 0.25 + (100 - risk) * 0.2);
}

/** Signed impact (-100..100) communication has on seller trust. */
export function calculateTrustImpactScore(s: CommunicationSignals): number {
  let v = 0;
  v += s.fulfilledCommitments * 8;
  v -= s.brokenCommitments * 18;
  v -= s.overdueCommitments * 8;
  v += (calculateSentimentScore(s) - 55) * 0.4;
  if (s.daysSinceContact != null && s.daysSinceContact > s.contactThresholdDays) v -= Math.min(25, (s.daysSinceContact - s.contactThresholdDays) * 1.5);
  return Math.max(-100, Math.min(100, Math.round(v)));
}

/** Signed impact (-100..100) on buyer engagement. */
export function calculateEngagementImpactScore(s: CommunicationSignals): number {
  let v = 0;
  v += s.inboundMessages * 4;
  v -= s.unansweredMessages * 9;
  v += (calculateSentimentScore(s) - 55) * 0.3;
  if (s.daysSinceContact != null && s.daysSinceContact > s.contactThresholdDays) v -= Math.min(30, (s.daysSinceContact - s.contactThresholdDays) * 2);
  else if (s.daysSinceContact != null) v += 10;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

/** Signed impact (-100..100) on deal/property/match momentum. */
export function calculateMomentumImpactScore(s: CommunicationSignals): number {
  let v = 0;
  v += Math.min(30, s.totalMessages * 3);
  v -= s.missedFollowups * 12;
  v -= s.overdueCommitments * 8;
  if (s.daysSinceContact != null && s.daysSinceContact <= s.contactThresholdDays) v += 15;
  else if (s.daysSinceContact != null) v -= Math.min(25, s.daysSinceContact - s.contactThresholdDays);
  return Math.max(-100, Math.min(100, Math.round(v)));
}

// ── Next best action + AI-ready deterministic text ───────────────────────────
export interface CommProfileComputed {
  communication_health_score: number;
  responsiveness_score: number;
  sentiment_score: number;
  followup_risk_score: number;
  trust_impact_score: number;
  engagement_impact_score: number;
  momentum_impact_score: number;
  next_best_action: string;
  ai_summary: string;
  ai_risk_summary: string;
  ai_recommendation_summary: string;
}

export function computeCommunicationProfile(s: CommunicationSignals, entityLabel: string): CommProfileComputed {
  const health = calculateCommunicationHealthScore(s);
  const responsiveness = calculateResponsivenessScore(s);
  const sentiment = calculateSentimentScore(s);
  const risk = calculateFollowupRiskScore(s);
  const trust = calculateTrustImpactScore(s);
  const engagement = calculateEngagementImpactScore(s);
  const momentum = calculateMomentumImpactScore(s);

  const stale = s.daysSinceContact != null && s.daysSinceContact > s.contactThresholdDays;
  let next: string;
  if (s.brokenCommitments > 0) next = "השלם התחייבות שנשברה והחזר אמון";
  else if (s.overdueCommitments > 0) next = "סגור התחייבות שעברה את מועד היעד";
  else if (s.missedFollowups > 0) next = "בצע פולואפ שמתעכב";
  else if (s.unansweredMessages > 0) next = "שלח תזכורת — יש הודעות שלא נענו";
  else if (s.daysSinceContact == null) next = "צור קשר ראשוני ופתח ערוץ תקשורת";
  else if (stale) next = `חזור לקשר — עברו ${s.daysSinceContact} ימים`;
  else if (sentiment < 40) next = "טפל בסנטימנט שלילי בשיחה אישית";
  else next = "המשך קשר שוטף ועדכן בהתקדמות";

  const lastTxt = s.daysSinceContact == null ? "אין תיעוד קשר" : s.daysSinceContact === 0 ? "קשר היום" : `${s.daysSinceContact} ימים מאז הקשר האחרון`;
  const ai_summary = `${entityLabel}: ${lastTxt}. ${s.totalMessages} אינטראקציות (${s.inboundMessages} נכנסות). סנטימנט ${sentiment}, בריאות תקשורת ${health}.`;

  const risks: string[] = [];
  if (s.brokenCommitments > 0) risks.push(`${s.brokenCommitments} התחייבויות שנשברו`);
  if (s.overdueCommitments > 0) risks.push(`${s.overdueCommitments} התחייבויות באיחור`);
  if (s.missedFollowups > 0) risks.push(`${s.missedFollowups} פולואפים שמתעכבים`);
  if (s.unansweredMessages > 0) risks.push(`${s.unansweredMessages} הודעות ללא מענה`);
  if (stale) risks.push(`אין קשר ${s.daysSinceContact} ימים`);
  if (sentiment < 40) risks.push("סנטימנט שלילי");
  const ai_risk_summary = risks.length ? `סיכוני תקשורת: ${risks.join(" · ")}.` : "אין סיכוני תקשורת פעילים.";

  const ai_recommendation_summary = `פעולה מומלצת: ${next}. השפעה: אמון ${trust >= 0 ? "+" : ""}${trust}, מעורבות ${engagement >= 0 ? "+" : ""}${engagement}, מומנטום ${momentum >= 0 ? "+" : ""}${momentum}.`;

  return {
    communication_health_score: health,
    responsiveness_score: responsiveness,
    sentiment_score: sentiment,
    followup_risk_score: risk,
    trust_impact_score: trust,
    engagement_impact_score: engagement,
    momentum_impact_score: momentum,
    next_best_action: next,
    ai_summary, ai_risk_summary, ai_recommendation_summary,
  };
}

// ── Deterministic message understanding (AI-ready) ───────────────────────────
const COMMITMENT_CUES = ["אשלח", "אחזור", "נבדוק", "אעדכן", "נקבע", "אתאם", "אדאג", "נדבר", "אברר", "אכין"];

/** Detect commitment-like sentences from free text (deterministic placeholder). */
export function detectCommitments(text: string | null | undefined): string[] {
  if (!text) return [];
  const parts = text.split(/[\n.!?]+/).map((p) => p.trim()).filter(Boolean);
  return parts.filter((p) => COMMITMENT_CUES.some((c) => p.includes(c))).slice(0, 5);
}

/** Deterministic suggested reply draft (no send). */
export function draftReply(channel: string, direction: string, sentiment: string, entityLabel: string): string {
  const hi = channel === "email" ? `שלום ${entityLabel},` : `היי ${entityLabel},`;
  if (sentiment === "negative" || sentiment === "urgent")
    return `${hi}\nתודה על הסבלנות — אני מטפל/ת בנושא כעת ואחזור אליך עם עדכון מסודר בהקדם. מתי נוח לדבר?`;
  if (direction === "inbound")
    return `${hi}\nתודה על העדכון! קיבלתי ואבדוק. אחזור אליך עם תשובה מלאה.`;
  return `${hi}\nרק מתעדכן/ת — האם הספקת לעבור על מה ששלחתי? אשמח לקדם משם.`;
}

export interface DraftActions {
  whatsappDraft: string;
  emailDraft: string;
  nextAction: string;
}

/** One-click action drafts (text only — no external sending yet). */
export function buildDraftActions(entityLabel: string, nextBestAction: string, sentiment: number): DraftActions {
  const tone = sentiment < 40 ? "אני כאן בשבילך ואטפל בזה אישית. " : "";
  return {
    whatsappDraft: `היי ${entityLabel}, ${tone}רוצה לעדכן ולתאם את ההמשך. מתי נוח לך לדבר?`,
    emailDraft: `שלום ${entityLabel},\n${tone}רציתי לעדכן בהתקדמות ולתאם את הצעד הבא. אשמח לחזור אליך בהקדם.\nבברכה,`,
    nextAction: nextBestAction,
  };
}
