// ============================================================================
// P9.6C — reconciliation + safe-QA-lead harness (TEST/HARNESS).
// Exercises the REAL shipped pure logic where importable (qa-lead.ts has no
// deps); mirrors the trivial planner + automation-suppression rules (their
// modules pull server-only deps that tsx can't resolve) — mirrors are clearly
// labelled and kept byte-faithful to the shipped code.
// Run: node_modules/.bin/tsx --test scripts/p9-6c-harness.mts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { isQaSuppressAuthorized } from "../src/lib/agent-website/qa-lead.ts";

// ── Part A — reconcile planner (mirror of reconcile.ts:planReconcile) ─────────
const planReconcile = (ids: string[], existing: Set<string>) => ids.filter((id) => !existing.has(id));

test("A1: plan enriches only the missing buyers (idempotent skip)", () => {
  const ids = ["b1", "b2", "b3", "b4"];
  const existing = new Set(["b1", "b3"]);
  assert.deepEqual(planReconcile(ids, existing), ["b2", "b4"]);
});
test("A2: re-run after full enrichment plans nothing (safe to rerun)", () => {
  const ids = ["b1", "b2"];
  assert.deepEqual(planReconcile(ids, new Set(ids)), []);
});
test("A3: empty org → empty plan", () => {
  assert.deepEqual(planReconcile([], new Set()), []);
});

// ── Part B — QA suppression AUTHORIZATION (real shipped pure logic) ───────────
const SECRET = "s3cr3t-qa-token-32-chars-long-xxxx"; // ≥16 chars

test("B1: correct token + configured secret → authorized (suppress)", () => {
  assert.equal(isQaSuppressAuthorized(SECRET, SECRET), true);
});
test("B2: UNAUTHORIZED public request (wrong token) → cannot suppress", () => {
  assert.equal(isQaSuppressAuthorized("guessing-a-token-of-same-len-xxxx", SECRET), false);
});
test("B3: public visitor with NO token → normal delivery (no suppress)", () => {
  assert.equal(isQaSuppressAuthorized(null, SECRET), false);
  assert.equal(isQaSuppressAuthorized(undefined, SECRET), false);
  assert.equal(isQaSuppressAuthorized("", SECRET), false);
});
test("B4: secret not configured / too weak → never suppress (fail safe)", () => {
  assert.equal(isQaSuppressAuthorized(SECRET, undefined), false);
  assert.equal(isQaSuppressAuthorized(SECRET, ""), false);
  assert.equal(isQaSuppressAuthorized("short", "short"), false); // env < 16 chars
});
test("B5: length-mismatch token → false (no prefix bypass)", () => {
  assert.equal(isQaSuppressAuthorized(SECRET + "x", SECRET), false);
  assert.equal(isQaSuppressAuthorized(SECRET.slice(0, -1), SECRET), false);
});

// ── Part B — automation external-suppression gate (mirror of automation-subscriber) ──
// projectEventToAutomation returns null (no external automation bundle) when the
// event payload carries an authorized suppressExternal flag; otherwise a lead.created
// yields the "new_lead" bundle exactly as before.
const projectSuppress = (payload: Record<string, unknown> | null): "suppressed" | "new_lead" => {
  if (payload && (payload as { suppressExternal?: unknown }).suppressExternal === true) return "suppressed";
  return "new_lead";
};

test("B6: NORMAL lead → external automation bundle unchanged", () => {
  assert.equal(projectSuppress({ source: "agent_website", intent: "buyer" }), "new_lead");
});
test("B7: AUTHORIZED QA lead → external automation suppressed (internal still fires elsewhere)", () => {
  assert.equal(projectSuppress({ source: "agent_website", intent: "buyer", suppressExternal: true, qa: true }), "suppressed");
});
test("B8: a spoofed non-true value does NOT suppress", () => {
  assert.equal(projectSuppress({ suppressExternal: "true" }), "new_lead"); // strict === true only
  assert.equal(projectSuppress({ suppressExternal: 1 }), "new_lead");
});
