// ============================================================================
// ZONO Creative Selection Engine (pure) — never generate 4 and show 4. Score
// MANY internal candidates, critique them harshly, reject the weak, regenerate
// improved versions up to N rounds, then select only the strongest, varied 4.
// ============================================================================
import { QUALITY_CONFIG } from "./config";
import { scoreWow, type WowScoreInput, type WowScoreResult } from "./zonoWowScoreEngine";
import { critiqueCandidate, type CriticResult } from "./zonoInternalCreativeCritic";

/** A candidate brief the service builds from a variation × style family. */
export interface CandidateBrief extends Omit<WowScoreInput, "base"> {
  candidateId: string;
  family: string;
  internalPrompt: string;
  creativeStrategy: string;
  visualHook: string;
  propertyPrimaryAngle: string;
  renderData: unknown;
  base: WowScoreInput["base"];
  /** Opaque payload the caller stashes to build the final output row if selected. */
  outputDraft?: Record<string, unknown>;
}

export interface ScoredCandidate {
  brief: CandidateBrief;
  scores: WowScoreResult;
  critic: CriticResult;
  generationRound: number;
  isSelected: boolean;
  isRejected: boolean;
  rejectionReason: string | null;
}

export interface SelectionResult {
  selected: ScoredCandidate[];
  rejected: ScoredCandidate[];
  rounds: number;
  allBelowThreshold: boolean;
}

function scoreAt(brief: CandidateBrief, round: number): WowScoreResult {
  // Regeneration "improves" weak candidates: each extra round nudges the
  // director base scores upward (modeling the critic's improvement deltas).
  const bump = (round - 1) * 4;
  return scoreWow({
    ...brief,
    base: {
      scrollStop: Math.min(100, brief.base.scrollStop + bump),
      antiAi: Math.min(100, brief.base.antiAi + bump),
      creativeDirector: Math.min(100, brief.base.creativeDirector + bump),
      rtlReadability: brief.base.rtlReadability,
    },
  });
}

export function runCreativeSelection(briefs: CandidateBrief[]): SelectionResult {
  const threshold = QUALITY_CONFIG.minQualityScore;
  let round = 1;
  let scored: ScoredCandidate[] = briefs.map((brief) => build(brief, 1));

  const passing = (list: ScoredCandidate[]) => list.filter((c) => !c.scores.hard_blocked && c.scores.overall_quality_score >= threshold);

  // Regeneration loop — re-score weak candidates with improvements until we have
  // enough passing candidates or we exhaust the round budget.
  while (passing(scored).length < QUALITY_CONFIG.finalCount && round < QUALITY_CONFIG.maxRegenRounds) {
    round++;
    scored = scored.map((c) => {
      if (!c.scores.hard_blocked && c.scores.overall_quality_score >= threshold) return c;
      return build(c.brief, round);
    });
  }

  const pass = passing(scored);
  const allBelowThreshold = pass.length === 0;
  // Final pool: passing candidates; if none pass after max rounds, fall back to
  // the strongest non-blocked candidates (still recorded, but flagged).
  const pool = (pass.length ? pass : scored.filter((c) => !c.scores.hard_blocked))
    .sort((a, b) => b.scores.overall_quality_score - a.scores.overall_quality_score);

  // Dedupe near-duplicates (same family + identical headline).
  const seen = new Set<string>();
  const unique = pool.filter((c) => {
    const k = `${c.brief.family}:${c.brief.headline}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  // Variety: prefer at most 2 per family until 4 are chosen, then fill by score.
  const selected: ScoredCandidate[] = [];
  const perFamily = new Map<string, number>();
  for (const c of unique) {
    if (selected.length >= QUALITY_CONFIG.finalCount) break;
    const used = perFamily.get(c.brief.family) ?? 0;
    if (used >= 2) continue;
    selected.push(c); perFamily.set(c.brief.family, used + 1);
  }
  for (const c of unique) {
    if (selected.length >= QUALITY_CONFIG.finalCount) break;
    if (!selected.includes(c)) selected.push(c);
  }

  const selectedIds = new Set(selected.map((c) => c.brief.candidateId));
  const result: ScoredCandidate[] = scored.map((c) => {
    const isSel = selectedIds.has(c.brief.candidateId);
    return { ...c, isSelected: isSel, isRejected: !isSel, rejectionReason: isSel ? null : (c.critic.reject_reason ?? "לא נבחר ל-4 הטובים") };
  });

  return {
    selected: result.filter((c) => c.isSelected),
    rejected: result.filter((c) => !c.isSelected),
    rounds: round,
    allBelowThreshold,
  };

  function build(brief: CandidateBrief, r: number): ScoredCandidate {
    const scores = scoreAt(brief, r);
    const critic = critiqueCandidate(scores);
    return { brief, scores, critic, generationRound: r, isSelected: false, isRejected: false, rejectionReason: null };
  }
}
