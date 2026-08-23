// ============================================================================
// ZONO Public Agent Site — StatStrip responsive composition (pure, testable).
// The public agent trust-numbers band must read intentionally at every REAL
// stat count: 0 hides, 1 is a centered single composition, 2 a balanced pair,
// 3–4 a responsive grid that wraps cleanly (no stray flex dividers). This pure
// resolver returns the grid+width classes per count so the behavior is unit
// tested directly, decoupled from the JSX component.
// ============================================================================

/** Responsive grid + max-width classes for a REAL stat count (1–4+). */
export function statStripGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-[240px]"; // single centered composition
  if (count === 2) return "grid-cols-2 max-w-2xl";    // balanced 2-column
  if (count === 3) return "grid-cols-3 max-w-3xl";    // balanced 3-column
  return "grid-cols-2 sm:grid-cols-4 max-w-4xl";      // 4 → 2×2 on mobile, 4-across on sm+
}

/** Whether the trust-numbers band renders at all (0 real stats ⇒ hidden). */
export function statStripVisible(count: number): boolean {
  return count >= 1;
}
