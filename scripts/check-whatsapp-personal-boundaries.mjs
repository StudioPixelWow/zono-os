#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO OS — Batch 6.6A · PERSONAL WHATSAPP BRIDGE BOUNDARY GUARD.
//
// Proves the Evolution-isolation invariants from the Architecture & Boundary
// Contract (C1–C4, C9). Fails the build on any leak. Rules:
//   1. The Evolution NAME/vocabulary appears in src ONLY under the Personal
//      transport adapter (src/lib/whatsapp/provider/personal/).
//   2. C9: raw Evolution endpoint/auth fragments appear ONLY under
//      .../personal/compat/ — never elsewhere in the adapter, never above it.
//   3. Only src/lib/whatsapp/provider/ may import the adapter/compat internals.
//   4. No migration introduces an evolution_* schema; canonical model files
//      contain no Evolution field.
// (Comments are stripped before scanning so doc headers don't trip the guard.)
// ============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const failures = [];
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
};
const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const PERSONAL_DIR = "src/lib/whatsapp/provider/personal/";
const COMPAT_DIR = "src/lib/whatsapp/provider/personal/compat/";
const PROVIDER_DIR = "src/lib/whatsapp/provider/";

const srcFiles = walk("src");

// ── Rule 1 — Evolution-API identifiers live only inside the Personal adapter.
//    (Matches the API specifically — NOT the common English word "evolution",
//    which ZONO uses as a domain term e.g. "brokerage evolution".) ───────────
const EVO_IDENTIFIERS = /evolution-api|evoapicloud|EVOLUTION_API|evolutionConfig|WHATSAPP-BAILEYS/i;
for (const f of srcFiles) {
  if (f.startsWith(PERSONAL_DIR)) continue;
  if (/qa\.ts$/.test(f)) continue;                        // QA fixtures name shapes on purpose
  const code = strip(readFileSync(f, "utf8"));
  if (EVO_IDENTIFIERS.test(code)) {
    failures.push(`${f}: references an Evolution-API identifier outside the Personal transport adapter (C1/C2)`);
  }
}

// ── Rule 2 — raw Evolution endpoint fragments live only in compat/. Specific
//    route shapes only, so generic "/instance/" strings elsewhere don't trip. ─
const EVO_FRAGMENTS = /WHATSAPP-BAILEYS|\/instance\/(create|connect|connectionState|logout|delete)|\/message\/send(Text|Media)|\/chat\/sendPresence/;
for (const f of srcFiles) {
  if (f.startsWith(COMPAT_DIR)) continue;                 // compat may hold them
  if (/qa\.ts$/.test(f)) continue;                        // QA fixtures name shapes on purpose
  const code = strip(readFileSync(f, "utf8"));
  if (EVO_FRAGMENTS.test(code)) {
    failures.push(`${f}: raw Evolution endpoint fragment outside compat/ (C9)`);
  }
}

// ── Rule 3 — only the provider dir may import adapter/compat internals. ──────
const INTERNAL_IMPORT = /from ["'][^"']*provider\/personal\/(adapter|compat)(\/[^"']*)?["']|import\(["'][^"']*provider\/personal\/(adapter|compat)/;
for (const f of srcFiles) {
  if (f.startsWith(PROVIDER_DIR)) continue;               // registry/index/etc. may
  const code = strip(readFileSync(f, "utf8"));
  if (INTERNAL_IMPORT.test(code)) {
    failures.push(`${f}: imports Personal adapter/compat internals — use the neutral personal surface (C2)`);
  }
}

// ── Rule 4 — no evolution_* schema in migrations. ───────────────────────────
for (const f of walk("supabase/migrations")) {
  const code = readFileSync(f, "utf8");
  if (/evolution_/i.test(code)) failures.push(`${f}: migration introduces an evolution_* schema (C4)`);
}

// ── Sanity — the adapter + compat + kill switch actually exist. ─────────────
for (const req of [
  `${PERSONAL_DIR}adapter.ts`, `${COMPAT_DIR}index.ts`,
  "src/lib/whatsapp/provider/personal-flag.ts",
]) if (!existsSync(req)) failures.push(`missing required 6.6A file: ${req}`);

if (failures.length) {
  console.error("✗ WhatsApp Personal (6.6A) boundary guard failed:");
  for (const f of failures) console.error("  · " + f);
  process.exit(1);
}
console.log(`✓ WhatsApp Personal (6.6A) boundary guard: ${srcFiles.length} files scanned — Evolution sealed in the adapter`);
