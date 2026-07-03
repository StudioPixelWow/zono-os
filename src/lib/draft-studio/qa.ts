// ============================================================================
// ✅ Draft Studio — self-tests (pure, offline). 30.3. Part 10.
// Buyer / Seller / Lead / Broker / Office / Luxury / Negotiation / Reminder /
// No Data / Large CRM. Verifies channels, explainability, versioning, approval-
// gating (never sends) and personalization.
// ============================================================================
import { buildDraftBundle } from "./generate";
import type { CommContext, DraftRequest, EntityKind, Channel, Purpose, Tone, Draft } from "./types";

export interface DSCheck { name: string; pass: boolean; detail: string }
export interface DSSelfCheck { ok: boolean; total: number; passed: number; checks: DSCheck[] }

const ctx = (o: Partial<CommContext> = {}): CommContext => ({
  entityKind: "buyer", entityId: "B1", name: "רון כהן", firstName: "רון",
  brokerName: "דנה לוי", officeName: "זונו נדל\"ן", journeyStage: "qualified",
  trust: 70, relationshipPath: ["דנה לוי"], truthScore: 65,
  recommendation: "שלח נכסים מתאימים", strategy: "SEND_PROPERTIES", reason: "קונה חם עם התאמות",
  missionGoal: "קדם לסגירה", lastActivity: "01/07", facts: ["3 התאמות מושלמות", "תקציב ₪2.1M"],
  preferences: ["3 חדרים", "מרכז העיר"], propertyTitle: "דירה ברחוב הרצל 10", price: 2100000, ...o,
});
const req = (o: Partial<DraftRequest> = {}): DraftRequest => ({ channel: "whatsapp", purpose: "follow_up", tone: "professional", language: "he", ...o });

const validDraft = (d: Draft) => !!d.body && d.requiresApproval === true && d.explain.why.length > 0 && d.explain.goal.length > 0 && typeof d.explain.confidence === "number" && d.explain.evidence.length > 0;

export function runSelfCheck(): DSSelfCheck {
  const checks: DSCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const b = buildDraftBundle(ctx(), req());
  add("bundle has primary + 4 versions", validDraft(b.primary) && validDraft(b.versions.short) && validDraft(b.versions.long) && validDraft(b.versions.alternative) && validDraft(b.versions.altTone), "");
  add("personalization — name in body", b.primary.body.includes("רון") && b.primary.body.includes("דנה"), "");
  add("all drafts approval-gated (never send)", [b.primary, b.versions.short, b.versions.long, b.versions.alternative, b.versions.altTone].every((d) => d.requiresApproval === true), "");
  add("short version shorter than long", b.versions.short.body.length < b.versions.long.body.length, `${b.versions.short.body.length}<${b.versions.long.body.length}`);
  add("altTone differs from primary tone", b.versions.altTone.tone !== b.primary.tone, `${b.primary.tone}/${b.versions.altTone.tone}`);
  add("no-send note present", b.notes.some((n) => n.includes("אישור")), "");

  // Channels: whatsapp / sms / email / call.
  const email = buildDraftBundle(ctx(), req({ channel: "email" }));
  add("email has subject", email.primary.subject !== null && email.primary.subject!.length > 0, email.primary.subject ?? "");
  const sms = buildDraftBundle(ctx(), req({ channel: "sms" }));
  add("sms short + no subject", sms.primary.subject === null && sms.primary.body.length < 220, `${sms.primary.body.length}`);
  const call = buildDraftBundle(ctx(), req({ channel: "call", purpose: "negotiation" }));
  add("call script structured", /פתיחה|מסר|סגירה/.test(call.primary.body), "");

  // Entities: buyer/seller/lead/broker/office.
  const entities: EntityKind[] = ["buyer", "seller", "lead", "broker", "office", "property", "mission", "customer"];
  add("all entity kinds compose", entities.every((k) => validDraft(buildDraftBundle(ctx({ entityKind: k, entityId: k }), req()).primary)), "");

  // Luxury tone.
  const lux = buildDraftBundle(ctx({ propertyTitle: "פנטהאוז יוקרה", price: 12000000 }), req({ tone: "luxury", channel: "email", purpose: "listing_update" }));
  add("luxury tone drafts", validDraft(lux.primary) && lux.primary.tone === "luxury" && lux.primary.body.length > 0, "");

  // Negotiation.
  const neg = buildDraftBundle(ctx({ entityKind: "seller", facts: ["פער מחיר 6% מעל השוק"] }), req({ purpose: "negotiation", tone: "negotiation" }));
  add("negotiation uses evidence", neg.primary.explain.evidence.some((e) => e.includes("פער")) && neg.primary.body.length > 0, "");

  // Reminder.
  const rem = buildDraftBundle(ctx(), req({ purpose: "reminder" }));
  add("reminder purpose", rem.primary.purpose === "reminder" && rem.primary.explain.goal.length > 0, "");

  // No data.
  const empty = buildDraftBundle({ entityKind: "lead", entityId: "L0", name: "ליד", firstName: "", brokerName: null, officeName: null, journeyStage: null, trust: null, relationshipPath: [], truthScore: null, recommendation: null, strategy: null, reason: null, missionGoal: null, lastActivity: null, facts: [], preferences: [], propertyTitle: null, price: null }, req());
  add("no-data still produces a valid draft + low confidence", validDraft(empty.primary) && empty.primary.explain.confidence <= 70 && empty.notes.some((n) => n.includes("דל")), `${empty.primary.explain.confidence}`);

  // Large CRM — performance.
  const t0 = Date.now();
  for (let i = 0; i < 400; i++) buildDraftBundle(ctx({ entityId: `B${i}` }), req({ channel: (["whatsapp", "email", "sms", "call"] as Channel[])[i % 4], purpose: (["follow_up", "reminder", "negotiation", "price_discussion"] as Purpose[])[i % 4], tone: (["professional", "friendly", "luxury", "urgent"] as Tone[])[i % 4] }));
  const elapsed = Date.now() - t0;
  add("large CRM performance < 400ms (400 bundles)", elapsed < 400, `${elapsed}ms`);

  // English language.
  const en = buildDraftBundle(ctx(), req({ language: "en" }));
  add("english language", /Hi|Hello|Dear|regards/i.test(en.primary.body), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
