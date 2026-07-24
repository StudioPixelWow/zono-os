#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO — Batch 6.8 · META WORKSPACE BOUNDARY GUARD.
//
// Locks the Meta Workspace architectural invariants. Fails the build on any leak.
// Rules (from the Phase 0 command):
//   1. No Meta module imports a WhatsApp/Evolution/Batch-6.6(A) transport
//      internal, nor a transport-specific message table.
//   2. Graph implementation literals (graph.facebook.com, access_token, endpoint
//      fragments, raw Meta permission strings, raw Graph payload fields) appear
//      ONLY under src/lib/meta/provider/graph/.
//   3. Meta Workspace never references frozen tables (Communication OS, Copilot,
//      client_memory, ai_memory, Command Center, WhatsApp).
//   4. No direct model endpoint / AI provider under src/lib/meta/.
//   5. No non-Graph file imports Graph INTERNALS (compat/errors/types) — a raw
//      Graph response cannot leak upward.
//   6. Tokens do not appear in the module's exported public surface.
//   7. Facebook Groups are never marked enabled / MVP / Extended (excluded only).
//
// The core scan is exported (scanContent / runGuard) so the Phase 0 QA can drive
// it against synthetic fixtures. Comments are stripped before scanning so doc
// headers don't trip the guard. When run directly it scans `src` and exits.
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const META_DIR = "src/lib/meta";
export const GRAPH_DIR = "src/lib/meta/provider/graph";
// Phase 3B — the scheduling / queue / worker / retry / dead-letter module lives
// ONLY here. It is the ONE place background publishing orchestration is allowed;
// it must still route ALL provider work through the Phase-3A publish service seam
// (never a Graph import, never a second publishing engine).
export const SCHEDULE_DIR = "src/lib/meta/schedule";
const inScheduleDir = (p) => p.replace(/\\/g, "/").includes("/schedule/");

const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Rule 1 — transport internals must never be imported by a Meta module. ────
const TRANSPORT_IMPORT = /from ["']@\/lib\/whatsapp\/|import\(["']@\/lib\/whatsapp\/|evolution-api|evoapicloud|EVOLUTION_API/;

// ── Rule 2 — Graph implementation literals (only allowed under GRAPH_DIR). ────
const GRAPH_LITERALS = new RegExp(
  [
    "graph\\.facebook\\.com",
    "access_token",
    "/me/accounts",
    "/me/businesses",
    "instagram_business_account",
    "granular_scopes",
    "fbtrace_id",
    // raw Meta permission strings
    "pages_manage_posts",
    "pages_manage_engagement",
    "pages_read_engagement",
    "pages_show_list",
    "pages_messaging",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_messages",
    "instagram_basic",
    "business_management",
    "read_insights",
  ].join("|"),
);

// ── Rule 3 — frozen table references (any of these string names). ────────────
const FROZEN_TABLES = /whatsapp_conversations|whatsapp_messages|copilot_[a-z_]+|client_memory|ai_memory|canonical_ai_memory|communication_summaries|\bjourneys\b|command_center_[a-z_]+/;

// ── Rule 4 — direct model endpoints / AI providers. ──────────────────────────
const MODEL_ENDPOINT = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis/;

// ── Rule 5 — Graph internals imported from outside GRAPH_DIR. ────────────────
const GRAPH_INTERNAL_IMPORT = /provider\/graph\/(compat|errors|types)/;

// Graph PUBLISH endpoint literals — allowed ONLY inside provider/graph/ (like
// other Graph specifics); a leak elsewhere is a rule-8 violation.
const GRAPH_PUBLISH_LITERALS = /scheduled_publish_time|media_publish|createMediaContainer|\/media_publish/;

// ── Rule 8 (Phase 2/3A) — no storage-secret / raw-bytes / auto-send / auto-retry
//    leakage. Applied everywhere under the Meta module + routes/UI (Graph + QA
//    exempt for the publish-endpoint subset). ──────────────────────────────────
const PHASE2_FORBIDDEN = new RegExp(
  [
    "publishToMeta", "executePublish", "publishNow", "runPublish", // functional publish
    "autoPublish", "autoReply", // no automatic send behavior
    "media_bytes", "file_bytes", "\\bbytea\\b", // raw media bytes in DB
    "SUPABASE_SERVICE_ROLE_KEY", // storage/service secret exposure
    "requiresApproval:\\s*false", // approval must not be bypassed
    "graph_payload",            // raw Graph payload as draft data
    // Phase 3A — no automatic retry / background execution of publishing.
    "autoRetry", "retryWorker", "retryMiddleware", "backgroundPoll", "\\bsetInterval\\b",
    "scheduledPublish", "publishScheduler", "publishQueue", "publishWorker", "publishCron",
  ].join("|"),
);

/** Is a file path inside the sealed Graph directory? */
const inGraphDir = (p) => p.replace(/\\/g, "/").includes("provider/graph/");
/** Is a file the QA harness (may name banned things via escaped construction)? */
const isQa = (p) => /qa\.ts$/.test(p);

/**
 * Scan a single file's content and return violation strings. `path` is the
 * repo-relative path (used to decide whether Graph literals are allowed here).
 * Exported so QA can feed synthetic fixtures without writing to disk.
 */
export function scanContent(path, rawCode) {
  const out = [];
  const norm = path.replace(/\\/g, "/");
  const code = strip(rawCode);

  if (TRANSPORT_IMPORT.test(code)) out.push(`${path}: imports a transport/Evolution internal — Meta must stay provider-isolated (rule 1)`);
  if (FROZEN_TABLES.test(code)) out.push(`${path}: references a frozen table (Communication OS / Copilot / memory / Command Center / WhatsApp) (rule 3)`);
  if (MODEL_ENDPOINT.test(code)) out.push(`${path}: calls a model endpoint directly — no AI provider under the Meta module (rule 4)`);

  // Graph literals — allowed only inside the sealed Graph directory.
  if (!inGraphDir(norm) && GRAPH_LITERALS.test(code)) {
    out.push(`${path}: Graph implementation literal outside provider/graph/ (rule 2)`);
  }
  // Graph internals may be imported only by files inside the Graph directory.
  if (!inGraphDir(norm) && GRAPH_INTERNAL_IMPORT.test(code)) {
    out.push(`${path}: imports Graph internals (compat/errors/types) outside provider/graph/ (rule 5)`);
  }
  // Rule 8 (Phase 2/3A) — no storage-secret / raw-bytes / auto-send / auto-retry leakage.
  if (PHASE2_FORBIDDEN.test(code)) {
    out.push(`${path}: Phase-2/3A forbidden token (storage-secret/raw-bytes/auto-send/auto-retry/approval-bypass) (rule 8)`);
  }
  // Graph publish endpoint literals may live ONLY inside provider/graph/.
  if (!inGraphDir(norm) && GRAPH_PUBLISH_LITERALS.test(code)) {
    out.push(`${path}: Graph publish endpoint literal outside provider/graph/ (rule 8)`);
  }
  // Rule 7 — Facebook Groups capability lines must be classified excluded.
  const lines = code.split("\n");
  for (const line of lines) {
    if (/groups\.(read|publish)/.test(line) && !/excluded/.test(line)) {
      out.push(`${path}: Facebook Groups capability not marked "excluded" (rule 7)`);
    }
  }
  return out;
}

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
};

/** Extra dirs (Phase 2) scanned for the same leakage rules: routes + workspace UI. */
export const EXTRA_DIRS = ["src/app/api/meta", "src/app/(app)/meta-workspace"];

/** Walk the Meta module + assert public-surface / structural invariants. */
export function runGuard() {
  const failures = [];
  const files = walk(META_DIR);
  if (files.length === 0) failures.push(`${META_DIR}: module missing`);
  for (const d of EXTRA_DIRS) for (const f of walk(d)) files.push(f);

  for (const f of files) {
    if (isQa(f)) continue; // QA constructs banned literals via escaped strings
    const code = readFileSync(f, "utf8");
    failures.push(...scanContent(f, code));
  }

  // Structural: a publishing worker/scheduler/cron/queue FILE is allowed ONLY
  // inside the Phase-3B schedule module — never elsewhere under the Meta module.
  for (const f of files) {
    if (inScheduleDir(f)) continue;
    if (/(worker|scheduler|cron|queue)\.(ts|tsx)$/i.test(f)) failures.push(`${f}: a publishing worker/scheduler/cron/queue outside src/lib/meta/schedule/ is not allowed (rule 8)`);
  }
  // Structural: safe read models must not surface a signed/provider URL — nor,
  // in Phase 3B, a durable LEASE TOKEN (a server-only fencing nonce).
  for (const f of files) {
    if (/\/(read|dto)\.ts$/.test(f)) {
      const c = readFileSync(f, "utf8");
      if (/signedUrl|signed_url|createSignedUrl/.test(c)) failures.push(`${f}: a signed/provider-delivery URL must not appear in a safe read model (rule 8)`);
      if (/leaseToken|lease_token/.test(c)) failures.push(`${f}: a durable lease token must not appear in a safe read model (rule 9)`);
    }
  }
  // Structural: a queue-consumer / dead-letter / reconciliation-worker FILE is
  // allowed ONLY inside the Phase-3B schedule module (dead-letter.ts lives there).
  for (const f of files) {
    if (inScheduleDir(f)) continue;
    if (/(queue-consumer|dead-letter|deadletter|reconcile-worker)\.(ts|tsx)$/i.test(f)) failures.push(`${f}: a queue consumer / dead-letter / reconciliation worker outside src/lib/meta/schedule/ is not allowed (rule 8)`);
  }
  // Phase 3B structural: the schedule module must NEVER import the sealed Graph
  // layer directly — all provider work goes through the Phase-3A publish service
  // seam (no second publishing engine, no raw Graph call from the worker).
  for (const f of files) {
    if (!inScheduleDir(f) || isQa(f)) continue; // QA names the pattern in fixtures
    const c = strip(readFileSync(f, "utf8"));
    if (/from ["'][^"']*provider\/graph/.test(c) || /import\(["'][^"']*provider\/graph/.test(c)) {
      failures.push(`${f}: the schedule module must not import provider/graph — drive publishing via the Phase-3A publish seam (rule 9)`);
    }
  }

  // Rule 6 — the exported public surface (index.ts) must not expose a token field.
  const idx = join(META_DIR, "index.ts");
  if (existsSync(idx)) {
    const code = strip(readFileSync(idx, "utf8"));
    if (/access_token|pageToken\b|rawToken|tokenValue/.test(code)) failures.push(`${idx}: a token-bearing symbol is exported on the public surface (rule 6)`);
  }

  // Structural sanity — the Phase 0 foundations exist.
  for (const req of [
    "provider/registry.ts",
    "provider/errors.ts",
    "provider/graph/compat.ts",
    "capability/registry.ts",
    "capability/evaluate.ts",
    "index.ts",
  ]) {
    if (!existsSync(join(META_DIR, req))) failures.push(`missing required Phase 0 file: ${META_DIR}/${req}`);
  }

  return { failures, filesScanned: files.length };
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect || process.argv[1]?.endsWith("check-meta-boundaries.mjs")) {
  const { failures, filesScanned } = runGuard();
  if (failures.length) {
    console.error("✗ Meta Workspace (6.8) boundary guard failed:");
    for (const f of failures) console.error("  · " + f);
    process.exit(1);
  }
  console.log(`✓ Meta Workspace (6.8) boundary guard: ${filesScanned} files scanned — provider-isolated, Graph sealed, frozen-safe`);
}

// Keep a reference so bundlers don't tree-shake the util import in some setups.
void fileURLToPath;
