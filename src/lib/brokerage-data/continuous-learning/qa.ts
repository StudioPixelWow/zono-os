// ============================================================================
// ✅ Continuous Learning self-tests (pure, offline). 26.4.16.
// Validates scheduler priority ordering, freshness decay, and bounded/gradual
// confidence evolution. No DB, no network, no AI.
// ============================================================================
import { classifyCityPriority, rankPriorities, type CitySignals } from "./priority";
import { freshnessScore, isStale, evolveConfidence } from "./freshness";
import { CONF_STEP_UP, CONF_STEP_DOWN } from "./types";

export interface CLCheck { name: string; pass: boolean; detail: string }
export interface CLSelfCheck { ok: boolean; total: number; passed: number; checks: CLCheck[] }

const base: CitySignals = { city: "x", cityNormalized: "x", waitingCandidates: 0, unmatchedBrokers: 0, unlinkedListings: 0, coveragePct: 100, freshnessScore: 100, rawDataExists: true };

export function runSelfCheck(): CLSelfCheck {
  const checks: CLCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Priority tiers.
  add("P1 waiting candidates", classifyCityPriority({ ...base, waitingCandidates: 5 })?.tier === 1, "");
  add("P2 low coverage", classifyCityPriority({ ...base, coveragePct: 40 })?.tier === 2, "");
  add("P3 stale evidence", classifyCityPriority({ ...base, freshnessScore: 40 })?.tier === 3, "");
  add("P4 unlinked listings", classifyCityPriority({ ...base, unlinkedListings: 8 })?.tier === 4, "");
  add("P5 unmatched brokers", classifyCityPriority({ ...base, unmatchedBrokers: 3 })?.tier === 5, "");
  add("no work → null", classifyCityPriority(base) === null, "");

  // Waiting beats everything (waiting + low coverage → tier 1).
  add("waiting outranks coverage", classifyCityPriority({ ...base, waitingCandidates: 1, coveragePct: 10 })?.tier === 1, "");

  // Ranking: tier order first, then score.
  const ranked = rankPriorities([
    classifyCityPriority({ ...base, city: "a", cityNormalized: "a", unmatchedBrokers: 2 })!,
    classifyCityPriority({ ...base, city: "b", cityNormalized: "b", waitingCandidates: 1 })!,
    classifyCityPriority({ ...base, city: "c", cityNormalized: "c", waitingCandidates: 9 })!,
  ]);
  add("rank: waiting first", ranked[0].reason === "waiting_candidates" && ranked[0].score === 9, `${ranked[0].reason}/${ranked[0].score}`);
  add("rank: brokers last", ranked[ranked.length - 1].tier === 5, `${ranked[ranked.length - 1].tier}`);

  // Freshness decay.
  add("fresh recent = 100", freshnessScore(new Date().toISOString()) === 100, "");
  add("null date = 0", freshnessScore(null) === 0, "");
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  add("very old ≤ 30", freshnessScore(old) <= 30, `${freshnessScore(old)}`);
  add("null date is stale", isStale(null), "");

  // Confidence evolution is gradual + bounded.
  add("up nudge bounded", evolveConfidence(50, { increases: 3, decreases: 0, monthsSinceEvidence: 0 }) <= 50 + CONF_STEP_UP, "");
  add("no instant jump", evolveConfidence(50, { increases: 100, decreases: 0, monthsSinceEvidence: 0 }) === 50 + CONF_STEP_UP, `${evolveConfidence(50, { increases: 100, decreases: 0, monthsSinceEvidence: 0 })}`);
  add("decay only after months", evolveConfidence(50, { increases: 0, decreases: 0, monthsSinceEvidence: 1 }) === 50, "");
  add("gradual decay when stale", (() => { const v = evolveConfidence(50, { increases: 0, decreases: 0, monthsSinceEvidence: 6 }); return v < 50 && v >= 50 - CONF_STEP_DOWN; })(), "");
  add("never below floor", evolveConfidence(21, { increases: 0, decreases: 5, monthsSinceEvidence: 24 }) >= 20, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
