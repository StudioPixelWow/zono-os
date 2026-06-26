// ============================================================================
// ZONO — PHASE 26.10: AI Copilot intent router (PURE, client-safe).
// Maps a Hebrew question (+ parsed entities) to one of the supported agency
// intelligence intents. Ordered keyword rules; falls back to "unknown" so the
// answer builder can ask the user to rephrase instead of guessing.
// ============================================================================
import type { AgencyCopilotIntent, ParsedAgencyQuery } from "./agencyCopilotTypes";

const has = (t: string, ...keys: string[]): boolean => keys.some((k) => t.includes(k));

/** Detect the intent of an agency-intelligence question. */
export function detectAgencyIntent(question: string, parsed: ParsedAgencyQuery): AgencyCopilotIntent {
  const t = (question ?? "").toLowerCase();

  // Comparison: two named agencies, or explicit comparison words.
  if (parsed.agencyNames.length >= 2 || has(t, "השוואה", "להשוות", "השווה", "מול", "לעומת", "בהשוואה"))
    return "agency_comparison";

  // Most dangerous / high threat competitor.
  if (has(t, "מסוכן", "איום", "סיכון", "מאיים", "להיזהר"))
    return "high_threat_competitors";

  // Recent growth / momentum.
  if (has(t, "התחזק", "התחזקו", "צמח", "צמיחה", "השתפר", "עלה", "עולה", "מומנטום", "בעלייה", "מתחזק"))
    return "recent_growth";

  // Opportunity / weak area.
  if (has(t, "הזדמנות", "הזדמנויות", "פחות תחרות", "בלי הרבה תחרות", "בלי תחרות", "אזור פנוי", "חלש", "פנוי", "פוטנציאל"))
    return parsed.city || parsed.neighborhood ? "territory_opportunity" : "weak_user_area";

  // Dominance by area.
  if (has(t, "שולט", "שליטה", "מי שולט", "דומיננט", "החזק ביותר באזור"))
    return "dominance_by_area";

  // Signals / what changed.
  if (has(t, "מה השתנה", "מה חדש", "אותות", "שינויים", "מה קרה", "נכנסו לאחרונה", "נכנס לאחרונה", "מעקב", "דורש מעקב"))
    return "signals_summary";

  // Strongest competitor overall (no area) vs top in a specific area.
  if (has(t, "הכי חזק", "החזק ביותר", "המוביל", "הכי טוב", "המשרד המוביל", "הכי דומיננטי", "החזקים")) {
    if (parsed.city || parsed.neighborhood) return "top_agencies_in_area";
    if (has(t, "מתחרה", "מתחרים", "מתחרֶה")) return "strongest_competitor";
    return "strongest_competitor";
  }

  // Single agency summary.
  if (parsed.agencyName && has(t, "ספר לי", "סיכום", "מי זה", "על ", "מידע על", "תסכם", "פרטים"))
    return "agency_summary";
  if (parsed.agencyName) return "agency_summary";

  return "unknown";
}
