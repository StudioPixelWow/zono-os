// ============================================================================
// 👤 Buyer Digital Twin — Matching Intelligence (pure). 28.1. Part 9.
// Perfect / near / hidden / future matches with an explanation for each. Scored
// against the buyer's real preferences — evidence-only, never invented.
// ============================================================================
import type { BuyerProfile, ListingCandidate, BuyerMatch, BuyerMatches } from "./types";

interface Scored { m: BuyerMatch; matched: number; budgetOver: number; areaMatch: boolean; typeMatch: boolean }

function scoreListing(p: BuyerProfile, l: ListingCandidate): Scored {
  const reasons: string[] = []; const missing: string[] = [];
  const areaMatch = !!l.area && p.preferences.areas.some((a) => a && l.area && (a === l.area || l.area.includes(a) || a.includes(l.area)));
  const typeMatch = !!l.type && p.preferences.types.some((t) => t && l.type && (t === l.type || l.type.includes(t)));
  const max = p.budget.max, min = p.budget.min;
  const budgetOk = l.price == null ? false : (max == null || l.price <= max) && (min == null || l.price >= min * 0.9);
  const budgetOver = l.price != null && max != null && l.price > max ? (l.price / max - 1) : 0;
  const roomsOk = l.rooms == null ? false : (p.preferences.roomsMin == null || l.rooms >= p.preferences.roomsMin) && (p.preferences.roomsMax == null || l.rooms <= p.preferences.roomsMax);

  if (areaMatch) reasons.push(`אזור מועדף: ${l.area}`); else missing.push("אזור");
  if (typeMatch) reasons.push(`סוג מתאים: ${l.type}`); else missing.push("סוג");
  if (budgetOk) reasons.push("בתקציב"); else missing.push(budgetOver > 0 ? `מעל תקציב ${Math.round(budgetOver * 100)}%` : "תקציב");
  if (roomsOk) reasons.push("חדרים מתאימים"); else missing.push("חדרים");

  const matched = [areaMatch, typeMatch, budgetOk, roomsOk].filter(Boolean).length;
  const score = Math.round((matched / 4) * 100);
  return { m: { listingId: l.id, title: l.title, score, reasons, missing }, matched, budgetOver, areaMatch, typeMatch };
}

export function buildBuyerMatches(profile: BuyerProfile, listings: ListingCandidate[]): BuyerMatches {
  const perfect: BuyerMatch[] = [], near: BuyerMatch[] = [], hidden: BuyerMatch[] = [], future: BuyerMatch[] = [];
  const notes: string[] = [];
  if (!profile.preferences.areas.length && !profile.preferences.types.length) notes.push("אין העדפות מספיקות להתאמה — אסוף מידע מהקונה.");

  for (const l of listings) {
    const sc = scoreListing(profile, l);
    if (sc.matched === 4) perfect.push(sc.m);
    else if (sc.matched === 3) near.push(sc.m);
    else if (sc.typeMatch && sc.budgetOver > 0 && sc.budgetOver <= 0.1) hidden.push({ ...sc.m, reasons: [...sc.m.reasons, "מעט מעל התקציב — שווה בדיקה"] });
    else if (sc.typeMatch && !sc.areaMatch) future.push({ ...sc.m, reasons: [...sc.m.reasons, "אזור חדש — הזדמנות עתידית"] });
  }

  const byScore = (a: BuyerMatch, b: BuyerMatch) => b.score - a.score;
  return {
    perfect: perfect.sort(byScore).slice(0, 10), near: near.sort(byScore).slice(0, 10),
    hidden: hidden.sort(byScore).slice(0, 10), future: future.sort(byScore).slice(0, 10), notes,
  };
}
