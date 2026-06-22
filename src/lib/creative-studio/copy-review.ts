// ============================================================================
// ZONO — Copy Review (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Scores generated copy: spelling/RTL sanity, readability, headline + CTA
// strength, brand alignment (vs approved/rejected patterns), RE relevance.
// Returns sub-scores + an overall confidence (0-100).
// ============================================================================
import type { GeneratedCopy } from "./copy-engine";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const HEB = /[֐-׿]/;
const LATIN = /[A-Za-z]{4,}/;

export interface CopyReview {
  rtl: number; readability: number; headlineStrength: number; ctaStrength: number; brandAlignment: number; realEstateRelevance: number; confidence: number;
}
const RE_TERMS = ["נכס", "דירה", "פנטהאוז", "פרויקט", "נדל״ן", "מרפסת", "נוף", "שכונה", "מיקום", "השקעה", "תשואה", "מכירה", "קנייה", "חדרים", "מ״ר", "בלעדי"];
const STRONG_CTA = ["וואטסאפ", "סיור", "הערכת שווי", "הרשמה", "תיאום", "דברו", "צרו קשר"];

export function reviewCopy(copy: GeneratedCopy, approvedPatterns: string[], rejectedPatterns: string[]): CopyReview {
  const text = [copy.headline, copy.subheadline, copy.body, copy.cta].filter(Boolean).join(" ");
  const hasHeb = HEB.test(text);
  const latinLeak = (text.match(LATIN) || []).length;
  const rtl = clamp((hasHeb ? 90 : 40) - latinLeak * 8);

  const len = text.length;
  const readability = clamp(len === 0 ? 0 : len < 240 ? 85 : len < 420 ? 70 : 50);

  const hl = copy.headline || "";
  let headlineStrength = clamp(40 + (hl.length >= 6 && hl.length <= 42 ? 30 : 10) + (HEB.test(hl) ? 15 : 0) + (/[?!״]/.test(hl) ? 8 : 0));
  if (!hl) headlineStrength = copy.copy_type === "headline" ? 20 : 60;

  const ctaStrength = clamp(STRONG_CTA.some((s) => (copy.cta || "").includes(s)) ? 88 : copy.cta ? 60 : 35);

  const aligned = approvedPatterns.some((p) => p && text.includes(p));
  const conflicts = rejectedPatterns.some((p) => p && text.includes(p));
  const brandAlignment = clamp(60 + (aligned ? 20 : 0) - (conflicts ? 35 : 0));

  const reHits = RE_TERMS.filter((t) => text.includes(t)).length;
  const realEstateRelevance = clamp(40 + reHits * 12);

  const confidence = clamp(rtl * 0.2 + readability * 0.15 + headlineStrength * 0.2 + ctaStrength * 0.15 + brandAlignment * 0.15 + realEstateRelevance * 0.15);
  return { rtl, readability, headlineStrength, ctaStrength, brandAlignment, realEstateRelevance, confidence };
}
