// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE FINGERPRINT + CONTEXT (PURE). Phase 4.
// ----------------------------------------------------------------------------
// Deterministic content fingerprinting + material-change detection + bounded
// context windowing. Rescoring happens ONLY when the subject MATERIALLY changes
// (a new fingerprint), never on a cosmetic touch — this is what prevents scoring
// loops and duplicate spend. The window is bounded + safely truncated so the
// Reasoning boundary receives the minimum context. No secret, no Graph model.
// ============================================================================

/** Deterministic FNV-1a hash → stable hex string (pure; no crypto, no ambient). */
export function fingerprint(parts: readonly (string | number | null | undefined)[]): string {
  const s = parts.map((p) => (p == null ? "" : String(p))).join("␟");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0") + `_${s.length.toString(16)}`;
}

export interface SubjectSnapshot {
  subjectRef: string;
  replyCount: number;
  lastActivityAt: string | null;
  subjectPreview: string;
}
/** A subject's fingerprint changes only when its MATERIAL content changes. */
export function subjectFingerprint(s: SubjectSnapshot): string {
  return fingerprint([s.subjectRef, s.replyCount, s.lastActivityAt, s.subjectPreview.trim()]);
}

/** Whether a re-score is warranted (fingerprint differs, or no prior signal). */
export function isMaterialChange(prevFingerprint: string | null, nextFingerprint: string): boolean {
  return prevFingerprint == null || prevFingerprint !== nextFingerprint;
}

export const CONTEXT_MAX_ITEMS = 12;
export const CONTEXT_ITEM_MAX_CHARS = 280;
export interface ContextItem { author: string | null; text: string; at: string | null; fromPage: boolean }

/** Bound + safely truncate a context window (most-recent-N, capped per item). */
export function boundedContext(items: readonly ContextItem[], maxItems = CONTEXT_MAX_ITEMS): ContextItem[] {
  const recent = items.slice(Math.max(0, items.length - maxItems));
  return recent.map((it) => ({
    author: it.author ? it.author.slice(0, 80) : null,
    text: truncate(it.text ?? "", CONTEXT_ITEM_MAX_CHARS),
    at: it.at,
    fromPage: !!it.fromPage,
  }));
}
const truncate = (s: string, n: number) => { const c = s.replace(/\s+/g, " ").trim(); return c.length > n ? c.slice(0, n - 1) + "…" : c; };
