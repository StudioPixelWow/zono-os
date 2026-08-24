// ============================================================================
// ZONO 9.3 — SILENT LEAD-INTAKE OBSERVABILITY regression tests.
// Proves every public/external lead intake either becomes exactly ONE correctly-
// attributed canonical CRM lead + its downstream event, or FAILS VISIBLY:
//   • CRM insert failure → honest retryable failure + audit record, NO fake success,
//     NO lead.created event (office / agent / property);
//   • lead.created is emitted with the TRUSTED server-resolved org (so it actually
//     persists on an unauthenticated path) + an idempotency key (exactly-once),
//     and a real ok:false is recorded — never ignored;
//   • duplicate submits are deduped; attribution + org isolation hold;
//   • the customer only ever sees Hebrew-safe copy (no SQL/enum/UUID/stack).
// Behavioral for the pure rules (classifier + Hebrew copy); source-closure for the
// server-only wiring. No @/ alias (fd runner).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/lead-intake-observability-9-3.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyLeadError, LEAD_INTAKE_OK, LEAD_INTAKE_RETRY } from "../../src/lib/lead-intake/rules.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");
const office = () => src("lib/office-website/service.ts");
const agent = () => src("lib/agent-website/service.ts");
const property = () => src("lib/property-marketing/actions.ts");

// ── 1/2/3. Success path emits the OBSERVED canonical event with the trusted org ─
test("office/agent/property success paths emit lead.created via the observed helper (trusted org)", () => {
  assert.match(office(), /emitLeadCreatedObserved\(\{ orgId, leadId, source: "website"/, "office emits observed with the slug-resolved org");
  assert.match(agent(), /emitLeadCreatedObserved\(\{ orgId: s\.organization_id, leadId, source: "agent_website"/, "agent emits observed with the site's org");
  assert.match(property(), /emitLeadCreatedObserved\(\{ orgId: p\.org_id, leadId, source: "property_marketing_page"/, "property emits observed with the property's org");
});

// ── 4. FB lead consistency (9.1 preserved, now observed) ──────────────────────
test("Facebook-comment lead routes through the same observed emit (not a parallel path)", () => {
  const fb = src("lib/distribution/comment-lead-bridge.ts");
  assert.match(fb, /emitLeadCreatedObserved\(\{[\s\S]*orgId, leadId: crmLeadId, source: "facebook"/, "FB uses the shared observed emit with its org + lead");
  assert.match(fb, /alreadyPromoted/, "the 9.1 replay guard is preserved");
});

// ── 5. lead.created emitted EXACTLY ONCE where required (idempotency key) ──────
test("the observed emit carries an idempotency key so a retry never double-fires downstream", () => {
  const obs = src("lib/lead-intake/observability.ts");
  assert.match(obs, /idempotencyKey: `lead\.created:\$\{e\.leadId\}`/, "one canonical event per lead id (outbox-deduped on replay)");
  assert.match(obs, /orgId: e\.orgId/, "the emit passes the explicit trusted org (fixes the silent ok:false drop on public paths)");
});

// ── 6. Primary (CRM) write failure is SURFACED — no fake success ──────────────
test("a failed CRM insert returns a retryable failure + audits it + emits no event", () => {
  for (const [name, s] of [["office", office()], ["agent", agent()], ["property", property()]] as const) {
    assert.match(s, /if \(!leadId\) \{[\s\S]*recordLeadIntakeFailure\(\{[\s\S]*stage: "crm_write"[\s\S]*return \{[\s\S]*LEAD_INTAKE_RETRY/, `${name}: CRM failure → audit + honest retryable failure`);
  }
  // The old fake-success pattern is gone: no path swallows the insert in a bare catch
  // and then returns ok:true unconditionally.
  assert.doesNotMatch(office(), /keep raw lead below \*\/ \}\n\n?\s*await admin\.from\("office_website_leads"\)[\s\S]*return \{ ok: true \};\n\}/, "office no longer returns ok:true regardless of the CRM result");
});

// ── 7. Secondary (mirror) write failure is OBSERVABLE (best-effort, non-blocking) ─
test("a mirror-insert failure is recorded but does not fail a valid CRM lead", () => {
  assert.match(office(), /if \(mirrorErr\) await recordLeadIntakeFailure\(\{[\s\S]*stage: "mirror_write"/, "office mirror error is recorded observably");
  assert.match(agent(), /if \(mirrorErr\) await recordLeadIntakeFailure\(\{[\s\S]*stage: "mirror_write"/, "agent mirror error is recorded observably");
});

// ── 8. emit ok:false is OBSERVABLE, never ignored ─────────────────────────────
test("emitLeadCreatedObserved records a real ok:false (not a dedupe) as an event_emit failure", () => {
  const obs = src("lib/lead-intake/observability.ts");
  assert.match(obs, /if \(!res\.ok && !res\.deduped\) \{[\s\S]*recordLeadIntakeFailure\(\{[\s\S]*stage: "event_emit"/, "a genuine emit failure is audited; a dedupe is not a failure");
});

// ── 9. Duplicate-submit idempotency on all three public paths ─────────────────
test("office/agent/property all dedupe a repeated submission within a short window", () => {
  assert.match(office(), /DEDUPE_WINDOW_MS[\s\S]*office_website_leads[\s\S]*return \{ ok: true \}/, "office 2-min dedupe (7.1) preserved");
  assert.match(agent(), /2 \* 60 \* 1000[\s\S]*agent_website_leads[\s\S]*return \{ ok: true \}/, "agent dedupe added");
  assert.match(property(), /2 \* 60 \* 1000[\s\S]*\.eq\("property_id", p\.id\)[\s\S]*return \{ ok: true \}/, "property dedupe added (by org+property+contact)");
});

// ── 10. source_section preserved ──────────────────────────────────────────────
test("office + agent preserve source_section into the mirror and the event", () => {
  assert.match(office(), /source_section: input\.sourceSection/, "office mirror keeps source_section");
  assert.match(office(), /emitLeadCreatedObserved\(\{ orgId, leadId, source: "website", sourceSection: input\.sourceSection/, "office event carries source_section");
  assert.match(agent(), /emitLeadCreatedObserved\(\{ orgId: s\.organization_id, leadId, source: "agent_website", sourceSection: input\.sourceSection/, "agent event carries source_section");
});

// ── 11. Property attribution preserved (property + agent + office member) ──────
test("property lead preserves property_id + owner_id + office_member_id (server-resolved)", () => {
  assert.match(property(), /org_id: p\.org_id, owner_id: agentId, office_member_id: p\.office_member_id \?\? null, property_id: p\.id/, "full property attribution, all from the trusted property row");
  assert.match(property(), /const intent = p\.listing_kind === "rent" \? "renter" : "buyer"/, "sale→buyer / rent→renter preserved (7.0/7.1)");
});

// ── 12. Agent attribution preserved (owner = the site's agent) ────────────────
test("agent lead is owned by the site's agent, and a suspended agent creates no lead", () => {
  assert.match(agent(), /org_id: s\.organization_id, owner_id: s\.user_id/, "agent lead auto-routed to the site's agent");
  assert.match(agent(), /if \(\(agentUser as \{ status: string \} \| null\)\?\.status !== "active"\) return \{ ok: false/, "9.2B suspended-agent fail-closed guard preserved");
});

// ── 13. Org isolation — org is server-resolved, never client-supplied ─────────
test("org_id is resolved from the public entity (slug/property), never from client input", () => {
  assert.match(office(), /from\("office_websites"\)[\s\S]*\.eq\("slug", slug\)[\s\S]*organization_id/, "office org from the slug row");
  assert.match(property(), /from\("properties"[\s\S]*\.eq\("id", propertyId\)[\s\S]*org_id: p\.org_id/, "property org from the property row");
  // No path reads an org/owner id from the client input object.
  assert.doesNotMatch(office(), /input\.(orgId|org_id|ownerId|owner_id)/, "office never trusts a client org/owner");
  assert.doesNotMatch(property(), /input\.(orgId|org_id|ownerId|owner_id)/, "property never trusts a client org/owner");
});

// ── 14. Customer-facing copy is Hebrew-safe (behavioral) ──────────────────────
test("customer-facing lead copy is Hebrew and leaks no SQL/enum/UUID/English stack", () => {
  for (const s of [LEAD_INTAKE_OK, LEAD_INTAKE_RETRY]) {
    assert.ok(/[֐-׿]/.test(s), "message is Hebrew");
    assert.doesNotMatch(s, /select|insert|constraint|enum|null value|[0-9a-f]{8}-[0-9a-f]{4}|error|undefined/i, "no technical leakage");
  }
  // The public services surface only the sanitized retry message on failure.
  assert.match(office(), /return \{ ok: false as const, error: LEAD_INTAKE_RETRY \}/);
  assert.match(property(), /return \{ error: LEAD_INTAKE_RETRY \}/);
});

// ── error classification (§14 point 8) — behavioral ───────────────────────────
test("classifyLeadError buckets errors into safe, non-PII categories", () => {
  assert.equal(classifyLeadError(new Error("duplicate key value violates unique constraint")), "duplicate");
  assert.equal(classifyLeadError(new Error("fetch failed: ETIMEDOUT")), "db_timeout");
  assert.equal(classifyLeadError(new Error("new row violates row-level security policy")), "db_permission");
  assert.equal(classifyLeadError(new Error("invalid input value for enum lead_source")), "db_constraint");
  assert.equal(classifyLeadError({ message: "null value in column phone" }), "db_constraint");
  assert.equal(classifyLeadError(""), "unknown");
  assert.equal(classifyLeadError(null), "unknown");
  assert.equal(classifyLeadError(new Error("something odd")), "db_error");
});
