#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO OS 2.0 — Batch 5.6I · CANONICAL JOURNEY BOUNDARY GUARD.
//
// Fails the build/gate when a future change re-opens a retired Journey
// reasoning path. The canonical architecture is:
//
//   Kernel events → journey subscriber → canonical `journeys`/`journey_events`
//   → journey-center provider → shared projection → consumers
//
// Approved canonical entry points (the ONLY ways to reason about Journeys):
//   · @/lib/journey-center/service   (getJourneyCenter / getJourneyDetail)
//   · @/lib/journey-center/command   (getCanonicalJourneyCommand)
//   · @/lib/journey-center/canonical (pure mappers incl. verifiedDwellDays)
//   · @/lib/journey-center/kpis      (isStalled / isBlocked / filters / sort)
//   · @/lib/executive-os/journey-projection (shared projection + queue mapper)
//   · @/lib/broker-intelligence (canonical queue)
//   · @/lib/kernel (event emission; journey-applier is the ONE stage writer)
//   · @/lib/journey-backfill/service (the ONE creation/backfill writer)
// ============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const failures = [];

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
};

const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const files = walk(SRC);

// ── Rule 1 — the retired journey-intelligence module must never come back. ──
for (const f of files) {
  const code = stripComments(readFileSync(f, "utf8"));
  if (/from ["']@\/lib\/journey-intelligence|import\(["']@\/lib\/journey-intelligence/.test(code)) {
    failures.push(`${f}: imports the RETIRED journey-intelligence module (deleted in 5.6I)`);
  }
}

// ── Rule 2 — canonical Journey consumers must not read forbidden derived
//    columns or the legacy prediction/satellite tables. ──────────────────────
// Tier A — journey-ONLY modules: any forbidden term is a violation. Other
// domains legitimately own same-named columns (e.g. deals.next_best_action),
// so mixed surfaces get Tier B instead.
const JOURNEY_ONLY_DIRS = [
  "src/lib/journey-center",
  "src/lib/journey-cockpit",
  "src/lib/journey-coach",                        // 5.7 — the Coach is evidence-native by contract
  "src/lib/executive-decision",                   // 5.8 — the Decision Engine inherits, never reads legacy
  "src/lib/executive-memory",                     // 5.9 — Memory diffs snapshots, never reads journey state
  "src/lib/executive-workspace",                  // 6.0 — Workspace COMPOSES canonical providers, never reads journey state
  "src/components/journey",
  "src/components/dashboard/sections/JourneysDashboardSection.tsx",
  "src/app/(app)/journeys",
];
const FORBIDDEN_TABLES = /journey_predictions|journey_scores|journey_velocity|journey_risks|journey_opportunities|journey_milestones|journey_blockers/;
const FORBIDDEN_FIELDS = /velocity_score|velocity_state|health_score|engagement_score|conversion_score|next_best_action/;
for (const f of files.filter((f) => JOURNEY_ONLY_DIRS.some((d) => f.startsWith(d)))) {
  if (/qa\.ts$|journey-qa\.ts$/.test(f)) continue;                 // QA files NAME the banned things on purpose
  const code = stripComments(readFileSync(f, "utf8"));
  const m = code.match(FORBIDDEN_TABLES) ?? code.match(FORBIDDEN_FIELDS);
  if (m) failures.push(`${f}: canonical Journey consumer references forbidden legacy field/table '${m[0]}'`);
}
// Tier B — every file: the legacy journey satellite TABLES are dead to
// production, and a `journeys`-table read may not select derived score columns.
for (const f of files) {
  if (/qa\.ts$|journey-qa\.ts$/.test(f) || f.startsWith("src/lib/supabase/")) continue;
  const code = stripComments(readFileSync(f, "utf8"));
  const t = code.match(FORBIDDEN_TABLES);
  if (t) failures.push(`${f}: references retired journey satellite table '${t[0]}'`);
  const sel = code.match(/from\(["']journeys["']\)[\s\S]{0,260}?(velocity_state|velocity_score|health_score|engagement_score|conversion_score|risk_score|next_best_action)/);
  if (sel) failures.push(`${f}: reads forbidden derived column '${sel[1]}' from the journeys table`);
}

// ── Rule 3 — no independent dwell derivation: only the shared gate may turn a
//    timestamp into "days in stage". ─────────────────────────────────────────
const DWELL_SURFACES = ["src/lib/journey-cockpit/assemble.ts"];
for (const f of DWELL_SURFACES) {
  const code = stripComments(readFileSync(f, "utf8"));
  if (/stageEnteredAt \?\?|startedAt \?\?|daysSince\(/.test(code)) {
    failures.push(`${f}: independent timestamp dwell derivation detected — use verifiedDwellDays (journey-center/canonical)`);
  }
  if (!code.includes("verifiedDwellDays(")) {
    failures.push(`${f}: no longer consumes the shared verifiedDwellDays gate`);
  }
}

// ── Rule 4 — the canonical `journeys` table has exactly TWO writers:
//    the kernel applier and the backfill/creation service. ──────────────────
const WRITER_ALLOWLIST = new Set([
  "src/lib/kernel/journey-applier.ts",
  "src/lib/journey-backfill/service.ts",
  "src/lib/journey/repository.ts",   // touchJourney: last_activity_at ONLY (activity stamp, no stage/dwell field)
]);
for (const f of files) {
  const code = stripComments(readFileSync(f, "utf8"));
  if (/from\(["']journeys["']\)\s*[\s\S]{0,80}?\.(update|insert|upsert|delete)\(/.test(code) && !WRITER_ALLOWLIST.has(f)) {
    failures.push(`${f}: writes the canonical journeys table outside the approved writer set`);
  }
}
// …and the activity stamp must stay an activity stamp.
{
  const code = stripComments(readFileSync("src/lib/journey/repository.ts", "utf8"));
  if (/current_stage|stage_entered_at|status:/.test(code.split("touchJourney")[1]?.split("}")[1] ?? "")) {
    failures.push("src/lib/journey/repository.ts: touchJourney must stamp last_activity_at only");
  }
}

// ── Rule 5 — activity staleness stays out of canonical stalled reasoning. ───
for (const f of ["src/lib/journey-center/kpis.ts", "src/lib/journey-center/canonical.ts", "src/lib/journey-center/command.ts"]) {
  const code = stripComments(readFileSync(f, "utf8"));
  if (/@\/lib\/journey\/stages|@\/lib\/journey\/repository/.test(code)) {
    failures.push(`${f}: canonical Journey reasoning imports the activity-staleness helpers`);
  }
}

if (failures.length) {
  console.error("✗ Journey boundary guard failed:");
  for (const f of failures) console.error("  · " + f);
  process.exit(1);
}
console.log(`✓ Journey boundary guard: ${files.length} files scanned — canonical architecture intact`);
