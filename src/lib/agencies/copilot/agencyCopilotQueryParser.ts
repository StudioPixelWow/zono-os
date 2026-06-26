// ============================================================================
// ZONO — PHASE 26.10: AI Copilot query parser (PURE, client-safe).
// Extracts city / neighborhood / street / agency name(s) / period from a free
// text Hebrew question, deterministically. Conservative: returns null when not
// confident, so the context builder never guesses an area or agency.
// ============================================================================
import type { ParsedAgencyQuery } from "./agencyCopilotTypes";

const clean = (s: string): string => s.replace(/[?.!,;:"'""'']+$/g, "").replace(/^[\s"'""'']+/, "").trim();
const norm = (s: string): string => (s ?? "").replace(/\s+/g, " ").trim();

// Tokens that are never a place/agency name on their own.
const STOP = new Set([
  "שלי", "ההתמחות", "התמחות", "בלי", "הרבה", "תחרות", "האזור", "אזור", "הכי", "חזק",
  "חזקה", "המשרד", "משרד", "מתחרה", "מתחרים", "כרגע", "החודש", "השבוע", "השנה", "לי",
  "יש", "מי", "מה", "איזה", "איפה", "את", "של", "עם", "זה", "טוב", "כל",
]);

const PERIODS: { re: RegExp; days: number; label: string }[] = [
  { re: /היום|כיום/, days: 1, label: "היום" },
  { re: /השבוע|בשבוע האחרון|לאחרונה/, days: 7, label: "השבוע האחרון" },
  { re: /החודש|בחודש האחרון/, days: 30, label: "החודש האחרון" },
  { re: /רבעון|ברבעון/, days: 90, label: "הרבעון האחרון" },
  { re: /השנה|בשנה האחרונה/, days: 365, label: "השנה האחרונה" },
];

function captureAfter(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m || !m[1]) return null;
  const c = clean(m[1]);
  if (!c || STOP.has(c)) return null;
  return c;
}

/** Parse a Hebrew agency-intelligence question into structured entities. */
export function parseAgencyIntelQuestion(question: string): ParsedAgencyQuery {
  const raw = norm(question ?? "");

  // Period.
  let periodDays: number | null = null, periodLabel: string | null = null;
  for (const p of PERIODS) if (p.re.test(raw)) { periodDays = p.days; periodLabel = p.label; break; }

  // Neighborhood / street.
  const neighborhood = captureAfter(raw, /שכונ(?:ת|ה)\s+([א-ת'""\-]+(?:\s+[א-ת'""\-]+)?)/);
  const street = captureAfter(raw, /(?:ב?רחוב)\s+([א-ת'""\-]+(?:\s+[א-ת'""\-]+)?)/);

  // City: "קריית X" / "בעיר X" / "באזור X" (excluding user-area phrases & stopwords).
  let city: string | null = null;
  const kiryat = raw.match(/(קריי?ת\s+[א-ת'""\-]+)/);
  if (kiryat) city = clean(kiryat[1]).replace(/^קרית/, "קריית");
  if (!city) {
    const byCity = captureAfter(raw, /(?:בעיר|עיר)\s+([א-ת'""\-]+(?:\s+[א-ת'""\-]+)?)/);
    if (byCity) city = byCity;
  }
  if (!city) {
    const byArea = raw.match(/(?:באזור|אזור)\s+([א-ת'""\-]+)/);
    if (byArea && byArea[1]) {
      const c = clean(byArea[1]);
      if (c && !STOP.has(c) && !/^ה?התמחות/.test(c)) city = c;
    }
  }
  // Don't let a neighborhood/street token leak in as the city.
  if (city && (city === neighborhood || city === street)) city = null;

  // Agency name(s): quotes, or after משרד/סוכנות/קבוצת, or "X מול/לעומת Y".
  const agencyNames: string[] = [];
  // "X מול/לעומת Y" or "בין X ל-Y".
  const cmp = raw.match(/([א-תa-z'""\-]+(?:\s+[א-תa-z'""\-]+)?)\s+(?:מול|לעומת|בהשוואה ל)\s*([א-תa-z'""\-]+(?:\s+[א-תa-z'""\-]+)?)/i)
    || raw.match(/בין\s+([א-תa-z'""\-]+(?:\s+[א-תa-z'""\-]+)?)\s+ל[־-]?([א-תa-z'""\-]+(?:\s+[א-תa-z'""\-]+)?)/i);
  if (cmp) { for (const g of [cmp[1], cmp[2]]) { const c = clean(g); if (c && !STOP.has(c)) agencyNames.push(c); } }
  let agencyName: string | null = agencyNames[0] ?? null;
  if (!agencyName) {
    const quoted = raw.match(/[""'']([^""'']{2,40})[""'']/);
    if (quoted) agencyName = clean(quoted[1]);
  }
  if (!agencyName) agencyName = captureAfter(raw, /(?:משרד|סוכנות|קבוצת|רי\/מקס|רימקס|אנגלו|century)\s+([א-תa-zA-Z'""\-]+(?:\s+[א-תa-zA-Z'""\-]+)?)/i);

  return { raw, city, neighborhood, street, agencyName, agencyNames, periodDays, periodLabel };
}

/** True when the user is referring to their own specialization area ("האזור שלי"). */
export function refersToUserArea(question: string): boolean {
  const q = norm(question);
  return /אזור ההתמחות שלי|האזור שלי|אזור שלי|השוק שלי|אצלי באזור|באזור שלי/.test(q);
}
