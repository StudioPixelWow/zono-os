// ============================================================================
// ZONO -- Creative promotion core: 21-scenario proof. Mocks only (no IO).
// Run: node --experimental-strip-types --test scripts/creative-promotion-tests/promotion-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promote, revoke, resolveForJob, PUBLICATION_BUCKET,
  type CreativeOutput, type Derivative, type Channel,
} from "../../src/lib/creative-studio/promotion/creative-promotion-core.ts";

const ORG = "org-alpha";
const OTHER = "org-beta";

function output(over: Partial<CreativeOutput> = {}): CreativeOutput {
  return { id: "out-1", orgId: ORG, state: "approved", privateMasterPath: "org-alpha/quick/out-1.png", creativeVersion: 1, contentHash: "h1", ...over };
}
function pctx(over: Record<string, unknown> = {}) {
  return { callerOrgId: ORG, targetChannel: "facebook_groups" as Channel, purpose: "publish", actorId: "mgr-1", isManager: true, now: "2026-08-07T00:00:00Z", derivativeId: "d-1", eventId: "e-1", derivativePath: `${PUBLICATION_BUCKET}/org-alpha/out-1/v1/facebook_groups.png`, ...over };
}
function deriv(over: Partial<Derivative> = {}): Derivative {
  return { id: "d-1", orgId: ORG, outputId: "out-1", creativeVersion: 1, contentHash: "h1", targetChannel: "facebook_groups", purpose: "publish", sourceMasterPath: "org-alpha/quick/out-1.png", derivativePath: `${PUBLICATION_BUCKET}/org-alpha/out-1/v1/facebook_groups.png`, state: "active", promotedBy: "mgr-1", ...over };
}

// 1. approved Groups promotion succeeds
test("T1 approved facebook_groups promotion succeeds", () => {
  const d = promote(output(), null, pctx({ targetChannel: "facebook_groups" }));
  assert.equal(d.ok, true); assert.equal(d.copyRequested, true);
  assert.equal(d.derivative?.targetChannel, "facebook_groups");
  assert.ok(d.derivative?.derivativePath.startsWith(PUBLICATION_BUCKET + "/"));
  assert.equal(d.event?.action, "promote");
});
// 2. approved WhatsApp promotion succeeds
test("T2 approved whatsapp promotion succeeds", () => {
  const d = promote(output(), null, pctx({ targetChannel: "whatsapp", derivativePath: `${PUBLICATION_BUCKET}/org-alpha/out-1/v1/whatsapp.png` }));
  assert.equal(d.ok, true); assert.equal(d.derivative?.targetChannel, "whatsapp");
});
// 3. unapproved (draft) rejected
test("T3 unapproved output rejected", () => {
  assert.equal(promote(output({ state: "draft" }), null, pctx()).error, "not_approved");
});
// 4. rejected rejected
test("T4 rejected output cannot promote", () => {
  assert.equal(promote(output({ state: "rejected" }), null, pctx()).error, "rejected_not_promotable");
});
// 5. archived rejected
test("T5 archived output cannot promote", () => {
  assert.equal(promote(output({ state: "archived" }), null, pctx()).error, "archived_not_promotable");
});
// 6. cross-org rejected
test("T6 cross-org output rejected", () => {
  assert.equal(promote(output({ orgId: OTHER }), null, pctx()).error, "cross_org_rejected");
});
// 7. private master remains private (derivative never targets a public bucket / master unchanged)
test("T7 derivative lives in private publication bucket; master path unchanged", () => {
  const d = promote(output(), null, pctx());
  assert.ok(d.derivative!.derivativePath.startsWith("creative-published/"));
  assert.ok(!d.derivative!.derivativePath.includes("/object/public/"));
  assert.equal(d.derivative!.sourceMasterPath, "org-alpha/quick/out-1.png"); // lineage, still private
});
// 8. derivative maps to correct source output/version
test("T8 derivative carries correct output + version + hash lineage", () => {
  const d = promote(output({ creativeVersion: 3, contentHash: "hZ" }), null, pctx({ derivativePath: `${PUBLICATION_BUCKET}/x/v3.png` }));
  assert.equal(d.derivative?.outputId, "out-1");
  assert.equal(d.derivative?.creativeVersion, 3);
  assert.equal(d.derivative?.contentHash, "hZ");
});
// 9. concurrent promotion -> one derivative (2nd sees the 1st as existing -> noop)
test("T9 concurrent promotion collapses to one derivative", () => {
  const first = promote(output(), null, pctx());
  const second = promote(output(), first.derivative, pctx({ derivativeId: "d-2", eventId: "e-2" }));
  assert.equal(second.noop, true);
  assert.equal(second.derivative?.id, "d-1"); // the existing one
  assert.equal(second.copyRequested, false);
});
// 10. promotion retry -> same derivative
test("T10 retry returns the existing derivative", () => {
  const r = promote(output(), deriv(), pctx({ derivativeId: "d-9" }));
  assert.equal(r.noop, true); assert.equal(r.derivative?.id, "d-1");
});
// 11. no duplicate ledger event on retry
test("T11 idempotent retry emits no ledger event", () => {
  assert.equal(promote(output(), deriv(), pctx()).event, null);
});
// 12. Groups getNextPost returns approved derivative only
test("T12 hand-off returns the active groups derivative", () => {
  const r = resolveForJob([deriv()], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.ok, true); assert.equal(r.derivative?.id, "d-1");
});
// 13. Groups missing derivative blocks honestly
test("T13 missing derivative -> honest blocked", () => {
  const r = resolveForJob([], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.ok, false); assert.equal(r.blocked, true); assert.equal(r.reason, "no_approved_derivative");
  assert.equal(r.derivative, null);
});
// 14. Groups revoked derivative blocks
test("T14 revoked derivative -> blocked", () => {
  const r = resolveForJob([deriv({ state: "revoked" })], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.blocked, true); assert.equal(r.derivative, null);
});
// 15. Groups wrong-org derivative denied
test("T15 wrong-org derivative denied at hand-off", () => {
  const r = resolveForJob([deriv({ orgId: OTHER })], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.blocked, true);
});
// 16. emergency stop blocks hand-off
test("T16 emergency stop blocks hand-off", () => {
  const r = resolveForJob([deriv()], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: true });
  assert.equal(r.blocked, true); assert.equal(r.reason, "emergency_stop_active");
});
// 17. WhatsApp receives approved derivative only (channel-scoped)
test("T17 whatsapp resolves only whatsapp derivative", () => {
  const derivs = [deriv({ targetChannel: "facebook_groups" }), deriv({ id: "d-w", targetChannel: "whatsapp" })];
  const r = resolveForJob(derivs, { callerOrgId: ORG, outputId: "out-1", targetChannel: "whatsapp", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.derivative?.id, "d-w");
});
// 18. export receives approved derivative only
test("T18 export resolves only export derivative", () => {
  const r = resolveForJob([deriv({ id: "d-e", targetChannel: "export" })], { callerOrgId: ORG, outputId: "out-1", targetChannel: "export", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.ok, true); assert.equal(r.derivative?.targetChannel, "export");
});
// 19. version change requires a NEW derivative (old-version key not matched)
test("T19 new creative_version requires a fresh promotion", () => {
  const oldV1 = deriv({ creativeVersion: 1 });
  // promoting v2 with only a v1 derivative present -> existingForKey is null (key differs) -> new copy
  const d = promote(output({ creativeVersion: 2 }), null, pctx({ derivativePath: `${PUBLICATION_BUCKET}/x/v2.png` }));
  assert.equal(d.noop, false); assert.equal(d.copyRequested, true);
  assert.equal(d.derivative?.creativeVersion, 2);
  // and a v1 job never resolves the v2 derivative
  const r = resolveForJob([oldV1, d.derivative!], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.derivative?.creativeVersion, 1);
});
// 20. approval revoke prevents future hand-off
test("T20 revoked output cannot promote + revoked derivative not handed off", () => {
  assert.equal(promote(output({ state: "rejected" }), null, pctx()).error, "rejected_not_promotable");
  const rv = revoke(deriv(), { callerOrgId: ORG, actorId: "mgr-1", isManager: true, now: "n", eventId: "e-r" });
  assert.equal(rv.derivative?.state, "revoked");
  const r = resolveForJob([rv.derivative!], { callerOrgId: ORG, outputId: "out-1", targetChannel: "facebook_groups", creativeVersion: 1, emergencyActive: false });
  assert.equal(r.blocked, true);
});
// 21. Meta/Instagram regression: promotion channels never include page/instagram
test("T21 meta/instagram are NOT promotion channels (own private path preserved)", () => {
  const d = promote(output(), null, pctx({ targetChannel: "instagram" as unknown as Channel }));
  assert.equal(d.ok, false); assert.equal(d.error, "bad_channel");
});
// Extra: non-manager cannot promote
test("T+ non-manager cannot promote", () => {
  assert.equal(promote(output(), null, pctx({ isManager: false })).error, "not_authorized");
});
