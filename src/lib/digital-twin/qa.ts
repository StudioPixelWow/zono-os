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

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
