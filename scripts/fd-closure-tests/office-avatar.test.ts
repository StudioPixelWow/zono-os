// ============================================================================
// ZONO — Office Manager 2.0: deterministic pure-unit coverage for the agent
// photo-identity system. The avatar resolution + initials fallback are pure and
// verifiable here; the DB-scoped matrix items (owner-excluded KPI, workload
// counts, unassigned-lead queue, manager-gated assignment, property attribution,
// approval manager-only, cross-org denial, org-scoped agent detail) require the
// authed runtime + live DB and are reported HUMAN_REQUIRED (no fake PASS).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-avatar.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgentAvatar, agentInitials } from "../../src/lib/office/avatar.ts";

// ── avatar resolution priority (member → linked user → null) ─────────────────
test("resolution #1: explicit office_member avatar wins over the linked-user avatar", () => {
  assert.equal(resolveAgentAvatar({ avatarUrl: "/demo/agents/dana.svg", linkedUserAvatarUrl: "/u/x.png" }), "/demo/agents/dana.svg");
});
test("resolution #2: falls back to the linked Auth user's avatar when the member has none", () => {
  assert.equal(resolveAgentAvatar({ avatarUrl: null, linkedUserAvatarUrl: "/u/x.png" }), "/u/x.png");
  assert.equal(resolveAgentAvatar({ avatarUrl: "   ", linkedUserAvatarUrl: "/u/x.png" }), "/u/x.png"); // blank is not a photo
});
test("resolution #3: null when neither exists → UI renders initials (never a broken image)", () => {
  assert.equal(resolveAgentAvatar({ avatarUrl: null, linkedUserAvatarUrl: null }), null);
  assert.equal(resolveAgentAvatar({}), null);
});
test("roster-only member (no avatar, no linked user) resolves to null → initials fallback", () => {
  assert.equal(resolveAgentAvatar({ avatarUrl: null, linkedUserAvatarUrl: null }), null);
  assert.equal(agentInitials("דנה כהן").length, 2);
});

// ── initials fallback ────────────────────────────────────────────────────────
test("initials take the first letter of the first two name parts", () => {
  assert.equal(agentInitials("דנה כהן"), "דכ");
  assert.equal(agentInitials("Michal"), "M");
  assert.equal(agentInitials("  yoav   levi "), "yl");
  assert.equal(agentInitials(""), "?");        // never empty → stable fallback glyph
});
