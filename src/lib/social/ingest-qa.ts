// ============================================================================
// ZONO — P4.2 ingestion QA (pure, offline). Covers the normalization/validation
// contract of the producer. DB-level idempotency, ON-CONFLICT/23505 dedup, and
// attribution SEMANTICS are validated against a real Postgres (see delivery
// report); this harness guards the pure, untrusted-input handling.
//
// Run: npx tsx src/lib/social/ingest-qa.ts
// ============================================================================
import { normalizeInteractionInput } from "./ingest-normalize";

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // Malformed payloads.
  add("null payload rejected", normalizeInteractionInput(null as never).ok === false);
  add("array payload rejected", normalizeInteractionInput([] as never).ok === false);
  add("empty object rejected (no id, no text)", normalizeInteractionInput({}).ok === false);
  add("whitespace-only text with no id rejected",
    normalizeInteractionInput({ messageText: "   " }).ok === false);

  // Valid: comment with text.
  const c = normalizeInteractionInput({ interactionType: "comment", messageText: "מעוניין במחיר", externalCommentId: "fb_1" });
  add("valid comment accepted", c.ok === true);
  add("comment type preserved", c.ok && c.value.interactionType === "comment");

  // NULL message but has external id (reaction-like) → allowed.
  const r = normalizeInteractionInput({ interactionType: "reaction", externalCommentId: "fb_react_1" });
  add("reaction with id + no text accepted", r.ok === true);
  add("reaction type preserved", r.ok && r.value.interactionType === "reaction" && r.value.messageText === null);

  // Whitelists.
  const bad = normalizeInteractionInput({ platform: "myspace", interactionType: "poke", messageText: "hi" });
  add("unknown platform → null", bad.ok && bad.value.platform === null);
  add("unknown interaction type → defaults to comment", bad.ok && bad.value.interactionType === "comment");
  const good = normalizeInteractionInput({ platform: "facebook", messageText: "hi" });
  add("known platform preserved", good.ok && good.value.platform === "facebook");

  // Text length cap.
  const long = normalizeInteractionInput({ messageText: "x".repeat(9000) });
  add("message text capped at 4000", long.ok && long.value.messageText!.length === 4000);

  // sourcePostId uuid validation.
  const okUuid = "aaaaaaaa-0000-0000-0000-000000000001";
  const su = normalizeInteractionInput({ messageText: "hi", sourcePostId: okUuid });
  add("valid uuid sourcePostId preserved", su.ok && su.value.sourcePostId === okUuid);
  const bu = normalizeInteractionInput({ messageText: "hi", sourcePostId: "not-a-uuid" });
  add("malformed sourcePostId → null (becomes unresolved)", bu.ok && bu.value.sourcePostId === null);

  // Tenancy/attribution ids are NEVER read from the payload.
  const spoof = normalizeInteractionInput({
    messageText: "hi",
    organization_id: "22222222-2222-2222-2222-222222222222",
    property_id: "pp", campaign_id: "cc", group_id: "gg",
  } as never);
  add("client org/property/campaign/group ignored (not in normalized output)",
    spoof.ok && !("organization_id" in spoof.value) && !("property_id" in spoof.value)
      && !("campaign_id" in spoof.value) && !("group_id" in spoof.value));

  // rawPayload object preserved; non-object coerced to {}.
  const rp = normalizeInteractionInput({ messageText: "hi", rawPayload: { a: 1 } });
  add("rawPayload object preserved", rp.ok && (rp.value.rawPayload as { a?: number }).a === 1);
  const rp2 = normalizeInteractionInput({ messageText: "hi", rawPayload: "nope" as never });
  add("non-object rawPayload → {}", rp2.ok && Object.keys(rp2.value.rawPayload).length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}

const res = runSelfCheck();
for (const c of res.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
console.log(`\nP4.2 ingestion QA: ${res.passed}/${res.total} ${res.ok ? "ALL PASS" : "FAILED"}`);
if (!res.ok) process.exit(1);
