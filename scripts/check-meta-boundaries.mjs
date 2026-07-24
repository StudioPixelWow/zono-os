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

/** Walk the Meta module + assert public-surface / structural invariants. */
export function runGuard() {
  const failures = [];
  const files = walk(META_DIR);
  if (files.length === 0) failures.push(`${META_DIR}: module missing`);

  for (const f of files) {
    if (isQa(f)) continue; // QA constructs banned literals via escaped strings
    const code = readFileSync(f, "utf8");
    failures.push(...scanContent(f, code));
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
