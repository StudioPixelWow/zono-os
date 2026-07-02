// ============================================================================
// 🛒 Buyer Agent — Property Match Intelligence (pure). 29.4. Part 3.
// Tiers real buyer↔property matches into perfect / emerging / hidden / future /
// expired, each explained. Reuses the match scores; nothing invented.
// ============================================================================
import type { BuyerSignals, MatchIntel, MatchItem, MatchTier } from "./types";

function tierOf(score: number, ageDays: number | null): MatchTier {
  if (ageDays != null && ageDays > 60) return "expired";
  return score >= 85 ? "perfect" : score >= 65 ? "emerging" : score >= 45 ? "hidden" : "future";
}
const TIER_WHY: Record<MatchTier, string> = {
  perfect: "התאמה מצוינת לקריטריונים", emerging: "התאמה טובה עם פוטנציאל", hidden: "התאמה חלקית — שווה בדיקה",
  future: "התאמה עתידית / תנאים חלקיים", expired: "התאמה ישנה — ייתכן שאינה רלוונטית",
};

export function computeMatchIntel(sig: BuyerSignals): MatchIntel {
  const buckets: Record<MatchTier, MatchItem[]> = { perfect: [], emerging: [], hidden: [], future: [], expired: [] };
  for (const m of sig.matches) {
    const tier = tierOf(m.score, m.ageDays);
    buckets[tier].push({ listingId: m.listingId, title: m.title, score: m.score, tier, why: m.reasons.length ? m.reasons : [`${TIER_WHY[tier]} (ציון ${m.score})`] });
  }
  const byScore = (a: MatchItem, b: MatchItem) => b.score - a.score;
  const notes: string[] = [];
  if (!sig.matches.length) notes.push("אין התאמות נכס — אסוף העדפות/הפעל מנוע התאמה.");
  else if (!buckets.perfect.length && !buckets.emerging.length) notes.push("אין התאמות חזקות — שקול הרחבת קריטריונים.");
  return {
    perfect: buckets.perfect.sort(byScore).slice(0, 8), emerging: buckets.emerging.sort(byScore).slice(0, 8),
    hidden: buckets.hidden.sort(byScore).slice(0, 8), future: buckets.future.sort(byScore).slice(0, 8),
    expired: buckets.expired.sort(byScore).slice(0, 8), notes,
  };
}
