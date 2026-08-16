// ============================================================================
// ZI Expert™ — SUPPORT TICKET BRIDGE, pure core (Phase ZI-CS P6, dep-light).
// Turns a ZI support classification + conversation into a ready-to-insert
// support_tickets draft: subject, description (AI summary + transcript + context),
// category and priority — all mapped onto the EXISTING support_tickets vocabulary
// (verified against the DB CHECK constraints). No I/O here → unit-runnable.
//   priority ∈ low|normal|high|urgent   source ∈ …|customer_report|…
// ============================================================================
import type { SupportClassification, SupportSeverity, SupportCategory } from "./support-intent";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

/** Map ZI severity → the support_tickets priority enum (DB-constrained). */
export function severityToPriority(sev: SupportSeverity): TicketPriority {
  switch (sev) {
    case "CRITICAL": return "urgent";
    case "HIGH": return "high";
    case "LOW": return "low";
    default: return "normal";
  }
}

// Hebrew labels for the ticket subject (customer-facing).
const CATEGORY_HE: Partial<Record<SupportCategory, string>> = {
  FACEBOOK: "פייסבוק", WHATSAPP: "וואטסאפ", GOOGLE: "גוגל", INTEGRATION: "אינטגרציה",
  BILLING: "חיוב", SUBSCRIPTION: "מנוי", AUTHENTICATION: "התחברות", PERMISSIONS: "הרשאות",
  PROPERTY: "נכסים", BUYER: "קונים", SELLER: "מוכרים", LEAD: "לידים", TRANSACTION: "עסקאות",
  SYNC: "סנכרון", PERFORMANCE: "ביצועים", TECHNICAL_ERROR: "תקלה טכנית", BUG: "באג",
  DATA: "נתונים", SECURITY: "אבטחה", ACCOUNT: "חשבון", ONBOARDING: "התחלה",
  AI_FEATURE: "יכולת AI", FEATURE_REQUEST: "בקשת פיצ׳ר", PRODUCT_USAGE: "שימוש במוצר", OTHER: "כללי",
};

export interface ZiTicketDraft {
  subject: string;
  description: string;
  category: string;     // lowercased ZI category (support_tickets.category has no CHECK)
  priority: TicketPriority;
}

export interface ZiTranscriptTurn { role: "user" | "assistant"; content: string }

const oneLine = (s: string): string => (s || "").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Build a support-ticket draft from a ZI support turn. Pure + deterministic.
 * `summary` is the ZI-generated one-line issue summary (directive §17); when
 * absent, the user's question stands in. Transcript is trimmed to the last turns.
 */
export function buildZiTicketDraft(input: {
  classification: SupportClassification;
  question: string;
  transcript?: ZiTranscriptTurn[];
  summary?: string | null;
  context?: { route?: string | null; moduleLabel?: string | null; roleLabel?: string | null; plan?: string | null };
  diagnostics?: string[] | null;
}): ZiTicketDraft {
  const { classification: c } = input;
  const catHe = CATEGORY_HE[c.category] ?? "כללי";
  const subject = clip(`[${catHe}] ${oneLine(input.summary || input.question) || "פנייה חדשה"}`, 90);

  const lines: string[] = [];
  lines.push(`סיכום התקלה: ${oneLine(input.summary || input.question)}`);
  lines.push("");
  lines.push(`קטגוריה: ${catHe} · חומרה: ${c.severity} · ביטחון סיווג: ${Math.round(c.confidence * 100)}%`);
  if (input.context) {
    const ctx = [
      input.context.moduleLabel && `מסך: ${input.context.moduleLabel}`,
      input.context.route && `נתיב: ${input.context.route}`,
      input.context.roleLabel && `תפקיד: ${input.context.roleLabel}`,
      input.context.plan && `חבילה: ${input.context.plan}`,
    ].filter(Boolean).join(" · ");
    if (ctx) lines.push(ctx);
  }
  if (input.diagnostics && input.diagnostics.length) {
    lines.push("");
    lines.push("תוצאות אבחון:");
    for (const d of input.diagnostics.slice(0, 8)) lines.push(`- ${oneLine(d)}`);
  }
  const turns = (input.transcript ?? []).slice(-12);
  if (turns.length) {
    lines.push("");
    lines.push("תמליל השיחה:");
    for (const t of turns) lines.push(`${t.role === "assistant" ? "ZI" : "לקוח"}: ${clip(oneLine(t.content), 500)}`);
  }
  lines.push("");
  lines.push("— נפתח אוטומטית על ידי ZI. הלקוח אינו צריך להסביר שוב את הבעיה.");

  return {
    subject,
    description: lines.join("\n"),
    category: c.category.toLowerCase(),
    priority: severityToPriority(c.severity),
  };
}

/** Stable link key so a ZI conversation maps to at most one open ticket. */
export const ziConversationLinkRef = (conversationId: string): string => `zi:${conversationId}`;
