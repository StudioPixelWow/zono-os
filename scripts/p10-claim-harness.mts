// ============================================================================
// P10 — Claim My Listings: evidence + decision + dedupe unit tests (§AR).
// Run: npx esbuild scripts/p10-claim-harness.mts --bundle --platform=node --format=cjs | node -
// ============================================================================
// NOTE: namespace imports — tsx in this env mis-resolves named `.ts` imports.
import * as EC from "../src/lib/claim/claim-evidence-core.ts";
import * as DC from "../src/lib/claim/claim-decision-core.ts";
const { scoreCandidate, isCandidate } = EC;
type CandidateEvidence = EC.CandidateEvidence;
const { transitionDecision, snoozeUntil, isSnoozeElapsed, planClaim } = DC;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`FAIL: ${n}`); } };
const E = (o: Partial<CandidateEvidence>): CandidateEvidence => ({
  sameOrg: true, stableAgentIdMatch: false, nameMatch: "none", phoneMatch: "unknown",
  officeMatch: false, cityMatch: false, priorConfirmedSameIdentity: 0, ...o,
});

// ── Evidence scoring + guardrails ────────────────────────────────────────────
ok("cross-org evidence is EXCLUDED", scoreCandidate(E({ sameOrg: false, stableAgentIdMatch: true })).excluded);
ok("stable agent id + no contradiction → HIGH", scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "exact" })).confidence === "high");
ok("NAME ALONE never HIGH", scoreCandidate(E({ nameMatch: "exact" })).confidence !== "high");
ok("PHONE ALONE never HIGH", scoreCandidate(E({ phoneMatch: "exact" })).confidence !== "high");
ok("exact name + office → MEDIUM", scoreCandidate(E({ nameMatch: "exact", officeMatch: true })).confidence === "medium");
ok("similar name + exact phone → MEDIUM", scoreCandidate(E({ nameMatch: "similar", phoneMatch: "exact" })).confidence === "medium");
ok("name-only similarity → LOW", scoreCandidate(E({ nameMatch: "similar" })).confidence === "low");
ok("phone CONTRADICTION caps at LOW even with stable id", scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "contradict" })).confidence === "low");
ok("phone contradiction records a caution", scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "contradict" })).cautions.some((c) => c.includes("טלפון")));
ok("office-only → officeLevelOnly + LOW", (() => { const v = scoreCandidate(E({ officeMatch: true })); return v.officeLevelOnly && v.confidence === "low"; })());
ok("identity anchor (>=3 prior) → HIGH without id", scoreCandidate(E({ priorConfirmedSameIdentity: 3, nameMatch: "similar" })).confidence === "high");
ok("verdict carries reasons", scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "exact", officeMatch: true })).reasons.length >= 2);
ok("isCandidate false for excluded", !isCandidate(scoreCandidate(E({ sameOrg: false }))));

// Pure scorer: a VERIFIED phone contradiction caps at LOW even with office/city.
// (Per P10A §13 the real Maor listing's different phone is NOT auto-treated as a
//  contradiction — see the §13 classifier tests in p10a-claim-write-harness.mts.
//  The real case is LOW on name-only grounds; this asserts the scorer's cap.)
ok("verified phone contradiction → LOW (scorer cap)",
  scoreCandidate(E({ nameMatch: "first_only", phoneMatch: "contradict", officeMatch: true, cityMatch: true })).confidence === "low");

// ── Decision transitions ─────────────────────────────────────────────────────
ok("claim → claimed", transitionDecision("candidate", "claim").next === "claimed");
ok("claimed is terminal (no re-claim)", !transitionDecision("claimed", "claim").ok);
ok("reject → rejected", transitionDecision("candidate", "reject").next === "rejected");
ok("snooze → snoozed", transitionDecision("candidate", "snooze").next === "snoozed");
ok("snoozed → reopen → candidate", transitionDecision("snoozed", "reopen").next === "candidate");

// ── Snooze windows ───────────────────────────────────────────────────────────
const now = 1_000_000_000_000;
ok("tomorrow = +1d", snoozeUntil(now, "tomorrow") === now + 86_400_000);
ok("week = +7d", snoozeUntil(now, "week") === now + 7 * 86_400_000);
ok("snoozed hidden before window", !isSnoozeElapsed(snoozeUntil(now, "week"), now + 86_400_000));
ok("snoozed returns after window", isSnoozeElapsed(snoozeUntil(now, "tomorrow"), now + 2 * 86_400_000));

// ── Idempotent claim / dedupe planning ───────────────────────────────────────
ok("already promoted → reuse", planClaim({ listingPromotedPropertyId: "p1", listingPrimaryPropertyId: null, existingBySourceId: null, duplicateGroupPromotedId: null }).action === "reuse");
ok("primary link → reuse", planClaim({ listingPromotedPropertyId: null, listingPrimaryPropertyId: "p2", existingBySourceId: null, duplicateGroupPromotedId: null }).action === "reuse");
ok("existing by source_id → reuse", planClaim({ listingPromotedPropertyId: null, listingPrimaryPropertyId: null, existingBySourceId: "p3", duplicateGroupPromotedId: null }).action === "reuse");
ok("duplicate-group sibling → reuse", planClaim({ listingPromotedPropertyId: null, listingPrimaryPropertyId: null, existingBySourceId: null, duplicateGroupPromotedId: "p4" }).action === "reuse");
ok("no link → create", planClaim({ listingPromotedPropertyId: null, listingPrimaryPropertyId: null, existingBySourceId: null, duplicateGroupPromotedId: null }).action === "create");
ok("repeated claim resolves to SAME property (idempotent)", planClaim({ listingPromotedPropertyId: "pX", listingPrimaryPropertyId: null, existingBySourceId: null, duplicateGroupPromotedId: null }).action === "reuse");

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
