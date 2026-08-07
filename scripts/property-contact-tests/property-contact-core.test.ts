// ============================================================================
// ZONO — Property Contact CTA core: scenario proof. Pure, no I/O.
// Run: npx tsx --test scripts/property-contact-tests/property-contact-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePropertyContact,
  classifyRepresentation,
  type ResolveContactInput,
} from "@/lib/properties/contact/property-contact-core";

const BASE: ResolveContactInput = {
  ownershipScope: "agent",
  sourceType: "internal",
  exclusivityScope: "none",
  isExclusive: false,
  isAgentExclusive: false,
  isOfficeExclusive: false,
  externalHasAgent: null,
  externalContactType: null,
  ownerPhone: null,
  ownerName: null,
  brokerPhone: null,
  brokerName: null,
  agentName: "דנה כהן",
  propertyLabel: "רחוב הרצל 10, תל אביב",
};
const input = (over: Partial<ResolveContactInput> = {}): ResolveContactInput => ({ ...BASE, ...over });

// 1. private property → WhatsApp owner
test("1 private property resolves a WhatsApp-owner CTA", () => {
  const r = resolvePropertyContact(input({ ownerPhone: "050-123-4567", ownerName: "משה לוי" }));
  assert.equal(r.representation, "private_owner");
  assert.equal(r.contactType, "owner");
  assert.equal(r.whatsappLabel, "שלח WhatsApp לבעל הנכס");
  assert.ok(r.whatsappUrl?.startsWith("https://wa.me/972501234567?text="));
  assert.equal(r.disabled, false);
});

// 2. private property → call owner
test("2 private property resolves a call-owner CTA", () => {
  const r = resolvePropertyContact(input({ ownerPhone: "050-123-4567" }));
  assert.equal(r.telUrl, "tel:+972501234567");
  assert.equal(r.callLabel, "חייג לבעל הנכס");
});

// 3. broker property → WhatsApp broker
test("3 broker property resolves a WhatsApp-broker CTA", () => {
  const r = resolvePropertyContact(input({ externalHasAgent: true, brokerPhone: "052-999-8888", brokerName: "תיווך X" }));
  assert.equal(r.representation, "broker");
  assert.equal(r.contactType, "broker");
  assert.equal(r.whatsappLabel, "שלח WhatsApp למתווך");
  assert.ok(r.whatsappUrl?.startsWith("https://wa.me/972529998888?text="));
});

// 4. broker property → call broker
test("4 broker property resolves a call-broker CTA", () => {
  const r = resolvePropertyContact(input({ externalContactType: "broker", brokerPhone: "052-999-8888" }));
  assert.equal(r.contactType, "broker");
  assert.equal(r.telUrl, "tel:+972529998888");
  assert.equal(r.callLabel, "חייג למתווך");
});

// 5. exclusive broker property → broker, NEVER owner (even when an owner phone exists)
test("5 broker-exclusive routes to the broker, not the owner", () => {
  const r = resolvePropertyContact(input({
    externalHasAgent: true, isExclusive: true,
    ownerPhone: "050-111-1111", ownerName: "בעלים",
    brokerPhone: "052-999-8888", brokerName: "תיווך בלעדי",
  }));
  assert.equal(r.representation, "broker_exclusive");
  assert.equal(r.contactType, "broker");
  assert.equal(r.badgeLabel, "נכס בבלעדיות מתווך");
  assert.equal(r.displayPhone, "972529998888"); // broker's, not the owner's
  assert.ok(!r.whatsappUrl?.includes("9721111111"));
});

// 6. missing phone → honest disabled state
test("6 missing phone yields an honest disabled CTA", () => {
  const r = resolvePropertyContact(input({ externalHasAgent: true, brokerPhone: null }));
  assert.equal(r.disabled, true);
  assert.equal(r.whatsappUrl, null);
  assert.equal(r.telUrl, null);
  assert.equal(r.message, null);
  assert.equal(r.emptyLabel, "אין מספר טלפון זמין");
});

// 7. logged-in agent name appears in the WhatsApp text
test("7 the agent name appears in the WhatsApp message", () => {
  const r = resolvePropertyContact(input({ ownerPhone: "0501234567", agentName: "יעל אברהם" }));
  assert.ok(r.message?.includes("יעל אברהם"));
  const text = decodeURIComponent(new URL(r.whatsappUrl!).searchParams.get("text")!);
  assert.ok(text.includes("יעל אברהם"));
  assert.ok(text.includes("סוכן נדל״ן"));
});

// 8. Israeli phone normalization across formats
test("8 phone normalization handles IL formats", () => {
  for (const raw of ["050-123-4567", "+972 50 1234567", "00972501234567", "972501234567", "0501234567"]) {
    const r = resolvePropertyContact(input({ ownerPhone: raw }));
    assert.equal(r.displayPhone, "972501234567", `failed for ${raw}`);
    assert.equal(r.telUrl, "tel:+972501234567");
  }
});

// 9. Hebrew is URL-encoded in the wa.me link and round-trips
test("9 Hebrew message is URL-encoded and decodes back exactly", () => {
  const r = resolvePropertyContact(input({ ownerPhone: "0501234567" }));
  const encoded = r.whatsappUrl!.split("?text=")[1];
  assert.ok(/%D7/.test(encoded)); // Hebrew bytes are percent-encoded
  assert.ok(!/[א-ת]/.test(encoded)); // no raw Hebrew leaked into the URL
  assert.equal(decodeURIComponent(encoded), r.message);
});

// 10. classification edge — ownership_scope carries the broker signal
test("10 ownership_scope=broker classifies as broker", () => {
  assert.equal(classifyRepresentation(input({ ownershipScope: "broker" })), "broker");
});

// 11. our OWN exclusivity is not broker-exclusive (agent/office exclusive stays 'broker')
test("11 our own agent/office exclusivity is not broker_exclusive", () => {
  const r = classifyRepresentation(input({ externalHasAgent: true, isExclusive: true, isAgentExclusive: true }));
  assert.equal(r, "broker");
  const r2 = classifyRepresentation(input({ externalHasAgent: true, isExclusive: true, exclusivityScope: "office_exclusive", isOfficeExclusive: true }));
  assert.equal(r2, "broker");
});

// 12. default (no broker signal at all) is a private owner
test("12 no representation signal defaults to private_owner", () => {
  assert.equal(classifyRepresentation(input()), "private_owner");
});
