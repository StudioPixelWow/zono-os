// ============================================================================
// ZONO Creative Quality Engine — config. Env-driven thresholds so the system
// never shows raw first-generation AI outputs: it generates many candidates,
// scores them harshly, regenerates weak ones, and shows only the strongest.
// ============================================================================
function intEnv(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}
function boolEnv(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

export const QUALITY_CONFIG = {
  /** Internal candidates generated per request before selection. */
  candidatesPerRequest: intEnv("ZONO_CREATIVE_CANDIDATES_PER_REQUEST", 16),
  /** Minimum overall_quality_score required to be shown to a normal user. */
  minQualityScore: intEnv("ZONO_CREATIVE_MIN_QUALITY_SCORE", 85),
  /** Max automatic regeneration rounds when not enough candidates pass. */
  maxRegenRounds: intEnv("ZONO_CREATIVE_MAX_REGEN_ROUNDS", 3),
  /** Whether admins can see rejected candidates in debug. */
  showRejectedInAdmin: boolEnv("ZONO_CREATIVE_SHOW_REJECTED_IN_ADMIN", true),
  /** Final outputs surfaced to the user. */
  finalCount: 4,
} as const;

/** Hard-blocker thresholds — a candidate failing any of these is rejected. */
export const HARD_BLOCKERS = {
  hebrewReadabilityMin: 90,
  rtlMin: 95,
  propertyTruthMin: 100,
} as const;
