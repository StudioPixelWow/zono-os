// ============================================================================
// ZONO — Public office website: deterministic pure coverage for the property →
// responsible-member attribution (the core of the office-first rebuild). The
// DB/service-role assembly (team from office_members, show_on_website filtering,
// public-DTO privacy, lead property/member context, cross-org isolation, agent
// profile) requires the live DB + runtime and is reported HUMAN_REQUIRED / audit-
// verified (no fake PASS).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-website.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveResponsibleMemberId } from "../../src/lib/office-website/attribution.ts";

const PUBLIC = new Set(["m_dana", "m_yoav", "m_manager"]);
const BY_USER = new Map([["u_manager", "m_manager"]]); // only the manager has an Auth login

test("attribution #1: office_member_id wins when it is a public in-org member", () => {
  assert.equal(resolveResponsibleMemberId({ office_member_id: "m_dana", owner_id: "u_manager" }, PUBLIC, BY_USER), "m_dana");
});
test("attribution #2: legacy owner_id → linked public member when no office_member_id", () => {
  assert.equal(resolveResponsibleMemberId({ office_member_id: null, owner_id: "u_manager" }, PUBLIC, BY_USER), "m_manager");
});
test("attribution #3: no attribution → null (office contact, never invented)", () => {
  assert.equal(resolveResponsibleMemberId({ office_member_id: null, owner_id: null }, PUBLIC, BY_USER), null);
  assert.equal(resolveResponsibleMemberId({ office_member_id: null, owner_id: "u_unknown" }, PUBLIC, BY_USER), null);
});
test("privacy: a NON-public / cross-org office_member_id never resolves (not exposed)", () => {
  // m_internal is not in the public set (private or another org) → falls through,
  // and with no linked public owner it resolves to null, never leaking the member.
  assert.equal(resolveResponsibleMemberId({ office_member_id: "m_internal", owner_id: null }, PUBLIC, BY_USER), null);
  // Even with an owner that maps to a public member, a private office_member_id
  // does NOT get promoted — the owner fallback still yields the public member.
  assert.equal(resolveResponsibleMemberId({ office_member_id: "m_internal", owner_id: "u_manager" }, PUBLIC, BY_USER), "m_manager");
});
test("roster-only public member (no Auth login) is fully attributable by office_member_id", () => {
  // דנה/יואב are non-auth roster members (not in BY_USER) yet resolve directly.
  assert.equal(resolveResponsibleMemberId({ office_member_id: "m_yoav", owner_id: null }, PUBLIC, BY_USER), "m_yoav");
});
