// ============================================================================
// 🌐 AI Brokerage Website — view-model assembler (pure). 32.1.
// Maps normalized engine inputs → PUBLIC-SAFE AI view models (home / property /
// neighborhood / office), applying redaction. Evidence-only; no fabrication.
// ============================================================================
import { badgesFor, trustTier, demandLevel } from "./redact";
import { marketUpdateBlock, neighborhoodSpotlightBlock, buyingTipBlock, sellingTipBlock, investmentInsightBlock } from "./content";
import type { SiteInput, SiteListingInput, PropertyAI, NeighborhoodAI, OfficeAI, HomeAI } from "./types";

const fmtPrice = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// ── Property AI landing ─────────────────────────────────────────────────────
export function buildProperty(l: SiteListingInput, all: SiteListingInput[]): PropertyAI {
  const badges = badgesFor(l);
  const parts: string[] = [];
  parts.push(`${l.title}${l.neighborhood ? ` ב${l.neighborhood}` : l.city ? ` ב${l.city}` : ""}`);
  if (l.rooms) parts.push(`${l.rooms} חדרים`);
  if (l.area) parts.push(`${l.area} מ"ר`);
  if (l.price) parts.push(fmtPrice(l.price));
  const aiSummary = `${parts.join(" · ")}. ${badges.demand === "high" ? "הנכס מציג ביקוש גבוה מקונים מתאימים במלאי המשרד. " : ""}${badges.pricePosition === "within" ? "המחיר ממוקם בתוך טווח השוק. " : badges.pricePosition === "below" ? "המחיר אטרקטיבי ביחס לשוק. " : ""}${badges.trust === "verified" ? "פרטי הנכס אומתו מול מקורות נתונים." : ""}`.trim();

  const highlights: string[] = [];
  if (badges.marketScore != null) highlights.push(`ביצועי שוק ${badges.marketScore}/100`);
  if (badges.demand === "high") highlights.push("ביקוש גבוה");
  if (badges.matchingBuyers > 0) highlights.push(`${badges.matchingBuyers} קונים מתאימים במאגר`);
  if (badges.domBand === "fast") highlights.push("קצב מכירה מהיר לאזור");
  if (badges.strategyLabel) highlights.push(badges.strategyLabel);

  const related = all.filter((x) => x.id !== l.id && (x.city === l.city || x.type === l.type)).slice(0, 4).map((x) => ({ id: x.id, title: x.title, price: x.price, image: x.image }));
  return {
    id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price, rooms: l.rooms, area: l.area, type: l.type, status: l.status,
    image: l.image, gallery: l.gallery.slice(0, 12), aiSummary, highlights, badges, related,
  };
}

// ── Neighborhood AI ─────────────────────────────────────────────────────────
export function buildNeighborhood(name: string, listings: SiteListingInput[], growthScore: number | null): NeighborhoodAI {
  const inArea = listings.filter((l) => (l.neighborhood ?? l.city) === name || l.neighborhood === name);
  const prices = inArea.map((l) => l.price).filter((p): p is number => p != null);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const demand = demandLevel(avg(inArea.map((l) => l.buyerDemandScore ?? 0)));
  const luxuryShare = inArea.length ? inArea.filter((l) => l.classification.includes("יוקרה")).length / inArea.length : 0;
  const city = inArea[0]?.city ?? null;
  const overview = `${name}${city ? `, ${city}` : ""}: ${inArea.length} נכסים פעילים במלאי המשרד${avgPrice ? ` · מחיר ממוצע ${fmtPrice(avgPrice)}` : ""}. ${demand === "high" ? "אזור מבוקש. " : ""}${luxuryShare >= 0.4 ? "פעילות יוקרה משמעותית. " : ""}`.trim();
  return {
    name, city, overview,
    stats: { inventory: inArea.length, avgPrice, demand, luxuryActivity: luxuryShare >= 0.4 ? "high" : luxuryShare >= 0.15 ? "medium" : "low", growthScore, trend: growthScore != null ? (growthScore >= 60 ? "up" : growthScore >= 40 ? "flat" : "down") : "flat" },
    highlights: [`${inArea.length} נכסים`, ...(avgPrice ? [`ממוצע ${fmtPrice(avgPrice)}`] : []), ...(demand === "high" ? ["ביקוש גבוה"] : [])],
    recommendedListings: inArea.slice(0, 6).map((l) => ({ id: l.id, title: l.title, price: l.price, image: l.image })),
    investmentScore: growthScore,
  };
}

// ── Office AI profile (public-safe) ─────────────────────────────────────────
export function buildOffice(input: SiteInput): OfficeAI {
  const s = input.officeStats;
  const trustBand = trustTier(s.dataQuality);   // reuse tiering on data-quality (public-safe)
  const story = `${input.branding.officeName} — משרד תיווך פעיל${input.coverage.length ? ` ב-${input.coverage.length} ערים` : ""} עם ${s.properties} נכסים ו-${s.agents} מתווכים. האתר מוזן ישירות ממלאי ה-CRM החי ומתעדכן אוטומטית.`;
  const highlights: string[] = [];
  if (s.properties > 0) highlights.push(`${s.properties} נכסים במלאי`);
  if (s.agents > 0) highlights.push(`${s.agents} מתווכים`);
  if (s.cities > 0) highlights.push(`כיסוי ${s.cities} ערים`);
  if (s.rating) highlights.push(`דירוג ${s.rating}`);
  return { name: input.branding.officeName, story, coverage: input.coverage, stats: { properties: s.properties, agents: s.agents, cities: s.cities, rating: s.rating }, trustBand, highlights, recentAreas: input.recentAreas.slice(0, 8) };
}

// ── Home dynamic content ────────────────────────────────────────────────────
export function buildHome(input: SiteInput): HomeAI {
  const areas = [...new Set([...input.coverage.flatMap((c) => c.areas), ...input.recentAreas])].slice(0, 8);
  const topArea = areas[0] ?? null;
  const areaListings = topArea ? input.listings.filter((l) => (l.neighborhood ?? l.city) === topArea) : [];
  const areaAvg = avg(areaListings.map((l) => l.price ?? 0).filter((p) => p > 0));
  const featured = input.listings.slice(0, 6).map((l) => {
    const b = badgesFor(l);
    return { id: l.id, title: l.title, price: l.price, image: l.image, badge: b.demand === "high" ? "ביקוש גבוה" : b.trust === "verified" ? "מאומת" : b.strategyLabel };
  });
  return {
    hero: {
      headline: `${input.branding.officeName} — הנדל"ן שלך, מונע בינה מלאכותית`,
      subtitle: areas.length ? `מלאי חי ב-${areas.slice(0, 3).join(", ")} ועוד — חיפוש חכם, המלצות מותאמות ותשובות מיידיות מ-Ask ZONO.` : "מלאי חי, חיפוש חכם ותשובות מיידיות מ-Ask ZONO.",
    },
    stats: [
      { label: "נכסים", value: String(input.officeStats.properties) },
      { label: "מתווכים", value: String(input.officeStats.agents) },
      { label: "ערים", value: String(input.officeStats.cities) },
      { label: "דירוג", value: String(input.officeStats.rating) },
    ],
    featured,
    marketSummary: input.marketSummaryFacts.length ? input.marketSummaryFacts.slice(0, 3).join(" · ") : `${input.officeStats.properties} נכסים פעילים במלאי המשרד.`,
    featuredAreas: areas,
    insights: [marketUpdateBlock(input), neighborhoodSpotlightBlock(topArea, areaListings.length, areaAvg), buyingTipBlock(), sellingTipBlock(), investmentInsightBlock(topArea, null)],
  };
}
