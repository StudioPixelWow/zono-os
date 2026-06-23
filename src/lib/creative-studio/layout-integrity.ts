// ============================================================================
// ZONO — Layout Integrity Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Guarantees a Design Execution Plan is a VALID final ad layout — not an
// internal canvas with overlapping text. It:
//   • clamps every content zone inside the safe margins,
//   • detects collisions between content zones,
//   • re-stacks the vertical flow so nothing overlaps,
//   • keeps the bottom contact strip (price / CTA / agent) non-overlapping,
//   • enforces a minimum price box so the price is never cropped,
//   • returns a QA verdict the generator uses to reject + regenerate a layout.
//
// It does NOT touch copy, concept, colours or assets — only geometry.
// ============================================================================
import type { DesignExecutionPlan, Zone } from "./design-system-engine";

export type ZoneName = keyof DesignExecutionPlan["zones"];

// Zones that carry text/contact info and must never overlap each other.
// `image` is the background and `logo` is a small overlay mark — both are
// allowed to sit under/over the photo, so they are excluded from text collision.
const CONTENT_ZONES: ZoneName[] = ["headline", "subheadline", "price", "cta", "features", "agent", "badge"];
// The vertical "flow" (top→bottom) that gets re-stacked when it overlaps.
const FLOW_ZONES: ZoneName[] = ["headline", "subheadline", "features", "price"];

const MIN_PRICE_W = 30;          // % — narrower than this risks a cropped price
const MIN_PRICE_H_INLINE = 6.5;  // %
const MIN_PRICE_H_DOMINANT = 13; // %
const STRIP_GAP = 2;             // % horizontal gap between CTA and agent
const EPS = 0.4;                 // % tolerance — sub-pixel touches are not collisions

export interface LayoutViolation { kind: "overlap" | "margin" | "price_crop" | "cta_overlap" | "agent_overlap"; zones: ZoneName[]; detail: string }
export interface LayoutQA { approved: boolean; violations: LayoutViolation[]; fixes: string[] }

interface Rect { top: number; left: number; right: number; bottom: number; w: number; h: number }
function rectOf(z: Zone): Rect { return { top: z.top, left: z.left, right: z.left + z.width, bottom: z.top + z.height, w: z.width, h: z.height }; }
function overlaps(a: Rect, b: Rect): boolean {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ox > EPS && oy > EPS;
}

/** Pure validation: list every layout problem without mutating the plan. */
export function validateDepLayout(dep: DesignExecutionPlan): LayoutQA {
  const Z = dep.zones;
  const margin = (dep.canvas.safeMargin / dep.canvas.height) * 100; // px → %
  const violations: LayoutViolation[] = [];
  const shown = CONTENT_ZONES.filter((n) => Z[n].shown);

  // 1) Safe margins.
  for (const n of shown) {
    const r = rectOf(Z[n]);
    if (r.top < margin - EPS || r.left < margin - EPS || r.right > 100 - margin + EPS || r.bottom > 100 - margin + EPS) {
      violations.push({ kind: "margin", zones: [n], detail: `${n} חורג מהשוליים הבטוחים` });
    }
  }
  // 2) Pairwise collisions.
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j];
      if (overlaps(rectOf(Z[a]), rectOf(Z[b]))) {
        const kind: LayoutViolation["kind"] = (a === "cta" || b === "cta") ? "cta_overlap" : (a === "agent" || b === "agent") ? "agent_overlap" : "overlap";
        violations.push({ kind, zones: [a, b], detail: `${a} ו-${b} חופפים` });
      }
    }
  }
  // 3) Price never cropped.
  if (Z.price.shown) {
    const minH = dep.flags.priceDominant ? MIN_PRICE_H_DOMINANT : MIN_PRICE_H_INLINE;
    if (Z.price.width < MIN_PRICE_W - EPS || Z.price.height < minH - EPS) {
      violations.push({ kind: "price_crop", zones: ["price"], detail: "תיבת המחיר קטנה מדי — סיכון לחיתוך" });
    }
  }
  return { approved: violations.length === 0, violations, fixes: [] };
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** Deterministically repair a plan so it always passes validateDepLayout:
 *  clamp to margins → guarantee price box → re-stack the vertical flow →
 *  lay the bottom contact strip out side-by-side. Returns the fixed plan and a
 *  human-readable list of what changed (for the debug panel / trace). */
export function normalizeDep(dep: DesignExecutionPlan): { dep: DesignExecutionPlan; qa: LayoutQA } {
  const margin = (dep.canvas.safeMargin / dep.canvas.height) * 100;
  const lo = margin, hi = 100 - margin;
  const fixes: string[] = [];
  // Deep-clone zones so we never mutate the caller's plan.
  const Z = JSON.parse(JSON.stringify(dep.zones)) as DesignExecutionPlan["zones"];

  const clampZone = (n: ZoneName) => {
    const z = Z[n]; if (!z.shown) return;
    const w = Math.min(z.width, hi - lo), h = Math.min(z.height, hi - lo);
    const left = clamp(z.left, lo, hi - w), top = clamp(z.top, lo, hi - h);
    if (left !== z.left || top !== z.top || w !== z.width || h !== z.height) fixes.push(`clamp ${n} לשוליים`);
    z.left = left; z.top = top; z.width = w; z.height = h;
  };
  // Clamp content zones (image stays full-bleed; logo is a free overlay).
  for (const n of CONTENT_ZONES) clampZone(n);

  // Price min-size (no-crop) BEFORE stacking, so stacking respects the bigger box.
  if (Z.price.shown) {
    const minH = dep.flags.priceDominant ? MIN_PRICE_H_DOMINANT : MIN_PRICE_H_INLINE;
    if (Z.price.width < MIN_PRICE_W) { Z.price.width = Math.min(MIN_PRICE_W, hi - lo); Z.price.left = clamp(Z.price.left, lo, hi - Z.price.width); fixes.push("הרחבת תיבת מחיר"); }
    if (Z.price.height < minH) { Z.price.height = minH; fixes.push("הגדלת גובה מחיר"); }
  }

  // Re-stack the vertical flow (headline → subheadline → features → price) so
  // each starts below the previous one ends. Only pushes DOWN, never up, and
  // keeps everything above the reserved bottom strip.
  const stripTop = 84; // reserve 84→hi for the contact strip
  const flow = FLOW_ZONES.filter((n) => Z[n].shown).sort((a, b) => Z[a].top - Z[b].top);
  let cursor = -1;
  for (const n of flow) {
    const z = Z[n];
    if (cursor >= 0 && z.top < cursor + 0.8) { fixes.push(`הזזת ${n} למטה למניעת חפיפה`); z.top = cursor + 0.8; }
    // keep the flow out of the reserved strip (price may sit just above it)
    const maxTop = (n === "price" ? stripTop : stripTop - 1) - z.height;
    if (z.top > maxTop) z.top = Math.max(lo, maxTop);
    cursor = z.top + z.height;
  }

  // Bottom contact strip: CTA + agent share one row, side by side, no overlap.
  const stripH = Math.min(10, hi - stripTop);
  const stripRowTop = clamp(stripTop, lo, hi - stripH);
  const ctaShown = Z.cta.shown, agentShown = Z.agent.shown;
  if (ctaShown && agentShown) {
    const half = (hi - lo - STRIP_GAP) / 2;
    // CTA on the start side, agent on the end side (RTL-agnostic geometry).
    Z.cta.top = stripRowTop; Z.cta.height = stripH; Z.cta.left = lo; Z.cta.width = half;
    Z.agent.top = stripRowTop; Z.agent.height = stripH; Z.agent.left = lo + half + STRIP_GAP; Z.agent.width = half; Z.agent.align = "end";
    fixes.push("פריסת רצועת CTA + סוכן ללא חפיפה");
  } else if (ctaShown) {
    Z.cta.top = stripRowTop; Z.cta.height = stripH;
    Z.cta.left = clamp(Z.cta.left, lo, hi - Z.cta.width);
  } else if (agentShown) {
    Z.agent.top = stripRowTop; Z.agent.height = stripH;
    Z.agent.left = clamp(Z.agent.left, lo, hi - Z.agent.width);
  }

  const fixed: DesignExecutionPlan = { ...dep, zones: Z };
  const qa = validateDepLayout(fixed);
  qa.fixes = fixes;
  return { dep: fixed, qa };
}

/** Final visual QA gate across the generated set: every creative must pass
 *  layout integrity, and the set must contain only DISTINCT family signatures
 *  (no duplicate concept/family). */
export interface FinalQAResult { approved: boolean; perCreative: { depId: string; family: string; ok: boolean; violations: LayoutViolation[] }[]; duplicateFamilies: string[]; reasons: string[] }
export function finalLayoutQA(deps: DesignExecutionPlan[]): FinalQAResult {
  const perCreative = deps.map((d) => { const qa = validateDepLayout(d); return { depId: d.depId, family: d.family, ok: qa.approved, violations: qa.violations }; });
  const seen = new Map<string, number>();
  for (const d of deps) seen.set(d.family, (seen.get(d.family) ?? 0) + 1);
  const duplicateFamilies = [...seen.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  const reasons: string[] = [];
  for (const c of perCreative) if (!c.ok) reasons.push(`${c.family}: ${c.violations.map((v) => v.detail).join(", ")}`);
  if (duplicateFamilies.length) reasons.push(`משפחות עיצוב כפולות: ${duplicateFamilies.join(", ")}`);
  return { approved: reasons.length === 0, perCreative, duplicateFamilies, reasons };
}
