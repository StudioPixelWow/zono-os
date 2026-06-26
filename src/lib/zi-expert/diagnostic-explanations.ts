// ============================================================================
// ZI Expert™ Diagnostics — Hebrew explanation engine (Phase 24, PURE).
// Turns a deterministic check result into a calm, plain-Hebrew support message:
//   מצאתי את הבעיה / מה זה אומר / מה אפשר לעשות עכשיו / מתי לפנות לתמיכה.
// ZI is SUPPORT-ONLY — it explains and suggests, never acts.
// ============================================================================
import type { CheckOutput } from "./diagnostic-checks";
import type { DiagnosticStatus, IssueType } from "./diagnostic-types";

const ISSUE_LABEL: Record<IssueType, string> = {
  property_radar_empty: "רדאר הנכסים ריק",
  map_empty: "המפה ריקה",
  buyer_matching_zero: "אין התאמות קונים",
  seller_intelligence_empty: "מודיעין מוכרים ריק",
  journey_not_running: "המסע לא רץ",
  ai_unavailable: "ה‑AI לא זמין",
  provider_sync_failed: "סנכרון הספק נכשל",
  cron_not_running: "הסנכרון האוטומטי לא רץ",
  realtime_not_arriving: "עדכוני זמן אמת לא מגיעים",
  feature_unavailable: "יכולת לא זמינה",
  permission_denied: "אין הרשאה",
  credits_exhausted: "המכסה מוצתה",
  reports_not_generating: "דוחות לא נוצרים",
  notifications_missing: "התראות חסרות",
  general: "בדיקה כללית",
};

const STATUS_OPENING: Record<DiagnosticStatus, string> = {
  healthy: "בדקתי — והכול נראה תקין.",
  warning: "מצאתי כמה דברים ששווה לשים לב אליהם.",
  critical: "מצאתי את הבעיה.",
  unknown: "בדקתי, אבל אין מספיק מידע כדי לקבוע בוודאות.",
};

/** One-line summary for the result header + support payload. */
export function buildSummary(issueType: IssueType, status: DiagnosticStatus, likelyCause: string | null): string {
  const label = ISSUE_LABEL[issueType] ?? ISSUE_LABEL.general;
  if (status === "healthy") return `${label}: לא נמצאה תקלה — הכול תקין.`;
  if (likelyCause) return `${label}: ${likelyCause}`;
  return `${label}: ${STATUS_OPENING[status]}`;
}

/** The formatted Hebrew explanation block shown in the widget. */
export function buildExplanation(issueType: IssueType, out: CheckOutput): string {
  const lines: string[] = [];

  // 1) מצאתי את הבעיה
  lines.push(`**מצאתי את הבעיה:** ${out.likelyCause ?? STATUS_OPENING[out.status]}`);

  // 2) מה זה אומר — the concrete findings (skip pure "ok" noise unless all-ok)
  const meaningful = out.findings.filter((f) => f.severity !== "ok");
  const shown = meaningful.length ? meaningful : out.findings;
  if (shown.length) {
    lines.push("");
    lines.push("**מה זה אומר:**");
    for (const f of shown.slice(0, 6)) lines.push(`• ${f.title} — ${f.detail}`);
  }

  // 3) מה אפשר לעשות עכשיו — user steps first (ZI is support-only, no actions)
  if (out.userNextSteps.length) {
    lines.push("");
    lines.push("**מה אפשר לעשות עכשיו:**");
    for (const s of out.userNextSteps.slice(0, 5)) lines.push(`• ${s}`);
  }

  // 4) מתי לפנות לתמיכה
  lines.push("");
  if (out.status === "critical") {
    lines.push("**מתי לפנות לתמיכה:** אם ביצעת את הצעדים ועדיין לא נפתר — פתח/י פנייה לתמיכה ואני אצרף סיכום אבחון מלא (ללא פרטים רגישים).");
  } else if (out.status === "healthy") {
    lines.push("**מתי לפנות לתמיכה:** לא נדרש. אם משהו עדיין לא נראה לך תקין — אני כאן.");
  } else {
    lines.push("**מתי לפנות לתמיכה:** אם זה חוזר על עצמו — אפשר לפתוח פנייה ואני אצרף סיכום אבחון.");
  }

  return lines.join("\n");
}

export function issueLabel(issueType: IssueType): string {
  return ISSUE_LABEL[issueType] ?? ISSUE_LABEL.general;
}
