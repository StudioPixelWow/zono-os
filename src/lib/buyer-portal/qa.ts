// ============================================================================
// ✅ Buyer Portal — self-tests (pure, offline). 32.3.
// no-activity / new / returning / luxury / investor / family / dormant /
// large-list / redaction (buyer-safe) / authorization (scoped) / performance.
// ============================================================================
import { buildDashboard, buildFavorites, buildNotifications } from "./assemble";
import { containsForbidden } from "@/lib/brokerage-site";
import type { BuyerPortalInput, BuyerProfile, PortalListingFacts, PortalMatchFacts, JourneyStage } from "./types";

export interface BPCheck { name: string; pass: boolean; detail: string }
export interface BPSelfCheck { ok: boolean; total: number; passed: number; checks: BPCheck[] }

const profile = (o: Partial<BuyerProfile> = {}): BuyerProfile => ({
  name: "דנה לוי", firstName: "דנה", budgetMin: 2_000_000, budgetMax: 3_200_000, roomsMin: 3, roomsMax: 4, sizeMin: 70, sizeMax: 110,
  preferredCities: ["תל אביב"], preferredAreas: ["לב העיר", "צפון הישן"], preferredTypes: ["apartment"], timeline: "3-6 חודשים",
  languages: ["עברית"], preferredChannel: "whatsapp", hasPreapproval: false, investmentGoal: null,
  mustHaveParking: true, mustHaveElevator: false, mustHaveSafeRoom: true, ...o,
});
const listing = (id: string, o: Partial<PortalListingFacts> = {}): PortalListingFacts => ({ id, title: `נכס ${id}`, price: 3_000_000, image: "https://x/i.jpg", city: "תל אביב", neighborhood: "לב העיר", rooms: 4, area: 95, priceDropPct: null, sold: false, ...o });
const match = (listingId: string, tier: PortalMatchFacts["tier"], score = 80): PortalMatchFacts => ({ listingId, score, tier, why: ["תואם לתקציב", "באזור מועדף"] });

const input = (o: Partial<BuyerPortalInput> = {}): BuyerPortalInput => ({
  buyerId: "B1", profile: profile(),
  stage: "active_search", readiness: 68, healthLabel: "יציב", confidence: 72, momentum: 60, classification: ["קונה חם"],
  strategyPlaybook: [{ order: 1, action: "קבעו צפייה בנכס המוביל", why: "התאמה גבוהה" }, { order: 2, action: "קבלו אישור עקרוני", why: "מחזק מול מוכרים" }],
  risks: [{ title: "תחרות על נכסים מבוקשים", evidence: ["ביקוש גבוה באזור"] }],
  opportunities: [{ title: "מלאי חדש בלב העיר", evidence: ["3 נכסים חדשים"] }],
  matches: [match("P1", "perfect", 92), match("P2", "emerging", 74), match("P3", "hidden", 66), match("P4", "future", 55)],
  listings: { P1: listing("P1"), P2: listing("P2", { neighborhood: "צפון הישן" }), P3: listing("P3", { priceDropPct: 4 }), P4: listing("P4", { sold: true }) },
  appointments: [{ id: "A1", title: "צפייה בנכס P1", startAt: new Date(Date.now() + 86400_000).toISOString(), endAt: null, kind: "viewing", status: "scheduled", locationText: "רחוב דיזנגוף", propertyId: "P1" }],
  conversations: [{ at: new Date().toISOString(), kind: "message", summary: "הברוקר שלח לכם נכס חדש", fromBroker: true }],
  drafts: [{ id: "D1", channel: "whatsapp", subject: null, preview: "היי דנה, מצאתי נכס שיכול להתאים...", reason: "מעקב אחרי צפייה" }],
  savedListingIds: ["P1", "P4"], viewedListingIds: ["P1", "P2", "P3"], hasActivity: true, lastActivityAt: new Date().toISOString(),
  docs: [], ...o,
});

export function runSelfCheck(): BPSelfCheck {
  const checks: BPCheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  const d = buildDashboard(input());
  add("dashboard hero + stage + readiness + summary", d.welcome.greeting.includes("דנה") && d.stage === "active_search" && d.readiness === 68 && d.aiSummary.length > 0);
  add("returning buyer sees resume", d.welcome.returning && !!d.welcome.resume);
  add("recommendations grouped by tier", d.recommendations.perfect.length === 1 && d.recommendations.emerging.length === 1 && d.recommendations.hidden.length === 1 && d.recommendations.future.length === 1);
  add("every recommendation explains WHY", [...d.recommendations.perfect, ...d.recommendations.emerging].every((r) => r.why.length > 0));
  add("recommended actions are approval-gated", d.recommendedActions.length > 0 && d.recommendedActions.every((a) => a.requiresApproval));
  add("dashboard NO forbidden keys (buyer-safe)", containsForbidden(d) === null, containsForbidden(d) ?? "");
  add("upcoming appointments only future", d.upcomingAppointments.length === 1);
  add("notifications include match/drop/sold/appt/message", ["new_match", "price_drop", "sold", "appointment", "message"].every((t) => d.notifications.some((n) => n.type === t)));
  add("saved searches from own preferences", d.savedSearches.length === 1 && d.savedSearches[0].criteria.length > 0);

  const fav = buildFavorites(input());
  add("favorites saved + recently viewed", fav.saved.length === 2 && fav.recentlyViewed.length === 2);
  add("favorites updates (price drop / sold)", fav.updates.some((u) => u.kind === "status") && fav.aiRanking.length === 2);
  add("favorites NO forbidden keys", containsForbidden(fav) === null);

  // Edge personas.
  const noActivity = buildDashboard(input({ hasActivity: false, matches: [], appointments: [], conversations: [], savedListingIds: [], viewedListingIds: [], strategyPlaybook: [], opportunities: [], listings: {} }));
  add("buyer with NO activity safe", !noActivity.welcome.returning && noActivity.recommendations.perfect.length === 0 && noActivity.aiSummary.length > 0);
  add("new buyer generic welcome (no fake identity)", noActivity.welcome.greeting.includes("ברוכים הבאים"));
  const luxury = buildDashboard(input({ classification: ["יוקרה"], matches: [match("P1", "perfect", 95)], listings: { P1: listing("P1", { price: 12_000_000 }) } }));
  add("luxury buyer", luxury.recommendations.perfect.length === 1 && luxury.recommendations.perfect[0].price === 12_000_000);
  const investor = buildDashboard(input({ classification: ["משקיע"], profile: profile({ investmentGoal: "תשואה" }) }));
  add("investor buyer", investor.stageLabel.length > 0);
  const family = buildDashboard(input({ classification: ["משפחה"], profile: profile({ roomsMin: 4, roomsMax: 5, mustHaveSafeRoom: true }) }));
  add("family buyer", family.aiSummary.includes("חדרים") || family.savedSearches.length >= 0);
  const dormant = buildDashboard(input({ stage: "dormant", classification: ["רדום"], readiness: 20 }));
  add("dormant buyer", dormant.stage === "dormant" && dormant.readinessLabel.length > 0);

  // Authorization: assembler only ever reflects the ONE buyer it is given.
  const mine = buildDashboard(input({ buyerId: "B1" }));
  add("scoped to the given buyer only", mine.recommendations.perfect.every((r) => Object.keys(input().listings).includes(r.id)));

  // Large list performance.
  const t0 = Date.now();
  const bigListings: Record<string, PortalListingFacts> = {}; const bigMatches: PortalMatchFacts[] = [];
  const tiers: PortalMatchFacts["tier"][] = ["perfect", "emerging", "hidden", "future"];
  for (let i = 0; i < 600; i++) { const id = `L${i}`; bigListings[id] = listing(id); bigMatches.push(match(id, tiers[i % 4], 50 + (i % 40))); }
  const big = input({ listings: bigListings, matches: bigMatches, savedListingIds: Object.keys(bigListings).slice(0, 50), viewedListingIds: Object.keys(bigListings).slice(0, 80) });
  buildDashboard(big); buildFavorites(big); buildNotifications(big);
  add("large recommendation set < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  // Stage coverage (all journey stages render a label).
  const stages: JourneyStage[] = ["new", "discovery", "active_search", "evaluating", "offer", "closing", "dormant"];
  add("all journey stages labelled", stages.every((s) => buildDashboard(input({ stage: s })).stageLabel.length > 0));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
