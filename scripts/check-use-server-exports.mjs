#!/usr/bin/env node
// ============================================================================
// 🛡️ ZONO — guard: a "use server" module may export ONLY async functions.
//
// Why this exists: `src/lib/{leads,deals,tasks}/actions.ts` each exported a
// const array. Next.js rejects that at MODULE EVALUATION with
//   'A "use server" file can only export async functions, found object'
// and because those modules get bundled with the rest of the server-action
// graph, it took down EVERY server action in the app (500 on /properties/new,
// /my-properties, /properties …). No business mutation could complete, which is
// why the kernel outbox (`domain_events`) sat at 0 rows.
//
// Static check — no build required. Run: node scripts/check-use-server-exports.mjs
// ============================================================================
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `grep -rl '^"use server"' src --include=*.ts --include=*.tsx || true`,
  { encoding: "utf8" },
).split("\n").filter(Boolean);

// Exports that are NOT async functions.
const ILLEGAL = /^export\s+(const|let|var|class|enum)\s+(\w+)/;
const ASYNC_FN = /^export\s+(async\s+function|const\s+\w+\s*(:[^=]+)?=\s*async)/;

// `export type { X }` — a type RE-EXPORT of an imported binding — is illegal even
// though it looks erasable: Next's "use server" transform emits a RUNTIME
// re-export for the name, but a type-only import has no runtime value, so the
// module throws `ReferenceError: X is not defined` at MODULE EVALUATION and takes
// the whole route down. That is exactly how /facebook 500'd on `BrokerFacebook`.
// Re-export the type from the service/types module instead.
//
// NOTE the deliberate narrowness: a LOCAL alias (`export type Foo = "a" | "b"`)
// declares the type in this file and is fully erased — it is SAFE and must not be
// flagged. Only the braces form (a re-export list) is dangerous.
const ILLEGAL_TYPE = /^export\s+type\s*\{/;

// `export { someAsyncAction } from "./other-use-server-module"` IS legal —
// re-exporting server actions is supported. Only value/type re-exports of
// non-actions are the problem, and those surface via the rules above.

const violations = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Only files whose FIRST statement is the directive are server-action modules.
  if (!/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(src)) continue;
  src.split("\n").forEach((line, i) => {
    if (ASYNC_FN.test(line)) return;
    const m = line.match(ILLEGAL);
    if (m) { violations.push(`${file}:${i + 1}  export ${m[1]} ${m[2]}`); return; }
    if (ILLEGAL_TYPE.test(line)) violations.push(`${file}:${i + 1}  ${line.trim()}   ← type re-export crashes at module evaluation`);
  });
}

if (violations.length) {
  console.error('✗ "use server" files may export ONLY async functions.\n');
  for (const v of violations) console.error("  " + v);
  console.error("\n  Move these values into a sibling non-\"use server\" module (e.g. ./options.ts).");
  process.exit(1);
}
console.log(`✓ use-server export guard: ${files.length} server-action modules clean`);
