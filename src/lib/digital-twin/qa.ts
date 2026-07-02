// ============================================================================
// ✅ Digital Twin Framework + Buyer Twin — self-tests (pure, offline). 28.1. Part 12.
// Scenarios: new / returning / luxury / investor / family buyer, changing
// preferences, no activity, no data, framework reuse — plus matching, decisions,
// missions, classification, learning and the entity-agnostic core.
// ============================================================================
import { createDigitalTwin, buildTwinMemory, learnFromActivity } from "./core";
import { buildBuyerTwin } from "./buyers/twin";
import { buildBuyerMatches } from "./buyers/matching";
import type { BuyerSeed, BuyerActivityInput, ListingCandidate } from "./buyers/types";
import { buildSellerTwin } from "./sellers/twin";
import type { SellerSeed, SellerActivityInput } from "./sellers/types";

export interface DTCheck { name: string; pass: boolean; detail: string }
export interface DTSelfCheck { ok: boolean; total: number; passed: number; checks: DTCheck[] }

const NOW = Date.UTC(2026, 6, 2);
const DAY = 86400000;
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();
let _a = 0;
const act = (kind: string, daysAgo: number): BuyerActivityInput => ({ id: `a${++_a}`, kind, at: iso(daysAgo), summary: kind });

const seed = (over: Partial<BuyerSeed> = {}): BuyerSeed => ({
  id: "B1", name: "קונה בדיקה", temperature: "warm",
  budgetMin: 1_500_000, budgetMax: 2_000_000, roomsMin: 3, roomsMax: 5,
  preferredAreas: ["רחובות"], preferredTypes: ["apartment"],
  mustHaveParking: true, mustHaveElevator: false, mustHaveSafeRoom: false,
  hasPhone: true, hasEmail: true, createdAt: iso(120), updatedAt: iso(1), ...over,
});

export function runSelfCheck(): DTSelfCheck {
  const checks: DTCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ── New buyer (no activity) ─────────────────────────────────────────────────
  const fresh = buildBuyerTwin({ seed: seed(), activities: [], now: NOW });
  add("new buyer health empty", fresh.health.label === "ריק", fresh.health.label);
  add("new buyer no activity", fresh.memory.totalActivities === 0, "");
  add("new buyer conservative confidence", fresh.confidence < 60, `${fresh.confidence}`);
  add("new buyer has notes (no fabrication)", fresh.notes.length > 0, "");
  add("twin identity is buyer", fresh.identity.entityType === "buyer" && fresh.version.length > 0, "");

  // ── Returning buyer (rich recent activity incl. offer) ──────────────────────
  _a = 0;
  const returning = buildBuyerTwin({ seed: seed({ temperature: "hot" }), activities: [
    act("view", 1), act("view", 2), act("save", 3), act("visit", 4), act("call", 2),
    act("meeting", 5), act("message", 1), act("offer", 3), act("view", 6), act("search", 7),
  ], now: NOW });
  add("returning high probability", returning.profile.probabilityToBuy >= 50, `${returning.profile.probabilityToBuy}`);
  add("returning classified hot", returning.classification.includes("קונה חם"), returning.classification.join(","));
  add("returning missions include follow-up + negotiation", returning.missions.some((m) => m.missionType === "BUYER_FOLLOWUP") && returning.missions.some((m) => m.missionType === "BUYER_NEGOTIATION"), returning.missions.map((m) => m.missionType).join(","));
  add("returning decisions ranked", returning.decisions.length > 0 && returning.decisions.every((d, i) => i === 0 || returning.decisions[i - 1].priority >= d.priority), "");
  add("returning learns intent up", returning.learnings.some((l) => l.type === "intent_up"), "");
  add("returning health not empty", returning.health.label !== "ריק", returning.health.label);

  // ── Luxury / investor / family classification ───────────────────────────────
  add("luxury tag", buildBuyerTwin({ seed: seed({ budgetMax: 4_200_000 }), activities: [], now: NOW }).classification.includes("יוקרה"), "");
  add("investor tag", buildBuyerTwin({ seed: seed({ preferredTypes: ["apartment", "commercial"] }), activities: [], now: NOW }).classification.includes("משקיע"), "");
  add("family tag", buildBuyerTwin({ seed: seed({ roomsMin: 4, mustHaveSafeRoom: true }), activities: [], now: NOW }).classification.includes("משפחה"), "");

  // ── Changing preferences (repeated rejections) ──────────────────────────────
  _a = 0;
  const drifting = buildBuyerTwin({ seed: seed(), activities: [act("reject", 2), act("reject", 5), act("reject", 8), act("view", 3)], now: NOW });
  add("preference drift detected", drifting.learnings.some((l) => l.type === "preference_drift"), "");

  // ── No data buyer ───────────────────────────────────────────────────────────
  const noData = buildBuyerTwin({ seed: seed({ budgetMin: null, budgetMax: null, preferredAreas: [], preferredTypes: [], roomsMin: null, roomsMax: null, hasPhone: false, hasEmail: false }), activities: [], now: NOW });
  add("no data low completeness", noData.profile.completeness < 40, `${noData.profile.completeness}`);
  add("no data → collect missing info", noData.decisions.some((d) => d.action.includes("מידע חסר") && d.readiness === "needs_info"), "");

  // ── Dormant buyer ───────────────────────────────────────────────────────────
  _a = 0;
  const dormant = buildBuyerTwin({ seed: seed(), activities: [act("view", 120), act("view", 130)], now: NOW });
  add("dormant classified + learned", dormant.classification.includes("רדום") && dormant.learnings.some((l) => l.type === "dormant"), dormant.classification.join(","));

  // ── Matching intelligence ───────────────────────────────────────────────────
  const listings: ListingCandidate[] = [
    { id: "L1", price: 1_800_000, area: "רחובות", type: "apartment", rooms: 4, title: "פרפקט" },
    { id: "L2", price: 1_800_000, area: "רחובות", type: "apartment", rooms: 2, title: "קרוב" },
    { id: "L3", price: 2_100_000, area: "אחר", type: "apartment", rooms: 4, title: "נסתר" },
    { id: "L4", price: 2_600_000, area: "נס ציונה", type: "apartment", rooms: 5, title: "עתידי" },
  ];
  const matches = buildBuyerMatches(returning.profile, listings);
  add("matching: perfect", matches.perfect.some((m) => m.listingId === "L1"), "");
  add("matching: near", matches.near.some((m) => m.listingId === "L2"), "");
  add("matching: hidden", matches.hidden.some((m) => m.listingId === "L3"), "");
  add("matching: future", matches.future.some((m) => m.listingId === "L4"), "");
  add("matches explain reasons", matches.perfect[0]?.reasons.length > 0, "");
  add("matching no prefs → note", buildBuyerMatches(noData.profile, listings).notes.length > 0, "");

  // ── Framework reuse (entity-agnostic core, non-buyer) ───────────────────────
  const sellerTwin = createDigitalTwin<{ askingPrice: number }>({
    id: "S1", entityType: "seller", name: "מוכר", profile: { askingPrice: 2_000_000 },
    activities: [{ id: "x", kind: "call", at: iso(2), summary: "call", weight: 2 }],
    completeness: 70, risk: 20, decisions: [], missions: [], now: NOW,
  });
  add("framework reuse seller twin", sellerTwin.identity.entityType === "seller" && sellerTwin.profile.askingPrice === 2_000_000 && sellerTwin.memory.totalActivities === 1, "");
  add("framework health computed generically", sellerTwin.health.score > 0 && sellerTwin.health.label !== "ריק", `${sellerTwin.health.score}`);

  // ── Core primitives ─────────────────────────────────────────────────────────
  const mem = buildTwinMemory([{ id: "1", kind: "view", at: iso(1), summary: "v", weight: 1 }, { id: "2", kind: "call", at: iso(1), summary: "c", weight: 2 }], NOW);
  add("memory counts + variety", mem.totalActivities === 2 && mem.recencyScore === 100 && Object.keys(mem.counts).length === 2, "");
  const learned = learnFromActivity(sellerTwin, [{ id: "y", kind: "offer", at: iso(0), summary: "offer", weight: 3 }], 70, 20, NOW);
  add("learnFromActivity folds memory", learned.memory.totalActivities === 2, `${learned.memory.totalActivities}`);

  // ── Seller Twin (second implementation, same framework) ─────────────────────
  runSellerChecks(add);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}

const sSeed = (over: Partial<SellerSeed> = {}): SellerSeed => ({
  id: "S1", name: "מוכר בדיקה", motivationLabel: "relocation", urgencyLevel: "medium",
  desiredPrice: 2_200_000, minimumPrice: 2_000_000, dreamPrice: 2_400_000, estimatedValue: 2_000_000,
  decisionStyle: "אנליטי", mainObjection: null,
  priceSensitivity: 50, timeSensitivity: 50, trustSensitivity: 50, cooperation: 60, negotiationFlexibility: 50,
  hasSignedAgreement: false, propertyId: "P1", valuationId: "V1", hasPhone: true, hasEmail: true,
  mustSellBy: null, targetSaleDate: null, createdAt: iso(90), updatedAt: iso(2), ...over,
});
const sAct = (kind: string, daysAgo: number, i: number): SellerActivityInput => ({ id: `sa${i}`, kind, at: iso(daysAgo), summary: kind });

function runSellerChecks(add: (name: string, pass: boolean, detail: string) => void) {
  // New seller (no activity).
  const fresh = buildSellerTwin({ seed: sSeed(), activities: [], now: NOW });
  add("seller uses framework (entity=seller)", fresh.identity.entityType === "seller" && fresh.version.length > 0, "");
  add("new seller empty health + notes", fresh.health.label === "ריק" && fresh.notes.length > 0, fresh.health.label);
  add("seller profile exists", typeof fresh.profile.motivation === "number" && typeof fresh.profile.churnRisk === "number" && typeof fresh.profile.readinessToSign === "number", "");
  add("seller next best action present", fresh.profile.nextBestAction.length > 0, "");

  // Motivated seller.
  const motivated = buildSellerTwin({ seed: sSeed({ urgencyLevel: "high", timeSensitivity: 80 }), activities: [sAct("call", 2, 1), sAct("meeting", 4, 2), sAct("valuation", 5, 3)], now: NOW });
  add("motivated → high motivation + hot", motivated.profile.motivation >= 55 && motivated.classification.includes("מוכר חם"), `${motivated.profile.motivation}`);
  add("seller decisions exist + ranked", motivated.decisions.length > 0 && motivated.decisions.every((d, i) => i === 0 || motivated.decisions[i - 1].priority >= d.priority), "");
  add("seller missions include follow-up", motivated.missions.some((m) => m.missionType === "SELLER_FOLLOWUP"), "");

  // Price-resistant seller (desired ≫ valuation).
  const priceGap = buildSellerTwin({ seed: sSeed({ desiredPrice: 2_600_000, estimatedValue: 2_000_000, priceSensitivity: 80 }), activities: [sAct("price", 3, 1), sAct("objection", 5, 2)], now: NOW });
  add("price-gap classified + learned", priceGap.classification.includes("פער מחיר") && priceGap.learnings.some((l) => l.type === "price_resistance"), priceGap.classification.join(","));
  add("price-gap → suggest price update", priceGap.decisions.some((d) => d.action.includes("עדכון מחיר")) && priceGap.missions.some((m) => m.missionType === "PRICE_REDUCTION"), "");

  // Seller at risk (stale + objections + low trust).
  const atRisk = buildSellerTwin({ seed: sSeed({ trustSensitivity: 10, cooperation: 15, updatedAt: iso(120) }), activities: [sAct("objection", 100, 1), sAct("objection", 110, 2)], now: NOW });
  add("at-risk churn + recovery", atRisk.profile.churnRisk >= 55 && (atRisk.classification.includes("בסיכון נטישה") || atRisk.missions.some((m) => m.missionType === "SELLER_RECOVERY")), `${atRisk.profile.churnRisk}`);

  // Ready-to-sign seller.
  const ready = buildSellerTwin({ seed: sSeed({ urgencyLevel: "high", cooperation: 90, trustSensitivity: 85 }), activities: [sAct("meeting", 1, 1), sAct("valuation", 2, 2), sAct("document", 1, 3), sAct("call", 1, 4)], now: NOW });
  add("ready-to-sign → send agreement", ready.profile.readinessToSign >= 55 && (ready.decisions.some((d) => d.action.includes("הסכם")) || ready.classification.includes("מוכן לחתימה")), `${ready.profile.readinessToSign}`);

  // Signed seller → property prep + marketing launch missions.
  const signed = buildSellerTwin({ seed: sSeed({ hasSignedAgreement: true }), activities: [sAct("agreement", 3, 1)], now: NOW });
  add("signed → prep + marketing missions", signed.missions.some((m) => m.missionType === "PROPERTY_PREPARATION") && signed.missions.some((m) => m.missionType === "MARKETING_LAUNCH"), "");
  add("signed classified חתום", signed.classification.includes("חתום"), "");

  // Stale seller.
  const stale = buildSellerTwin({ seed: sSeed(), activities: [sAct("call", 120, 1)], now: NOW });
  add("stale classified + learned", stale.classification.includes("מתיישן") && stale.learnings.some((l) => l.type === "stale_followup"), stale.classification.join(","));

  // High-value seller.
  add("high-value tag", buildSellerTwin({ seed: sSeed({ desiredPrice: 5_000_000, estimatedValue: 4_800_000 }), activities: [], now: NOW }).classification.includes("ערך גבוה"), "");

  // No data seller.
  const noData = buildSellerTwin({ seed: sSeed({ desiredPrice: null, minimumPrice: null, dreamPrice: null, estimatedValue: null, motivationLabel: null, urgencyLevel: null, decisionStyle: null, propertyId: null, hasPhone: false, hasEmail: false }), activities: [], now: NOW });
  add("no data → low completeness + collect info", noData.profile.completeness < 40 && noData.decisions.some((d) => d.readiness === "needs_info"), `${noData.profile.completeness}`);
  add("seller confidence conservative (no data)", noData.confidence < 60, `${noData.confidence}`);
}
