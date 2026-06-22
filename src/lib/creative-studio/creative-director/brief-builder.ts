// ============================================================================
// ZONO — Creative Director Brief Builder (pure)
// ----------------------------------------------------------------------------
// Builds the EXACT structured Hebrew brief the proven framework expects.
// ============================================================================

export interface DirectorBriefInput {
  companyName: string; primaryColor: string; textColor: string; format: string;
  headline: string; subheadline?: string; lines?: string[]; trust?: string; cta: string;
}

/** The exact Hebrew brief structure (proven input format). */
export function buildHebrewBrief(i: DirectorBriefInput): string {
  const fmtLabel = i.format === "story_9_16" ? "Meta Story 9:16" : "Meta Feed 4:5";
  const lines = (i.lines ?? []).filter(Boolean);
  const lineRows = lines.map((l, idx) => `סעיף ${idx + 1}: ${l}`).join("\n");
  return [
    'אני צריך פרמפט לגרפיקת פרסום בפייסבוק.',
    '',
    'פרטי מותג:',
    `חברה: ${i.companyName || "—"}`,
    'תעשייה: נדל"ן',
    `צבע מותג ראשי: ${i.primaryColor || "—"}`,
    `צבע טקסט/פונט: ${i.textColor || "—"}`,
    'פונט: Heebo עברית RTL',
    `פורמט: ${fmtLabel}`,
    '',
    'הקופי המלא:',
    `כותרת: ${i.headline || "—"}`,
    `תת-כותרת: ${i.subheadline || "—"}`,
    lineRows,
    `אישור ממסגר: ${i.trust || "—"}`,
    `CTA: ${i.cta || "—"}`,
    '',
    'תן לי פרמפט אחד מלא מוכן להדבקה למחולל התמונות.',
  ].filter((x) => x !== "").join("\n");
}
