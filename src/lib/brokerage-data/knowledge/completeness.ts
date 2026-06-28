// ============================================================================
// ZONO Brokerage Knowledge — Data Completeness engine (pure).
// Weighted completeness % + missing fields + enrichment suggestions for every
// office and agent. Deterministic; UI shows progress bars + missing info.
// ============================================================================
import type { CompletenessField, CompletenessResult } from "./types";

// Field weights (per spec). Higher weight = more important for a trusted record.
const OFFICE_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "name", label: "שם משרד", weight: 10 },
  { key: "owner", label: "בעלים", weight: 6 },
  { key: "phone", label: "טלפון", weight: 10 },
  { key: "email", label: "אימייל", weight: 7 },
  { key: "website", label: "אתר", weight: 7 },
  { key: "address", label: "כתובת", weight: 7 },
  { key: "city", label: "עיר", weight: 8 },
  { key: "google", label: "Google Business", weight: 6 },
  { key: "facebook", label: "פייסבוק", weight: 4 },
  { key: "instagram", label: "אינסטגרם", weight: 3 },
  { key: "linkedin", label: "לינקדאין", weight: 2 },
  { key: "business_hours", label: "שעות פעילות", weight: 3 },
  { key: "location", label: "מיקום (קואורדינטות)", weight: 6 },
  { key: "coverage_area", label: "אזורי פעילות", weight: 5 },
  { key: "license", label: "רישיון", weight: 4 },
  { key: "sources", label: "מספר מקורות", weight: 5 },
  { key: "confidence", label: "ביטחון", weight: 4 },
  { key: "last_verification", label: "אימות אחרון", weight: 3 },
];
const AGENT_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "name", label: "שם סוכן", weight: 10 },
  { key: "phone", label: "טלפון", weight: 10 },
  { key: "email", label: "אימייל", weight: 7 },
  { key: "whatsapp", label: "וואטסאפ", weight: 5 },
  { key: "office", label: "שיוך משרד", weight: 8 },
  { key: "city", label: "עיר", weight: 8 },
  { key: "role", label: "תפקיד", weight: 3 },
  { key: "specialties", label: "התמחויות", weight: 4 },
  { key: "license", label: "רישיון", weight: 5 },
  { key: "coverage_area", label: "אזורי פעילות", weight: 5 },
  { key: "sources", label: "מספר מקורות", weight: 5 },
  { key: "confidence", label: "ביטחון", weight: 4 },
  { key: "last_verification", label: "אימות אחרון", weight: 3 },
];

const SUGGESTION: Record<string, string> = {
  phone: "אסוף טלפון ראשי ממקור מהימן", email: "השלם כתובת אימייל",
  website: "אתר את אתר המשרד הרשמי", address: "השלם כתובת מלאה",
  google: "קשר ל-Google Business לדירוג וביקורות", location: "הוסף קואורדינטות למיקום מדויק",
  coverage_area: "הגדר אזורי פעילות", license: "אמת מספר רישיון", owner: "אתר שם בעלים/מנהל",
  office: "שייך את הסוכן למשרד", last_verification: "אמת מחדש מול מקור עדכני",
  facebook: "קשר עמוד פייסבוק", instagram: "קשר פרופיל אינסטגרם", whatsapp: "הוסף מספר וואטסאפ",
};

/** Score a prepared list of weighted fields → completeness %, missing & tips. */
export function scoreCompleteness(fields: CompletenessField[]): CompletenessResult {
  const totalWeight = fields.reduce((a, f) => a + f.weight, 0) || 1;
  const filledWeight = fields.filter((f) => f.present).reduce((a, f) => a + f.weight, 0);
  const missing = fields.filter((f) => !f.present)
    .map((f) => ({ key: f.key, label: f.label, weight: f.weight }))
    .sort((a, b) => b.weight - a.weight);
  const suggestions = missing.slice(0, 4).map((m) => SUGGESTION[m.key] ?? `השלם: ${m.label}`);
  return { pct: Math.round((filledWeight / totalWeight) * 100), filledWeight, totalWeight, missing, suggestions };
}

/** Build office field presence from a flexible record + aggregated extras. */
export function officeCompleteness(present: Record<string, boolean>): CompletenessResult {
  return scoreCompleteness(OFFICE_WEIGHTS.map((w) => ({ ...w, present: !!present[w.key] })));
}
/** Build agent field presence from a flexible record + aggregated extras. */
export function agentCompleteness(present: Record<string, boolean>): CompletenessResult {
  return scoreCompleteness(AGENT_WEIGHTS.map((w) => ({ ...w, present: !!present[w.key] })));
}
