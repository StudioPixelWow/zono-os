// ============================================================================
// 👤 AI Agent Website — evidence-only broker content (pure). 32.2.
// Composes public copy from REAL facts only. No fake awards / sales / testimonials.
// ============================================================================
import type { AgentInput } from "./types";

const fmtPrice = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

export function brokerIntro(input: AgentInput): string {
  const b = input.branding;
  const parts: string[] = [`${b.brokerName}${b.title ? ` · ${b.title}` : ""}`];
  if (b.specialties.length) parts.push(`מתמחה ב${b.specialties.slice(0, 3).join(", ")}`);
  if (input.serviceAreas.length) parts.push(`פעיל/ה ב${input.serviceAreas.slice(0, 3).join(", ")}`);
  if (input.listings.length) parts.push(`${input.listings.length} נכסים פעילים`);
  if (input.perf.closedDeals != null && input.perf.closedDeals > 0) parts.push(`${input.perf.closedDeals} עסקאות שנסגרו`);
  const base = `${parts.join(" · ")}. האתר מוזן ישירות ממלאי ה-CRM החי ומתעדכן אוטומטית.`;
  return b.bio && b.bio.trim().length > 0 ? `${b.bio.trim()} ${base}` : base;
}

export function areaExpertise(area: string, inventory: number, avgPrice: number | null): { title: string; body: string; evidence: string[] } {
  const p = fmtPrice(avgPrice);
  return { title: `מומחיות ב${area}`, body: `${area}: ${inventory} נכסים פעילים בייצוג${p ? ` · מחיר ממוצע ${p}` : ""}. הכרות מעמיקה עם האזור מבוססת על המלאי הפעיל.`, evidence: [`${inventory} נכסים`, ...(p ? [`ממוצע ${p}`] : [])] };
}

export function buyingTip(): { title: string; body: string; evidence: string[] } {
  return { title: "טיפ לקונים", body: "הגדירו מראש תקציב, אזור ומספר חדרים — כך אוכל להתאים לכם נכסים במדויק ולחסוך זמן. אפשר לשאול אותי ישירות דרך Ask Agent.", evidence: ["הנחיה כללית — ללא הבטחת תשואה"] };
}
export function sellingTip(): { title: string; body: string; evidence: string[] } {
  return { title: "טיפ למוכרים", body: "תמחור נכון מול השוק מקצר משמעותית את זמן המכירה. אני משתמש/ת בנתוני שוק והערכות שווי כדי למקם את המחיר נכון מההתחלה.", evidence: ["הנחיה כללית — מבוסס נתוני שוק"] };
}

export function agentFaq(input: AgentInput): { q: string; a: string; evidence: string[] }[] {
  const b = input.branding;
  const out: { q: string; a: string; evidence: string[] }[] = [
    { q: `כיצד יוצרים קשר עם ${b.brokerName}?`, a: "דרך טופס יצירת הקשר, וואטסאפ, טלפון או מייל — או ישירות דרך Ask Agent באתר.", evidence: ["פרטי קשר"] },
    { q: "האם הנכסים מעודכנים?", a: "כן — האתר מוזן ישירות ממלאי ה-CRM החי ומתעדכן אוטומטית.", evidence: ["מלאי חי"] },
  ];
  if (b.languages.length) out.push({ q: "באילו שפות אפשר לתקשר?", a: `${b.languages.join(", ")}.`, evidence: ["שפות שהוגדרו"] });
  if (b.calendarLink) out.push({ q: "אפשר לקבוע פגישה אונליין?", a: "בהחלט — ניתן לקבוע דרך קישור היומן בעמוד אודות.", evidence: ["קישור יומן"] });
  return out;
}
