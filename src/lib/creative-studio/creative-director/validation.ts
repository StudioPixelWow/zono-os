// ============================================================================
// ZONO — Creative Validation Service (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Checks a creative direction against: blacklist (anti-AI), RTL/Hebrew
// readability, text hierarchy, real-estate truthfulness, brand consistency,
// scroll-stop strength. Returns the 4 Creative-Director scores + result flags.
// ============================================================================
import { BLACKLIST, RE_FAKE_TERMS } from "./system-prompt";
import type { CreativeDirection } from "./engine";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const HEB = /[֐-׿]/;

export interface ValidationInput {
  direction: CreativeDirection; headline: string; copy: string; cta: string;
  providedFeatures: string[]; hasPropertyImage: boolean; brandColors: string[];
}
export interface ValidationResult {
  scrollStopScore: number; creativeDirectorScore: number; antiAiScore: number; rtlReadabilityScore: number;
  blacklistHits: string[]; fakeRealEstateHits: string[]; passed: boolean; notes: string[];
}

export function validateCreative(v: ValidationInput): ValidationResult {
  const prompt = v.direction.internalPrompt;
  const notes: string[] = [];

  // anti-AI blacklist
  const blacklistHits = BLACKLIST.filter((b) => b.term.test(prompt)).map((b) => b.label);
  const antiAiScore = clamp(100 - blacklistHits.length * 30);
  if (blacklistHits.length) notes.push(`רכיבים אסורים: ${blacklistHits.join(", ")}`);

  // real-estate truthfulness: a feature term may appear only if provided
  const providedJoined = v.providedFeatures.join(" ");
  const fakeRealEstateHits = RE_FAKE_TERMS.filter((t) => t.term.test(prompt) && !t.term.test(providedJoined) && !t.term.test(v.copy)).map((t) => t.label);
  if (fakeRealEstateHits.length) notes.push(`חשד לפרטי נכס שלא סופקו: ${fakeRealEstateHits.join(", ")}`);

  // RTL / Hebrew readability
  const heb = HEB.test(v.headline) || HEB.test(v.copy);
  const tooLongHeadline = (v.headline || "").length > 48;
  const rtlReadabilityScore = clamp((heb ? 88 : 40) - (tooLongHeadline ? 12 : 0) - (fakeRealEstateHits.length ? 0 : 0));
  if (!heb) notes.push("חסר טקסט עברי (RTL)");

  // hierarchy + craft (creative director score)
  const hasStrategy = /\[STRATEGY:/.test(prompt);
  const hasCraft = /\d{2}mm at f\//.test(prompt);
  const hasAccent = v.brandColors.length > 0 || /accent color/i.test(prompt);
  const endsRaw = /--style raw\s*$/.test(prompt);
  const hasCta = Boolean(v.cta);
  const creativeDirectorScore = clamp(40 + (hasStrategy ? 15 : 0) + (hasCraft ? 15 : 0) + (hasAccent ? 10 : 0) + (endsRaw ? 10 : 0) + (hasCta ? 10 : 0) - fakeRealEstateHits.length * 10);

  // scroll-stop strength
  const dominant = /impossible to miss|dominant element|60%\+|28%\+/.test(prompt);
  const scrollStopScore = clamp((dominant ? 70 : 45) + (hasAccent ? 15 : 0) + (heb ? 10 : 0) - blacklistHits.length * 10);

  const passed = blacklistHits.length === 0 && fakeRealEstateHits.length === 0 && heb;
  return { scrollStopScore, creativeDirectorScore, antiAiScore, rtlReadabilityScore, blacklistHits, fakeRealEstateHits, passed, notes };
}
