// P9.0C — ACTIVATION PHASE-TRANSITION + ZERO-STATE ROLLOUT QA (PURE; no DB/network).
// Proves: (1) the office activation phase advances NEW → ACTIVATING → ACTIVE strictly
// from real signals (no manual DB edit, no time-only, no fabrication); (2) an office
// never gets trapped in the new-office dashboard once real work begins; (3) the
// ContextualZeroState rollout reached the primary modules and the Deals no-op CTA is gone.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeActivation, ACTIVE_PHASE_THRESHOLD, type ActivationInput } from "../src/lib/activation/activation.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

const BASE: ActivationInput = { orgExists: true, ownerIdentity: true, cityDetected: true, counts: {}, brandConfigured: false, digitalPresence: false, teamSize: 1 };
const phase = (patch: Partial<ActivationInput>) => computeActivation({ ...BASE, ...patch, counts: { ...BASE.counts, ...(patch.counts ?? {}) } }).phase;

console.log("P9.0C · (1) NEW → ACTIVATING → ACTIVE walks only on real signals");
ok(phase({}) === "new", "fresh office (identity+city only) → NEW");
ok(phase({ counts: { operating_area: 1 } }) === "new", "+ operating area (no business data) → still NEW (honest)");
ok(phase({ brandConfigured: true }) === "new", "+ brand configured (no business data) → still NEW");
ok(phase({ teamSize: 4, counts: { team_invited: 2 } }) === "new", "+ team invited (no business data) → still NEW");
ok(phase({ counts: { first_property: 1 } }) === "activating", "+ first property → ACTIVATING (real work began)");
ok(phase({ counts: { first_contact: 1 } }) === "activating", "+ first contact → ACTIVATING");
ok(phase({ counts: { first_task_meeting: 1 } }) === "activating", "+ first task/meeting → ACTIVATING");

console.log("\nP9.0C · (2) no trap: operational office with enough progress → ACTIVE");
const near = computeActivation({ orgExists: true, ownerIdentity: true, cityDetected: true, brandConfigured: true, digitalPresence: false, teamSize: 3, counts: { operating_area: 1, team_invited: 1, first_property: 2, first_contact: 3 } });
ok(near.hasOperationalData === true, "has operational data");
ok(near.percent >= ACTIVE_PHASE_THRESHOLD, `percent ${near.percent}% ≥ ${ACTIVE_PHASE_THRESHOLD}% threshold`);
ok(near.phase === "active", "→ ACTIVE (falls through to full dashboard, not trapped)");
const partial = computeActivation({ ...BASE, counts: { first_property: 1 } });
ok(partial.phase === "activating" && partial.percent < ACTIVE_PHASE_THRESHOLD, "operational but <70% → ACTIVATING (evolving home)");

console.log("\nP9.0C · (3) ContextualZeroState rollout + Deals no-op removed");
const deals = read("src/app/(app)/deals/DealsView.tsx");
ok(deals.includes("ContextualZeroState"), "Deals: uses ContextualZeroState");
ok(deals.includes('new CustomEvent("zono:new-deal")'), "Deals: empty CTA dispatches a real create (zono:new-deal)");
ok(deals.includes("!empty && <Button onClick={build}"), "Deals: match-dependent 'בנה עסקאות' hidden for a fresh office (no no-op)");
ok(read("src/app/(app)/properties/PropertiesListView.tsx").includes("ContextualZeroState"), "Properties: uses ContextualZeroState");
ok(read("src/app/(app)/leads/LeadsListView.tsx").includes("ContextualZeroState"), "Leads: uses ContextualZeroState");
ok(read("src/app/(app)/settings/operating-areas/OperatingAreasView.tsx").includes("ContextualZeroState"), "Operating Areas: uses ContextualZeroState");
ok(read("src/app/(app)/properties/new/page.tsx").includes("initial.city ="), "Properties/new: city-first prefill wired");

console.log(`\n${fail === 0 ? "✅ P9.0C QA PASSED" : `❌ P9.0C QA FAILED (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
