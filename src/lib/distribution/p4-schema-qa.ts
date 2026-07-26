// ============================================================================
// ZONO — P4.1 schema/attribution QA (pure, offline, no DB).
// Guards the two P4.1 migrations against accidental deletion/regression by
// asserting the exact required DDL is present. Runtime constraint/FK/resolver
// SEMANTICS are validated separately against a real Postgres (see delivery report:
// partial-unique idempotency, cross-org allow, same-org reject, multi-NULL,
// FK accept/reject, ON DELETE SET NULL, resolver org-scoping).
//
// Run: npx tsx src/lib/distribution/p4-schema-qa.ts
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = join(process.cwd(), "supabase", "migrations");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  const m1 = norm(readFileSync(join(MIG, "20270110120000_p4_1_social_interactions_idempotency.sql"), "utf8"));
  const m2 = norm(readFileSync(join(MIG, "20270110120100_p4_1_group_post_source_link.sql"), "utf8"));

  // M1 — partial unique index for idempotency.
  add("M1 creates a UNIQUE index", m1.includes("create unique index"));
  add("M1 keyed on (organization_id, external_comment_id)", m1.includes("social_interactions (organization_id, external_comment_id)"));
  add("M1 is PARTIAL (where external_comment_id is not null)", m1.includes("where external_comment_id is not null"));
  add("M1 is idempotent (if not exists)", m1.includes("if not exists"));
  add("M1 is additive (no drop/delete/update of data)", !/\b(drop table|delete from|update )/.test(m1));

  // M2 — source_post_id FK + index.
  add("M2 adds source_post_id column", m2.includes("add column if not exists source_post_id uuid"));
  add("M2 FK references distribution_posts(id)", m2.includes("references public.distribution_posts(id)"));
  add("M2 ON DELETE SET NULL", m2.includes("on delete set null"));
  add("M2 indexes source_post_id", m2.includes("dgp_source_post_idx") && m2.includes("(source_post_id)"));
  add("M2 is additive (no drop/delete/update of data)", !/\b(drop table|delete from|update )/.test(m2));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}

// Self-run when executed directly.
const res = runSelfCheck();
for (const c of res.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
console.log(`\nP4.1 schema QA: ${res.passed}/${res.total} ${res.ok ? "ALL PASS" : "FAILED"}`);
if (!res.ok) process.exit(1);
