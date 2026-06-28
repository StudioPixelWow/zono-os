// ============================================================================
// ZONO Brokerage Knowledge — Source Reliability engine (pure).
// Every data source has a reliability score; AI confidence must factor it in.
// Deterministic. Higher = more trustworthy public/business source.
// ============================================================================

export const SOURCE_RELIABILITY: Record<string, number> = {
  website: 90,   // official office website
  google: 85,    // Google Business
  manual: 100,   // human-entered, verified
  yad2: 80,
  madlan: 78,
  b144: 65,
  easy: 60,
  facebook: 55,
  instagram: 50,
  linkedin: 58,
  imported: 40,
  other: 45,
};

/** Reliability (0..100) for a source type; unknown sources get a cautious 45. */
export function sourceReliability(sourceType?: string | null): number {
  if (!sourceType) return 45;
  return SOURCE_RELIABILITY[sourceType.toLowerCase()] ?? 45;
}

/**
 * Blend a base confidence with the reliability of the sources backing it. A
 * fact seen on a high-reliability source (website/Google) keeps most of its
 * confidence; one seen only on a weak source is discounted. More corroborating
 * sources nudge it up. Returns 0..100, deterministic.
 */
export function blendConfidence(baseConfidence: number, sourceTypes: string[]): number {
  const base = Math.max(0, Math.min(100, baseConfidence));
  if (!sourceTypes.length) return Math.round(base * 0.85);
  const rels = sourceTypes.map(sourceReliability);
  const best = Math.max(...rels);
  // corroboration bonus: each extra source above the first adds up to +6 total.
  const corroboration = Math.min(6, (sourceTypes.length - 1) * 2);
  const blended = base * (0.55 + 0.45 * (best / 100)) + corroboration;
  return Math.round(Math.max(0, Math.min(100, blended)));
}
