// ============================================================================
// ✅ Office Inventory attribution self-tests (pure, offline). Phase 26.5.
// Verifies direct vs broker-derived attribution, conflict flagging (no
// overwrite), strength-based dedupe, and honest non-inclusion.
// ============================================================================
import { attributeLink, stronger, type LinkFacts } from "./attribution";

export interface OICheck { name: string; pass: boolean; detail: string }
export interface OISelfCheck { ok: boolean; total: number; passed: number; checks: OICheck[] }

const link = (o: Partial<LinkFacts>): LinkFacts => ({ linkOfficeId: null, agentId: null, matchReasons: [], ...o });

export function runSelfCheck(): OISelfCheck {
  const checks: OICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Direct link to this office.
  const direct = attributeLink(link({ linkOfficeId: "O1" }), null, "O1", null, "RE/MAX Family");
  add("direct included", direct.included && direct.kind === "direct" && !direct.derived, "");

  // Phone / website matches.
  add("office_phone kind", attributeLink(link({ linkOfficeId: "O1", matchReasons: ["office_phone"] }), null, "O1", null, "x").kind === "office_phone", "");
  add("office_website kind", attributeLink(link({ linkOfficeId: "O1", matchReasons: ["office_website"] }), null, "O1", null, "x").kind === "office_website", "");

  // Derived from broker who belongs to the office.
  const derived = attributeLink(link({ agentId: "B1" }), "O1", "O1", "יוסי כהן", "RE/MAX Family");
  add("derived included", derived.included && derived.kind === "derived_broker" && derived.derived, "");
  add("derived reason names broker", /יוסי כהן/.test(derived.reason), derived.reason);

  // Conflict: link points at a different office than the broker's.
  const conflict = attributeLink(link({ agentId: "B1", linkOfficeId: "O2" }), "O1", "O1", "יוסי כהן", "RE/MAX Family");
  add("conflict flagged", conflict.included && conflict.conflict && !!conflict.conflictNote, "");

  // Not included: broker belongs to a different office, no explicit link here.
  const none = attributeLink(link({ agentId: "B9" }), "O3", "O1", "x", "x");
  add("not included (other office)", !none.included, "");

  // Strength: direct beats derived (dedupe keeps direct).
  add("stronger keeps direct", stronger(direct, derived) === direct, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
