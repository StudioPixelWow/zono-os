// ============================================================================
// 🏷️ Seller Agent — Buyer Connection (pure). 29.5. Part 8.
// Which buyers are waiting/matching/priority for this seller's property, and the
// matching brokers. Reuses buyer↔property matches; explains WHY (score). Nothing
// invented.
// ============================================================================
import type { SellerSignals, BuyerConnection } from "./types";

export function buildBuyerConnection(sig: SellerSignals): BuyerConnection {
  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  const all = [...sig.matchingBuyers].sort(byScore);
  const matching = all.filter((b) => b.score >= 65);
  const priority = all.filter((b) => b.score >= 80);
  const notes: string[] = [];
  if (!all.length) notes.push("אין קונים ממתינים לנכס זה — הרחב שיווק/התאמה.");
  else if (!matching.length) notes.push("אין התאמות חזקות — שקול עדכון מחיר/קריטריונים.");
  return { waitingBuyers: all.slice(0, 10), matchingBuyers: matching.slice(0, 10), priorityBuyers: priority.slice(0, 10), matchingBrokers: sig.brokerConnections.slice(0, 5), notes };
}
