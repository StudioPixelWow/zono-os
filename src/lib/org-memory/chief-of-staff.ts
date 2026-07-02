// ============================================================================
// 🧠 Organizational Memory — Chief-of-Staff answers (pure). 27.8. Part 7.
// Lets the Chief of Staff answer from memory: "we tried this before", "this
// strategy succeeded", "this usually fails", "this office repeats the same
// mistake". Grounded in real patterns/learnings — no assumptions. CoS itself is
// not modified; it consumes these answers read-only.
// ============================================================================
import type { Pattern, Learning, MemoryAnswer } from "./types";

const topByOcc = (ps: Pattern[]): Pattern | null => ([...ps].sort((a, b) => b.occurrences - a.occurrences)[0] ?? null);

export function buildChiefOfStaffAnswers(successPatterns: Pattern[], failurePatterns: Pattern[], learnings: Learning[]): MemoryAnswer[] {
  const answers: MemoryAnswer[] = [];
  const tried = [...successPatterns, ...failurePatterns].sort((a, b) => b.occurrences - a.occurrences)[0] ?? null;

  answers.push(tried
    ? { question: "האם ניסינו את זה בעבר?", answer: `כן — "${tried.title}" (${tried.occurrences} מקרים).`, evidence: tried.evidence, confidence: Math.min(90, 40 + tried.occurrences * 10) }
    : { question: "האם ניסינו את זה בעבר?", answer: "אין היסטוריה מספקת עדיין.", evidence: [], confidence: 0 });

  const succ = topByOcc(successPatterns);
  answers.push(succ
    ? { question: "אילו אסטרטגיות הצליחו?", answer: `${succ.title} — הצליחה שוב ושוב.`, evidence: succ.evidence, confidence: Math.min(90, 45 + succ.occurrences * 10) }
    : { question: "אילו אסטרטגיות הצליחו?", answer: "טרם נרשמו הצלחות חוזרות.", evidence: [], confidence: 0 });

  const fail = topByOcc(failurePatterns.filter((p) => p.key.startsWith("cat:")));
  answers.push(fail
    ? { question: "מה בדרך כלל נכשל?", answer: `${fail.title} — נוטה להיכשל.`, evidence: fail.evidence, confidence: Math.min(88, 45 + fail.occurrences * 10) }
    : { question: "מה בדרך כלל נכשל?", answer: "טרם נרשמו כשלים חוזרים.", evidence: [], confidence: 0 });

  const repeatEntity = topByOcc(failurePatterns.filter((p) => p.key.startsWith("ent:")));
  answers.push(repeatEntity
    ? { question: "איזה משרד חוזר על אותה טעות?", answer: `${repeatEntity.entities[0] ?? repeatEntity.title} חוזר על אותה טעות (${repeatEntity.occurrences} מקרים).`, evidence: repeatEntity.evidence, confidence: Math.min(85, 45 + repeatEntity.occurrences * 10) }
    : { question: "איזה משרד חוזר על אותה טעות?", answer: "לא זוהתה טעות חוזרת ברמת משרד.", evidence: [], confidence: 0 });

  // Bonus: the strongest actionable learning.
  const best = learnings[0];
  if (best) answers.push({ question: "מה הלקח החזק ביותר?", answer: best.recommendation, evidence: best.evidence, confidence: best.confidence });

  return answers;
}

/** Direct lookup: have we tried this category/type before? */
export function weTriedThisBefore(category: string, patterns: Pattern[]): MemoryAnswer {
  const hit = patterns.filter((p) => p.category === category || p.key === `cat:${category}`).sort((a, b) => b.occurrences - a.occurrences)[0];
  return hit
    ? { question: `האם ניסינו ${category} בעבר?`, answer: `כן — ${hit.occurrences} מקרים (${hit.kind === "success" ? "הצלחה" : "כישלון"}).`, evidence: hit.evidence, confidence: Math.min(90, 40 + hit.occurrences * 10) }
    : { question: `האם ניסינו ${category} בעבר?`, answer: "אין רשומה קודמת.", evidence: [], confidence: 0 };
}
