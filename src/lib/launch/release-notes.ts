// ============================================================================
// ZONO — release notes (pure). Generated deterministically from static version
// metadata (no AI). The metadata is the single source of truth; the UI renders
// it newest-first. Append a new VersionMeta entry per release.
// ============================================================================
import type { ReleaseNote, VersionMeta } from "./types";

// Newest entries first. Keep highlights short, user-facing, Hebrew.
export const VERSION_HISTORY: VersionMeta[] = [
  {
    version: "1.0.0", date: "2026-06-26", title: "השקה מסחרית — ZONO Commercial Launch",
    area: "Platform",
    highlights: [
      "מצב Beta לכל ארגון/משתמש + באנר ומשוב מובנה",
      "מרכז עזרה, סיור מוצר אינטראקטיבי ו‑Onboarding מודרך",
      "דיאגנוסטיקה, ניתוח שימוש, כלי תמיכה ולוח מוכנות להשקה",
      "מסגרת חבילות (Starter/Professional/Office/Enterprise) והכנה לחיוב",
    ],
  },
  {
    version: "0.20.0", date: "2026-06-25", title: "Enterprise Reliability Platform™",
    area: "Reliability",
    highlights: [
      "מרכז בריאות מערכת, תורים, retry, מעגלי הגנה (circuit breakers)",
      "דגלי תכונה, יומן ביקורת מרכזי ושער מוכנות לפרודקשן",
    ],
  },
  {
    version: "0.19.0", date: "2026-06-24", title: "Executive Business Intelligence™",
    area: "Intelligence",
    highlights: ["המוח העסקי: הכנסה צפויה, פייפליין, תחזיות, ROI ובריאות משרד"],
  },
];

export function generateReleaseNotes(history: VersionMeta[] = VERSION_HISTORY): ReleaseNote[] {
  return [...history]
    .map((v) => ({ version: v.version, date: v.date, title: v.title, highlights: v.highlights, area: v.area ?? "General" }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function currentVersion(history: VersionMeta[] = VERSION_HISTORY): string {
  return generateReleaseNotes(history)[0]?.version ?? "0.0.0";
}
