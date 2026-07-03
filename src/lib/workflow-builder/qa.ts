// ============================================================================
// ✅ Workflow Builder — self-tests (pure, offline). 30.4. Part 9.
// Buyer / Seller / Listing / Office workflows + Cancelled / Blocked / Large org.
// Verifies approval-gating (no auto-execution), timeline, progress, explainability.
// ============================================================================
import { instantiateWorkflow, advanceWorkflow } from "./engine";
import { WORKFLOW_TEMPLATES } from "./templates";
import type { WorkflowContext, EntityKind, TriggerType } from "./types";

export interface WFCheck { name: string; pass: boolean; detail: string }
export interface WFSelfCheck { ok: boolean; total: number; passed: number; checks: WFCheck[] }

const ctx = (o: Partial<WorkflowContext> = {}): WorkflowContext => ({ truthScore: 65, confidence: 70, businessScore: 60, relationshipStrength: 50, journeyStage: "qualified", missionState: null, now: Date.now(), ...o });
const ent = (kind: EntityKind, id = "E1", name = "ישות") => ({ entityKind: kind, entityId: id, entityName: name });

export function runSelfCheck(): WFSelfCheck {
  const checks: WFCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Buyer workflow — condition passes → first action waits for approval (not executed).
  const buyer = instantiateWorkflow("buyer_closing", "BUYER_HOT", ent("buyer", "B1", "רון"), ctx());
  add("buyer workflow instantiates", !!buyer && buyer.steps.length === 5, "");
  add("condition auto-resolves, action waits for approval", !!buyer && buyer.status === "waiting_approval" && buyer.steps[0].status === "completed" && buyer.steps[1].status === "waiting_approval", buyer?.status ?? "");
  add("nothing executed (no completed action)", !!buyer && buyer.steps.filter((s) => s.kind === "action" && s.status === "completed").length === 0, "");
  add("explainability present", !!buyer && buyer.explain.whyStarted.length > 0 && buyer.explain.whyWaiting !== null && typeof buyer.explain.confidence === "number", "");

  // Approve advances one step at a time.
  let b2 = advanceWorkflow(buyer!, { kind: "approve" }, ctx());
  add("approve completes step + advances", b2.steps[1].status === "completed" && b2.steps[2].status === "waiting_approval" && b2.progress.completed === 2, `${b2.progress.completed}`);
  // Approve through to completion.
  b2 = advanceWorkflow(b2, { kind: "approve" }, ctx());
  b2 = advanceWorkflow(b2, { kind: "approve" }, ctx());
  b2 = advanceWorkflow(b2, { kind: "approve" }, ctx());
  add("full approval → completed 100%", b2.status === "completed" && b2.progress.percent === 100, `${b2.status}/${b2.progress.percent}`);

  // Seller workflow.
  const seller = instantiateWorkflow("seller_recovery", "SELLER_AT_RISK", ent("seller", "S1"), ctx());
  add("seller workflow", !!seller && seller.status === "waiting_approval" && seller.templateId === "seller_recovery", "");

  // Listing workflow.
  const listing = instantiateWorkflow("listing_refresh", "LISTING_STALE", ent("property", "P1"), ctx());
  add("listing workflow", !!listing && listing.steps.some((s) => s.missionType === "REFRESH_MARKETING"), "");

  // Office workflow — business score gates it.
  const office = instantiateWorkflow("recruit_broker", "MANUAL", ent("office", "O1"), ctx({ businessScore: 70 }));
  add("office workflow starts when business ok", !!office && office.status === "waiting_approval", office?.status ?? "");

  // Blocked — failing condition.
  const blocked = instantiateWorkflow("recruit_broker", "MANUAL", ent("office", "O2"), ctx({ businessScore: 20 }));
  add("failing condition → blocked + reason", !!blocked && blocked.status === "blocked" && blocked.steps[0].status === "blocked" && !!blocked.explain.whyBlocked, blocked?.status ?? "");

  // Reject blocks the workflow.
  const rej = advanceWorkflow(seller!, { kind: "reject", note: "לא רלוונטי" }, ctx());
  add("reject blocks workflow", rej.status === "blocked" && rej.explain.whyBlocked !== null, rej.status);

  // Cancelled.
  const canc = advanceWorkflow(seller!, { kind: "cancel" }, ctx());
  add("cancel → cancelled + no active steps", canc.status === "cancelled" && !canc.steps.some((s) => s.status === "active" || s.status === "waiting_approval"), canc.status);

  // Lead qualification with journey-stage condition (in-operator).
  const lead = instantiateWorkflow("lead_qualification", "AGENT_PROPOSAL", ent("lead", "L1"), ctx({ journeyStage: "new" }));
  add("lead qualification stage condition", !!lead && lead.steps[0].status === "completed" && lead.status === "waiting_approval", lead?.status ?? "");
  const leadWrong = instantiateWorkflow("lead_qualification", "AGENT_PROPOSAL", ent("lead", "L2"), ctx({ journeyStage: "converted" }));
  add("lead wrong stage → blocked", !!leadWrong && leadWrong.status === "blocked", leadWrong?.status ?? "");

  // All 7 templates instantiate without crashing.
  add("all 7 templates valid", WORKFLOW_TEMPLATES.length === 7 && WORKFLOW_TEMPLATES.every((t) => !!instantiateWorkflow(t.id, t.trigger as TriggerType, ent(t.entityKind), ctx({ businessScore: 80, confidence: 80, journeyStage: "new" }))), "");

  // Large organization — performance (instantiate + advance many).
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    let w = instantiateWorkflow("buyer_closing", "BUYER_HOT", ent("buyer", `B${i}`), ctx())!;
    for (let k = 0; k < 4; k++) w = advanceWorkflow(w, { kind: "approve" }, ctx());
  }
  const elapsed = Date.now() - t0;
  add("large org performance < 500ms (300 workflows)", elapsed < 500, `${elapsed}ms`);

  // History records every transition.
  add("history recorded", b2.history.length >= 5 && b2.history.some((h) => h.event === "approved"), `${b2.history.length}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
