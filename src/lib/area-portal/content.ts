// ============================================================================
// 🌍 Area Portal — evidence-only AI content (pure). 32.5.
// Every summary/insight is built from the real public market snapshot and cites
// its evidence. No invented figures, no fake trends.
// ============================================================================
import type { AreaData, AreaMarket, AreaInsight } from "./types";

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);
const pct = (n: number | null) => (n == null ? null : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

function marketEvidence(m: AreaMarket): string[] {
  return [
    m.avgPrice != null ? `מחיר ממוצע ${fmt(m.avgPrice)}` : "",
    m.pricePerSqm != null ? `${fmt(m.pricePerSqm)}/מ״ר` : "",
    `${m.inventory} נכסים פעילים`, `${m.transactions} עסקאות`,
    m.priceTrendPct != null ? `מגמת מחירים ${pct(m.priceTrendPct)}` : "",
  ].filter(Boolean);
}

const TREND_HE = (m: AreaMarket) => (m.momentum === "up" ? "מגמת עלייה" : m.momentum === "down" ? "מגמת ירידה" : "יציבות");
const DEMAND_HE = (m: AreaMarket) => (m.demandLevel === "high" ? "ביקוש גבוה" : m.demandLevel === "medium" ? "ביקוש מתון" : "ביקוש נמוך");
const SUPPLY_HE = (m: AreaMarket) => (m.supplyLevel === "high" ? "היצע רב" : m.supplyLevel === "medium" ? "היצע בינוני" : "היצע מצומצם");

export function areaSummary(d: AreaData): string {
  const where = d.street ? `רחוב ${d.street}${d.neighborhood ? `, ${d.neighborhood}` : ""}` : d.neighborhood ? `${d.neighborhood}, ${d.city}` : d.city;
  const m = d.market;
  const bits: string[] = [];
  if (m.avgPrice != null) bits.push(`מחיר ממוצע ${fmt(m.avgPrice)}`);
  if (m.pricePerSqm != null) bits.push(`${fmt(m.pricePerSqm)} למ״ר`);
  bits.push(SUPPLY_HE(m)); bits.push(DEMAND_HE(m));
  if (m.priceTrendPct != null) bits.push(TREND_HE(m));
  const head = `${where} — ${bits.join(", ")}.`;
  const tail = d.transactions.length > 0 ? ` נרשמו ${d.transactions.length} עסקאות אחרונות באזור.` : d.listings.length > 0 ? ` ${d.listings.length} נכסים מוצעים כעת.` : " הנתונים מתעדכנים באופן שוטף.";
  return head + tail;
}

export function buildInsights(d: AreaData): AreaInsight[] {
  const m = d.market; const ev = marketEvidence(m); const out: AreaInsight[] = [];
  const name = d.neighborhood ?? d.city;

  out.push({ kind: "summary", title: `סקירת ${name}`, body: areaSummary(d), evidence: ev });

  if (m.demandLevel === "high" && m.supplyLevel === "low")
    out.push({ kind: "buy", title: "הזדמנות קנייה", body: `${name} מציג ביקוש גבוה מול היצע מצומצם — נכסים איכותיים נחטפים מהר. כדאי לפעול במהירות על הזדמנויות.`, evidence: ev });
  if (m.priceReductions >= 3 || m.supplyLevel === "high")
    out.push({ kind: "buy", title: "מרחב למשא ומתן", body: `יש ${m.priceReductions} ירידות מחיר ו${SUPPLY_HE(m)} ב${name} — סביבה נוחה לקונים ולמשא ומתן.`, evidence: ev });

  if (m.demandLevel === "high" || (m.priceTrendPct ?? 0) > 3)
    out.push({ kind: "sell", title: "הזדמנות מכירה", body: `${TREND_HE(m)} ו${DEMAND_HE(m)} ב${name} — תנאים תומכים למוכרים. תמחור נכון עשוי למקסם את הערך.`, evidence: ev });

  if ((m.priceTrendPct ?? 0) > 4 && m.transactions >= 5)
    out.push({ kind: "invest", title: "תובנת השקעה", body: `מחירי ${name} עלו ${pct(m.priceTrendPct)} עם פעילות עסקאות ערה — אזור עם מומנטום להשקעה.`, evidence: ev });
  if (m.rentalPct >= 30)
    out.push({ kind: "invest", title: "פוטנציאל השכרה", body: `${Math.round(m.rentalPct)}% מההיצע ב${name} הוא להשכרה — שוק שכירות פעיל למשקיעים.`, evidence: [`${Math.round(m.rentalPct)}% השכרה`] });

  if (m.supplyLevel === "high" && m.demandLevel === "low")
    out.push({ kind: "warning", title: "אזהרת שוק", body: `היצע עודף וביקוש מתון ב${name} — ייתכן לחץ על מחירים. תמחור ובידול קריטיים.`, evidence: ev });

  if (m.luxuryPct >= 25)
    out.push({ kind: "luxury", title: "מגמת יוקרה", body: `${Math.round(m.luxuryPct)}% מההיצע ב${name} בקטגוריית יוקרה — ריכוז נכסים ברמה גבוהה.`, evidence: [`${Math.round(m.luxuryPct)}% יוקרה`] });

  out.push({ kind: "demand", title: "מצב הביקוש", body: `${DEMAND_HE(m)} ב${name}, מבוסס על קצב העסקאות וההיצע הזמין.`, evidence: ev });

  out.push({ kind: "outlook", title: "מבט קדימה", body: outlook(m, name), evidence: ev });

  return out;
}

function outlook(m: AreaMarket, name: string): string {
  if (m.momentum === "up") return `אם המגמה תימשך, ${name} צפוי להמשיך למשוך ביקוש. מומלץ לעקוב אחר קצב העסקאות וההיצע.`;
  if (m.momentum === "down") return `${name} מראה התקררות. הזדמנויות עשויות להיפתח לקונים סבלניים.`;
  return `${name} יציב יחסית. שינוי בהיצע או בביקוש עשוי לפתוח חלון הזדמנות.`;
}

/** City-level opportunities: rank neighborhoods by a public opportunity proxy. */
export function cityOpportunities(d: AreaData): AreaInsight[] {
  return [...d.neighborhoods]
    .filter((n) => n.transactions > 0 || n.inventory > 0)
    .sort((a, b) => (b.transactions + b.inventory) - (a.transactions + a.inventory))
    .slice(0, 4)
    .map((n) => ({ kind: "buy" as const, title: `${n.name}`, body: `${n.inventory} נכסים פעילים · ${n.transactions} עסקאות${n.avgPrice != null ? ` · ממוצע ${fmt(n.avgPrice)}` : ""}.`, evidence: [`${n.inventory} נכסים`, `${n.transactions} עסקאות`] }));
}

export function cityRecommendation(d: AreaData): string {
  const top = [...d.neighborhoods].sort((a, b) => (b.transactions + b.inventory) - (a.transactions + a.inventory))[0];
  if (top) return `הפעילות הגבוהה ביותר ב${d.city} מרוכזת ב${top.name}. כדאי להתמקד שם לאיתור הזדמנויות קנייה, מכירה וגיוס.`;
  return `${d.city} — עקבו אחר האזורים הפעילים ביותר לזיהוי חלונות הזדמנות.`;
}
