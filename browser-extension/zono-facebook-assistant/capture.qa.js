/* eslint-disable @typescript-eslint/no-require-imports */
// ============================================================================
// ZONO Facebook Assistant — capture helper QA (P4.3). Pure, offline, Node.
// Run: node browser-extension/zono-facebook-assistant/capture.qa.js
// Covers the high-risk logic: validation, EXACT payload contract (no tenancy
// fields), response classification, and bounded retry backoff. UI/DOM behavior
// (double-click guard, clear-on-new-post, 404-disable) is exercised in popup.js
// and is NOT covered here (see delivery report "not live-tested").
// ============================================================================
const C = require("./capture.js");

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log("FAIL  " + name); } };

// ── validateCaptureInput ─────────────────────────────────────────────────────
ok("empty form rejected", C.validateCaptureInput({}).ok === false);
ok("null form rejected", C.validateCaptureInput(null).ok === false);
ok("whitespace-only text + no id rejected", C.validateCaptureInput({ messageText: "   " }).ok === false);
ok("comment with text accepted", C.validateCaptureInput({ interactionType: "comment", messageText: "מחיר?" }).ok === true);
const reaction = C.validateCaptureInput({ interactionType: "reaction", externalCommentId: "fb_r1" });
ok("reaction with id + empty text accepted", reaction.ok === true && reaction.value.messageText === undefined);
ok("unknown type defaults to comment", C.validateCaptureInput({ interactionType: "poke", messageText: "hi" }).value.interactionType === "comment");
ok("text trimmed", C.validateCaptureInput({ messageText: "  hi  " }).value.messageText === "hi");
ok("text capped at 4000", C.validateCaptureInput({ messageText: "x".repeat(9000) }).value.messageText.length === 4000);
ok("empty optional -> undefined (omitted)", C.validateCaptureInput({ messageText: "hi", personName: "   " }).value.personName === undefined);
const heb = C.validateCaptureInput({ messageText: "שלום עולם 🏠", externalCommentId: "fb1" });
ok("unicode/hebrew preserved", heb.ok === true && heb.value.messageText === "שלום עולם 🏠");

// ── buildCapturePayload: EXACT contract, no tenancy fields ────────────────────
const v = C.validateCaptureInput({ interactionType: "comment", messageText: "hi", externalCommentId: "fb1", personName: "Dana" }).value;
const payload = C.buildCapturePayload("aaaaaaaa-0000-0000-0000-000000000001", v);
ok("sourcePostId from caller only", payload.sourcePostId === "aaaaaaaa-0000-0000-0000-000000000001");
ok("platform is facebook", payload.platform === "facebook");
ok("includes provided fields", payload.externalCommentId === "fb1" && payload.messageText === "hi" && payload.personName === "Dana");
ok("omits empty optionals", !("externalPostId" in payload) && !("profileUrl" in payload));
const ALLOWED = ["sourcePostId", "platform", "interactionType", "externalCommentId", "externalPostId", "externalPostUrl", "personName", "profileUrl", "messageText"];
ok("no key outside the allowed set", Object.keys(payload).every((k) => ALLOWED.indexOf(k) >= 0));
["organizationId", "propertyId", "campaignId", "groupId", "leadId", "orgId"].forEach((k) => {
  ok("never sends " + k, !(k in payload));
});
// Even if a value object were polluted, build only reads known fields.
const polluted = C.buildCapturePayload("p1", Object.assign({ interactionType: "comment", messageText: "hi" }, { organizationId: "x", campaignId: "y", groupId: "z", propertyId: "w" }));
ok("build ignores polluted tenancy keys", !("organizationId" in polluted) && !("campaignId" in polluted) && !("groupId" in polluted) && !("propertyId" in polluted));

// ── classifyCaptureResponse ──────────────────────────────────────────────────
ok("200 ok -> success", C.classifyCaptureResponse(200, { ok: true, id: "i1", deduped: false, attribution: "post" }).kind === "success");
ok("success carries attribution", C.classifyCaptureResponse(200, { ok: true, attribution: "unresolved" }).attribution === "unresolved");
ok("deduped true surfaced (treated as success)", C.classifyCaptureResponse(200, { ok: true, deduped: true }).deduped === true);
ok("400 -> invalid", C.classifyCaptureResponse(400, { error: "empty_interaction" }).kind === "invalid");
ok("401 -> unauthorized", C.classifyCaptureResponse(401, {}).kind === "unauthorized");
ok("404 -> disabled", C.classifyCaptureResponse(404, {}).kind === "disabled");
ok("429 -> rate_limited", C.classifyCaptureResponse(429, {}).kind === "rate_limited");
ok("500 -> retryable", C.classifyCaptureResponse(500, {}).kind === "retryable");
ok("network (status 0) -> retryable", C.classifyCaptureResponse(0, null).kind === "retryable");
ok("odd 3xx -> error", C.classifyCaptureResponse(302, {}).kind === "error");

// ── nextRetryDelay: bounded, increasing ──────────────────────────────────────
ok("retry delay increases", C.nextRetryDelay(0) < C.nextRetryDelay(1));
ok("retry delay capped at 2000", C.nextRetryDelay(10) === 2000);
ok("max retries is 2", C.MAX_RETRIES === 2);

console.log(`\nP4.3 capture QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
