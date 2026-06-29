// ============================================================================
// 🔗 Mission evidence builders (pure). Phase 27.4.
// Maps existing signals into traceable evidence. No fabrication — evidence is
// only ever derived from real inputs. A mission with no evidence is skipped.
// ============================================================================
import type { AIReasoningResponse } from "@/lib/ai-reasoning/types";
import type { MissionEvidence } from "./types";

export function hasSufficientEvidence(evidence: MissionEvidence[]): boolean {
  return Array.isArray(evidence) && evidence.length > 0 && evidence.every((e) => !!e.source && !!e.label);
}

/** Evidence from an AI Reasoning Gateway response (cited context items). */
export function evidenceFromReasoning(resp: AIReasoningResponse): MissionEvidence[] {
  return (resp.evidence ?? []).map((e) => ({
    source: e.source,
    sourceId: e.entityId ?? null,
    label: e.label,
    value: e.value ?? null,
    confidence: typeof resp.confidence === "number" ? resp.confidence : null,
  }));
}

export interface AlertDescriptor {
  sourceId?: string | null;
  alertType: string;          // price_drop | new_listing | likely_exit | competitor | market_event | ...
  title: string;
  entityType?: string | null;
  entityId?: string | null;
  value?: string | null;
  confidence?: number | null;
  url?: string | null;
}

/** Evidence from an existing alert / market event descriptor. */
export function evidenceFromAlert(alert: AlertDescriptor): MissionEvidence[] {
  return [{
    source: alert.alertType,
    sourceId: alert.sourceId ?? alert.entityId ?? null,
    label: alert.title,
    value: alert.value ?? null,
    confidence: alert.confidence ?? null,
    url: alert.url ?? null,
  }];
}
