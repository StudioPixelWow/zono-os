// ============================================================================
// ZONO — feedback context builder (pure, client-safe). Assembles the
// non-sensitive technical context auto-attached to every feedback submission:
// browser, app version, role, current page, correlation id. NEVER captures
// business content — only the technical envelope.
// ============================================================================
import type { FeedbackContext, FeedbackInput, FeedbackType } from "./types";

export const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: string }[] = [
  { value: "bug", label: "תקלה", icon: "AlertTriangle" },
  { value: "suggestion", label: "הצעה", icon: "Sparkles" },
  { value: "missing_feature", label: "פיצ׳ר חסר", icon: "Plus" },
  { value: "performance", label: "בעיית ביצועים", icon: "Activity" },
];

/** Parse a browser UA into a short, non-identifying label. */
export function shortBrowser(ua: string): string {
  const u = ua || "";
  if (/edg\//i.test(u)) return "Edge";
  if (/chrome\//i.test(u) && !/edg\//i.test(u)) return "Chrome";
  if (/firefox\//i.test(u)) return "Firefox";
  if (/safari\//i.test(u) && !/chrome\//i.test(u)) return "Safari";
  return "Other";
}

/** Build the technical context envelope from client-available signals. */
export function buildFeedbackContext(opts: {
  userAgent: string; appVersion: string; roleKey: string; page: string; correlationId: string;
  viewport?: string; locale?: string;
}): FeedbackContext {
  return {
    browser: shortBrowser(opts.userAgent),
    appVersion: opts.appVersion,
    roleKey: opts.roleKey,
    page: opts.page,
    correlationId: opts.correlationId,
    viewport: opts.viewport,
    locale: opts.locale,
  };
}

/** Validate a feedback submission (pure). Returns an error message or null. */
export function validateFeedback(input: FeedbackInput): string | null {
  const okType = FEEDBACK_TYPES.some((t) => t.value === input.type);
  if (!okType) return "סוג משוב לא תקין.";
  if (!input.title.trim() && !input.body.trim()) return "נא להוסיף כותרת או תיאור.";
  if (input.body.length > 4000) return "התיאור ארוך מדי.";
  return null;
}
