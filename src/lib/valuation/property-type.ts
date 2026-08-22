// ============================================================================
// ZONO — Property-type FAMILY resolver (PURE, client-safe, dependency-free).
// ----------------------------------------------------------------------------
// Maps both the internal English enum ("apartment","penthouse","garden_apartment"
// …) AND the Hebrew strings that arrive on GovMap / portal comparables
// ("דירה בבית קומות","דירת גן","פנטהאוז","קוטג׳" …) to ONE comparison family, so
// the valuation engine can tell a penthouse from an ordinary apartment instead of
// treating them identically. Unknown types resolve to "other" (never forced to
// match). No market coefficients invented — this only groups like-with-like.
// ============================================================================

export type PropertyFamily =
  | "apartment" | "penthouse" | "garden" | "duplex" | "house" | "cottage"
  | "commercial" | "land" | "other";

/** Resolve any English enum or Hebrew label to a comparison family. */
export function propertyTypeFamily(raw: string | null | undefined): PropertyFamily {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "other";
  // English enum first (exact-ish).
  if (/(^|_|\b)(penthouse|pnthouse)/.test(s)) return "penthouse";
  if (/garden/.test(s)) return "garden";
  if (/duplex/.test(s)) return "duplex";
  if (/cottage/.test(s)) return "cottage";
  if (/(private_)?house|villa|detached/.test(s)) return "house";
  if (/(commercial|office|shop|store|retail|business)/.test(s)) return "commercial";
  if (/(land|lot|plot|ground)/.test(s)) return "land";
  if (/apartment|flat|unit/.test(s)) return "apartment";
  // Hebrew labels.
  if (/פנטהאוז|פנטהאוס|גג/.test(s)) return "penthouse";
  if (/דירת גן|גן/.test(s)) return "garden";
  if (/דופלקס/.test(s)) return "duplex";
  if (/קוטג/.test(s)) return "cottage";
  if (/בית פרטי|וילה|צמוד קרקע|פרטי/.test(s)) return "house";
  if (/מסחרי|משרד|חנות|עסק|מבנה מסחר/.test(s)) return "commercial";
  if (/מגרש|קרקע|נחלה/.test(s)) return "land";
  if (/דירה|יחיד|סטודיו/.test(s)) return "apartment"; // "דירה", "דירה בבית קומות"
  return "other";
}

/** Families that are close enough to substitute with only a mild penalty. */
const NEIGHBOR_FAMILIES: Record<string, PropertyFamily[]> = {
  apartment: ["garden", "duplex", "penthouse"],
  garden: ["apartment", "duplex"],
  duplex: ["apartment", "penthouse", "garden"],
  penthouse: ["duplex", "apartment"],
  house: ["cottage", "duplex"],
  cottage: ["house", "duplex"],
};

export type TypeRelation = "same" | "adjacent" | "different" | "unknown";

/** Relation between a subject family and a comparable family. */
export function typeRelation(subject: string | null | undefined, comp: string | null | undefined): TypeRelation {
  const a = propertyTypeFamily(subject), b = propertyTypeFamily(comp);
  if (a === "other" || b === "other") return "unknown"; // can't judge → no penalty, no bonus
  if (a === b) return "same";
  if ((NEIGHBOR_FAMILIES[a] ?? []).includes(b)) return "adjacent";
  return "different";
}
