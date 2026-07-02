// ============================================================================
// 🧠 Organizational Memory — shared pure helpers. 27.8.
// ============================================================================
export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
