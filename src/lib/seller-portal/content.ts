// ============================================================================
// 🏷️ Seller Portal — AI content (pure, evidence-only). 32.4.
// Seller-facing guidance derived ONLY from the seller's real property + market +
// buyer signals. No fabricated numbers, no invented buyers, no fake documents.
// ============================================================================
import type { SellerPortalInput, PortalDoc, PortalInsight, ValuationPosition } from "./types";

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

const POS_HE: Record<ValuationPosition, string> = { above: "מעל הערכת השוק", within: "בתוך טווח השוק", below: "מתחת להערכת השוק", unknown: "לא ידוע" };

/** AI daily summary — only from real signals. */
export function aiSummary(input: SellerPortalInput): string {
  const p = input.property;
  const parts: string[] = [];
  if (p.askingPrice != null) parts.push(`הנכס שלכם מוצע ב${fmt(p.askingPrice)}`);
  if (p.valuationPosition !== "unknown") parts.push(`מחיר הפרסום ${POS_HE[p.valuationPosition]}`);
  const demand = p.buyerDemandScore;
  const demandLine = demand != null ? (demand >= 65 ? "הביקוש גבוה" : demand >= 40 ? "הביקוש מתון" : "הביקוש נמוך כרגע") : "אנחנו אוספים נתוני ביקוש";
  const buyers = input.buyerInterest.length;
  const buyersLine = buyers > 0 ? `${buyers} קונים פוטנציאליים תואמים לנכס.` : "טרם נמצאו קונים תואמים — נעדכן ברגע שיופיעו.";
  const head = parts.length ? `${parts.join(", ")}. ` : "";
  return `${head}${demandLine}. ${buyersLine}`.trim();
}

export function whyDemand(input: SellerPortalInput): PortalInsight {
  const d = input.property.buyerDemandScore ?? 0;
  const evidence = [`ציון ביקוש ${d}/100`, `${input.buyerInterest.length} קונים תואמים`];
  if (d >= 65) return { title: "מדוע הביקוש גבוה", body: "יש ריכוז קונים תואמים והנכס נמצא בטווח מחיר אטרקטיבי לשוק. זה חלון טוב לקידום צפיות.", evidence };
  if (d >= 40) return { title: "מצב הביקוש", body: "הביקוש מתון. חידוד המחיר או שיווק ממוקד יכולים להגדיל את מספר הפניות.", evidence };
  return { title: "מדוע הביקוש נמוך", body: "מעט קונים תואמים כרגע. כדאי לבחון את המחיר מול השוק ואת חומרי השיווק.", evidence };
}

export function shouldPriceChange(input: SellerPortalInput): PortalInsight {
  const p = input.property;
  if (p.valuationPosition === "above" && (p.buyerDemandScore ?? 0) < 50)
    return { title: "האם לשנות מחיר?", body: `מחיר הפרסום ${POS_HE.above} והביקוש מתון. יישור מחיר לטווח השוק צפוי להגדיל פניות וצפיות.`, evidence: [p.priceGapPct != null ? `פער מחיר ${p.priceGapPct > 0 ? "+" : ""}${p.priceGapPct}%` : "מעל השוק"] };
  if (p.valuationPosition === "below")
    return { title: "האם לשנות מחיר?", body: "מחיר הפרסום מתחת להערכת השוק — ייתכן מרחב להעלאה, במיוחד אם הביקוש חזק.", evidence: ["מתחת להערכת השוק"] };
  return { title: "מיצוב מחיר", body: "המחיר תואם את טווח השוק. שווה להמשיך לעקוב אחר הביקוש והתחרות לפני שינוי.", evidence: p.valuationPosition !== "unknown" ? [POS_HE[p.valuationPosition]] : ["ממתין לנתוני הערכה"] };
}

export function marketExplanation(input: SellerPortalInput): PortalInsight {
  const p = input.property;
  const ev = [p.marketScore != null ? `ציון שוק ${p.marketScore}/100` : "", p.daysOnMarket != null ? `${p.daysOnMarket} ימים בשוק` : ""].filter(Boolean);
  return { title: "הסבר שוק", body: `ביצועי השוק של הנכס נמדדים לפי ביקוש, תחרות וקצב מכירה באזור. ${p.daysOnMarket != null ? `הנכס בשוק ${p.daysOnMarket} ימים.` : ""}`.trim(), evidence: ev };
}

export function competitionExplanation(input: SellerPortalInput): PortalInsight {
  const c = input.property.competitionPressure;
  const level = c == null ? "לא ידוע" : c >= 65 ? "גבוהה" : c >= 40 ? "בינונית" : "נמוכה";
  return { title: "הסבר תחרות", body: `רמת התחרות באזור ${level}. ${c != null && c >= 65 ? "בידול הנכס והמחיר חשובים במיוחד." : "יש מקום לבלוט מול היצע מוגבל."}`, evidence: c != null ? [`לחץ תחרות ${c}/100`] : [] };
}

export function nextStep(input: SellerPortalInput): { title: string; why: string } {
  const a = input.strategyPlaybook[0];
  if (a) return { title: a.action, why: a.why };
  return { title: input.aiRecommendation || "המשיכו לעקוב אחר הביצועים", why: "מבוסס על מצב הנכס והשוק" };
}

/** Seller-safe documents/guides — real availability flagged; nothing fabricated. */
export function sellerGuides(input: SellerPortalInput): PortalDoc[] {
  return [
    { id: "doc-agreement", title: "הסכם ייצוג / בלעדיות", category: "agreement", body: "הסכם הייצוג שלכם. יופיע כאן כשישותף על ידי הברוקר.", url: null, available: false },
    { id: "doc-valuation", title: "הערכת שווי הנכס", category: "valuation", body: input.hasValuation ? "הערכת השווי העדכנית של הנכס שלכם." : "הערכת שווי תתווסף לאחר שתופק.", url: null, available: input.hasValuation },
    { id: "doc-marketing", title: "חומרי שיווק", category: "marketing", body: "מצגות, תמונות וטקסטים שיווקיים לנכס.", url: null, available: !!input.property.campaignActive },
    { id: "guide-selling", title: "מדריך: שלבי מכירת דירה", category: "guide", body: "מהעלאת הנכס ועד החתימה — סקירה של כל שלב בתהליך המכירה.", url: null, available: true },
    { id: "guide-pricing", title: "מדריך: תמחור נכון", category: "guide", body: "כיצד לתמחר נכון מול השוק כדי למקסם פניות וערך.", url: null, available: true },
  ];
}

export function sellingTips(input: SellerPortalInput): PortalInsight[] {
  const tips: PortalInsight[] = [];
  if ((input.property.buyerDemandScore ?? 0) >= 60) tips.push({ title: "נצלו את הביקוש", body: "יש ביקוש חזק — כדאי לאשר צפיות ולהיות זמינים לפניות.", evidence: ["ביקוש גבוה"] });
  if (input.property.valuationPosition === "above") tips.push({ title: "בחנו את המחיר", body: "מחיר הפרסום מעל השוק — יישור עשוי להאיץ מכירה.", evidence: ["מעל הערכת השוק"] });
  tips.push({ title: "הכינו את הנכס לצפיות", body: "נכס מסודר ומוצג היטב מגדיל את הסיכוי להצעה טובה.", evidence: ["הנחיה כללית"] });
  return tips.slice(0, 3);
}
