// ============================================================================
// 🗜️ Context Compression Engine — fit a package to a size budget (pure).
// ----------------------------------------------------------------------------
// Deterministic. Sorts by Context Priority™ and trims the LOWEST-priority block
// payloads first when over budget. Invariants (per spec):
//   • never removes the highest-priority blocks
//   • never removes evidence (evidence + key + priority + confidence are kept)
// Trimming replaces a low-priority block's `data` with a truncation marker.
// No AI, no summarization — just deterministic size control.
// ============================================================================
import type { ContextBlock, ContextSize } from "./types";

/** Approximate character budgets per size tier. */
export const SIZE_BUDGET: Record<ContextSize, number> = {
  small: 4_000,
  medium: 12_000,
  large: 40_000,
  enterprise: 200_000,
};

/** Always keep the top-N highest-priority blocks fully intact. */
const ALWAYS_FULL_TOP = 3;

function blockChars(b: ContextBlock): number {
  try { return JSON.stringify(b).length; } catch { return 0; }
}

export function compress(blocks: ContextBlock[], size: ContextSize): ContextBlock[] {
  const budget = SIZE_BUDGET[size];
  // Highest priority first; stable by key for determinism on ties.
  const ordered = [...blocks].sort((a, b) => (b.priority - a.priority) || a.key.localeCompare(b.key));

  let total = ordered.reduce((s, b) => s + blockChars(b), 0);
  if (total <= budget) return ordered;

  // Trim from the lowest-priority end inward, never touching the top-N.
  for (let i = ordered.length - 1; i >= ALWAYS_FULL_TOP && total > budget; i--) {
    const b = ordered[i];
    if (b.truncated) continue;
    const before = blockChars(b);
    ordered[i] = { ...b, data: { truncated: true }, truncated: true };
    total -= before - blockChars(ordered[i]);
  }
  return ordered;
}

export function approxChars(blocks: ContextBlock[]): number {
  return blocks.reduce((s, b) => s + blockChars(b), 0);
}
