// ============================================================================
// ZONO Brokerage Evolution — DNA engine (pure).
// Builds a dynamic specialization profile for an office/agent from the
// distribution of its public listings. Deterministic; confidence scales with
// sample size. Estimates only — never asserted as fact.
// ============================================================================
import type { ListingProfile, EntityDNA } from "./types";

const LUXURY_SALE = 4_000_000;   // ₪ — luxury threshold for sale
const LUXURY_RENT = 12_000;      // ₪/mo — luxury threshold for rent

function category(propertyType?: string | null): "residential" | "commercial" | "land" | "project" | "other" {
  const t = String(propertyType ?? "").toLowerCase();
  if (/מסחר|משרד|חנות|commercial|office|shop|store/.test(t)) return "commercial";
  if (/מגרש|קרקע|land|plot/.test(t)) return "land";
  if (/פרויקט|פרוייקט|project|new\s*development|מהקבלן/.test(t)) return "project";
  if (/דירה|בית|פנטהאוז|דופלקס|וילה|קוטג|apartment|house|penthouse|duplex|garden|studio/.test(t)) return "residential";
  return "other";
}

const CAT_HE: Record<string, string> = { residential: "מגורים", commercial: "מסחרי", land: "קרקע", project: "פרויקטים", other: "אחר" };

/** Estimate DNA from a set of listing profiles. */
export function estimateDNA(listings: ListingProfile[], opts: { digitalPresence?: number } = {}): EntityDNA {
  const n = listings.length;
  const evidence: string[] = [];
  if (!n) {
    return { primarySpecialization: "לא ידוע", propertyTypes: [], priceMin: null, priceMax: null, avgValue: null,
      luxuryPct: 0, projectsPct: 0, secondhandPct: 0, commercialPct: 0, rentalsPct: 0, cities: [], neighborhoods: [],
      digitalPresence: opts.digitalPresence ?? 0, growthPattern: "unknown", riskIndicators: ["אין מספיק מודעות"], clientProfile: "לא ידוע", confidence: 10, evidence: ["אין נתוני מודעות"] };
  }
  const cats: Record<string, number> = {};
  const prices: number[] = [];
  const cityCount: Record<string, number> = {};
  const nbhdCount: Record<string, number> = {};
  let luxury = 0, rentals = 0;
  for (const l of listings) {
    const c = category(l.propertyType); cats[c] = (cats[c] ?? 0) + 1;
    const rent = String(l.dealType ?? "").toLowerCase() === "rent";
    if (rent) rentals++;
    const p = typeof l.price === "number" && Number.isFinite(l.price) ? l.price : null;
    if (p != null) { prices.push(p); if ((rent && p >= LUXURY_RENT) || (!rent && p >= LUXURY_SALE)) luxury++; }
    if (l.city) cityCount[l.city] = (cityCount[l.city] ?? 0) + 1;
    if (l.neighborhood) nbhdCount[l.neighborhood] = (nbhdCount[l.neighborhood] ?? 0) + 1;
  }
  const pct = (x: number) => Math.round((x / n) * 100);
  const propertyTypes = Object.entries(cats).map(([category, count]) => ({ category: CAT_HE[category] ?? category, pct: pct(count) })).sort((a, b) => b.pct - a.pct);
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
  const commercialPct = pct(cats.commercial ?? 0);
  const projectsPct = pct(cats.project ?? 0);
  const secondhandPct = pct((cats.residential ?? 0) - 0); // residential = mostly second-hand
  const rentalsPct = pct(rentals);
  const luxuryPct = pct(luxury);
  const sorted = prices.slice().sort((a, b) => a - b);
  const priceMin = sorted.length ? sorted[0] : null;
  const priceMax = sorted.length ? sorted[sorted.length - 1] : null;
  const avgValue = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
  const cities = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const neighborhoods = Object.entries(nbhdCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

  let primarySpecialization = CAT_HE[topCat] ?? "מגורים";
  if (luxuryPct >= 40) primarySpecialization = "יוקרה";
  else if (commercialPct >= 40) primarySpecialization = "מסחרי";
  else if (rentalsPct >= 50) primarySpecialization = "השכרות";
  else if (projectsPct >= 30) primarySpecialization = "פרויקטים מקבלן";

  const clientProfile = luxuryPct >= 40 ? "לקוחות יוקרה" : commercialPct >= 40 ? "משקיעים/עסקים" : rentalsPct >= 50 ? "שוכרים" : "רוכשי דירות";
  const riskIndicators: string[] = [];
  if (n < 5) riskIndicators.push("מדגם קטן");
  if (cities.length > 4) riskIndicators.push("פיזור גאוגרפי רחב");
  if (prices.length < n * 0.5) riskIndicators.push("חוסר נתוני מחיר");

  evidence.push(`${n} מודעות`, `התמחות מובילה: ${primarySpecialization}`);
  if (cities.length) evidence.push(`ערים עיקריות: ${cities.slice(0, 3).join(", ")}`);
  const confidence = Math.round(Math.max(20, Math.min(95, 30 + Math.min(50, n * 2) + (prices.length / Math.max(1, n)) * 15)));

  return {
    primarySpecialization, propertyTypes, priceMin, priceMax, avgValue,
    luxuryPct, projectsPct, secondhandPct: Math.max(0, secondhandPct - commercialPct - projectsPct), commercialPct, rentalsPct,
    cities, neighborhoods, digitalPresence: opts.digitalPresence ?? 0, growthPattern: "unknown",
    riskIndicators, clientProfile, confidence, evidence,
  };
}
