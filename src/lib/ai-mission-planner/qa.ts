// ============================================================================
// ✅ Mission Planner QA — offline, deterministic self-check (pure). Phase 27.4.
// No DB, no network, no AI. Validates the planner/schema/transition logic only.
// ============================================================================
import { planFromReasoning, planFromAlert, applyStatusTransition } from "./planner";
import { dedupeKey, validateMissionDraft } from "./mission-schema";
import type { AIReasoningResponse } from "@/lib/ai-reasoning/types";
import type { MissionDraftInput } from "./types";

export interface QaCheck { name: string; ok: boolean; detail: string }
export interface QaResult { passed: boolean; checks: QaCheck[] }

function answered(confidence: number, withEvidence: boolean): AIReasoningResponse {
  return {
    status: "answered", answer: "המשרד המוביל בשכונה הוא רי/מקס כרמל לפי שליטה אזורית.", confidence,
    evidence: withEvidence ? [{ label: "משרד מוביל", source: "neighborhoodIntelligence", entityType: "office", entityId: "o1", field: "leaderOffice", value: "רי/מקס כרמל" }] : [],
    missingData: [], limitations: [], followUpQuestions: ["מי המתחרה הקרוב?"], cacheKey: "ctx:v27.2.0:demo", version: "27.3.0",
  };
}

const ALLOWED_KEYS = new Set<keyof MissionDraftInput>([
  "sourceType", "sourceId", "brokerId", "priority", "category", "title", "summary",
  "recommendedAction", "expectedOutcome", "estimatedImpact", "confidence",
  "relatedEntity", "evidence", "generatedFrom", "blockedBy", "metadata",
]);

export function runSelfCheck(): QaResult {
  const checks: QaCheck[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });
  const q = "איזה משרד מוביל בשכונה?";
  const entity = { type: "office", id: "o1" };

  // 1) reasoning with evidence → one draft
  const p1 = planFromReasoning({ question: q, response: answered(80, true), relatedEntity: entity, sourceId: "ctx:demo" });
  add("1-creates-draft-with-evidence", p1.created.length === 1, `created ${p1.created.length}`);

  // 2) reasoning without evidence → nothing
  const p2 = planFromReasoning({ question: q, response: answered(80, false), relatedEntity: entity });
  add("2-no-evidence-skips", p2.created.length === 0 && p2.skipped.some((s) => s.reason === "insufficient_evidence"), p2.skipped.map((s) => s.reason).join(","));

  // 3) duplicate prevented (same org+source+category+entity → same dedupe key)
  const d = p1.created[0];
  const sameKey = dedupeKey("org1", d) === dedupeKey("org1", d);
  const diffKey = dedupeKey("org1", d) !== dedupeKey("org1", { ...d, relatedEntity: { type: "office", id: "o2" } });
  add("3-dedupe-key", sameKey && diffKey, dedupeKey("org1", d));

  // 4) alert → draft
  const p4 = planFromAlert({ alertType: "price_drop", title: "ירידת מחיר 5%", entityType: "listing", entityId: "l1", value: "-5%", confidence: 70 });
  add("4-alert-creates-draft", p4.created.length === 1 && p4.created[0].category === "pricing", p4.created[0]?.category ?? "—");

  // 5) approve transition
  add("5-approve", applyStatusTransition("ready_for_review", "approve") === "approved");

  // 6) reject transition
  add("6-reject", applyStatusTransition("ready_for_review", "reject") === "rejected");

  // 7) approved/rejected drafts carry no execution fields (structured-only)
  const keysOk = Object.keys(d).every((k) => ALLOWED_KEYS.has(k as keyof MissionDraftInput));
  add("7-no-execution-fields", keysOk, Object.keys(d).join(","));

  // 8) evidence sources come from inputs only (no invented/openai source)
  add("8-evidence-from-context", d.evidence.length > 0 && d.evidence[0].source === "neighborhoodIntelligence" && !d.evidence.some((e) => /openai|gpt|invent/i.test(e.source)), d.evidence[0]?.source ?? "—");

  // 9) no fake values — every evidence item attributed
  add("9-no-fake-values", validateMissionDraft(d).ok && d.evidence.every((e) => !!e.source && !!e.label), "");

  // 10) org-scoped dedupe key
  add("10-org-scoped", dedupeKey("orgX", d).startsWith("orgX|"), dedupeKey("orgX", d));

  // 11) low confidence → skipped
  const p11 = planFromReasoning({ question: q, response: answered(40, true), relatedEntity: entity });
  add("11-low-confidence-skips", p11.created.length === 0 && p11.skipped.some((s) => s.reason === "low_confidence"), "");

  // 12) deterministic
  const again = planFromReasoning({ question: q, response: answered(80, true), relatedEntity: entity, sourceId: "ctx:demo" });
  add("12-deterministic", JSON.stringify(p1) === JSON.stringify(again), "");

  // invalid transition guard
  add("13-no-approve-after-rejected", applyStatusTransition("rejected", "approve") === null);

  return { passed: checks.every((c) => c.ok), checks };
}
