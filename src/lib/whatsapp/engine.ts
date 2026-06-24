// ============================================================================
// ZONO — WhatsApp Execution OS · Pure engine (client-safe, deterministic)
// ----------------------------------------------------------------------------
// Intent + qualification scoring, action extraction (Hebrew), sensitive-topic
// risk classification (→ approval), inbox state derivation, segment catalog,
// missed-call recovery copy, and the 86-feature coverage matrix. No I/O, no
// LLM, no unofficial automation. Outbound is always draft → approval → send.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── intent ─────────────────────────────────────────────────────────────────────
export type WaIntent = "unknown" | "buyer_intent" | "seller_intent" | "investor_intent" | "price_request"
  | "viewing_request" | "question" | "financing" | "negotiation" | "spam";
export function detectIntent(text: string): { intent: WaIntent; score: number } {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return { intent: "unknown", score: 0 };
  if (/(הלוואה מובטחת|קריפטו|הימור|spam|רווח מובטח)/.test(s)) return { intent: "spam", score: 90 };
  if (/(משכנתא|מימון|הון עצמי|ריבית|financing)/.test(s)) return { intent: "financing", score: 75 };
  if (/(מחיר|כמה עולה|עלות|הנחה|לסגור על|price)/.test(s)) return { intent: "price_request", score: 80 };
  if (/(לתאם|סיור|לראות|ביקור|צפייה|מתי אפשר|viewing)/.test(s)) return { intent: "viewing_request", score: 85 };
  if (/(להשקיע|תשואה|נכס להשקעה|investor)/.test(s)) return { intent: "investor_intent", score: 72 };
  if (/(רוצה למכור|למכור את הדירה|מוכר|to sell)/.test(s)) return { intent: "seller_intent", score: 80 };
  if (/(מחפש לקנות|רוצה לקנות|מחפש דירה|מעוניין בדירה|looking to buy)/.test(s)) return { intent: "buyer_intent", score: 80 };
  if (/(אפשר להתמקח|נתקדם על המחיר|הצעה נגדית|negotiat)/.test(s)) return { intent: "negotiation", score: 70 };
  if (/[?]|איך|מה|האם|where|what/.test(s)) return { intent: "question", score: 50 };
  return { intent: "unknown", score: 20 };
}
export const INTENT_LABELS: Record<string, string> = {
  unknown: "לא ידוע", buyer_intent: "כוונת קנייה", seller_intent: "כוונת מכירה", investor_intent: "משקיע",
  price_request: "בקשת מחיר", viewing_request: "בקשת צפייה", question: "שאלה", financing: "מימון", negotiation: "משא ומתן", spam: "ספאם",
};
export const INTENT_TONE: Record<string, string> = {
  buyer_intent: "bg-success-soft text-success", seller_intent: "bg-brand-soft text-brand-strong", viewing_request: "bg-success-soft text-success",
  price_request: "bg-warning-soft text-warning", investor_intent: "bg-brand-soft text-brand-strong", financing: "bg-warning-soft text-warning",
  negotiation: "bg-warning-soft text-warning", question: "bg-surface text-ink", spam: "bg-danger-soft text-danger", unknown: "bg-surface text-muted",
};

// ── conversation-level intelligence (over REAL ingested messages) ───────────
export interface WaMessage { direction: "inbound" | "outbound"; body: string | null; createdAt?: string | null }
export interface PropertyIntent { rooms: number | null; budget: number | null; area: string | null; raw: string[] }

/** Extract structured property hints from conversation text — real text only. */
export function extractPropertyIntent(messages: WaMessage[]): PropertyIntent {
  const text = messages.map((m) => m.body ?? "").join(" \n ");
  const raw: string[] = [];
  let rooms: number | null = null;
  const roomsM = text.match(/(\d(?:\.5)?)\s*חדר/);
  if (roomsM) { rooms = Number(roomsM[1]); raw.push(`${rooms} חדרים`); }
  let budget: number | null = null;
  const milM = text.match(/(\d(?:\.\d)?)\s*(?:מיליון|מ['׳]?)/);
  if (milM) { budget = Math.round(Number(milM[1]) * 1_000_000); raw.push(`תקציב ~${milM[1]}M`); }
  else { const kM = text.match(/(\d{3,4})\s*(?:אלף|k)/i); if (kM) { budget = Number(kM[1]) * 1000; } }
  let area: string | null = null;
  const areaM = text.match(/ב(?:שכונת|אזור|רחוב)\s+([֐-׿\s]{2,20})/);
  if (areaM) { area = areaM[1].trim().split(/\s+/).slice(0, 3).join(" "); raw.push(area); }
  return { rooms, budget, area, raw };
}

export type WaRole = "buyer" | "seller" | "investor" | "unknown";
export interface ConversationAnalysis {
  role: WaRole; topIntent: WaIntent; intentScore: number; summary: string;
  needsResponse: boolean; nextBestAction: string; propertyIntent: PropertyIntent;
}

/** Deterministic conversation analysis: role, dominant intent, Hebrew summary, NBA. */
export function summarizeConversation(messages: WaMessage[], contactName?: string | null): ConversationAnalysis {
  const inbound = messages.filter((m) => m.direction === "inbound");
  const counts: Record<string, number> = {};
  let bestScore = 0; let topIntent: WaIntent = "unknown";
  for (const m of inbound) {
    const { intent, score } = detectIntent(m.body ?? "");
    counts[intent] = (counts[intent] ?? 0) + 1;
    if (score > bestScore) { bestScore = score; topIntent = intent; }
  }
  const buyerSignals = (counts.buyer_intent ?? 0) + (counts.viewing_request ?? 0) + (counts.financing ?? 0) + (counts.price_request ?? 0);
  const sellerSignals = counts.seller_intent ?? 0;
  const investorSignals = counts.investor_intent ?? 0;
  let role: WaRole = "unknown";
  if (sellerSignals > buyerSignals && sellerSignals >= investorSignals) role = "seller";
  else if (investorSignals > buyerSignals && investorSignals >= sellerSignals) role = "investor";
  else if (buyerSignals > 0) role = "buyer";

  const pi = extractPropertyIntent(messages);
  const last = messages[messages.length - 1];
  const needsResponse = last?.direction === "inbound";

  const name = contactName || "הליד";
  const roleHe = role === "buyer" ? "קונה פוטנציאלי" : role === "seller" ? "מוכר פוטנציאלי" : role === "investor" ? "משקיע" : "פנייה כללית";
  const intentHe = INTENT_LABELS[topIntent] ?? "לא ידוע";
  const bits = [`${name} — ${roleHe}.`, `כוונה מרכזית: ${intentHe}.`];
  if (pi.raw.length) bits.push(`מאפיינים שעלו: ${pi.raw.join(", ")}.`);
  bits.push(`${inbound.length} הודעות נכנסות בשיחה.`);
  if (needsResponse) bits.push("ממתין לתשובה ממך.");
  const summary = bits.join(" ");

  let nextBestAction = "המשך מעקב";
  if (needsResponse && topIntent === "viewing_request") nextBestAction = "תאם צפייה בנכס";
  else if (needsResponse && topIntent === "price_request") nextBestAction = "השב עם טווח מחיר/הצעה";
  else if (role === "buyer") nextBestAction = "צור כרטיס קונה ושלח התאמות";
  else if (role === "seller") nextBestAction = "צור כרטיס מוכר וקבע פגישת הערכה";
  else if (needsResponse) nextBestAction = "השב לפנייה";

  return { role, topIntent, intentScore: bestScore, summary, needsResponse, nextBestAction, propertyIntent: pi };
}

// ── sensitive-topic risk classification (→ approval) ──────────────────────────
const SENSITIVE = /(מחיר|הנחה|לסגור על|עמלה|דמי תיווך|משפטי|חוזה|חתימה|התחייב|מימון|משכנתא|ריבית|להתמקח|הצעה נגדית|זמין מתי|מובטח)/;
export function classifyRisk(body: string): { risk: "safe" | "review" | "sensitive"; requiresApproval: boolean } {
  const s = (body || "").toLowerCase();
  if (SENSITIVE.test(s)) return { risk: "sensitive", requiresApproval: true };
  if (/(מתי|לתאם|פגישה|אשלח|אעדכן)/.test(s)) return { risk: "review", requiresApproval: false };
  return { risk: "safe", requiresApproval: false };
}

// ── qualification scoring ──────────────────────────────────────────────────────
export interface QualInput { intent: WaIntent; messageCount: number; hasBudget: boolean; hasArea: boolean; hasTimeline: boolean; urgentWords: boolean }
export interface QualResult {
  leadQuality: number; buyerIntent: number; sellerIntent: number; investorIntent: number;
  motivation: number; budgetFit: number; timeline: number; urgency: number; stage: string;
}
export function qualify(i: QualInput): QualResult {
  const engaged = Math.min(1, i.messageCount / 5);
  const buyerIntent = clamp((i.intent === "buyer_intent" ? 70 : i.intent === "viewing_request" || i.intent === "price_request" ? 55 : 20) + engaged * 25);
  const sellerIntent = clamp((i.intent === "seller_intent" ? 75 : 15) + engaged * 20);
  const investorIntent = clamp((i.intent === "investor_intent" ? 75 : 15) + engaged * 15);
  const budgetFit = i.hasBudget ? 70 : 30;
  const timeline = i.hasTimeline ? 70 : 35;
  const urgency = clamp((i.urgentWords ? 70 : 35) + engaged * 20);
  const motivation = clamp((urgency + timeline) / 2 + (i.hasArea ? 10 : 0));
  const leadQuality = clamp(Math.max(buyerIntent, sellerIntent, investorIntent) * 0.4 + motivation * 0.3 + budgetFit * 0.2 + engaged * 10);
  let stage = "new";
  if (leadQuality >= 75) stage = "hot";
  else if (leadQuality >= 55) stage = "qualified";
  else if (leadQuality >= 35) stage = "engaged";
  return { leadQuality, buyerIntent, sellerIntent, investorIntent, motivation, budgetFit, timeline, urgency, stage };
}

// ── action extraction (Hebrew) ─────────────────────────────────────────────────
export interface ExtractedAction { action_type: string; title: string; requires_approval: boolean }
export function extractActions(text: string): ExtractedAction[] {
  const s = (text || "").toLowerCase(); const out: ExtractedAction[] = [];
  if (/(תחזור אליי|תתקשר|חזרה|מחר)/.test(s)) out.push({ action_type: "create_followup", title: "תזכורת חזרה ללקוח", requires_approval: false });
  if (/(שלח לי פרטים|פרטים על|מידע על)/.test(s)) out.push({ action_type: "send_property_draft", title: "טיוטת שליחת פרטי נכס", requires_approval: false });
  if (/(לראות|סיור|פגישה|ביום)/.test(s)) out.push({ action_type: "suggest_meeting", title: "הצעת תיאום סיור/פגישה", requires_approval: false });
  if (/(תבדוק מחיר|מה המחיר|כמה עולה)/.test(s)) out.push({ action_type: "price_response", title: "מענה מחיר (דורש אישור)", requires_approval: true });
  if (/(נכסים דומים|עוד אופציות|המלצות)/.test(s)) out.push({ action_type: "recommendation_request", title: "בקשת חבילת המלצות", requires_approval: false });
  if (/(תעדכן אותי|כשיש|כשיתפנה)/.test(s)) out.push({ action_type: "create_alert", title: "התראה על נכס מתאים", requires_approval: false });
  return out;
}

// ── inbox state derivation ─────────────────────────────────────────────────────
export type InboxState = "requires_reply" | "can_wait" | "bot_handled" | "agent_needed" | "closed" | "stale"
  | "missed_call_recovery" | "hot_lead" | "waiting_client" | "approval_required";
export function deriveState(opts: { lastDirection: "inbound" | "outbound" | null; leadScore: number; missedCall: boolean; pendingApproval: boolean; hoursSinceLast: number }): InboxState {
  if (opts.pendingApproval) return "approval_required";
  if (opts.missedCall) return "missed_call_recovery";
  if (opts.leadScore >= 75) return "hot_lead";
  if (opts.lastDirection === "outbound") return "waiting_client";
  if (opts.hoursSinceLast > 72) return "stale";
  if (opts.lastDirection === "inbound") return "requires_reply";
  return "can_wait";
}
export const STATE_LABELS: Record<string, string> = {
  requires_reply: "דורש מענה", can_wait: "יכול להמתין", bot_handled: "טופל ע״י בוט", agent_needed: "דרוש סוכן",
  closed: "סגור", stale: "מיושן", missed_call_recovery: "שחזור שיחה שלא נענתה", hot_lead: "ליד חם",
  waiting_client: "ממתין ללקוח", approval_required: "דורש אישור",
};
export const STATE_TONE: Record<string, string> = {
  requires_reply: "bg-warning-soft text-warning", hot_lead: "bg-success-soft text-success", missed_call_recovery: "bg-danger-soft text-danger",
  approval_required: "bg-danger-soft text-danger", waiting_client: "bg-brand-soft text-brand-strong", stale: "bg-surface text-muted",
  can_wait: "bg-surface text-muted", bot_handled: "bg-surface text-ink", agent_needed: "bg-warning-soft text-warning", closed: "bg-surface text-muted",
};

// ── segment catalog ────────────────────────────────────────────────────────────
export const SEGMENTS: { key: string; label: string }[] = [
  { key: "hot_buyers", label: "קונים חמים" }, { key: "cold_buyers", label: "קונים קרים" },
  { key: "buyers_by_city", label: "קונים לפי עיר" }, { key: "buyers_by_budget", label: "קונים לפי תקציב" },
  { key: "sellers", label: "מוכרים" }, { key: "potential_sellers", label: "מוכרים פוטנציאליים" },
  { key: "investors", label: "משקיעים" }, { key: "project_leads", label: "לידים לפרויקט" },
  { key: "portal_viewers", label: "צופי פורטל" }, { key: "silent_active", label: "לידים פעילים שקטים" },
  { key: "missed_call_leads", label: "לידים משיחות שלא נענו" }, { key: "reactivation", label: "לידים להחייאה" },
];

// ── campaign goals ──────────────────────────────────────────────────────────────
export const CAMPAIGN_GOALS: { key: string; label: string }[] = [
  { key: "sell_property", label: "מכירת נכס" }, { key: "promote_project", label: "קידום פרויקט" },
  { key: "acquire_sellers", label: "גיוס מוכרים" }, { key: "reactivate_buyers", label: "החייאת קונים" },
  { key: "investor_opportunity", label: "הזדמנות למשקיעים" }, { key: "open_house", label: "בית פתוח" },
  { key: "price_drop", label: "ירידת מחיר" }, { key: "exclusive_listing", label: "נכס בלעדי" },
];

// ── missed-call recovery copy (draft only) ────────────────────────────────────
export function missedCallDraft(name: string | null): string {
  return `שלום${name ? " " + name : ""}, ראיתי שהתקשרת ולא הספקתי לענות. אשמח לחזור אליך — מתי נוח? (טיוטה — לאישור הסוכן לפני שליחה)`;
}

// ── 86-feature coverage matrix ─────────────────────────────────────────────────
export type CoverageStatus = "built" | "partial" | "provider_dependent";
export interface CoverageFeature { num: number; name: string; layer: string; status: CoverageStatus; module: string }
const L = ["Communication Hub", "AI WhatsApp Assistant", "Smart Qualification", "Missed Call Engine", "AI Follow Up", "WhatsApp Marketing AI", "Client Experience", "Intelligence", "Agent AI"];
export const COVERAGE: CoverageFeature[] = [
  { num: 1, name: "Unified Inbox", layer: L[0], status: "built", module: "whatsapp" },
  { num: 2, name: "Smart Contact Creation", layer: L[0], status: "built", module: "whatsapp+routing" },
  { num: 3, name: "AI Conversation Summary", layer: L[0], status: "built", module: "whatsapp (deterministic)" },
  { num: 4, name: "AI Action Extraction", layer: L[0], status: "built", module: "whatsapp" },
  { num: 5, name: "Voice Note Analysis", layer: L[0], status: "provider_dependent", module: "transcription provider" },
  { num: 6, name: "Voice to CRM", layer: L[0], status: "partial", module: "whatsapp drafts" },
  { num: 7, name: "Inbox Zero", layer: L[0], status: "built", module: "whatsapp states" },
  { num: 8, name: "Full Auto Reply", layer: L[1], status: "provider_dependent", module: "Meta API + policy" },
  { num: 9, name: "Contextual AI Reply", layer: L[1], status: "partial", module: "knowledge_base drafts" },
  { num: 10, name: "Conversation Memory", layer: L[1], status: "built", module: "conversations.summary" },
  { num: 11, name: "Client Memory", layer: L[1], status: "built", module: "buyer/seller twins" },
  { num: 12, name: "Personalized Answers", layer: L[1], status: "partial", module: "knowledge_base" },
  { num: 13, name: "Answers from Property Inventory", layer: L[1], status: "built", module: "properties" },
  { num: 14, name: "Answers from Project Inventory", layer: L[1], status: "built", module: "projects" },
  { num: 15, name: "Knowledge Base Answers", layer: L[1], status: "built", module: "whatsapp_knowledge_base" },
  { num: 16, name: "Smart Links", layer: L[2], status: "built", module: "whatsapp_smart_links + /w/[slug]" },
  { num: 17, name: "Bot Q&A", layer: L[2], status: "partial", module: "smart link flows" },
  { num: 18, name: "Dynamic Questions", layer: L[2], status: "partial", module: "qualification flows" },
  { num: 19, name: "Lead Quality Score", layer: L[2], status: "built", module: "qualify()" },
  { num: 20, name: "Buyer Detection", layer: L[2], status: "built", module: "qualify()" },
  { num: 21, name: "Seller Detection", layer: L[2], status: "built", module: "qualify()" },
  { num: 22, name: "Investor Detection", layer: L[2], status: "built", module: "qualify()" },
  { num: 23, name: "Motivation Score", layer: L[2], status: "built", module: "qualify()" },
  { num: 24, name: "Budget Detection", layer: L[2], status: "built", module: "qualify()" },
  { num: 25, name: "Timeline Detection", layer: L[2], status: "built", module: "qualify()" },
  { num: 26, name: "Missed Call", layer: L[3], status: "built", module: "whatsapp_call_events" },
  { num: 27, name: "WhatsApp Auto Recovery", layer: L[3], status: "provider_dependent", module: "Meta template + policy" },
  { num: 28, name: "Missed Call Funnel", layer: L[3], status: "built", module: "recovery_status" },
  { num: 29, name: "Missed Call AI", layer: L[3], status: "built", module: "missedCallDraft" },
  { num: 30, name: "Missed Call Dashboard", layer: L[3], status: "built", module: "/whatsapp missed tab" },
  { num: 31, name: "Automatic Follow-Up", layer: L[4], status: "built", module: "whatsapp_followups" },
  { num: 32, name: "Follow-Up by Client Type", layer: L[4], status: "built", module: "followup_type" },
  { num: 33, name: "Follow-Up by Property", layer: L[4], status: "partial", module: "followup metadata" },
  { num: 34, name: "Follow-Up by Project", layer: L[4], status: "partial", module: "followup metadata" },
  { num: 35, name: "Follow-Up by Funnel Stage", layer: L[4], status: "built", module: "stage" },
  { num: 36, name: "Follow-Up by Time", layer: L[4], status: "built", module: "due_at" },
  { num: 37, name: "Follow-Up by Behavior", layer: L[4], status: "partial", module: "smart link events" },
  { num: 38, name: "Follow-Up by Property Views", layer: L[4], status: "partial", module: "portal/website views" },
  { num: 39, name: "Follow-Up by Message Opens", layer: L[4], status: "provider_dependent", module: "Meta read receipts" },
  { num: 40, name: "Reactivation", layer: L[4], status: "built", module: "reactivation segment" },
  { num: 41, name: "Send to Hundreds", layer: L[5], status: "partial", module: "manual send queue (no unsafe mass send)" },
  { num: 42, name: "Personalized Message", layer: L[5], status: "built", module: "campaign template" },
  { num: 43, name: "AI Personalization", layer: L[5], status: "partial", module: "template tokens" },
  { num: 44, name: "Copy Generation", layer: L[5], status: "partial", module: "content angles" },
  { num: 45, name: "Campaign Builder", layer: L[5], status: "built", module: "whatsapp_campaigns" },
  { num: 46, name: "Smart Segments", layer: L[5], status: "built", module: "whatsapp_segments" },
  { num: 47, name: "Buyer Segments", layer: L[5], status: "built", module: "segments" },
  { num: 48, name: "Seller Segments", layer: L[5], status: "built", module: "segments" },
  { num: 49, name: "Investor Segments", layer: L[5], status: "built", module: "segments" },
  { num: 50, name: "Project Segments", layer: L[5], status: "built", module: "segments" },
  { num: 51, name: "Auto Campaigns", layer: L[5], status: "partial", module: "automation triggers" },
  { num: 52, name: "Broadcast Analytics", layer: L[5], status: "built", module: "campaign counters" },
  { num: 53, name: "Engagement Analytics", layer: L[5], status: "partial", module: "smart link + reply" },
  { num: 54, name: "Response Analytics", layer: L[5], status: "built", module: "replied_count" },
  { num: 55, name: "Conversion Analytics", layer: L[5], status: "built", module: "converted_count" },
  { num: 56, name: "Buyer Portal Link", layer: L[6], status: "built", module: "Client Portal OS (draft link)" },
  { num: 57, name: "Seller Portal Link", layer: L[6], status: "built", module: "Client Portal OS" },
  { num: 58, name: "Client Portal Link", layer: L[6], status: "built", module: "Client Portal OS" },
  { num: 59, name: "Property Feed", layer: L[6], status: "built", module: "properties" },
  { num: 60, name: "Recommendation Package", layer: L[6], status: "built", module: "Recommendation OS" },
  { num: 61, name: "AI Property Match", layer: L[6], status: "built", module: "Matching OS" },
  { num: 62, name: "New Property Alerts", layer: L[6], status: "built", module: "followup/alert draft" },
  { num: 63, name: "Price Update Alerts", layer: L[6], status: "built", module: "alert draft" },
  { num: 64, name: "Project Update Alerts", layer: L[6], status: "partial", module: "alert draft" },
  { num: 65, name: "Family Portal", layer: L[6], status: "partial", module: "Client Portal OS" },
  { num: 66, name: "Lead Score", layer: L[7], status: "built", module: "Decision Brain" },
  { num: 67, name: "Intent Score", layer: L[7], status: "built", module: "qualify()" },
  { num: 68, name: "Hot Lead Detection", layer: L[7], status: "built", module: "Decision Brain signal" },
  { num: 69, name: "Silent Lead Detection", layer: L[7], status: "built", module: "stale/silent states" },
  { num: 70, name: "Churn Detection", layer: L[7], status: "partial", module: "Communication Intelligence" },
  { num: 71, name: "Opportunity Detection", layer: L[7], status: "built", module: "Decision Brain" },
  { num: 72, name: "Deal Probability", layer: L[7], status: "built", module: "Deal Forecast OS" },
  { num: 73, name: "Next Best Action", layer: L[7], status: "built", module: "conversations.next_best_action" },
  { num: 74, name: "Daily Mission", layer: L[7], status: "built", module: "whatsapp_daily_missions" },
  { num: 75, name: "AI Sales Assistant", layer: L[7], status: "built", module: "AI Office Layer" },
  { num: 76, name: "Conversation Manager", layer: L[8], status: "built", module: "whatsapp_ai_actions" },
  { num: 77, name: "Campaign Manager", layer: L[8], status: "built", module: "campaigns" },
  { num: 78, name: "Lead Reactivation Manager", layer: L[8], status: "built", module: "reactivation" },
  { num: 79, name: "Seller Detection Agent", layer: L[8], status: "built", module: "qualify() seller" },
  { num: 80, name: "Buyer Detection Agent", layer: L[8], status: "built", module: "qualify() buyer" },
  { num: 81, name: "Property Recommendation Agent", layer: L[8], status: "built", module: "Recommendation OS" },
  { num: 82, name: "Hot Deal Detection Agent", layer: L[8], status: "built", module: "Decision Brain" },
  { num: 83, name: "Daily Summary Agent", layer: L[8], status: "built", module: "missions + AI brief" },
  { num: 84, name: "Task Generation Agent", layer: L[8], status: "built", module: "ai_actions → tasks" },
  { num: 85, name: "WhatsApp Manager Agent", layer: L[8], status: "built", module: "/whatsapp command center" },
  { num: 86, name: "Control & Approval Layer", layer: L[8], status: "built", module: "whatsapp_drafts approval" },
];
export function coverageStats() {
  const built = COVERAGE.filter((c) => c.status === "built").length;
  const partial = COVERAGE.filter((c) => c.status === "partial").length;
  const provider = COVERAGE.filter((c) => c.status === "provider_dependent").length;
  return { total: COVERAGE.length, built, partial, provider };
}
