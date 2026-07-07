// ============================================================================
// 🤝 ZONO — Client Experience 2.0 — offline self-check (pure). PHASE 56.0.
// Spec QA (privacy-first): buyer sees only own data, seller sees only own
// property, documents safe, offers safe, timeline safe, AI redacted, mobile UX.
// ============================================================================
import { assembleClientExperience, redactItems, scopedAnswerGuard } from "./assemble";
import type { ClientSourceBundle, SourceItem } from "./types";

const item = (over: Partial<SourceItem>): SourceItem => ({ at: "2026-07-01T10:00:00.000Z", title: "פריט", kind: "update", ...over });

function bundle(items: SourceItem[], clientId = "me"): ClientSourceBundle {
  return { role: "buyer", clientId, clientName: "דנה", items };
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Buyer sees only own data — items owned by another client are dropped.
  const r1 = assembleClientExperience(bundle([
    item({ id: "mine", kind: "appointment", title: "סיור שלי", ownerId: "me" }),
    item({ id: "other", kind: "appointment", title: "סיור של מישהו אחר", ownerId: "other" }),
    item({ id: "shared", kind: "document", title: "מדריך", ownerId: null }),
  ]));
  add("buyer isolation: other client's item dropped", r1.timeline.some((t) => t.id === "mine") && !r1.timeline.some((t) => t.id === "other") && r1.timeline.some((t) => t.id === "shared"));

  // 2. Internal-visibility items never surface.
  const r2 = assembleClientExperience(bundle([
    item({ id: "pub", kind: "status", title: "עודכן סטטוס" }),
    item({ id: "sec", kind: "status", title: "הערת משרד פנימית", visibility: "internal" }),
  ]));
  add("visibility: internal item dropped", r2.timeline.some((t) => t.id === "pub") && !r2.timeline.some((t) => t.id === "sec"));

  // 3. Internal notes are stripped even on visible items.
  const red = redactItems([item({ id: "x", title: "מסמך", internalNote: "עמלה 2%" })], "me");
  add("redaction: internal note stripped", red[0].internalNote === null);

  // 4. Documents block is client-safe + grouped.
  const r4 = assembleClientExperience(bundle([item({ id: "d1", kind: "document", title: "חוזה" }), item({ id: "d2", kind: "document", title: "מדריך" })]));
  add("documents: grouped block", (r4.blocks.find((b) => b.kind === "document")?.items.length ?? 0) === 2);

  // 5. Offers are surfaced + become notifications.
  const r5 = assembleClientExperience(bundle([item({ id: "o1", kind: "offer", title: "הצעה חדשה", important: true })]));
  add("offers: in timeline + notification center", r5.timeline.some((t) => t.kind === "offer") && r5.notifications.some((n) => n.kind === "offer"));

  // 6. Timeline sorted newest-first.
  const r6 = assembleClientExperience(bundle([
    item({ id: "old", title: "ישן", at: "2026-06-01T10:00:00.000Z" }),
    item({ id: "new", title: "חדש", at: "2026-07-05T10:00:00.000Z" }),
  ]));
  add("timeline: newest first", r6.timeline[0].id === "new");

  // 7. Seller sees only own property (owner-scoped, same mechanism).
  const rs: ClientSourceBundle = { role: "seller", clientId: "seller1", clientName: "יוסי", items: [
    item({ id: "mine", kind: "marketing", title: "דוח שיווק שלי", ownerId: "seller1" }),
    item({ id: "notmine", kind: "marketing", title: "דוח נכס אחר", ownerId: "seller2" }),
  ] };
  const r7 = assembleClientExperience(rs);
  add("seller isolation: only own property marketing", r7.timeline.some((t) => t.id === "mine") && !r7.timeline.some((t) => t.id === "notmine"));

  // 8. AI redacted — cross-client / commission questions refused.
  add("AI redacted: cross-client question refused", scopedAnswerGuard("מה המחיר של לקוח אחר?", r1.timeline).allowed === false);
  add("AI redacted: commission question refused", scopedAnswerGuard("כמה עמלה הסוכן מקבל?", r1.timeline).allowed === false);
  add("AI allowed: own-file question passes", scopedAnswerGuard("מתי הסיור הבא שלי?", r1.timeline).allowed === true);

  // 9. Approval-gated actions carry the flag (mobile UX surfaces it).
  const r9 = assembleClientExperience(bundle([item({ id: "a1", kind: "action", title: "אישור מסמך", requiresApproval: true })]));
  add("actions: requiresApproval preserved", r9.timeline.find((t) => t.id === "a1")?.requiresApproval === true);

  // 10. No data → honest empty + privacy note.
  const r10 = assembleClientExperience(bundle([]));
  add("no data: empty + privacy note", !r10.hasData && r10.notes.some((n) => n.includes("שלך")));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
