// ============================================================================
// ZONO creative-studio — output lineage + version history (pure).
//
// A refinement/regeneration NEVER overwrites an approved or rejected historical
// output — it creates a new immutable version that points back to its parent and
// root. This module builds the lineage metadata and enforces the no-overwrite
// rule; persistence is done by the caller against zono_quick_creative_outputs.
// ============================================================================

export type GenerationMode = "initial" | "regenerate" | "refine" | "variation" | "restore";
export type OutputApproval = "generated" | "selected" | "rejected" | "approved";

export interface OutputLineage {
  parentOutputId: string | null;
  rootOutputId: string | null;
  generationRound: number;
  mode: GenerationMode;
  refinementReason: string | null;
  briefVersion: string | null;
  brandVersion: string | null;
  provider: string;
  model: string;
  createdAtHint: string | null;   // caller stamps the real timestamp on persist
}

export interface ParentOutput {
  id: string;
  root_output_id?: string | null;
  generation_round?: number | null;
  status?: OutputApproval | string | null;
  is_approved?: boolean | null;
}

/** Historical outputs that must never be mutated in place. */
export function isImmutableHistory(o: ParentOutput): boolean {
  const s = (o.status ?? "").toLowerCase();
  return Boolean(o.is_approved) || s === "approved" || s === "rejected";
}

export class LineageError extends Error {
  constructor(message: string) { super(message); this.name = "LineageError"; }
}

/**
 * Build lineage for a NEW derived output. `parent` may be null for an initial
 * generation. Throws if a caller tries to overwrite immutable history in place
 * (callers must always create a new row).
 */
export function buildDerivedLineage(
  parent: ParentOutput | null,
  opts: { mode: GenerationMode; provider: string; model: string; refinementReason?: string | null; briefVersion?: string | null; brandVersion?: string | null; overwriteInPlace?: boolean },
): OutputLineage {
  if (parent && opts.overwriteInPlace && isImmutableHistory(parent)) {
    throw new LineageError(`cannot overwrite immutable output ${parent.id} (${parent.status ?? "approved"}); create a new version`);
  }
  const root = parent ? (parent.root_output_id ?? parent.id) : null;
  const round = parent ? (parent.generation_round ?? 1) + 1 : 1;
  return {
    parentOutputId: parent?.id ?? null,
    rootOutputId: root,
    generationRound: round,
    mode: opts.mode,
    refinementReason: opts.refinementReason ?? null,
    briefVersion: opts.briefVersion ?? null,
    brandVersion: opts.brandVersion ?? null,
    provider: opts.provider,
    model: opts.model,
    createdAtHint: null,
  };
}

/** Restore an earlier version AS A NEW version (never resurrect-in-place). */
export function buildRestoreLineage(source: ParentOutput, provider: string, model: string): OutputLineage {
  return buildDerivedLineage(source, { mode: "restore", provider, model, refinementReason: `restored from ${source.id}` });
}

/** Order a version set oldest→newest by round then id (stable). Pure. */
export function orderVersions<T extends { generation_round?: number | null; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = a.generation_round ?? 0, rb = b.generation_round ?? 0;
    return ra !== rb ? ra - rb : a.id.localeCompare(b.id);
  });
}
