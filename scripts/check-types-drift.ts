// ============================================================================
// 🛡️ ZONO — Supabase types drift guard (Phase 34.2 · QA.1). Read-only CI check.
// ----------------------------------------------------------------------------
// Fails (exit 1) when application code queries a Postgres table that is MISSING
// from the generated client types (src/lib/supabase/types.ts) — the condition
// that forces `as never` casts and disables compile-time safety. Also reports
// the remaining count of `as never` table casts so the number can be driven to
// zero over time.
//
//   npm run check:types-drift      (add to package.json scripts + CI)
//   npx tsx scripts/check-types-drift.ts
//
// Regenerate types from the live project first when drift is found:
//   npx supabase gen types typescript --project-id <PROJECT_ID> --schema public \
//     > src/lib/supabase/types.ts
// ============================================================================
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TYPES_FILE = "src/lib/supabase/types.ts";

function typedTables(): Set<string> {
  const src = readFileSync(TYPES_FILE, "utf8");
  const set = new Set<string>();
  const re = /^\s+([a-z_0-9]+):\s*TableShape</gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}

// Grep all `.from("<table>"...)` usages in src (excluding the types file itself).
function queriedTables(): { table: string; asNever: boolean; file: string }[] {
  let out = "";
  try {
    out = execSync(
      `grep -rEno "\\.from\\(\\"[a-z_0-9]+\\"( as never)?\\)" src --include=*.ts --include=*.tsx || true`,
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch { /* grep exit 1 = no matches */ }
  const rows: { table: string; asNever: boolean; file: string }[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const mm = line.match(/^(.*?):\d+:\.from\("([a-z_0-9]+)"( as never)?\)/);
    if (!mm) continue;
    rows.push({ file: mm[1], table: mm[2], asNever: !!mm[3] });
  }
  return rows;
}

function main() {
  const typed = typedTables();
  const rows = queriedTables();

  const missing = new Map<string, Set<string>>();
  let asNeverCount = 0;
  const asNeverTables = new Set<string>();

  for (const r of rows) {
    if (r.asNever) { asNeverCount += 1; asNeverTables.add(r.table); }
    if (!typed.has(r.table)) {
      if (!missing.has(r.table)) missing.set(r.table, new Set());
      missing.get(r.table)!.add(r.file);
    }
  }

  console.log(`\nSupabase types drift guard — ${typed.size} typed tables, ${rows.length} .from() call sites.`);
  console.log(`Remaining "as never" table casts: ${asNeverCount} across ${asNeverTables.size} distinct tables.`);

  if (missing.size === 0) {
    console.log("\n✅ No queried table is missing from generated types.\n");
  } else {
    console.log(`\n❌ ${missing.size} queried table(s) MISSING from generated types (regenerate types.ts):`);
    for (const [t, files] of [...missing.entries()].sort()) {
      console.log(`   • ${t}  (${files.size} file${files.size > 1 ? "s" : ""})`);
    }
    console.log("");
  }

  // Fail the build only on true drift (queried-but-untyped). The as-never count
  // is reported as a debt metric but does not fail (it shrinks as types are
  // regenerated + casts removed).
  process.exit(missing.size > 0 ? 1 : 0);
}

main();
