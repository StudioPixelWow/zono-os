#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO — Batch 6.7 · AI COMMUNICATION COPILOT BOUNDARY GUARD.
//
// Locks the Copilot's design invariants. Fails the build on any leak:
//   1. Transport-agnostic: no transport module import (no @/lib/whatsapp/*).
//   2. Canonical-only read: no SQL on frozen transport tables
//      (whatsapp_conversations / whatsapp_messages) and no write to `journeys`.
//   3. Never sends: no transport send import (covered by rule 1) — asserted also
//      by the reply artifact being approval-only (see QA).
//   4. LLM only via the Reasoning Gateway: no direct model-endpoint fetch.
//   5. No forbidden derived-field literals (journey scoring vocabulary).
// (Comments stripped before scanning.)
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/lib/comm-copilot";
const failures = [];
const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

const files = walk(DIR);
if (files.length === 0) failures.push(`${DIR}: module missing`);

const TRANSPORT_IMPORT = /from ["']@\/lib\/whatsapp\/|import\(["']@\/lib\/whatsapp\//;
const FROZEN_SQL = /whatsapp_conversations|whatsapp_messages|\.from\(["']journeys["']\)/;
const MODEL_ENDPOINT = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis/;
const FORBIDDEN_FIELDS = /velocity_score|velocity_state|health_score|engagement_score|conversion_score|next_best_action/;

for (const f of files) {
  if (/qa\.ts$/.test(f)) continue;                         // QA may name banned things
  const code = strip(readFileSync(f, "utf8"));
  if (TRANSPORT_IMPORT.test(code)) failures.push(`${f}: imports a transport module — Copilot must read canonical conversations only (rule 1)`);
  if (FROZEN_SQL.test(code)) failures.push(`${f}: touches a frozen transport table / writes journeys (rule 2)`);
  if (MODEL_ENDPOINT.test(code)) failures.push(`${f}: calls a model endpoint directly — use the Reasoning Gateway (rule 4)`);
  if (FORBIDDEN_FIELDS.test(code)) failures.push(`${f}: uses a forbidden derived-field literal (rule 5)`);
}

// Required Phase 0 scaffolding present.
for (const req of ["types.ts", "normalize.ts", "read.ts", "explain.ts", "feedback.ts", "index.ts"]) {
  if (!existsSync(join(DIR, req))) failures.push(`missing required Phase 0 file: ${DIR}/${req}`);
}

if (failures.length) {
  console.error("✗ Comm-Copilot (6.7) boundary guard failed:");
  for (const f of failures) console.error("  · " + f);
  process.exit(1);
}
console.log(`✓ Comm-Copilot (6.7) boundary guard: ${files.length} files scanned — transport-agnostic, canonical-only, gateway-only`);
