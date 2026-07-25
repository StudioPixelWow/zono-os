// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · OPS SELF TEST.
// Runnable gate: `npx tsx src/lib/meta/ops/qa.ts`. Deterministic O1–O16 over the
// PURE orchestration metadata + cadence policy + static file proofs from disk.
// Does NOT import the server-only orchestrator (it pulls the service graph); it
// verifies the orchestrator by reading it as text + boundary-guard fixtures.
// No network, no DB, no ambient clock/RNG.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { DISPATCH_GROUP_NAMES, ALL_DISPATCH_SUBSYSTEMS, dispatchGroupMembers, validateDispatchPartition } from "./groups";
import { META_WORKER_CRONS } from "./cadence";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (Batch 7) — SELF TEST (Worker Orchestration + Scheduler + Cron)\n");

function main() {
  // ═══ Orchestration partition ════════════════════════════════════════════════
  check("O1 every durable Meta queue is scheduled in exactly one dispatch group", validateDispatchPartition().ok);
  check("O2 eight durable subsystems across three dispatch groups", ALL_DISPATCH_SUBSYSTEMS.length === 8 && DISPATCH_GROUP_NAMES.length === 3);
  check("O3 fast group = publish, inbox, messaging", dispatchGroupMembers("fast").join(",") === "publish,inbox,messaging");
  check("O4 standard group = engagement, intelligence, reconcile", dispatchGroupMembers("standard").join(",") === "engagement,intelligence,reconcile");
  check("O5 slow group = insights, listening", dispatchGroupMembers("slow").join(",") === "insights,listening");
  check("O6 no subsystem is scheduled twice (clean partition)", validateDispatchPartition().duplicated.length === 0);

  // ═══ Scheduler ↔ Cron routes ↔ vercel.json ═════════════════════════════════
  const CRON_DIR = "src/app/api/cron";
  check("O7 cadence declares exactly the 4 orchestrator crons (3 dispatch + 1 recover)", META_WORKER_CRONS.length === 4);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const cronPaths = new Set(vercel.crons.map((c) => c.path));
  check("O8 all cadence crons are wired in vercel.json", META_WORKER_CRONS.every((e) => cronPaths.has(e.path)));
  check("O9 vercel.json schedule matches the cadence policy (single source of truth)", META_WORKER_CRONS.every((e) => vercel.crons.find((c) => c.path === e.path)?.schedule === e.schedule));
  check("O10 additive: existing crons preserved (kernel-drain, zono-master-sync)", cronPaths.has("/api/cron/kernel-drain") && cronPaths.has("/api/cron/zono-master-sync"));
  for (const e of META_WORKER_CRONS) {
    const file = `${CRON_DIR}/${e.path.replace("/api/cron/", "")}/route.ts`;
    const r = existsSync(file) ? readFileSync(file, "utf8") : "";
    check(`O:${e.group} route exists, GET-only, Bearer CRON_SECRET-gated, imports the orchestrator`, !!r && /export async function GET/.test(r) && !/export async function (POST|PUT|PATCH|DELETE)/.test(r) && /Bearer \$\{secret\}/.test(r) && /@\/lib\/meta\/ops\/orchestrator/.test(r));
    check(`O:${e.group} route introduces no provider logic / no duplicate scheduling`, !!r && !/provider\/graph|graph\.facebook|claimDueJobs|createSupabase\w*Store|SKIP LOCKED|\bfetch\s*\(/.test(r));
  }

  // ═══ Orchestrator reuse-only (read as text — server-only module) ════════════
  const orch = readFileSync("src/lib/meta/ops/orchestrator.ts", "utf8");
  const orchCode = orch.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments (as the guard does)
  check("O11 orchestrator fans out to EXISTING tick services (schedule/inbox/messaging/...)", /@\/lib\/meta\/schedule\/service/.test(orch) && /runInboxDispatchTick/.test(orch) && /runMessagingDispatchTick/.test(orch) && /runListeningRecoveryTick/.test(orch));
  check("O12 orchestrator body introduces NO provider logic and NO duplicate queue logic", !/provider\/graph|graph\.facebook|createSupabase\w*Store|claimDueJobs|SKIP LOCKED|createServiceRoleClient|\bfetch\s*\(/.test(orchCode));
  check("O13 orchestrator is server-only", /import "server-only"/.test(orch));

  // ═══ Boundary guard · Rule 18 ══════════════════════════════════════════════
  check("O14 guard flags a provider/graph import in a Meta cron route (rule 18)", scanContent("src/app/api/cron/meta-dispatch-fast/route.ts", 'import { g } from "@/lib/meta/provider/graph";').some((v) => /rule 18/.test(v)));
  check("O15 guard flags a direct queue claim in an ops file (rule 18)", scanContent("src/lib/meta/ops/x.ts", "await createSupabaseInboxStore().claimDueJobs(a);").some((v) => /rule 18/.test(v)));
  check("O16 guard is clean on the real orchestrator (fan-out only)", scanContent("src/lib/meta/ops/orchestrator.ts", orch).length === 0);

  console.log(`\nBatch 7 ops self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
