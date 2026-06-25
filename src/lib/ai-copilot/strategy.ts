// ============================================================================
// ZONO — call/meeting strategy briefs (pure builders + deterministic fallbacks).
// Augments the deterministic Seller Intelligence with a structured human-ready
// brief. The deterministic score/probability/recommended-action are quoted, not
// recomputed — the AI explains + advises, it never overrides them.
// ============================================================================
import type { SellerCallContext } from "./types";

const fmtPrice = (p: number | null) => (p != null ? `₪${p.toLocaleString("he-IL")}` : "—");
const addr = (c: SellerCallContext) => c.addressText ?? ([c.neighborhood, c.city].filter(Boolean).join(", ") || "הנכס");

function motivation(c: SellerCallContext): string {
  if (c.priceDropCount >= 2 || (c.daysOnMarket ?? 0) >= 60) return "גבוהה";
  if (c.priceDropCount >= 1 || (c.daysOnMarket ?? 0) >= 30) return "בינונית";
  return "נמוכה-בינונית";
}
function urgency(c: SellerCallContext): string {
  return c.exclusiveProbability >= 80 ? "גבוהה" : c.exclusiveProbability >= 60 ? "בינונית" : "נמוכה";
}

export function buildSellerCallBrief(c: SellerCallContext): { instruction: string; fallback: string } {
  const a = addr(c);
  const fallback = [
    `תדריך שיחה — ${a}`,
    `סיכום מוכר: נכס ${c.listingType === "private" ? "פרטי" : c.listingType ?? ""} ב${c.city ?? ""}, מחיר ${fmtPrice(c.price)}, ${c.daysOnMarket ?? "?"} ימים בשוק.`,
    `מצב נוכחי: ${c.priceDropCount} ירידות מחיר · ${c.buyerMatchCount} קונים מתאימים · שלב: ${c.lifecycleStage}.`,
    `פתיח מומלץ: "שלום, אני מתמחה ב${c.city ?? "אזור"} ויש לי קונים רלוונטיים ל${a} — יש דקה?"`,
    `התנגדויות אפשריות: "כבר יש לי מתווך" / "אני מסתדר לבד" / "המחיר סופי".`,
    `אסטרטגיה מומלצת: ${c.recommendedActionReason || "להדגיש קונים זמינים ומהירות מכירה"}.`,
    `טיפים למו"מ: להוביל עם ביקוש אמיתי (${c.buyerMatchCount} קונים), לא להילחם על מחיר בשיחה ראשונה.`,
    `זמינות קונים: ${c.buyerMatchCount > 0 ? `${c.buyerMatchCount} קונים מתאימים כעת` : "אין כרגע — להדגיש פוטנציאל אזור"}.`,
    `מחיר ושינויים: ${c.priceDropCount} עדכוני מחיר עד כה.`,
    `הערכת מוטיבציה: ${motivation(c)} · הערכת דחיפות: ${urgency(c)}.`,
    `סבירות בלעדיות (דטרמיניסטית): ${c.exclusiveProbability}% (${c.exclusiveBand}) · ציון מוכר ${c.sellerScore}.`,
  ].join("\n\n");
  return {
    instruction: "בנה תדריך שיחה לסוכן לפני שיחה עם בעל הנכס. כלול: סיכום מוכר, מצב נוכחי, פתיח מומלץ, התנגדויות אפשריות, " +
      "אסטרטגיה מומלצת, טיפים למו\"מ, זמינות קונים, היסטוריית נכס, שינויי מחיר, הערכת מוטיבציה והערכת דחיפות. " +
      "צטט את הציון והסבירות הדטרמיניסטיים כפי שהם, אל תשנה אותם. כתוב בעברית, מובנה וקצר.",
    fallback,
  };
}

export function buildBuyerCallBrief(c: SellerCallContext): { instruction: string; fallback: string } {
  const a = addr(c);
  const fallback = [
    `תדריך שיחת קונה — ${a}`,
    `למה זה מתאים: ${c.scoreReasons.slice(0, 3).join(" · ") || "התאמה לקריטריונים שהוגדרו"}.`,
    `נקודות לשיחה: מיקום (${c.city ?? ""}), מחיר ${fmtPrice(c.price)}, ${c.daysOnMarket != null ? `${c.daysOnMarket} ימים בשוק` : ""}.`,
    `שאלות לשאול: מסגרת תקציב סופית? מתי זמין לצפייה? מה הכי חשוב בנכס?`,
    `התנגדויות אפשריות: מחיר גבוה / מיקום / זמינות — להציע חלופות באזור.`,
    `מעקב מומלץ: ${c.recommendedAction === "schedule_meeting" ? "לתאם צפייה" : "וואטסאפ עם פרטי הנכס"}.`,
  ].join("\n\n");
  return {
    instruction: "בנה תדריך לשיחה עם קונה: למה הנכס מתאים, נקודות לשיחה, שאלות לשאול, התנגדויות אפשריות ומעקב מומלץ. " +
      "התבסס על ההקשר בלבד. עברית, מובנה וקצר.",
    fallback,
  };
}

export function buildMeetingBrief(c: SellerCallContext): { instruction: string; fallback: string } {
  const a = addr(c);
  const fallback = [
    `תדריך פגישה — ${a}`,
    `נכס: ${c.listingType ?? ""} ב${c.city ?? ""}, ${fmtPrice(c.price)}, ${c.daysOnMarket ?? "?"} ימים בשוק.`,
    `מוכר: שלב ${c.lifecycleStage} · קשר אחרון: ${c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString("he-IL") : "—"}.`,
    `תקשורת קודמת: ${c.contactSummary ?? "אין תיעוד"}.`,
    `שוק נוכחי: ${c.buyerMatchCount} קונים מתאימים · ${c.priceDropCount} ירידות מחיר.`,
    `שאלות מוצעות: מה ציפיות המחיר? מהו לוח הזמנים? מה ניסיון המכירה עד כה?`,
    `עצות מו"מ: להציג בלעדיות כדרך למקסם מחיר ומהירות; להישען על הקונים הקיימים.`,
  ].join("\n\n");
  return {
    instruction: "בנה תדריך פגישה הכולל: נכס, מוכר, קונה, היסטוריה, תקשורת קודמת, שוק נוכחי, שאלות מוצעות ועצות מו\"מ. " +
      "עברית, מובנה. אל תמציא נתונים.",
    fallback,
  };
}

export function buildAfterCallSummary(notes: string, c: SellerCallContext): { instruction: string; fallback: string } {
  const a = addr(c);
  const trimmed = notes.trim().slice(0, 2000);
  const fallback = [
    `סיכום שיחה — ${a}`,
    `סיכום: ${trimmed || "—"}`,
    `פריטי פעולה: לעקוב בהתאם להמלצה (${c.recommendedAction}).`,
    `הערות CRM: ${trimmed ? trimmed.slice(0, 140) : "—"}`,
    `מעקב הבא: בתוך 1-2 ימים.`,
  ].join("\n\n");
  return {
    instruction: `המר את הערות הסוכן לסיכום מובנה: סיכום קצר, פריטי פעולה, משימות, הערות CRM ומועד מעקב מומלץ. ` +
      `הערות גולמיות: """${trimmed}""". עברית, תכליתי.`,
    fallback,
  };
}
