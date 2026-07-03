// ============================================================================
// 👤 AI Agent Website — view-model assembler (pure). 32.2.
// REUSES the 32.1 framework (badgesFor / trustTier / buildProperty / buildNeighborhood)
// and scopes everything to one broker. Public-safe, evidence-only.
// ============================================================================
import { badgesFor, trustTier } from "@/lib/brokerage-site/redact";
import { brokerIntro, areaExpertise, buyingTip, sellingTip, agentFaq } from "./content";
import type { AgentInput, AgentHome, AgentAbout, AgentAreas, AgentAreaSummary } from "./types";

const fmtPrice = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function buildAgentHome(input: AgentInput): AgentHome {
  const b = input.branding;
  const areasFromListings = [...new Set(input.listings.map((l) => l.neighborhood ?? l.city).filter((x): x is string => !!x))];
  const focus = [...new Set([...b.specialties, ...input.serviceAreas, ...areasFromListings])].slice(0, 6);
  const featured = input.listings.slice(0, 6).map((l) => {
    const bg = badgesFor(l);
    return { id: l.id, title: l.title, price: l.price, image: l.image, badge: bg.demand === "high" ? "ביקוש גבוה" : bg.trust === "verified" ? "מאומת" : bg.strategyLabel };
  });
  const stats = [
    { label: "נכסים", value: String(input.listings.length) },
    { label: "אזורים", value: String(new Set(areasFromListings).size || input.serviceAreas.length) },
    ...(b.yearsExperience != null ? [{ label: "ותק", value: `${b.yearsExperience} שנים` }] : []),
    ...(input.perf.closedDeals != null && input.perf.closedDeals > 0 ? [{ label: "עסקאות", value: String(input.perf.closedDeals) }] : []),
  ];
  const topArea = areasFromListings[0] ?? input.serviceAreas[0] ?? null;
  const areaListings = topArea ? input.listings.filter((l) => (l.neighborhood ?? l.city) === topArea) : [];
  const insights = [
    ...(topArea ? [areaExpertise(topArea, areaListings.length, avg(areaListings.map((l) => l.price ?? 0).filter((p) => p > 0)))] : []),
    buyingTip(), sellingTip(),
  ];
  return {
    hero: { name: b.brokerName, title: b.title, office: b.officeName, specialty: b.specialties[0] ?? null, focus, tagline: `${b.brokerName} — הנדל"ן שלך, בליווי אישי ובינה מלאכותית` },
    stats, intro: brokerIntro(input), featured, topAreas: focus, insights,
  };
}

export function buildAgentAbout(input: AgentInput): AgentAbout {
  const b = input.branding;
  const areasServed = [...new Set([...input.serviceAreas, ...input.listings.map((l) => l.neighborhood ?? l.city).filter((x): x is string => !!x)])].slice(0, 12);
  return {
    name: b.brokerName, title: b.title, photo: b.photo, office: b.officeName,
    bio: brokerIntro(input), languages: b.languages, specialties: b.specialties,
    areasServed, experienceYears: b.yearsExperience, trustBand: trustTier(input.dataQuality),
    contact: { phone: b.phone, whatsapp: b.whatsapp, email: b.email, calendarLink: b.calendarLink },
    faq: agentFaq(input),
  };
}

export function buildAgentAreas(input: AgentInput): AgentAreas {
  const byArea = new Map<string, { city: string | null; prices: number[]; count: number }>();
  for (const l of input.listings) {
    const key = l.neighborhood ?? l.city; if (!key) continue;
    const e = byArea.get(key) ?? { city: l.city, prices: [], count: 0 };
    if (l.price != null) e.prices.push(l.price); e.count += 1; byArea.set(key, e);
  }
  const areas: AgentAreaSummary[] = [...byArea.entries()].sort((a, c) => c[1].count - a[1].count).slice(0, 20).map(([name, e]) => ({
    name, city: e.city, inventory: e.count, avgPrice: e.prices.length ? Math.round(e.prices.reduce((a, b) => a + b, 0) / e.prices.length) : null,
    expertise: e.count >= 5 ? "verified" : e.count >= 2 ? "reviewed" : "listed",
  }));
  // service areas without active listings still shown (expertise: listed).
  for (const a of input.serviceAreas) if (!byArea.has(a)) areas.push({ name: a, city: null, inventory: 0, avgPrice: null, expertise: "listed" });
  return { areas: areas.slice(0, 24) };
}

export { fmtPrice };
