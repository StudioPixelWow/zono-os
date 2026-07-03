// ============================================================================
// 🛒 Buyer Portal — AI content (pure, evidence-only). 32.3.
// Buyer-facing guidance derived ONLY from the buyer's real profile + journey.
// No fabricated facts, no invented market numbers, no fake testimonials.
// ============================================================================
import type { BuyerPortalInput, BuyerProfile, JourneyStage, PortalDoc, PortalInsight, RecoProperty } from "./types";

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

export const STAGE_HE: Record<JourneyStage, string> = {
  new: "תחילת הדרך", discovery: "גילוי", active_search: "חיפוש פעיל", evaluating: "השוואה והערכה",
  offer: "שלב הצעה", closing: "לקראת סגירה", dormant: "לא פעיל כעת",
};

export function budgetLine(p: BuyerProfile): string | null {
  if (p.budgetMin != null && p.budgetMax != null) return `${fmt(p.budgetMin)}–${fmt(p.budgetMax)}`;
  if (p.budgetMax != null) return `עד ${fmt(p.budgetMax)}`;
  if (p.budgetMin != null) return `מעל ${fmt(p.budgetMin)}`;
  return null;
}

/** AI summary of the buyer's position — only from real signals. */
export function aiSummary(input: BuyerPortalInput): string {
  const p = input.profile;
  const parts: string[] = [];
  const areas = [...new Set([...p.preferredCities, ...p.preferredAreas])];
  if (areas.length) parts.push(`אתם מחפשים ב${areas.slice(0, 3).join(", ")}`);
  const b = budgetLine(p); if (b) parts.push(`בתקציב ${b}`);
  if (p.roomsMin != null || p.roomsMax != null) parts.push(`${p.roomsMin ?? ""}${p.roomsMax != null && p.roomsMax !== p.roomsMin ? `-${p.roomsMax}` : ""} חדרים`);
  const nMatch = input.matches.length;
  const head = parts.length ? `${parts.join(" · ")}. ` : "";
  const match = nMatch > 0 ? `זיהינו ${nMatch} נכסים שתואמים להעדפות שלכם.` : "עדכנו את ההעדפות שלכם כדי שנוכל למצוא לכם התאמות מדויקות.";
  const stage = `שלב הנוכחי: ${STAGE_HE[input.stage]}.`;
  return `${head}${match} ${stage}`.trim();
}

/** Explain WHY a property fits this buyer — reuses match reasons, adds profile context. */
export function explainRecommendation(reco: RecoProperty, p: BuyerProfile): string[] {
  const out = [...reco.why];
  const areas = [...new Set([...p.preferredCities, ...p.preferredAreas])];
  const loc = reco.neighborhood ?? reco.city;
  if (loc && areas.includes(loc) && !out.some((w) => w.includes(loc))) out.push(`ממוקם ב${loc} — אזור מועדף עליכם`);
  if (reco.price != null && p.budgetMax != null && reco.price <= p.budgetMax && !out.some((w) => w.includes("תקציב"))) out.push("בתוך התקציב שהגדרתם");
  if (reco.rooms != null && p.roomsMin != null && reco.rooms >= p.roomsMin && !out.some((w) => w.includes("חדר"))) out.push(`${reco.rooms} חדרים — תואם לצורך שלכם`);
  return out.slice(0, 5);
}

export function buyingTips(input: BuyerPortalInput): PortalInsight[] {
  const p = input.profile;
  const tips: PortalInsight[] = [];
  if (!p.hasPreapproval) tips.push({ title: "אישור עקרוני למשכנתא", body: "אישור עקרוני מחזק אתכם מול מוכרים ומאיץ את התהליך כשנמצא את הנכס הנכון.", evidence: ["אין אישור עקרוני בפרופיל"] });
  if (input.matches.length === 0) tips.push({ title: "חדדו את ההעדפות", body: "ככל שההעדפות מדויקות יותר, כך ההתאמות שנמצא עבורכם מדויקות יותר.", evidence: ["אין עדיין התאמות"] });
  tips.push({ title: "היו מוכנים לצפייה", body: "רשמו מראש את השאלות החשובות לכם — ליקויים, ועד בית, חניה, כיווני אוויר.", evidence: ["הנחיה כללית"] });
  return tips.slice(0, 3);
}

export function timelineGuidance(stage: JourneyStage): PortalInsight {
  const map: Record<JourneyStage, string> = {
    new: "בשלב זה כדאי להגדיר תקציב, אזורים והעדפות — הבסיס לחיפוש ממוקד.",
    discovery: "עכשיו הזמן לסקור אזורים ולצבור תחושה על טווחי מחירים ריאליים.",
    active_search: "בחיפוש פעיל — קבעו צפיות בנכסים המתאימים והשוו בין אפשרויות.",
    evaluating: "בשלב ההשוואה — שקלו יתרונות/חסרונות, מיקום, פוטנציאל וערך.",
    offer: "לקראת הצעה — הכינו אישור מימון ובדקו את טווח המחיר מול השוק.",
    closing: "לקראת סגירה — ליווי משפטי ובדיקת מסמכים הם קריטיים.",
    dormant: "כשתחזרו לחיפוש — נמשיך בדיוק מהנקודה שבה עצרתם.",
  };
  return { title: `הצעד הבא: ${STAGE_HE[stage]}`, body: map[stage], evidence: [`שלב נוכחי: ${STAGE_HE[stage]}`] };
}

export function offerPrepGuidance(): PortalInsight {
  return { title: "הכנה להצעה", body: "הצעה חזקה נשענת על מימון מסודר, הבנת טווח המחיר בשוק ותנאים ברורים. הברוקר שלכם ילווה אתכם בניסוח.", evidence: ["מדריך כללי"] };
}
export function mortgagePrepGuidance(hasPreapproval: boolean): PortalInsight {
  return hasPreapproval
    ? { title: "מימון", body: "יש לכם אישור עקרוני — שמרו אותו בתוקף ועדכנו אם התקציב משתנה.", evidence: ["יש אישור עקרוני"] }
    : { title: "הכנה למשכנתא", body: "התחילו בהשוואת הצעות מימון ובקבלת אישור עקרוני — זה מחזק אתכם משמעותית מול מוכרים.", evidence: ["אין אישור עקרוני"] };
}

/** Buyer-safe educational documents/guides — evidence-based, never fabricated files. */
export function buyerGuides(input: BuyerPortalInput): PortalDoc[] {
  const g: PortalDoc[] = [
    { id: "guide-process", title: "מדריך: שלבי רכישת דירה", category: "guide", body: "מהגדרת תקציב ועד קבלת מפתח — סקירה של כל שלב בתהליך הרכישה.", url: null },
    { id: "guide-viewing", title: "צ׳ק-ליסט לצפייה בנכס", category: "education", body: "מה לבדוק בביקור: מצב הנכס, ועד בית, חניה, רעש, כיווני אוויר ותשתיות.", url: null },
    mortgagePrepGuidance(input.profile.hasPreapproval).title === "מימון"
      ? { id: "guide-mortgage", title: "מדריך מימון ומשכנתא", category: "guide", body: "עקרונות מימון, אישור עקרוני והשוואת הצעות.", url: null }
      : { id: "guide-mortgage", title: "מדריך: אישור עקרוני למשכנתא", category: "guide", body: "כיצד לקבל אישור עקרוני ולמה זה מחזק אתכם כקונים.", url: null },
    { id: "guide-offer", title: "מדריך: הגשת הצעה חכמה", category: "education", body: "כיצד לבנות הצעה מבוססת שוק ומימון מסודר.", url: null },
  ];
  return g;
}
