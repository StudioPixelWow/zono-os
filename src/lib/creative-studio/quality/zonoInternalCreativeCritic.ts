// ============================================================================
// ZONO Internal Creative Critic (pure) — a brutally-honest second layer that
// critiques every candidate before a user could ever see it. Turns the score
// matrix into concrete problems + improvement instructions + a regeneration
// delta so weak candidates can be regenerated into stronger ones.
// ============================================================================
import { QUALITY_CONFIG } from "./config";
import type { WowScoreResult } from "./zonoWowScoreEngine";

export interface CriticResult {
  critic_summary: string;
  critic_problems: string[];
  improvement_instructions: string[];
  reject_reason: string | null;
  approval_reason: string | null;
  regeneration_prompt_delta: string;
}

export function critiqueCandidate(s: WowScoreResult): CriticResult {
  const problems: string[] = [];
  const improvements: string[] = [];

  if (s.scroll_stop_score < 80) { problems.push("ההוק החזותי חלש מדי לעצירת גלילה"); improvements.push("צור קומפוזיציה עוצרת-גלילה עם רעיון דומיננטי אחד"); }
  if (s.premium_score < 82) { problems.push("התחושה לא מספיק פרימיום"); improvements.push("הגדל מרחב נושם ושפר את היררכיית הטיפוגרפיה"); }
  if (s.modern_score < 80) { problems.push("העיצוב מרגיש מעט מיושן"); improvements.push("עדכן ספייסינג, פלטה וקומפוזיציה למראה מודרני 2026"); }
  if (s.clean_score < 80) { problems.push("הפריסה עמוסה / לא נקייה"); improvements.push("הפחת צפיפות טקסט והסר אלמנטים מיותרים"); }
  if (s.composition_score < 80) { problems.push("הקומפוזיציה לא מספיק חזקה"); improvements.push("חזק קרופ תמונה ומיקום אלמנטים"); }
  if (s.brand_match_score < 80) { problems.push("התאמת מותג חלשה"); improvements.push("השתמש בצבעי המותג, בלוגו ובתמונת הסוכן בצורה עקבית"); }
  if (s.conversion_score < 75) { problems.push("ה-CTA לא מספיק בולט"); improvements.push("הפוך את ה-CTA לבולט וברור יותר"); }
  if (s.real_estate_relevance_score < 78) { problems.push("זווית הנכס לא מספיק חזקה"); improvements.push("בנה את הקריאייטיב סביב נקודת המכירה החזקה ביותר של הנכס"); }
  if (s.hebrew_readability_score < 90) { problems.push("בעיית קריאות בעברית"); improvements.push("הקטן מספר שורות והגדל גודל טקסט לקריאות מובייל"); }
  if (s.trust_score < 75) { problems.push("חסר בלוק אמון אמיתי"); improvements.push("הוסף בלוק סוכן/משרד אמין עם פרטי קשר"); }

  // Generic-icon-row / template cheapness.
  if (s.block_reasons.includes("שורת אייקונים גנרית")) improvements.push("הסר שורת אייקונים גנרית — תן ל-2-3 מאפיינים חזקים לבלוט");
  if (s.block_reasons.includes("מראה תבנית Canva גנרי")) improvements.push("הפוך את הפריסה למותאמת אישית, לא תבנית סטוק");

  const approved = !s.hard_blocked && s.overall_quality_score >= QUALITY_CONFIG.minQualityScore;
  const reject_reason = s.hard_blocked
    ? `נחסם: ${s.block_reasons.join(", ")}`
    : !approved ? `מתחת לסף איכות (${s.overall_quality_score}/${QUALITY_CONFIG.minQualityScore})` : null;
  const approval_reason = approved
    ? `ברמת Studio Pixel: wow ${s.wow_score}, פרימיום ${s.premium_score}, עצירת גלילה ${s.scroll_stop_score}`
    : null;

  const critic_summary = approved
    ? "קריאייטיב חזק, פרימיום ומודרני — מאושר לתצוגה."
    : `לא מספיק טוב. ${problems.slice(0, 3).join("; ") || "דרוש שיפור כללי"}.`;

  const regeneration_prompt_delta = improvements.length
    ? improvements.slice(0, 5).join(" · ")
    : "חדד את הרעיון הדומיננטי, שמור פרימיום ונקי.";

  return { critic_summary, critic_problems: problems, improvement_instructions: improvements, reject_reason, approval_reason, regeneration_prompt_delta };
}
