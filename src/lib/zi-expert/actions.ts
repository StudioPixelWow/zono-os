"use server";
// ============================================================================
// ZI Expert™ — server actions (Phase 22). Everything org-scoped + per-user via
// RLS. ZI is read-only: these actions only ask the assistant and manage the
// support conversation history. They NEVER mutate business data.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/dashboard/context";
import { buildZIContext, type ServerContextParts } from "./context";
import { answerZi } from "./engine";
import { deriveTitle } from "./conversation";
import { searchKnowledge } from "./knowledge-search";
import { buildRagMessages, deterministicRagAnswer, ragSources, ragFollowups } from "./knowledge-rag";
import { runZiCompletion } from "./providers";
import {
  loadKnowledgeArticles, loadKnowledgeArticlesAdmin, recordKnowledgeFeedback,
  listKnowledgeFeedback, listMissingAnswerQuestions, type KnowledgeFeedbackRow,
} from "./knowledge-repository";
import { syncZIKnowledgeBase, type KnowledgeSyncResult } from "./knowledge-sync";
import { runZIDiagnostics } from "./diagnostics";
import { classifySupportIntentDeterministic, shouldEscalate } from "./support-intent";
import { shouldRunDiagnostics, diagnosticPlan } from "./support-diagnostics-routing";
import { openSupportTicketFromZi, getMyTicketByNumber, listMyOpenTickets } from "./support-bridge";
import { getOnboardingProgress, summarizeOnboardingForZi } from "@/lib/onboarding/progress";
import { getDailyCommandCenter } from "@/lib/daily/command-center";
import { listPropertiesMissingWeeklyReport } from "@/lib/sellers/lifecycle";
import { summarizePropertyForZi } from "@/lib/properties/control-center";
import { summarizeBuyerPortalForZi } from "@/lib/customer-portal/buyer-portal";
import { getPortfolioMarketingAutopilot, summarizeMarketingForZi } from "@/lib/marketing-autopilot/autopilot";
import type { DailyCommandCenter } from "@/lib/daily/priority";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { listRecentWhatsAppReplies } from "@/lib/whatsapp/inbound-linkage";
import { collectDiagnosticSignals, persistDiagnosticRun, listDiagnosticRuns, type DiagnosticRunRow } from "./diagnostic-repository";
import type { DiagnosticInput, DiagnosticResult, IssueType } from "./diagnostic-types";
import type { FeedbackRating, KnowledgeArticle, KnowledgeSourceRef } from "./knowledge-types";
import {
  appendMessageRow, createConversationRow, getMessageRows, listConversationRows,
  rateMessageRow, renameConversationRow, searchConversationRows, setArchivedRow,
  setPinnedRow, softDeleteConversationRow, touchConversation,
} from "./history";
import type {
  RoleKey, ZiAskRequest, ZiAskResult, ZiContext, ZiConversation,
  ZiConversationWithMessages, ZiMessage, ZiPagination,
} from "./types";

export type ZiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ROLE_KEYS: RoleKey[] = ["viewer", "agent", "manager", "admin", "owner"];
function asRoleKey(k: string | null): RoleKey | null {
  return k && (ROLE_KEYS as string[]).includes(k) ? (k as RoleKey) : null;
}

/** Build the sanitized server context (org / role / operating area). */
async function serverParts(): Promise<ServerContextParts> {
  const [dash, session] = await Promise.all([getDashboardContext(), getSessionContext()]);
  const profile = session.profile;
  return {
    organizationName: dash.organization?.name ?? null,
    plan: dash.organization?.plan ?? null,
    roleKey: asRoleKey(dash.user?.roleKey ?? null),
    roleLabel: dash.user?.roleLabel ?? null,
    operatingCity: profile?.operating_city ?? profile?.primary_city ?? dash.primaryLocality ?? null,
    operatingNeighborhood: (profile?.operating_neighborhoods ?? [])[0] ?? null,
    featureFlags: [], // foundation: access-filtered flags wired in a later phase
  };
}

/** Resolve the full ZI context for a given client context (used by the widget). */
export async function getZiContextAction(client: ZiAskRequest["client"]): Promise<ZiResult<ZiContext>> {
  try {
    const ctx = buildZIContext(client, await serverParts());
    return { ok: true, data: ctx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "context_failed" };
  }
}

/** Detect a ticket status/list query so ZI answers from the user's OWN tickets
 *  (org-scoped) instead of the knowledge base. A ZONO-#### reference is exact;
 *  status/list phrasing lists the user's open tickets. Kept narrow to avoid firing
 *  on ordinary product questions (directive §3/§16/§17). */
function detectTicketQuery(q: string): { kind: "number"; number: string } | { kind: "list" } | null {
  const m = q.match(/zono[-\s]?(\d{3,})/i);
  if (m) return { kind: "number", number: `ZONO-${m[1]}` };
  const t = q.toLowerCase();
  const phrases = ["סטטוס של הפנייה", "מה קורה עם הפנייה", "מה עם הפנייה", "האם חזרו אלי", "האם חזרו אליי", "עדכון על הפנייה", "הפניות שלי", "הפניות הפתוחות", "פניות פתוחות", "איזה פניות", "status of my ticket", "ticket status", "my tickets", "my open tickets", "open tickets"];
  return phrases.some((p) => t.includes(p)) ? { kind: "list" } : null;
}

/** Detect onboarding / setup-progress questions so ZI answers from REAL state. */
function isOnboardingQuery(q: string): boolean {
  const t = q.toLowerCase();
  const phrases = [
    "מה נשאר לי להגדיר", "מה נשאר להגדיר", "מה עוד צריך להגדיר", "מה עוד נשאר",
    "מה השלב הבא", "מה השלב הבא שלי", "מה לעשות עכשיו", "מה אני צריך לעשות",
    "מה חסר לי", "איך מתחילים", "איך להתחיל", "הקמת המשרד", "השלמת ההגדרה",
    "תחילת עבודה", "onboarding", "setup", "getting started", "what's next",
    "what next", "what do i do", "how do i start", "how to start",
  ];
  return phrases.some((p) => t.includes(p));
}

/** Detect an office-INTELLIGENCE question → the explainable Office Intelligence DTO
 *  (patterns/learning), distinct from the exceptions question below. Role-gated. */
function detectOfficeIntelligenceQuery(q: string): boolean {
  const t = q.toLowerCase();
  const phrases = [
    "מה אתה לומד על המשרד", "מה אתה למד על המשרד", "מה למדת על המשרד", "תובנות על המשרד", "תובנות על העסק",
    "איזה מקורות לידים", "מקורות לידים עובדים", "איפה עסקאות נתקעות", "איפה עסקאות נתקעו",
    "איזה נכסים מושכים", "איפה חסרים לנו נכסים", "איפה חסר לנו מלאי", "חוזרים מספיק מהר", "זמן מענה",
    "איזה אזורים חזקים", "מה הייתי משפר במשרד", "מה כדאי לשפר במשרד",
    "what are you learning", "which lead sources", "where do deals get stuck", "where are we missing inventory",
  ];
  return phrases.some((p) => t.includes(p));
}

/** Detect a manager/office-exceptions question → the Manager Command Center DTO.
 *  (Naturally role-gated: the summary returns null for non-managers.) */
function detectManagerOfficeQuery(q: string): boolean {
  const t = q.toLowerCase();
  const phrases = [
    "איפה יש בעיות במשרד", "מה קורה במשרד", "מצב המשרד", "איפה המשרד צריך אותי",
    "מי מחכה יותר מדי", "מי מחכה יותר מדאי", "איזה לידים ללא אחראי", "לידים ללא אחראי",
    "איזה עסקאות תקועות במשרד", "איפה יש עומס", "עומס אצל הסוכנים", "מה במשרד דורש",
    "what's broken in the office", "office exceptions", "which leads are unassigned", "where is the office overloaded",
  ];
  return phrases.some((p) => t.includes(p));
}

/** Detect the "plan my day" ask → the Agent Daily Autopilot summary. */
function detectPlanMyDayQuery(q: string): boolean {
  const t = q.toLowerCase();
  const phrases = ["תכנן לי את היום", "תכנן את היום", "בנה לי את היום", "סדר לי את היום", "מה התוכנית שלי להיום", "מה נשאר לי להיום", "מה נשאר לי היום", "plan my day", "plan my today", "what's left for me today", "whats left today"];
  return phrases.some((p) => t.includes(p));
}

type DailyIntent = "urgent" | "leads" | "property" | "overnight" | "marketing" | "problem";
/** Detect Daily Command Center questions so ZI answers from the SAME authoritative brief. */
function detectDailyQuery(q: string): DailyIntent | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  if (has(["על מי לחזור", "על מי אני צריך לחזור", "אילו לידים", "לידים לחזרה", "who to call", "which leads"])) return "leads";
  if (has(["איזה נכס לא משווק", "נכסים לא משווקים", "אילו נכסים לא", "which property", "unmarketed"])) return "property";
  if (has(["מה קרה מאז אתמול", "מה השתנה", "what changed", "since yesterday"])) return "overnight";
  if (has(["הפרסום הבא", "מה מתפרסם", "פרסום הבא שלי", "next publish", "what is publishing", "whats publishing"])) return "marketing";
  if (has(["איפה יש בעיה", "מה תקוע", "wheres the problem", "where is the problem"])) return "problem";
  if (has(["הכי דחוף", "מה דחוף", "מה הכי חשוב", "במה להתחיל", "מה לעשות קודם", "most urgent", "what should i do first", "what first"])) return "urgent";
  return null;
}

/** Detect follow-up-engine questions ZI answers from the canonical follow-up state. */
function detectFollowUpQuery(q: string): "overdue" | "no_next_action" | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  if (has(["מי באיחור", "מי בפיגור", "פולואפ באיחור", "פולואפים באיחור", "who is overdue", "overdue follow"])) return "overdue";
  if (has(["למי אין פעולה", "למי אין פולואפ", "אין פעולה הבאה", "no next action", "without next action", "who has no follow"])) return "no_next_action";
  return null;
}

/** Detect deal/pipeline questions ZI answers from the SAME authoritative brief. */
function detectDealQuery(q: string): "stuck" | "status" | "awaiting_offer" | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  if (has(["מי מחכה להצעה", "מחכה להצעה", "awaiting offer", "waiting for an offer"])) return "awaiting_offer";
  if (has(["עסקאות תקועות", "עסקה תקועה", "עסקאות שדורשות", "אילו עסקאות תקוע", "stuck deals", "deals stuck", "which deals are stuck"])) return "stuck";
  if (has(["מצב העסקאות", "מה מצב העסק", "סטטוס עסקאות", "deals status", "status of deals"])) return "status";
  return null;
}

/** Detect "who replied on WhatsApp" questions — answered from linked inbound replies. */
function detectWhatsAppRepliesQuery(q: string): boolean {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  return has(["מי ענה בוואטסאפ", "מי ענה לי בוואטסאפ", "מי חזר בוואטסאפ", "מי כתב בוואטסאפ", "תשובות וואטסאפ", "הודעות וואטסאפ", "who replied on whatsapp", "whatsapp replies"]);
}

/** Detect price-drop / property-update questions — answered from the SAME brief. */
function detectPriceDropQuery(q: string): "dropped" | "responses" | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  if (has(["מי הגיב לעדכון", "מי הגיב לירידת", "מי הגיב על ירידת", "who responded to the price", "responses to the price"])) return "responses";
  if (has(["איזה נכסים ירדו", "אילו נכסים ירדו", "נכסים שירדו במחיר", "ירידת מחיר", "ירידות מחיר", "מי כדאי לשלוח", "למי כדאי לשלוח", "מי ביקר בנכס והמחיר ירד", "which properties dropped", "price drops", "dropped in price"])) return "dropped";
  return null;
}

/** Detect marketing-autopilot questions. "plan"/"property" answer from the property
 *  in context; "portfolio" answers across the org. */
function detectMarketingQuery(q: string): "portfolio" | "property" | "plan" | "plan_status" | "approve" | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  // Approval is a consequential external action — ZI recognizes the ASK but never executes it.
  if (has(["אשר את התוכנית", "אשר והפעל", "הפעל את התוכנית", "approve the plan", "activate the plan"])) return "approve";
  if (has(["מה יש בתוכנית", "מה יפורסם השבוע", "מה מתוכנן השבוע", "מה מחכה לאישור", "יש בעיות בתוכנית", "מה מצב התוכנית", "what's in the plan", "what is scheduled this week", "what is awaiting approval", "any problems with the plan"])) return "plan_status";
  if (has(["תכין לי תוכנית שיווק", "תוכנית שיווק לשבוע", "הכן תוכנית שיווק", "תכין תוכנית שיווק", "prepare a marketing plan", "marketing plan for the week"])) return "plan";
  if (has(["מה אני צריך לשווק", "מה לשווק היום", "איזה נכסים לא משווקים", "נכסים לא משווקים", "איפה אין פרסום", "אילו נכסים דורשים שיווק", "what to market", "which properties are not marketed", "where is there no future marketing"])) return "portfolio";
  if (has(["מה כדאי לעשות עם הנכס", "מה לשווק בנכס", "איזה קריאייטיב צריך להחליף", "לאילו לקוחות כדאי לשלוח את הנכס", "לאילו קבוצות עוד לא פרסמנו", "what should i do with this property"])) return "property";
  return null;
}

/** Deterministic ZI summary of a property's OPEN plan (facts from the snapshot only). */
async function summarizeOpenPlanForZi(orgId: string, propertyId: string): Promise<string | null> {
  const { getOpenPlanWorkboard } = await import("@/lib/marketing-autopilot/plan-view");
  const { PLAN_STATUS_LABEL, ITEM_STATUS_LABEL } = await import("@/lib/marketing-autopilot/plan-core");
  const wb = await getOpenPlanWorkboard(orgId, propertyId);
  if (!wb) return null;
  const s = wb.snapshot;
  const failed = s.items.filter((i) => (i.execution?.status ?? i.status) === "failed");
  const lines = [
    `📋 תוכנית השיווק ל${s.propertyTitle ?? "נכס"} — ${PLAN_STATUS_LABEL[wb.row.status]}`,
    ...s.items.map((i) => `• ${i.title} — ${ITEM_STATUS_LABEL[(i.execution?.status ?? i.status) as keyof typeof ITEM_STATUS_LABEL] ?? i.status}`),
  ];
  if (failed.length) lines.push(`⚠️ ${failed.length} פעולות דורשות טיפול.`);
  lines.push(`לצפייה ואישור: /distribution/marketing-plan/${propertyId}`);
  return lines.join("\n");
}

/** Detect a "what does the customer see in their portal" question (answered from
 *  the buyer-portal selector when a buyer is in context). */
function detectBuyerPortalQuery(q: string): boolean {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  return has([
    "בפורטל", "מה הלקוח רואה", "מה רואה הלקוח", "איזה נכסים סימן", "מה סימן הלקוח", "מה הוא סימן",
    "יש לו נכסים חדשים", "מתי הביקור הבא שלו", "the customer see", "customer portal", "in the portal",
  ]);
}

/** Detect a "what's happening with THIS property" question (answered from the
 *  control-center selector when a property is in context). */
function detectPropertyControlQuery(q: string): boolean {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  return has([
    "מה קורה עם הנכס", "מצב הנכס", "מה המצב של הנכס", "מה הפעולה הבאה", "הפעולה הבאה",
    "מי מתאים לנכס", "מי הכי מתאים", "למי שלחנו את הנכס", "מה בעל הנכס יודע", "איפה יש בעיה בנכס",
    "מי הגיב לנכס", "what's happening with this property", "status of this property", "next action for this property",
  ]);
}

/** Detect seller-lifecycle questions — answered from canonical facts (brief + ledger). */
function detectSellerQuery(q: string): "need_call" | "no_report" | null {
  const t = q.toLowerCase();
  const has = (arr: string[]) => arr.some((p) => t.includes(p));
  if (has(["למי לא שלחנו דוח", "מי לא קיבל דוח", "מוכרים בלי דוח", "בעלי נכסים בלי דוח", "who didn't get a report", "sellers without a report"])) return "no_report";
  if (has(["בעלי נכסים צריכים", "איזה בעלי נכסים", "מי מהמוכרים צריך", "מוכרים שצריכים שיחה", "בעל נכס מבקש", "which sellers need", "sellers need a call"])) return "need_call";
  return null;
}

/** Deterministic Hebrew answer built from the real brief. ZI wording only; facts are server-computed. */
function formatDailyAnswer(b: DailyCommandCenter, intent: DailyIntent): string {
  if (intent === "leads") {
    if (!b.leads.length) return "אין כרגע לידים שממתינים לחזרה.";
    return "לידים לחזרה:\n" + b.leads.map((l) => `• ${l.name} — ${l.reason}`).join("\n");
  }
  if (intent === "property") {
    if (!b.properties.length) return "כל הנכסים מכוסים שיווקית כרגע ✓";
    return "נכסים שדורשים תשומת לב שיווקית:\n" + b.properties.map((p) => `• ${p.title} — ${p.statusLabel}`).join("\n");
  }
  if (intent === "overnight") {
    if (!b.overnight.length) return "לא היו שינויים משמעותיים מאז אתמול.";
    return "מה השתנה מאז אתמול:\n" + b.overnight.map((o) => `• ${o.label}`).join("\n");
  }
  if (intent === "marketing") {
    const parts: string[] = [];
    if (b.marketing.plannedToday > 0) parts.push(`${b.marketing.plannedToday} פרסומים מתוזמנים להיום`);
    if (b.marketing.nextPublishAt) parts.push(`הפרסום הבא בשעה ${new Date(b.marketing.nextPublishAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`);
    if (b.marketing.attention > 0) parts.push(`${b.marketing.attention} פרסומים דורשים טיפול`);
    return parts.length ? parts.join(" · ") : "אין פרסומים מתוזמנים כרגע — אפשר ליצור קמפיין חדש ב-/distribution.";
  }
  if (intent === "problem") {
    const p0 = b.priorityActions.filter((a) => a.priority === "P0");
    if (!p0.length) return "אין תקלות דחופות פתוחות כרגע ✓";
    return "דורש טיפול דחוף:\n" + p0.map((a) => `• ${a.title} — ${a.reason}`).join("\n");
  }
  // urgent
  if (!b.actionCount) return b.heroLine;
  const top = b.priorityActions.slice(0, 4);
  const rec = b.primaryAction ? `\n\nהייתי מתחיל מ: ${b.primaryAction.title} (${b.primaryAction.cta}).` : "";
  return `${b.heroLine}\n\n` + top.map((a) => `• ${a.title} — ${a.reason}`).join("\n") + rec;
}

/** Ask ZI a question. Creates a conversation if needed, persists both turns. */
export async function askZiAction(req: ZiAskRequest): Promise<ZiResult<ZiAskResult>> {
  try {
    const question = req.question.trim();
    if (!question) return { ok: false, error: "empty_question" };

    const ctx = buildZIContext(req.client, await serverParts());

    // Ensure a conversation exists.
    let conversationId = req.conversationId;
    let conversationTitle = "";
    let history: ZiMessage[] = [];
    if (!conversationId) {
      const created = await createConversationRow({ title: deriveTitle(question), route: ctx.route, moduleId: ctx.moduleId });
      conversationId = created.id;
      conversationTitle = created.title;
    } else {
      history = await getMessageRows(conversationId, { limit: 12, offset: 0 });
      conversationTitle = deriveTitle(history[0]?.content ?? question);
    }

    // Persist the user's question.
    const userMsg = await appendMessageRow({
      conversationId, role: "user", content: question, source: null, route: ctx.route, moduleId: ctx.moduleId,
    });

    // ── ZI-CS status/list: answer questions about the user's OWN tickets from the
    // org-scoped store (never another tenant's), before the knowledge base. ──
    const ticketQ = detectTicketQuery(question);
    if (ticketQ) {
      let content: string;
      if (ticketQ.kind === "number") {
        const t = await getMyTicketByNumber(ticketQ.number);
        content = t
          ? `פרטי הפנייה ${t.ticketNumber}:\nנושא: ${t.subject}\nסטטוס: ${t.statusHe}${t.updatedAt ? `\nעדכון אחרון: ${new Date(t.updatedAt).toLocaleDateString("he-IL")}` : ""}`
          : "לא מצאתי פנייה עם המספר הזה במסגרת המשרד שלך. אפשר לבדוק את המספר ולנסות שוב.";
      } else {
        const list = await listMyOpenTickets();
        content = list.length
          ? "הפניות הפתוחות שלך:\n" + list.map((t) => `• ${t.ticketNumber} — ${t.subject} (${t.statusHe})`).join("\n")
          : "אין לך פניות פתוחות כרגע. אם משהו לא עובד, אמור/י \"דבר עם נציג\" ואפתח עבורך פנייה.";
      }
      const statusMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
      await touchConversation(conversationId, 2);
      return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: statusMsg, source: "fallback", model: null, sources: [], followups: [] } };
    }

    // ── ZI onboarding awareness: answer setup / "what's next" questions from the
    // REAL, org-scoped onboarding state — never a hallucinated setup status. ──
    if (isOnboardingQuery(question)) {
      try {
        const op = await getOnboardingProgress();
        let content: string;
        if (!op.active) {
          content = "עדיין לא הושלמה הקמת המשרד. נשלים את הפרטים הבסיסיים ונמשיך משם.";
        } else if (op.complete) {
          content = "המשרד שלך מוגדר ומוכן לעבודה ✅ אין שלבים פתוחים בהקמה. רוצה שאעזור עם נכס, ליד או קמפיין?";
        } else {
          const next = op.nextRecommendedAction;
          content = summarizeOnboardingForZi(op)
            + (next ? `\n\nלביצוע עכשיו: ${next.label} — ${next.href}` : "")
            + "\n\nלרשימת כל השלבים: /getting-started";
        }
        const obMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
        await touchConversation(conversationId, 2);
        return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: obMsg, source: "fallback", model: null, sources: [], followups: [] } };
      } catch { /* fall through to normal RAG if state is unavailable */ }
    }

    // ── ZI Follow-up: "who is overdue / who has no next action" from the
    // canonical follow-up state (role-scoped; deterministic). ──
    const fuIntent = detectFollowUpQuery(question);
    if (fuIntent) {
      try {
        const { getOfficeFollowUpStates } = await import("@/lib/follow-up/service");
        const { states } = await getOfficeFollowUpStates({ limit: 300 });
        const wanted = fuIntent === "overdue"
          ? states.filter((s) => s.state === "followup_overdue")
          : states.filter((s) => s.state === "needs_action" || s.state === "new_waiting");
        let content: string;
        if (!wanted.length) content = fuIntent === "overdue" ? "אין פולואפים באיחור כרגע ✓" : "לכל הלידים הפעילים יש פעולה הבאה ✓";
        else {
          const head = fuIntent === "overdue" ? "פולואפים באיחור:" : "לידים ללא פעולה הבאה:";
          content = head + "\n" + wanted.slice(0, 12).map((s) => `• ${s.leadName ?? "ליד"} — ${s.reason}`).join("\n");
        }
        const fuMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
        await touchConversation(conversationId, 2);
        return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: fuMsg, source: "fallback", model: null, sources: [], followups: [] } };
      } catch { /* fall through to daily / RAG if unavailable */ }
    }

    // ── ZI Deals: "which deals are stuck / deals status / who's awaiting an offer"
    // from the SAME authoritative brief (deal exceptions are surfaced there as
    // deal_stuck actions). Role-scoped; deterministic facts, never invented. ──
    const dealIntent = detectDealQuery(question);
    if (dealIntent) {
      try {
        const brief = await getDailyCommandCenter();
        if (brief) {
          const stuck = brief.priorityActions.filter((a) => a.kind === "deal_stuck");
          let content: string;
          if (!stuck.length) {
            content = brief.pipeline && brief.pipeline.stuck > 0
              ? `יש ${brief.pipeline.stuck} עסקאות תקועות במשרד. לצפייה מלאה: /deals`
              : "אין עסקאות תקועות שדורשות טיפול כרגע ✓";
          } else {
            const head = dealIntent === "awaiting_offer" ? "עסקאות שדורשות טיפול (ייתכן שממתינות להצעה/תשובה):"
              : dealIntent === "status" ? "מצב העסקאות שדורשות טיפול:" : "עסקאות תקועות:";
            content = head + "\n" + stuck.slice(0, 12).map((a) => `• ${a.title} — ${a.reason}`).join("\n");
          }
          const zMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: zMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG if unavailable */ }
    }

    // ── ZI WhatsApp: "who replied on WhatsApp" from the LINKED inbound replies
    // (deterministic; only CRM-identified contacts). ──
    if (detectWhatsAppRepliesQuery(question)) {
      try {
        const { profile } = await getSessionContext();
        const orgId = profile?.org_id ?? null;
        if (orgId) {
          const replies = await listRecentWhatsAppReplies(createServiceRoleClient(), orgId, { limit: 12 });
          const content = replies.length
            ? "תשובות וואטסאפ אחרונות מלקוחות מזוהים:\n" + replies.map((r) => `• ${r.name ?? "לקוח"}${r.lastMessage ? ` — "${r.lastMessage.slice(0, 60)}"` : ""}`).join("\n")
            : "לא זוהו תשובות וואטסאפ אחרונות מלקוחות מזוהים.";
          const wMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: wMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Marketing Autopilot: "what to market / which properties need work" (org
    // portfolio) and "prepare a marketing plan / what to do with this property"
    // (from the property in context). Deterministic; PREPARES a plan draft, never
    // silently activates it. ──
    const mktIntent = detectMarketingQuery(question);
    if (mktIntent) {
      try {
        const { profile } = await getSessionContext();
        const orgId = profile?.org_id ?? null;
        if (mktIntent === "portfolio") {
          const portfolio = await getPortfolioMarketingAutopilot({ limit: 200 });
          const needy = portfolio.items.filter((i) => i.priority === "P0" || i.priority === "P1");
          const content = needy.length
            ? `זיהינו ${needy.length} נכסים שדורשים שיווק:\n` + needy.slice(0, 12).map((i) => `• ${i.title} — ${i.primaryReason}`).join("\n")
            : "כל הנכסים הפעילים מתוזמנים או מפורסמים כראוי ✓";
          const mMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: mMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
        if (orgId && ctx.selectedPropertyId) {
          const propertyId = ctx.selectedPropertyId;
          let content: string;
          if (mktIntent === "approve") {
            // Consequential external action — ZI NEVER approves/activates from chat.
            content = `אני לא מאשר תוכניות מהצ׳אט — האישור הוא פעולה משמעותית. התוכנית מוכנה, אפשר לעבור עליה ולאשר כאן: /distribution/marketing-plan/${propertyId}`;
          } else if (mktIntent === "plan") {
            const { preparePlanAction } = await import("@/lib/marketing-autopilot/plan-actions");
            const r = await preparePlanAction(propertyId);
            content = r.ok
              ? `הכנתי תוכנית שיווק מלאה לשבוע (טיוטה). לעבור עליה, לערוך ולאשר כאן: /distribution/marketing-plan/${propertyId}`
              : (r.error ?? "לא הצלחתי להכין תוכנית לנכס הזה.");
          } else if (mktIntent === "plan_status") {
            content = (await summarizeOpenPlanForZi(orgId, propertyId))
              ?? "עדיין אין תוכנית שיווק פתוחה לנכס הזה. אפשר להכין אחת כאן: /distribution/marketing-plan/" + propertyId;
          } else {
            content = (await summarizeMarketingForZi(orgId, propertyId, false)) ?? "לא נמצאו נתוני שיווק לנכס הנוכחי.";
          }
          const mMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: mMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Buyer portal: "what does the customer see / which properties did they
    // mark / when's their next viewing" — from the SAME portal selector when a buyer
    // is in context (ctx.selectedBuyerId). Deterministic; customer-safe facts. ──
    if (detectBuyerPortalQuery(question) && ctx.selectedBuyerId) {
      try {
        const { profile } = await getSessionContext();
        const orgId = profile?.org_id ?? null;
        if (orgId) {
          const content = (await summarizeBuyerPortalForZi(orgId, ctx.selectedBuyerId)) ?? "לא נמצאו נתוני פורטל ללקוח הנוכחי.";
          const bMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: bMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Property copilot: "what's happening with THIS property / next action /
    // who responded" — answered from the ONE control-center selector when a property
    // is in context (ctx.selectedPropertyId). Deterministic facts, never invented. ──
    if (detectPropertyControlQuery(question) && ctx.selectedPropertyId) {
      try {
        const { profile } = await getSessionContext();
        const orgId = profile?.org_id ?? null;
        if (orgId) {
          const content = (await summarizePropertyForZi(orgId, ctx.selectedPropertyId, false)) ?? "לא נמצאו נתונים לנכס הנוכחי.";
          const cMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: cMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Price-drop: "which properties dropped in price / who responded to the
    // price update" from the SAME authoritative brief (price_drop + price_drop_
    // response actions). Deterministic; never invents recipients. ──
    const priceIntent = detectPriceDropQuery(question);
    if (priceIntent) {
      try {
        const brief = await getDailyCommandCenter();
        if (brief) {
          let content: string;
          if (priceIntent === "responses") {
            const r = brief.priorityActions.filter((a) => a.kind === "price_drop_response");
            content = r.length ? r.map((a) => `• ${a.reason}`).join("\n") : "לא זוהו תגובות אחרונות לעדכוני מחיר.";
          } else {
            const drops = brief.priorityActions.filter((a) => a.kind === "price_drop");
            content = drops.length
              ? "נכסים שירדו במחיר לאחרונה (עם מתעניינים רלוונטיים):\n" + drops.slice(0, 12).map((a) => `• ${a.title} — ${a.reason}`).join("\n")
              : "לא זוהו ירידות מחיר עם מתעניינים רלוונטיים כרגע.";
          }
          const pMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: pMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Seller lifecycle: "which owners need a call" (from the brief) and
    // "which owners didn't get a report this week" (from the delivery ledger).
    // Deterministic; never invents recipients or metrics. ──
    const sellerIntent = detectSellerQuery(question);
    if (sellerIntent) {
      try {
        if (sellerIntent === "need_call") {
          const brief = await getDailyCommandCenter();
          const acts = brief ? brief.priorityActions.filter((a) => a.kind === "seller_callback" || a.kind === "seller_strategy") : [];
          const content = acts.length
            ? "בעלי נכסים שממתינים לטיפול:\n" + acts.slice(0, 12).map((a) => `• ${a.title} — ${a.reason}`).join("\n")
            : "אין כרגע בעלי נכסים שממתינים לשיחה.";
          const sMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: sMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
        const { profile } = await getSessionContext();
        const orgId = profile?.org_id ?? null;
        if (orgId) {
          const missing = await listPropertiesMissingWeeklyReport(orgId, createServiceRoleClient(), 100);
          const content = missing.length
            ? "נכסים שבעליהם עדיין לא קיבלו דוח השבוע:\n" + missing.slice(0, 15).map((p) => `• ${p.title ?? "נכס"}`).join("\n")
            : "כל בעלי הנכסים המנויים קיבלו דוח השבוע ✓";
          const sMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: sMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to daily / RAG */ }
    }

    // ── ZI Office Intelligence — "מה אתה לומד על המשרד / מקורות לידים / איפה
    // עסקאות נתקעות / איפה חסר מלאי". Answers from the SAME explainable DTO (role-
    // gated → null for non-managers). Explains patterns with evidence; never
    // fabricates strategic/causal claims or quotes private conversations. ──
    if (detectOfficeIntelligenceQuery(question)) {
      try {
        const { summarizeOfficeIntelligenceForZi } = await import("@/lib/office/office-intelligence");
        const summary = await summarizeOfficeIntelligenceForZi(30);
        if (summary) {
          try { const { recordUsage } = await import("@/lib/launch/server/services"); await recordUsage({ category: "ai", name: "office_intelligence_zi_question" }); } catch { /* telemetry best-effort */ }
          const iMsg = await appendMessageRow({ conversationId, role: "assistant", content: summary, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: iMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through */ }
    }

    // ── ZI Manager Command Center — "איפה יש בעיות במשרד / מי מחכה / מה ראשון".
    // Answers from the SAME office-exceptions DTO (role-gated: non-managers get
    // null → falls through). ZI never approves plans or reassigns from ambiguous
    // chat — consequential actions stay on /office with confirmation. ──
    if (detectManagerOfficeQuery(question)) {
      try {
        const { summarizeManagerForZi } = await import("@/lib/office/manager-command-center");
        const summary = await summarizeManagerForZi();
        if (summary) {
          try { const { recordUsage } = await import("@/lib/launch/server/services"); await recordUsage({ category: "ai", name: "manager_zi_question" }); } catch { /* telemetry best-effort */ }
          const oMsg = await appendMessageRow({ conversationId, role: "assistant", content: summary, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: oMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through */ }
    }

    // ── ZI "תכנן לי את היום" — the Agent Daily Autopilot. Returns a concise,
    // ORDERED plan from the SAME daily-plan source (no separate reasoning), then
    // routes to the full board. Never invents tasks. ──
    if (detectPlanMyDayQuery(question)) {
      try {
        const { summarizeDailyPlanForZi } = await import("@/lib/daily/daily-plan");
        const content = (await summarizeDailyPlanForZi()) ?? "אין עדיין נתונים לתכנון היום.";
        const pMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
        await touchConversation(conversationId, 2);
        return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: pMsg, source: "fallback", model: null, sources: [], followups: [] } };
      } catch { /* fall through */ }
    }

    // ── ZI Daily Command Center: answer "what's urgent / who to call / what's
    // unmarketed / what changed" from the SAME authoritative brief — deterministic
    // facts, never hallucinated counts. ──
    const dailyIntent = detectDailyQuery(question);
    if (dailyIntent) {
      try {
        const brief = await getDailyCommandCenter();
        if (brief) {
          const content = formatDailyAnswer(brief, dailyIntent);
          const dMsg = await appendMessageRow({ conversationId, role: "assistant", content, source: null, route: ctx.route, moduleId: ctx.moduleId });
          await touchConversation(conversationId, 2);
          return { ok: true, data: { conversationId, conversationTitle, question: userMsg, answer: dMsg, source: "fallback", model: null, sources: [], followups: [] } };
        }
      } catch { /* fall through to RAG if the brief is unavailable */ }
    }

    // ── RAG: retrieve permission-filtered, page-aware knowledge, then answer
    // ONLY from it (with the deterministic, knowledge-grounded fallback). ──
    const articles = await loadKnowledgeArticles();
    const hits = searchKnowledge(articles, question, { roleKey: ctx.roleKey, moduleId: ctx.moduleId, route: ctx.route });
    let answer: { content: string; source: "ai" | "fallback" | "cache"; model: string | null };
    if (hits.length > 0) {
      const messages = buildRagMessages(ctx, question, hits, history);
      const res = await runZiCompletion(messages, deterministicRagAnswer(ctx, hits));
      answer = { content: res.content, source: res.source, model: res.model };
    } else {
      // Nothing retrieved → honest fallback (engine returns the no-answer line).
      const fb = await answerZi(ctx, question, history);
      answer = { content: deterministicRagAnswer(ctx, []), source: fb.source === "ai" ? "fallback" : fb.source, model: null };
    }
    const sources: KnowledgeSourceRef[] = ragSources(hits);
    const followups = ragFollowups(hits);

    // ── ZI-CS (P1 + P6): classify the support intent, and auto-open a ticket with
    // the full transcript + context attached when escalation is warranted. Wrapped
    // so support classification/escalation can NEVER break the answer. ──
    let support: ZiAskResult["support"] | undefined;
    try {
      const classification = classifySupportIntentDeterministic(question, { route: ctx.route, moduleId: ctx.moduleId });

      // ── ZI-CS (P4): for an actionable support turn, run a LIVE diagnostic FIRST and
      // surface the finding + fix steps — troubleshoot, don't just explain. Findings
      // ride along to the ticket if we still escalate. Best-effort, never blocks. ──
      let diagnostics: string[] | undefined;
      if (shouldRunDiagnostics(classification)) {
        try {
          const issue = diagnosticPlan(classification);
          const dx0 = await collectDiagnosticSignals();
          const dx = runZIDiagnostics(
            { currentRoute: ctx.route, module: ctx.moduleId, issueType: (issue ?? undefined) as IssueType | undefined },
            dx0.signals, { orgId: dx0.orgId, userId: dx0.userId, role: dx0.role },
          );
          diagnostics = [dx.summary, ...dx.userNextSteps].filter(Boolean);
          if (dx.summary) {
            const steps = dx.userNextSteps.length ? "\n" + dx.userNextSteps.map((s) => `- ${s}`).join("\n") : "";
            answer.content = `**${dx.summary}**${steps}\n\n---\n${answer.content}`;
          }
        } catch { /* diagnostics best-effort — never block the answer */ }
      }

      let ticketId: string | null = null;
      let ticketNumber: string | null = null;
      let escalated = false;
      // Diagnostics that produced fix steps count as "we helped" → don't auto-escalate
      // on the no-knowledge rule; still escalate for human/critical/security/billing.
      const helped = hits.length > 0 || (diagnostics != null && diagnostics.length > 0);
      if (shouldEscalate(classification, { knowledgeFound: helped })) {
        const transcript = [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: answer.content },
        ];
        const res = await openSupportTicketFromZi({
          conversationId, classification, question, transcript, summary: null,
          context: { route: ctx.route, moduleLabel: ctx.moduleLabel, roleLabel: ctx.roleLabel, plan: ctx.plan },
          diagnostics: diagnostics ?? null,
        });
        if (res.ok && res.ticketId) {
          ticketId = res.ticketId;
          ticketNumber = res.ticketNumber ?? null;
          escalated = true;
          const ref = ticketNumber ? ` · מספר פנייה: ${ticketNumber}` : "";
          if (res.existing) {
            answer.content += `\n\n---\nהפנייה שלך לצוות התמיכה כבר פתוחה${ref}. אין צורך לפתוח פנייה חדשה — הצוות מטפל בה ויחזור אליך כאן.`;
          } else if (classification.requiresHuman) {
            answer.content = `פתחתי עבורך פנייה לצוות התמיכה ✅\nמספר הפנייה שלך: ${ticketNumber ?? "—"}\nצירפתי את פרטי השיחה, והצוות יחזור אליך כאן בהקדם.`;
          } else {
            answer.content += `\n\n---\nלא הצלחתי לפתור את זה בוודאות, אז פתחתי עבורך פנייה לצוות ZONO${ref} וצירפתי את כל פרטי התקלה והשיחה שלנו. אין צורך להסביר הכול מחדש — הצוות יחזור אליך כאן.`;
          }
        }
      }
      support = {
        lane: classification.lane, category: classification.category, severity: classification.severity,
        requiresHuman: classification.requiresHuman, escalated, ticketId, ticketNumber,
      };
    } catch { /* best-effort; the answer stands regardless of classification/escalation */ }

    // Persist the assistant's answer.
    const assistantMsg = await appendMessageRow({
      conversationId, role: "assistant", content: answer.content, source: answer.source, route: ctx.route, moduleId: ctx.moduleId,
    });

    await touchConversation(conversationId, 2);

    return {
      ok: true,
      data: {
        conversationId, conversationTitle, question: userMsg, answer: assistantMsg,
        source: answer.source, model: answer.model, sources, followups, support,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ask_failed" };
  }
}

export async function loadConversationsAction(includeArchived = false): Promise<ZiResult<ZiConversation[]>> {
  try { return { ok: true, data: await listConversationRows(includeArchived) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

export async function loadConversationAction(id: string, page: ZiPagination = { limit: 50, offset: 0 }): Promise<ZiResult<ZiConversationWithMessages>> {
  try {
    const [list, messages] = await Promise.all([listConversationRows(true), getMessageRows(id, page)]);
    const conv = list.find((c) => c.id === id);
    if (!conv) return { ok: false, error: "not_found" };
    return { ok: true, data: { ...conv, messages } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

export async function createConversationAction(input: { title?: string; route?: string | null; moduleId?: string | null }): Promise<ZiResult<ZiConversation>> {
  try {
    const conv = await createConversationRow({
      title: input.title?.trim() || "שיחה חדשה", route: input.route ?? null, moduleId: input.moduleId ?? null,
    });
    return { ok: true, data: conv };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "create_failed" }; }
}

export async function renameConversationAction(id: string, title: string): Promise<ZiResult<true>> {
  try { await renameConversationRow(id, title); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "rename_failed" }; }
}

export async function deleteConversationAction(id: string): Promise<ZiResult<true>> {
  try { await softDeleteConversationRow(id); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "delete_failed" }; }
}

export async function pinConversationAction(id: string, pinned: boolean): Promise<ZiResult<true>> {
  try { await setPinnedRow(id, pinned); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "pin_failed" }; }
}

export async function archiveConversationAction(id: string, archived: boolean): Promise<ZiResult<true>> {
  try { await setArchivedRow(id, archived); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "archive_failed" }; }
}

export async function searchConversationsAction(query: string): Promise<ZiResult<ZiConversation[]>> {
  try { return { ok: true, data: await searchConversationRows(query) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "search_failed" }; }
}

export async function rateMessageAction(messageId: string, rating: "up" | "down" | null): Promise<ZiResult<true>> {
  try { await rateMessageRow(messageId, rating); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "rate_failed" }; }
}

// ── Knowledge Engine actions (Phase 23) ──────────────────────────────────────

export interface ZiKnowledgeFeedbackInput {
  question: string;
  answer: string;
  articleIds: string[];
  route: string | null;
  moduleId: string | null;
  rating: FeedbackRating;
  comment?: string | null;
}

/** Record "האם זה עזר?" feedback on a ZI answer. */
export async function submitKnowledgeFeedbackAction(input: ZiKnowledgeFeedbackInput): Promise<ZiResult<true>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    await recordKnowledgeFeedback({
      question: input.question, answer: input.answer, articleIds: input.articleIds,
      route: input.route, moduleId: input.moduleId, role, rating: input.rating, comment: input.comment ?? null,
    });
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "feedback_failed" }; }
}

/** Seed/refresh the built-in knowledge base (idempotent). Admin-triggered. */
export async function syncKnowledgeAction(): Promise<ZiResult<KnowledgeSyncResult>> {
  try {
    const { profile, state } = await getSessionContext();
    if (state !== "ready" || !profile) return { ok: false, error: "unauthorized" };
    const res = await syncZIKnowledgeBase();
    return res.ok ? { ok: true, data: res } : { ok: false, error: res.error ?? "sync_failed" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "sync_failed" }; }
}

export interface KnowledgeAdminData {
  articles: KnowledgeArticle[];
  categories: string[];
  modules: string[];
  feedback: KnowledgeFeedbackRow[];
  missingQuestions: string[];
  unpublished: number;
}

/** Everything the /admin/zi-knowledge page needs. */
export async function loadKnowledgeAdminAction(): Promise<ZiResult<KnowledgeAdminData>> {
  try {
    const articles = await loadKnowledgeArticlesAdmin();
    const [feedback, missingQuestions] = await Promise.all([
      listKnowledgeFeedback().catch(() => []),
      listMissingAnswerQuestions().catch(() => []),
    ]);
    return {
      ok: true,
      data: {
        articles,
        categories: [...new Set(articles.map((a) => a.category))].sort(),
        modules: [...new Set(articles.map((a) => a.module).filter((m): m is string => !!m))].sort(),
        feedback, missingQuestions,
        unpublished: articles.filter((a) => !a.published).length,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

// ── Diagnostics Engine actions (Phase 24) ────────────────────────────────────

export interface RunDiagnosticsInput {
  currentRoute: string | null;
  module: string | null;
  issueType?: IssueType;
  entityId?: string | null;
  timeframe?: "today" | "week" | "all";
  browser?: string | null;
}

/**
 * Diagnose "why is this not working?" — collects a safe, org-scoped signal
 * snapshot, runs deterministic checks, and returns a Hebrew-explained result
 * with a REDACTED support payload. SUPPORT-ONLY: inspects + explains, no actions.
 */
export async function runDiagnosticsAction(input: RunDiagnosticsInput): Promise<ZiResult<DiagnosticResult>> {
  try {
    const { signals, orgId, userId, role } = await collectDiagnosticSignals();
    const dxInput: DiagnosticInput = {
      currentRoute: input.currentRoute,
      module: input.module,
      issueType: input.issueType,
      entityId: input.entityId ?? null,
      timeframe: input.timeframe,
    };
    const result = runZIDiagnostics(dxInput, signals, { orgId, userId, role }, input.browser ?? null);
    await persistDiagnosticRun(dxInput, result); // best-effort; never blocks
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "diagnostics_failed" };
  }
}

/** Recent diagnostic runs for the admin page (manager+ via RLS). */
export async function loadDiagnosticRunsAction(): Promise<ZiResult<DiagnosticRunRow[]>> {
  try { return { ok: true, data: await listDiagnosticRuns() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

// ── ZI Interactive Learning actions (Phase 25) ───────────────────────────────
import {
  walkthroughsForRole, tutorialsForRole, faqForModule, GLOSSARY, LEARNING_PATHS,
  recommendLearning, searchLearning,
} from "./learning";
import type {
  Walkthrough, Tutorial, FaqItem, GlossaryTerm, LearningPath, LearningProgress,
  LearningRecommendation, LearningSearchHit, LearningKind,
} from "./learning/types";
import { loadProgress, upsertProgress } from "./learning-repository";

export interface LearningData {
  progress: LearningProgress[];
  recommendations: LearningRecommendation[];
  walkthroughs: Walkthrough[];
  tutorials: Tutorial[];
  faq: FaqItem[];
  glossary: GlossaryTerm[];
  paths: LearningPath[];
}

/** Everything the ZI "Learn" panel needs for the current user + page. */
export async function loadLearningAction(currentModule: string | null): Promise<ZiResult<LearningData>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const progress = await loadProgress();
    return {
      ok: true,
      data: {
        progress,
        recommendations: recommendLearning({ role, progress, currentModule }),
        walkthroughs: walkthroughsForRole(role),
        tutorials: tutorialsForRole(role),
        faq: faqForModule(currentModule, role ?? "viewer"),
        glossary: GLOSSARY,
        paths: LEARNING_PATHS,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_load_failed" }; }
}

/** Record viewing / progress / completion / favorite for a lesson (support-only). */
export async function markLearningAction(input: { kind: LearningKind; slug: string; status?: "viewed" | "in_progress" | "completed"; favorite?: boolean; lastStep?: number }): Promise<ZiResult<true>> {
  try { await upsertProgress(input); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_mark_failed" }; }
}

/** Search learning content (built-ins) + the knowledge base, unified. */
export async function searchLearningAction(query: string): Promise<ZiResult<LearningSearchHit[]>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const builtin = searchLearning(query, role);
    const articles = await loadKnowledgeArticles();
    const kHits = searchKnowledge(articles, query, { roleKey: role, moduleId: null, route: null }, 6)
      .map((h): LearningSearchHit => ({ kind: "knowledge", slug: h.article.slug, title: h.article.title, snippet: h.article.summary, module: h.article.module, score: Math.round(h.score) }));
    const merged = [...builtin, ...kHits].sort((a, b) => b.score - a.score).slice(0, 14);
    return { ok: true, data: merged };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_search_failed" }; }
}

export interface LearningAdminData {
  tutorials: number; walkthroughs: number; glossary: number; faq: number;
  mostRequested: string[];
}

/** Admin overview for /admin/zi-learning (managers+). Read-only counts + gaps. */
export async function loadLearningAdminAction(): Promise<ZiResult<LearningAdminData>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const mostRequested = await listMissingAnswerQuestions(20).catch(() => []);
    return {
      ok: true,
      data: {
        tutorials: tutorialsForRole(role).length, walkthroughs: walkthroughsForRole(role).length,
        glossary: GLOSSARY.length, faq: faqForModule(null, role ?? "viewer").length, mostRequested,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_admin_failed" }; }
}

/** Test the knowledge search from the admin page (returns titles + scores). */
export async function testKnowledgeSearchAction(query: string): Promise<ZiResult<{ title: string; category: string; score: number; reason: string }[]>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const articles = await loadKnowledgeArticles();
    const hits = searchKnowledge(articles, query, { roleKey: role, moduleId: null, route: null }, 8);
    return { ok: true, data: hits.map((h) => ({ title: h.article.title, category: h.article.category, score: Math.round(h.score * 10) / 10, reason: h.reason })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "search_failed" }; }
}
