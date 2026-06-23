// ============================================================================
// ZONO Creative Quality Orchestrator (server) — ties the engines together:
// score → critic → reject → regenerate → select best 4, then persists every
// candidate + quality review (so admins can inspect rejected ones) and returns
// the selection for the caller to turn into shown outputs.
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import { QUALITY_CONFIG } from "./config";
import { runCreativeSelection, type CandidateBrief, type ScoredCandidate } from "./zonoCreativeSelectionEngine";
import type { InspirationResult } from "./zonoCreativeInspirationEngine";

type DB = SupabaseClient;

export interface QualityPipelineResult {
  selected: ScoredCandidate[];
  rejected: ScoredCandidate[];
  rounds: number;
  candidatesTotal: number;
  allBelowThreshold: boolean;
  /** candidateId → persisted quality_review row id */
  reviewIdByCandidate: Record<string, string>;
}

export async function runQualityPipeline(opts: {
  db: DB; orgId: string; requestId: string; entityType?: string | null; entityId?: string | null;
  briefs: CandidateBrief[]; inspiration: InspirationResult;
}): Promise<QualityPipelineResult> {
  const sel = runCreativeSelection(opts.briefs);
  const all = [...sel.selected, ...sel.rejected];

  // Persist quality reviews (one per candidate) — bulk insert, map ids back.
  const reviewRows = all.map((c) => ({
    org_id: opts.orgId, request_id: opts.requestId, candidate_id: c.brief.candidateId,
    entity_type: opts.entityType ?? null, entity_id: opts.entityId ?? null, review_round: c.generationRound,
    premium_score: c.scores.premium_score, modern_score: c.scores.modern_score, clean_score: c.scores.clean_score,
    scroll_stop_score: c.scores.scroll_stop_score, brand_match_score: c.scores.brand_match_score,
    real_estate_relevance_score: c.scores.real_estate_relevance_score, hebrew_readability_score: c.scores.hebrew_readability_score,
    rtl_score: c.scores.rtl_score, composition_score: c.scores.composition_score, trust_score: c.scores.trust_score,
    conversion_score: c.scores.conversion_score, wow_score: c.scores.wow_score, property_truth_score: c.scores.property_truth_score,
    agent_authenticity_score: c.scores.agent_authenticity_score, logo_authenticity_score: c.scores.logo_authenticity_score,
    overall_quality_score: c.scores.overall_quality_score, is_approved_for_display: c.isSelected, is_rejected: !c.isSelected,
    critic_summary: c.critic.critic_summary, critic_problems: c.critic.critic_problems as unknown as Json,
    improvement_instructions: c.critic.improvement_instructions as unknown as Json,
    reject_reason: c.rejectionReason, approval_reason: c.critic.approval_reason,
  }));
  const reviewIdByCandidate: Record<string, string> = {};
  try {
    const { data } = await opts.db.from("zono_creative_quality_reviews").insert(reviewRows as never).select("id,candidate_id");
    for (const r of (data ?? []) as { id: string; candidate_id: string }[]) reviewIdByCandidate[r.candidate_id] = r.id;
  } catch (e) { console.error("[quality] review persist failed:", e); }

  // Persist all candidates (selected + rejected) for admin inspection.
  try {
    const candRows = all.map((c) => ({
      org_id: opts.orgId, request_id: opts.requestId, entity_type: opts.entityType ?? null, entity_id: opts.entityId ?? null,
      candidate_family: c.brief.family, generation_round: c.generationRound, render_data: c.brief.renderData as Json,
      internal_prompt: c.brief.internalPrompt, creative_strategy: c.brief.creativeStrategy, visual_hook: c.brief.visualHook,
      property_primary_angle: c.brief.propertyPrimaryAngle, quality_score: c.scores.overall_quality_score, wow_score: c.scores.wow_score,
      status: c.isSelected ? "selected" : "rejected", is_selected: c.isSelected, is_rejected: !c.isSelected,
      rejection_reason: c.rejectionReason, quality_review_id: reviewIdByCandidate[c.brief.candidateId] ?? null,
      metadata: { blockReasons: c.scores.block_reasons, inspiration: opts.inspiration.inspirationSummary } as unknown as Json,
    }));
    await opts.db.from("zono_creative_candidates").insert(candRows as never);
  } catch (e) { console.error("[quality] candidate persist failed:", e); }

  return {
    selected: sel.selected, rejected: sel.rejected, rounds: sel.rounds,
    candidatesTotal: opts.briefs.length, allBelowThreshold: sel.allBelowThreshold, reviewIdByCandidate,
  };
}

export { QUALITY_CONFIG };
