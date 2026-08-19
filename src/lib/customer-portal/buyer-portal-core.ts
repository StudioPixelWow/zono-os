// ============================================================================
// ZONO — Buyer/renter portal: PURE customer-safe view logic (no IO, no LLM).
// Given the raw per-recommendation facts for ONE customer, derive the customer-
// facing card status, their OWN price delta, the summary counts, the single next
// step, and the filter/sort order. Fully unit-testable. Contains NO seller /
// other-buyer / deal-admin / score concepts by construction — the DTO shape here
// is the privacy boundary. Server maps DB rows onto these pure helpers.
// ============================================================================
// Self-contained (no imports) so it is trivially unit-testable and dependency-free.
const UNAVAILABLE = new Set(["sold", "rented", "withdrawn", "archived"]);
function isUnavailableStatus(status: string): boolean { return UNAVAILABLE.has(status); }
function formatIls(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const v = Number(n);
  return v >= 1_000_000 ? `₪${(v / 1_000_000).toFixed(2)}M` : `₪${Math.round(v).toLocaleString("he-IL")}`;
}

export type PortalCardStatus =
  | "new" | "interested" | "viewing_requested" | "viewing_scheduled" | "viewed" | "rejected" | "unavailable";

export type PortalFilter = "all" | "new" | "interested" | "viewings" | "rejected";

export const CARD_STATUS_LABEL: Record<PortalCardStatus, string> = {
  new: "חדש",
  interested: "מעניין אותי",
  viewing_requested: "ביקשת ביקור",
  viewing_scheduled: "ביקור נקבע",
  viewed: "כבר ביקרת",
  rejected: "לא מתאים",
  unavailable: "לא זמין יותר",
};

export interface CardSignals {
  recoStatus: string;                 // customer_property_recommendations.status
  propertyStatus: string;             // properties.status
  viewing: "none" | "scheduled" | "completed";
}

/** The single customer-facing status for a recommended property (priority-ordered). */
export function deriveCardStatus(s: CardSignals): PortalCardStatus {
  if (isUnavailableStatus(s.propertyStatus)) return "unavailable";
  if (s.viewing === "completed") return "viewed";
  if (s.viewing === "scheduled") return "viewing_scheduled";
  switch (s.recoStatus) {
    case "interested": return "interested";
    case "rejected": return "rejected";
    case "viewing_requested": return "viewing_requested";
    default: return "new"; // recommended / viewed(bundle-opened) → not explicitly responded
  }
}

export interface PortalPriceDelta { dropAmount: number; label: string }
/** THEIR own price delta from the price they were shown (price_at_send). */
export function derivePortalPriceDelta(priceAtSend: number | null | undefined, currentPrice: number | null | undefined): PortalPriceDelta | null {
  const o = Number(priceAtSend), n = Number(currentPrice);
  if (!Number.isFinite(o) || !Number.isFinite(n) || o <= 0 || n < 0 || n >= o) return null;
  const dropAmount = o - n;
  return { dropAmount, label: `המחיר ירד ב-${formatIls(dropAmount)}` };
}

// A minimal customer-safe card shape (no scores/seller/other-buyers).
export interface PortalCard {
  propertyId: string;
  title: string;
  city: string | null;
  rooms: number | null;
  price: number | null;
  imageUrl: string | null;
  status: PortalCardStatus;
  statusLabel: string;
  available: boolean;
  priceDrop: PortalPriceDelta | null;
  viewingAt: string | null;
  reason: string | null;              // customer-safe "why" (area/rooms fit), never a score
  feedbackGiven: boolean;
}

export interface PortalSummary { total: number; newCount: number; interested: number; viewings: number; priceDrops: number }
export function summarizeCards(cards: PortalCard[]): PortalSummary {
  let newCount = 0, interested = 0, viewings = 0, priceDrops = 0;
  for (const c of cards) {
    if (c.status === "new") newCount++;
    if (c.status === "interested") interested++;
    if (c.status === "viewing_requested" || c.status === "viewing_scheduled" || c.status === "viewed") viewings++;
    if (c.priceDrop && c.available) priceDrops++;
  }
  return { total: cards.length, newCount, interested, viewings, priceDrops };
}

/** Filter cards for the simple portal tabs. */
export function filterCards(cards: PortalCard[], filter: PortalFilter): PortalCard[] {
  switch (filter) {
    case "new": return cards.filter((c) => c.status === "new");
    case "interested": return cards.filter((c) => c.status === "interested");
    case "viewings": return cards.filter((c) => c.status === "viewing_requested" || c.status === "viewing_scheduled" || c.status === "viewed");
    case "rejected": return cards.filter((c) => c.status === "rejected");
    default: return cards;
  }
}

// Sort: action-required first, then new, interested, viewings, others, unavailable last.
const SORT_RANK: Record<PortalCardStatus, number> = {
  viewing_scheduled: 0, viewed: 1, new: 2, interested: 3, viewing_requested: 4, rejected: 6, unavailable: 7,
};
export function sortCards(cards: PortalCard[]): PortalCard[] {
  return cards.map((c, i) => ({ c, i })).sort((a, b) => (SORT_RANK[a.c.status] - SORT_RANK[b.c.status]) || (a.i - b.i)).map((x) => x.c);
}

export interface ViewingSignal { status: "scheduled" | "completed" | "cancelled"; feedbackGiven: boolean }
/** ONE customer-facing next step (deterministic; never LLM). */
export function derivePortalNextStep(input: { summary: PortalSummary; scheduledSoon: boolean; feedbackPending: number }): string | null {
  if (input.feedbackPending > 0) return "ספרו לנו איך היה הביקור";
  if (input.scheduledSoon) return "אשרו את הביקור הקרוב";
  if (input.summary.newCount > 0) return input.summary.newCount === 1 ? "יש נכס חדש לצפייה" : `יש ${input.summary.newCount} נכסים חדשים לצפייה`;
  if (input.summary.priceDrops > 0) return "יש עדכוני מחיר — כדאי להציץ";
  if (input.summary.total === 0) return "עדכנו את העדפות החיפוש כדי שנמצא לכם נכסים";
  return null;
}
