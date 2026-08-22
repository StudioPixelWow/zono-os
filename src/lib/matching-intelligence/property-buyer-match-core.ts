// ============================================================================
// ZONO — Property ⇄ buyer match "why matched" — PURE derivations (dependency-free,
// client-safe, unit-tested). Turns a buyer's SAVED search criteria + a property's
// facts into a HUMAN, Hebrew explanation of the match (§10/§12): only evidence-
// backed reasons ("מחפש ב…", "תקציב מתאים", "5–6 חדרים"), never an invented one.
// When nothing is derivable the caller shows the honest fallback line instead.
// ============================================================================

export interface BuyerCriteria {
  budgetMin: number | null;
  budgetMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  preferredAreas: string[];
}
export interface PropertyFacts {
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
}
export interface WhyReason { label: string; ok: boolean }

const has = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** Property price inside the buyer's budget band (needs at least one bound + a price). */
export function budgetFits(c: BuyerCriteria, price: number | null): boolean {
  if (!has(price)) return false;
  if (!has(c.budgetMin) && !has(c.budgetMax)) return false;
  const lo = has(c.budgetMin) ? c.budgetMin : 0;
  const hi = has(c.budgetMax) ? c.budgetMax : Number.MAX_SAFE_INTEGER;
  return price >= lo && price <= hi;
}

/** The property's city/neighborhood overlaps a preferred area (loose contains, both ways). */
export function matchedArea(c: BuyerCriteria, city: string | null, neighborhood: string | null): string | null {
  const areas = c.preferredAreas.map((a) => a.trim()).filter(Boolean);
  if (areas.length === 0) return null;
  for (const place of [neighborhood, city]) {
    const p = (place ?? "").trim();
    if (!p) continue;
    const hit = areas.find((a) => p.includes(a) || a.includes(p));
    if (hit) return hit;
  }
  return null;
}

/** Property rooms inside the buyer's rooms band. */
export function roomsFits(c: BuyerCriteria, rooms: number | null): boolean {
  if (!has(rooms)) return false;
  if (!has(c.roomsMin) && !has(c.roomsMax)) return false;
  const lo = has(c.roomsMin) ? c.roomsMin : 0;
  const hi = has(c.roomsMax) ? c.roomsMax : Number.MAX_SAFE_INTEGER;
  return rooms >= lo && rooms <= hi;
}

/** Evidence-backed Hebrew reasons this buyer fits this property. Only truths — an
 *  empty result means the caller shows "התאמה לפי נתוני החיפוש השמורים". */
export function buildWhyReasons(c: BuyerCriteria, f: PropertyFacts): WhyReason[] {
  const out: WhyReason[] = [];
  const area = matchedArea(c, f.city, f.neighborhood);
  if (area) out.push({ label: `מחפש ב${area}`, ok: true });
  if (budgetFits(c, f.price)) out.push({ label: "המחיר בתוך התקציב", ok: true });
  if (roomsFits(c, f.rooms)) out.push({ label: roomsLabel(c) ? `מחפש ${roomsLabel(c)}` : "מספר החדרים מתאים", ok: true });
  return out;
}

const ilsCompact = (n: number): string =>
  n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${n.toLocaleString("he-IL")}`;

/** "₪1.2M–₪1.5M" / "עד ₪1.5M" / "מ-₪1.2M" — null when no budget saved. */
export function budgetLabel(c: BuyerCriteria): string | null {
  const lo = has(c.budgetMin) ? ilsCompact(c.budgetMin) : null;
  const hi = has(c.budgetMax) ? ilsCompact(c.budgetMax) : null;
  if (lo && hi) return `${lo}–${hi}`;
  if (hi) return `עד ${hi}`;
  if (lo) return `מ-${lo}`;
  return null;
}

/** "4–5 חד׳" / "מ-4 חד׳" — null when no rooms saved. */
export function roomsLabel(c: BuyerCriteria): string | null {
  const lo = has(c.roomsMin) ? c.roomsMin : null;
  const hi = has(c.roomsMax) ? c.roomsMax : null;
  if (lo != null && hi != null) return lo === hi ? `${lo} חד׳` : `${lo}–${hi} חד׳`;
  if (hi != null) return `עד ${hi} חד׳`;
  if (lo != null) return `מ-${lo} חד׳`;
  return null;
}

/** "קרית ביאליק, קרית ים" (first 3) — null when none saved. */
export function areasLabel(c: BuyerCriteria): string | null {
  const areas = c.preferredAreas.map((a) => a.trim()).filter(Boolean);
  return areas.length ? areas.slice(0, 3).join(", ") : null;
}

// ── Buyer CRM stage → Hebrew (Hebrew-only public UI; unknown → null, never raw) ──
const BUYER_STAGE_HE: Record<string, string> = {
  new_lead: "ליד חדש",
  new: "ליד חדש",
  contacted: "נוצר קשר",
  qualified: "מוסמך",
  searching: "בחיפוש",
  active: "פעיל",
  hot: "חם",
  warm: "בתהליך חיפוש",
  cold: "ליד ראשוני",
  viewing: "בביקורים",
  negotiating: "במשא ומתן",
  offer: "הגיש הצעה",
  closed: "נסגר",
  won: "נסגר בהצלחה",
  lost: "אבד",
  inactive: "לא פעיל",
};
export function stageLabelHe(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const hit = BUYER_STAGE_HE[stage.trim().toLowerCase()];
  if (hit) return hit;
  return /[֐-׿]/.test(stage) ? stage : null; // already Hebrew passes; raw enum never leaks
}

export type MatchTone = "good" | "medium" | "risk";
export function matchTone(pct: number | null): MatchTone {
  const n = pct ?? 0;
  return n >= 70 ? "good" : n >= 45 ? "medium" : "risk";
}
