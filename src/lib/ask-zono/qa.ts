// ============================================================================
// ✅ Ask ZONO — self-tests (pure, offline). 30.1. Part 10.
// Scenarios: daily priorities / buyer / seller / listing / office / competition /
// valuation / mission / mixed / unknown — plus explainability, follow-ups and
// approval-gated actions. Uses synthetic engine results (no server).
// ============================================================================
import { understandAndPlan, askWithResults } from "./ask";
import type { EngineResult, EngineId, ChatTurn } from "./types";

export interface AZCheck { name: string; pass: boolean; detail: string }
export interface AZSelfCheck { ok: boolean; total: number; passed: number; checks: AZCheck[] }

const res = (engine: EngineId, headline: string, titles: string[], conf = 70): EngineResult => ({
  engine, headline, items: titles.map((t) => ({ title: t, detail: "", score: 70 })), evidence: [`${engine}: ${titles.length} פריטים`], confidence: conf,
});

export function runSelfCheck(): AZSelfCheck {
  const checks: AZCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // 1. Daily priorities → chief_of_staff + orchestrator.
  const p1 = understandAndPlan("מה עליי לעשות היום?");
  add("daily priorities intent + plan", p1.understanding.intent === "DAILY_PRIORITIES" && p1.plan.engines.includes("chief_of_staff") && p1.plan.engines.includes("orchestrator"), p1.plan.engines.join(","));

  // 2. Buyer question.
  const p2 = understandAndPlan("Which buyers are closest to closing?");
  add("buyers closing intent + only buyer engine", p2.understanding.intent === "BUYERS_CLOSING" && p2.plan.engines.length === 1 && p2.plan.engines[0] === "buyer", p2.plan.engines.join(","));

  // 3. Seller question.
  const p3 = understandAndPlan("Which sellers are at risk?");
  add("sellers at risk intent", p3.understanding.intent === "SELLERS_AT_RISK" && p3.plan.engines[0] === "seller" && p3.understanding.filters.includes("at_risk"), "");

  // 4. Listing question.
  const p4 = understandAndPlan("Which listings need a price reduction?");
  add("listings price reduction intent", p4.understanding.intent === "LISTINGS_PRICE_REDUCTION" && p4.plan.engines[0] === "listing", "");

  // 5. Office question.
  const p5 = understandAndPlan("Where should I recruit brokers?");
  add("recruit location intent + office engine + where", p5.understanding.intent === "RECRUIT_LOCATION" && p5.plan.engines[0] === "office" && p5.understanding.questionType === "where", "");

  // 6. Competition.
  const p6 = understandAndPlan("מי המתחרים בצמיחה?");
  add("competition intent", p6.understanding.intent === "COMPETITION" && p6.plan.engines.includes("office"), "");

  // 7. Valuation.
  const p7 = understandAndPlan("כמה שווה הנכס?");
  add("valuation intent", p7.understanding.intent === "VALUATION" && p7.plan.engines.includes("listing"), "");

  // 8. Mission.
  const p8 = understandAndPlan("אילו משימות חסומות?");
  add("missions intent", p8.understanding.intent === "MISSIONS" && p8.plan.engines.includes("chief_of_staff"), "");

  // 9. Planner never loads unneeded engines (buyer question loads exactly one).
  add("planner minimal — no extra engines", p2.plan.engines.length === 1 && p4.plan.engines.length === 1, "");

  // 10. Unknown question.
  const p10 = understandAndPlan("מה מזג האוויר מחר?");
  add("unknown intent → no engines + followups later", p10.understanding.intent === "UNKNOWN" && p10.plan.engines.length === 0, p10.understanding.intent);

  // ── Synthesis on a seller-at-risk answer ──
  const sellerAns = askWithResults("Which sellers are at risk?", [res("seller", "3 מוכרים בסיכון נטישה", ["דנה כהן — churn 72", "יוסי לוי — בסיכון"], 68)]);
  add("answer has executive + reasoning + confidence", sellerAns.answer.executiveAnswer.length > 0 && sellerAns.answer.reasoning.length > 0 && typeof sellerAns.answer.confidence === "number", "");
  add("explainability complete", sellerAns.answer.explain.why.length > 0 && sellerAns.answer.explain.sourceEngines.includes("seller") && sellerAns.answer.explain.limitations.length > 0, "");
  add("follow-ups generated", sellerAns.answer.followUps.length >= 2, "");
  add("actions approval-gated (never execute)", sellerAns.answer.actions.length > 0 && sellerAns.answer.actions.every((a) => a.requiresApproval === true), "");
  add("actions are proposals with mission type", sellerAns.answer.actions.some((a) => a.kind === "mission" && a.missionType === "SELLER_RETENTION"), "");
  add("risks surfaced from items", sellerAns.answer.risks.length > 0, "");

  // ── Mixed question (buyers + closing + today) still routes correctly ──
  const mixed = understandAndPlan("What should I do today about buyers closing?");
  add("mixed question resolves to a single dominant intent", ["DAILY_PRIORITIES", "BUYERS_CLOSING"].includes(mixed.understanding.intent) && mixed.plan.engines.length >= 1, mixed.understanding.intent);

  // ── Unknown answer → clarification + follow-ups, no actions ──
  const unknownAns = askWithResults("מה מזג האוויר מחר?", []);
  add("unknown → clarification + followups + no actions", unknownAns.answer.executiveAnswer.length > 0 && unknownAns.answer.followUps.length >= 2 && unknownAns.answer.actions.length === 0, "");
  add("unknown → limitations explain", unknownAns.answer.explain.limitations.some((l) => l.includes("כוונה")), "");

  // ── Session carry-over ──
  const history: ChatTurn[] = [{ role: "user", text: "which buyers are closing?", at: "t" }, { role: "assistant", text: "…", intent: "BUYERS_CLOSING", at: "t" }];
  const followup = understandAndPlan("ומה לגבי המוכרים?", history);
  add("carry-over / new focus follow-up resolves", followup.understanding.intent === "SELLERS_AT_RISK" || followup.understanding.intent === "BUYERS_CLOSING", followup.understanding.intent);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
