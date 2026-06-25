// ============================================================================
// ZONO — WhatsApp + Email generation (pure builders + deterministic fallbacks).
// Each builder returns { instruction, fallback }: the instruction guides the AI,
// the fallback is a real, ready-to-send Hebrew message built deterministically
// from the structured context so the feature works even with no AI provider.
// ============================================================================
import type { AiTone, EmailType, SellerCallContext, WhatsappMessageType } from "./types";

const TONE_HE: Record<AiTone, string> = {
  professional: "מקצועי ותכליתי", luxury: "יוקרתי ומכובד", friendly: "חברי וחם", short: "קצר וישיר", urgent: "דחוף וברור",
};
const fmtPrice = (p: number | null) => (p != null ? `₪${p.toLocaleString("he-IL")}` : "");
const addr = (c: SellerCallContext) => c.addressText ?? ([c.neighborhood, c.city].filter(Boolean).join(", ") || "הנכס");

export const WHATSAPP_LABEL: Record<WhatsappMessageType, string> = {
  new_property: "נכס חדש", price_drop: "ירידת מחיר", back_on_market: "חזר לשוק", hot_deal: "עסקה חמה",
  private_listing: "נכס פרטי", follow_up: "מעקב", appointment_reminder: "תזכורת פגישה", exclusive_meeting: "פגישת בלעדיות",
  buyer_recommendation: "המלצת קונה", missed_call: "שיחה שלא נענתה", meeting_summary: "סיכום פגישה",
};

export const EMAIL_LABEL: Record<EmailType, string> = {
  property_presentation: "מצגת נכס", meeting_follow_up: "סיכום פגישה", exclusive_proposal: "הצעת בלעדיות",
  market_update: "עדכון שוק", weekly_summary: "סיכום שבועי", price_update: "עדכון מחיר", buyer_opportunity: "הזדמנות לקונה",
};

function whatsappFallback(type: WhatsappMessageType, c: SellerCallContext, tone: AiTone): string {
  const a = addr(c); const price = fmtPrice(c.price);
  const sign = tone === "luxury" ? "בברכה מכובדת," : tone === "friendly" ? "בברכה," : "בכבוד רב,";
  const base: Record<WhatsappMessageType, string> = {
    new_property: `שלום, ראיתי את ${a}. אני מתמחה באזור ויש לי קונים רלוונטיים. אפשר לדבר?`,
    price_drop: `שלום, שמתי לב שהמחיר של ${a} עודכן. יש לי קונים שעשויים להתאים — מעוניין שנדבר?`,
    back_on_market: `שלום, ${a} חזר לשוק. אם הוא עדיין למכירה — יש לי קונים פעילים באזור.`,
    hot_deal: `שלום, ${a} ${price ? `במחיר ${price} ` : ""}נראה כהזדמנות. אשמח לעזור למכור מהר עם הקונים שלי.`,
    private_listing: `שלום, אני סוכן/ת באזור ${c.city ?? ""}. ראיתי שאתה מוכר את ${a} בעצמך — יש לי קונים מתאימים, אפשר לעזור.`,
    follow_up: `שלום, רק עוקב/ת לגבי ${a}. עדיין רלוונטי? יש לי עדכון מהאזור.`,
    appointment_reminder: `שלום, תזכורת לפגישה שלנו לגבי ${a}. נתראה!`,
    exclusive_meeting: `שלום, אשמח לקבוע פגישה קצרה לגבי ${a} — להציג איך נמכור מהר ובמחיר הטוב ביותר בבלעדיות.`,
    buyer_recommendation: `שלום, יש לי קונה רציני ל${a}${c.buyerMatchCount ? ` (ועוד ${c.buyerMatchCount - 1} מתעניינים)` : ""}. אפשר לתאם צפייה?`,
    missed_call: `שלום, ניסיתי להשיג אותך לגבי ${a}. אשמח לחזור — מתי נוח?`,
    meeting_summary: `שלום, תודה על הפגישה לגבי ${a}. מסכם את מה שסיכמנו ונמשיך מכאן.`,
  };
  return `${base[type]}\n${sign}`;
}

export function buildWhatsapp(type: WhatsappMessageType, tone: AiTone, c: SellerCallContext): { instruction: string; fallback: string } {
  return {
    instruction: `נסח הודעת וואטסאפ קצרה (2-4 שורות) מסוג "${WHATSAPP_LABEL[type]}" בטון ${TONE_HE[tone]}. ` +
      `פנה לבעל הנכס, התבסס על ההקשר, אל תמציא פרטים, וסיים בקריאה לפעולה עדינה. החזר רק את ההודעה.`,
    fallback: whatsappFallback(type, c, tone),
  };
}

export function buildEmail(type: EmailType, c: SellerCallContext): { instruction: string; fallback: string } {
  const a = addr(c); const price = fmtPrice(c.price);
  const fallback = `נושא: ${EMAIL_LABEL[type]} — ${a}\n\nשלום,\n\nבהמשך ל${a}${price ? ` (${price})` : ""}, ` +
    `${c.buyerMatchCount ? `יש לי ${c.buyerMatchCount} קונים מתאימים באזור. ` : ""}אשמח לתאם שיחה קצרה ולהציג כיצד נוכל לקדם את המכירה.\n\nבכבוד רב,`;
  return {
    instruction: `כתוב אימייל מסוג "${EMAIL_LABEL[type]}" בעברית, טון מקצועי. כלול שורת נושא, פתיח, גוף קצר וסגירה. ` +
      `התבסס על ההקשר בלבד, אל תמציא נתונים. החזר נושא + גוף.`,
    fallback,
  };
}
