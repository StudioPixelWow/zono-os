// ============================================================================
// P10C — identity-learning consumption (§10) + notification dedup semantics.
// Pure, deterministic. No DB, no production writes.
// Run: npx esbuild scripts/p10c-closure-harness.mts --bundle --platform=node --format=cjs | node -
// ============================================================================
import * as WC from "../src/lib/claim/claim-write-core.ts";
import * as EC from "../src/lib/claim/claim-evidence-core.ts";
const { countMatchingApprovals } = WC;
const { scoreCandidate } = EC;
type CandidateEvidence = EC.CandidateEvidence;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`FAIL: ${n}`); } };
const E = (o: Partial<CandidateEvidence>): CandidateEvidence => ({
  sameOrg: true, stableAgentIdMatch: false, nameMatch: "none", phoneMatch: "unknown",
  officeMatch: false, cityMatch: false, priorConfirmedSameIdentity: 0, ...o,
});
const AGENTS = ["agent-A", "agent-B"];
const approved = (ids: string[]) => ({ status: "approved", evidence: { anchorAgentIds: ids } });
const rejected = (ids: string[]) => ({ status: "rejected", evidence: { anchorAgentIds: ids } });

// ── §10 identity-learning consumption ────────────────────────────────────────
ok("0 prior approvals → 0 boost", countMatchingApprovals([], AGENTS) === 0);
ok("3 approved same-identity → 3", countMatchingApprovals([approved(["agent-A"]), approved(["agent-B"]), approved(["agent-A"])], AGENTS) === 3);
ok("rejected reviews do NOT count", countMatchingApprovals([rejected(["agent-A"]), rejected(["agent-A"]), rejected(["agent-A"])], AGENTS) === 0);
ok("pending reviews do NOT count", countMatchingApprovals([{ status: "pending", evidence: { anchorAgentIds: ["agent-A"] } }], AGENTS) === 0);
ok("approved but DIFFERENT identity does NOT count", countMatchingApprovals([approved(["someone-else"]), approved(["x"])], AGENTS) === 0);
ok("no anchor ids → 0 (never boosts)", countMatchingApprovals([approved(["agent-A"])], []) === 0);
ok("missing/!array evidence ignored", countMatchingApprovals([{ status: "approved", evidence: null }, { status: "approved", evidence: { anchorAgentIds: "agent-A" } }], AGENTS) === 0);

// The consumed count actually drives the engine toward HIGH (end-to-end of the
// identity-learning path): 3 approvals + name-similar + no contradiction → HIGH;
// 0 approvals + name-only → NOT high.
const boost = countMatchingApprovals([approved(["agent-A"]), approved(["agent-A"]), approved(["agent-B"])], AGENTS);
ok("3 approvals → engine returns HIGH", scoreCandidate(E({ nameMatch: "similar", priorConfirmedSameIdentity: boost })).confidence === "high");
ok("0 approvals + name-only → NOT high", scoreCandidate(E({ nameMatch: "similar", priorConfirmedSameIdentity: 0 })).confidence !== "high");
ok("rejected-only history → NOT high (name-only stays LOW)",
  scoreCandidate(E({ nameMatch: "similar", priorConfirmedSameIdentity: countMatchingApprovals([rejected(["agent-A"]), rejected(["agent-A"]), rejected(["agent-A"])], AGENTS) })).confidence === "low");

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
