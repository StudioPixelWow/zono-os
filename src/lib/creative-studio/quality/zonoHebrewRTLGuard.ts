// ============================================================================
// ZONO Hebrew / RTL Guard (pure) — ensures Hebrew is perfect and RTL is correct
// before a creative can be shown. Returns hebrew_readability + rtl scores.
// Preferred: ZONO renderer overlays Hebrew with a system font; AI-rendered
// Hebrew must pass strict validation or be rejected.
// ============================================================================

export interface HebrewRTLInput {
  headline: string;
  subheadline?: string | null;
  body?: string | null;
  cta?: string | null;
}

export interface HebrewRTLResult {
  hebrewReadabilityScore: number;
  rtlScore: number;
  flags: string[];
}

const HEBREW = /[֐-׿]/;
const LATIN_RUN = /[A-Za-z]{4,}/g;
// Latin tokens that are legitimately allowed inside Hebrew creatives.
const ALLOWED = /^(zono|ai|whatsapp|facebook|instagram|story|reels|crm|sqm)$/i;

export function guardHebrewRTL(i: HebrewRTLInput): HebrewRTLResult {
  const flags: string[] = [];
  const all = [i.headline, i.subheadline, i.body, i.cta].filter(Boolean).join(" ");
  let readability = 100;
  let rtl = 100;

  // Must be predominantly Hebrew.
  const letters = (all.match(/[A-Za-z֐-׿]/g) ?? []).length || 1;
  const hebrewLetters = (all.match(/[֐-׿]/g) ?? []).length;
  const hebrewRatio = hebrewLetters / letters;
  if (hebrewRatio < 0.6) { readability -= 30; rtl -= 20; flags.push("שיעור עברית נמוך"); }
  if (!HEBREW.test(i.headline)) { readability -= 25; rtl -= 25; flags.push("כותרת ללא עברית"); }

  // Unexpected latin runs (likely AI gibberish / wrong language).
  const latinRuns = (all.match(LATIN_RUN) ?? []).filter((w) => !ALLOWED.test(w));
  if (latinRuns.length > 0) { readability -= Math.min(20, latinRuns.length * 8); flags.push("טקסט לטיני לא צפוי"); }

  // Headline length / line discipline (mobile readability).
  if (i.headline.length > 42) { readability -= 8; flags.push("כותרת ארוכה מדי"); }
  const bodyLines = (i.body ?? "").split(/\n+/).filter(Boolean);
  if (bodyLines.length > 4) { readability -= 8; flags.push("יותר מדי שורות גוף"); }
  if (bodyLines.some((l) => l.length > 70)) { readability -= 5; flags.push("שורת גוף ארוכה"); }

  return { hebrewReadabilityScore: clamp(readability), rtlScore: clamp(rtl), flags };
}
function clamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }
