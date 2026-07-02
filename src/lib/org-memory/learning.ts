// ============================================================================
// 🧠 Organizational Memory — Learning Engine (pure). 27.8. Parts 5 + 9.
// Converts repeated patterns into learning objects. Every learning carries
// evidence, occurrences, confidence, business impact, a recommendation, the
// affected entities, historical cases and WHY it exists. Confidence grows with
// real repetition — never assumed.
// ============================================================================
import { clamp } from "./util";
import type { Pattern, Learning } from "./types";

const isCategory = (p: Pattern): boolean => p.key.startsWith("cat:");
const labelOf = (p: Pattern): string => p.key.replace(/^(cat|ent):/, "");

function confidenceFor(p: Pattern): number {
  // More occurrences + more distinct entities → higher confidence, capped honestly.
  const base = 40 + p.occurrences * 11 + Math.min(3, p.entities.length) * 3;
  return clamp(Math.min(p.kind === "success" ? 90 : 88, base));
}

function recommendationFor(p: Pattern): string {
  const name = labelOf(p);
  if (p.kind === "success") {
    return isCategory(p)
      ? `המשך והרחב את הגישה "${name}" — הוכחה כמצליחה ב-${p.occurrences} מקרים.`
      : `שכפל את הגישה המוצלחת של ${name} למשרדים/מתווכים נוספים.`;
  }
  return isCategory(p)
    ? `בחן מחדש את "${name}" — נכשל ${p.occurrences} פעמים; שנה גישה או ערוץ לפני חזרה.`
    : `התערב מול ${name} — חוזר על אותה טעות (${p.occurrences} מקרים).`;
}

export function patternsToLearnings(patterns: Pattern[]): Learning[] {
  return patterns.map((p) => {
    const confidence = confidenceFor(p);
    const span = p.firstAt && p.lastAt && p.firstAt !== p.lastAt ? ` בין ${p.firstAt.slice(0, 10)} ל-${p.lastAt.slice(0, 10)}` : "";
    return {
      id: `learn-${p.id}`, kind: p.kind, key: p.key, title: p.title,
      evidence: p.evidence.length ? p.evidence : [`${p.occurrences} מקרים מתועדים`],
      occurrences: p.occurrences, confidence, businessImpact: p.impact,
      recommendation: recommendationFor(p),
      affectedEntities: p.entities,
      cases: p.cases,
      why: `נלמד מ-${p.occurrences} מקרים היסטוריים${span} (${p.kind === "success" ? "הצלחה" : "כישלון"} חוזר).`,
    };
  }).sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
}
