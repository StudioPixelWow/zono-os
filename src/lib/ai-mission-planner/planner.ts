// ============================================================================
// 🧭 Mission Planner — turn existing signals into reviewable draft missions (pure).
// Phase 27.4. Deterministic. Creates a draft ONLY when: it is answered/real,
// evidence exists, confidence is sufficient, the entity is known (where the
// category requires it), and the action is safe. Never executes anything.
// ============================================================================
import { MISSION_CONFIDENCE_MIN, validateMissionDraft } from "./mission-schema";
import { evidenceFromAlert, evidenceFromReasoning, hasSufficientEvidence, type AlertDescriptor } from "./evidence";
import type {
  MissionCategory, MissionDraftInput, MissionPriority, MissionRelatedEntity,
  MissionStatus, PlanResult, PlanSkip,
} from "./types";
import type { AIReasoningResponse } from "@/lib/ai-reasoning/types";

function priorityFromConfidence(c: number): MissionPriority {
  if (c >= 85) return "urgent";
  if (c >= 70) return "high";
  if (c >= 55) return "medium";
  return "low";
}

const CATEGORY_KEYWORDS: { re: RegExp; category: MissionCategory }[] = [
  { re: /הערכ|שווי|valuation|price estimate/i, category: "valuation" },
  { re: /ירידת מחיר|מחיר|pricing|price/i, category: "pricing" },
  { re: /מתחר|competitor|competition/i, category: "competition" },
  { re: /מוכר|seller|בלעדי|exit|יציאה/i, category: "seller_risk" },
  { re: /קונה|buyer|התאמ|match/i, category: "buyer_match" },
  { re: /גיוס|מלאי|new listing|מודעה חדשה|acquisition/i, category: "acquisition" },
  { re: /שיווק|marketing|פרסום/i, category: "marketing" },
  { re: /ליד|lead|מעקב|follow/i, category: "follow_up" },
  { re: /שוק|market|אזור|שכונה/i, category: "market_watch" },
];

function inferCategory(text: string): MissionCategory {
  for (const k of CATEGORY_KEYWORDS) if (k.re.test(text)) return k.category;
  return "admin";
}

// Categories that can be org/market-level (no specific entity required).
const ENTITY_OPTIONAL: ReadonlySet<MissionCategory> = new Set(["market_watch", "admin", "competition"]);

function firstSentence(s: string, max = 90): string {
  const clean = (s ?? "").trim().replace(/\s+/g, " ");
  const cut = clean.split(/[.!?\n]/)[0] ?? clean;
  return (cut.length > max ? cut.slice(0, max) + "…" : cut) || clean.slice(0, max);
}

export interface ReasoningPlanInput {
  question: string;
  response: AIReasoningResponse;
  relatedEntity?: MissionRelatedEntity;
  sourceId?: string | null;
  category?: MissionCategory;
  title?: string;
}

/** Build a draft from an AI Reasoning Gateway response. */
export function planFromReasoning(input: ReasoningPlanInput): PlanResult {
  const skipped: PlanSkip[] = [];
  const r = input.response;

  if (r.status !== "answered") return { created: [], skipped: [{ reason: "not_answered", detail: r.status }] };

  const evidence = evidenceFromReasoning(r);
  if (!hasSufficientEvidence(evidence)) return { created: [], skipped: [{ reason: "insufficient_evidence", detail: "reasoning produced no citable evidence" }] };

  const confidence = typeof r.confidence === "number" ? r.confidence : 0;
  if (confidence < MISSION_CONFIDENCE_MIN) return { created: [], skipped: [{ reason: "low_confidence", detail: `confidence ${confidence} < ${MISSION_CONFIDENCE_MIN}` }] };

  const category = input.category ?? inferCategory(`${input.question} ${r.answer}`);
  const entity: MissionRelatedEntity = input.relatedEntity ?? {
    type: r.evidence[0]?.entityType ?? null,
    id: r.evidence[0]?.entityId ?? null,
  };
  if (!entity.id && !ENTITY_OPTIONAL.has(category)) {
    return { created: [], skipped: [{ reason: "unknown_entity", detail: `category ${category} requires a known entity` }] };
  }

  const draft: MissionDraftInput = {
    sourceType: "reasoning_gateway",
    sourceId: input.sourceId ?? r.cacheKey ?? null,
    priority: priorityFromConfidence(confidence),
    category,
    title: input.title ?? firstSentence(input.question),
    summary: firstSentence(r.answer, 200),
    recommendedAction: r.answer,
    expectedOutcome: r.followUpQuestions[0] ?? null,
    estimatedImpact: null,
    confidence,
    relatedEntity: entity,
    evidence,
    generatedFrom: [{ type: "reasoning_gateway", id: r.cacheKey ?? null, label: input.question }],
    blockedBy: r.missingData ?? [],
    metadata: { mode: "reasoning", version: r.version },
  };

  const v = validateMissionDraft(draft);
  if (!v.ok) return { created: [], skipped: [{ reason: "invalid", detail: v.errors.join("; ") }] };
  return { created: [draft], skipped };
}

const ALERT_CATEGORY: Record<string, MissionCategory> = {
  price_drop: "pricing", new_listing: "acquisition", likely_exit: "seller_risk",
  competitor: "competition", market_event: "market_watch",
};

/** Build a draft from an existing alert / market event descriptor. */
export function planFromAlert(alert: AlertDescriptor): PlanResult {
  const evidence = evidenceFromAlert(alert);
  if (!hasSufficientEvidence(evidence)) return { created: [], skipped: [{ reason: "insufficient_evidence", detail: "alert has no usable evidence" }] };

  const category = ALERT_CATEGORY[alert.alertType] ?? "market_watch";
  const confidence = alert.confidence ?? 60;
  const entity: MissionRelatedEntity = { type: alert.entityType ?? null, id: alert.entityId ?? null };
  if (!entity.id && !ENTITY_OPTIONAL.has(category)) {
    return { created: [], skipped: [{ reason: "unknown_entity", detail: `alert ${alert.alertType} requires a known entity` }] };
  }

  const draft: MissionDraftInput = {
    sourceType: "alert",
    sourceId: alert.sourceId ?? alert.entityId ?? null,
    priority: priorityFromConfidence(confidence),
    category,
    title: alert.title,
    summary: alert.value ? `${alert.title} · ${alert.value}` : alert.title,
    recommendedAction: null,
    expectedOutcome: null,
    estimatedImpact: null,
    confidence,
    relatedEntity: entity,
    evidence,
    generatedFrom: [{ type: "alert", id: alert.sourceId ?? null, label: alert.alertType }],
    blockedBy: [],
    metadata: { alertType: alert.alertType },
  };

  const v = validateMissionDraft(draft);
  if (!v.ok) return { created: [], skipped: [{ reason: "invalid", detail: v.errors.join("; ") }] };
  return { created: [draft], skipped: [] };
}

/** Pure review transition — approve/reject only. Never converts to a task. */
export function applyStatusTransition(current: MissionStatus, action: "approve" | "reject"): MissionStatus | null {
  if (action === "approve") return current === "draft" || current === "ready_for_review" ? "approved" : null;
  if (action === "reject") return current === "draft" || current === "ready_for_review" || current === "approved" ? "rejected" : null;
  return null;
}
