// ============================================================================
// ZONO Price Intelligence — premium seller PRESENTATION (PURE, client-safe).
// Builds a luxury, consulting-grade RTL Hebrew presentation from a completed
// valuation record + its AI intelligence. Slide-styled + print-to-PDF friendly.
// Uses ONLY real computed values; with no usable data it presents an honest
// "insufficient data" slide instead of fabricated numbers.
// ============================================================================
import type { ReportPayload } from "./report";
import type { ValuationIntelligence } from "./types";
import {
  CONFIDENCE_LABEL, DEMAND_LABEL, PRICE_POSITION_LABEL, VALUATION_DISCLAIMER, SOURCE_LABEL,
} from "./types";

const fmt = (n: number | null | undefined) => `₪${Math.round(Number(n ?? 0)).toLocaleString("he-IL")}`;
const money = (n: number | null | undefined) => (n != null && Number(n) > 0 ? fmt(n) : "—");
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Self-contained luxury HTML presentation (slides + print view). */
export function renderPresentationHtml(payload: ReportPayload): string {
  const { brand, valuation: v, generatedAt } = payload;
  const r = v.result;
  const i = v.input;
  const intel = r?.intelligence;
  const neg = intel?.negotiationAnalysis;
  const cb = intel?.confidenceBreakdown;
  const m = v.market;
  const brandColor = brand.brandColor || "#4c1d95";
  const gold = "#c9a24b";
  const addr = [i.street, i.houseNumber, i.neighborhood, i.city].filter(Boolean).join(" ") || i.city || "הנכס";
  const date = new Date(generatedAt).toLocaleDateString("he-IL");
  const available = r?.valuationAvailable !== false && (r?.estimatedValue ?? 0) > 0;

  // ONLY traceable comparables reach the shared presentation (VAL-QA-7).
  const comps = [...v.comparables].filter((c) => (c.pricePerSqm ?? 0) > 0 && c.isTraceable !== false)
    .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0)).slice(0, 8);
  const soldComps = comps.filter((c) => c.comparableType === "sold");
  const sourceList = [...new Set(v.comparables.map((c) => SOURCE_LABEL[c.source] ?? c.source))];

  const slide = (eyebrow: string, title: string, body: string, n: number) => `
    <section class="slide">
      <div class="slide-inner">
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h2>${esc(title)}</h2>
        ${body}
      </div>
      <div class="slide-foot"><span>ZONO · ${esc(brand.brokerName || brand.orgName)}</span><span>${String(n).padStart(2, "0")}</span></div>
    </section>`;

  const kpi = (l: string, val: string, sub = "") => `<div class="kpi"><div class="kpi-l">${esc(l)}</div><div class="kpi-v">${val}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ""}</div>`;
  const list = (items: string[]) => items.length ? `<ul class="lux-list">${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p class="muted">אין נתונים זמינים בתחום זה.</p>`;

  // ── No-data path — honest, never fabricated ────────────────────────────────
  if (!available) {
    const slides = [
      slide("ZONO · הערכת שווי", esc(addr), `<p class="lede">${esc(brand.brokerName || brand.orgName)} · ${esc(date)}</p>`, 1),
      slide("שקיפות", "לא נמצאו מספיק נתונים להערכת שווי אמינה", `
        <p class="lede">${esc(r?.unavailableReason || "טרם נאספו מספיק עסקאות ומודעות להשוואה באזור.")}</p>
        ${(r?.missingData?.length) ? `<div class="block"><h3>נתונים חסרים</h3>${list(r!.missingData!.map(esc))}</div>` : ""}
        ${r?.recommendedAction ? `<div class="cta-line">המלצה: ${esc(r.recommendedAction)}</div>` : ""}`, 2),
    ].join("");
    return shell(addr, brandColor, gold, brand, slides);
  }

  // ── Section bodies (all from real data) ────────────────────────────────────
  const execBody = `
    <p class="lede">${esc(intel?.explanation || r?.explanation || "")}</p>
    <div class="kpis hero-kpis">
      ${kpi("שווי מוערך", fmt(r?.estimatedValue))}
      ${kpi("טווח", `${fmt(r?.lowValue)} – ${fmt(r?.highValue)}`)}
      ${kpi("רמת ביטחון", `${r?.confidenceScore ?? 0}%`, esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"]))}
      ${intel ? kpi("מיצוב מחיר", esc(PRICE_POSITION_LABEL[intel.marketPosition])) : ""}
    </div>`;

  const confItems = cb ? [
    `עדכניות נתונים: <b>${cb.dataFreshness ?? "—"}</b>`,
    `כמות השוואות: <b>${cb.comparableCount ?? "—"}</b>`,
    `דמיון השוואות: <b>${cb.comparableSimilarity ?? "—"}</b>`,
    `קרבה גאוגרפית: <b>${cb.distance ?? "—"}</b>`,
    `אמינות מקורות: <b>${cb.sourceReliability ?? "—"}</b>`,
    `איכות עסקאות: <b>${cb.transactionQuality ?? "—"}</b>`,
    `שלמות נתוני הנכס: <b>${cb.missingInformation ?? "—"}</b>`,
  ] : [];

  const insightVal = (key: string) => intel?.marketInsights.find((x) => x.key === key)?.value ?? "—";

  const compsTable = comps.length ? `<table class="lux-table"><thead><tr>
      <th>מקור</th><th>כתובת</th><th>חדרים</th><th>שטח</th><th>מחיר</th><th>למ"ר</th><th>התאמה</th><th>קישור</th></tr></thead><tbody>
      ${comps.map((c) => `<tr><td>${esc(SOURCE_LABEL[c.source] ?? c.source)}</td>
        <td>${esc(c.street || c.neighborhood || c.city || "—")}</td><td>${c.rooms ?? "—"}</td>
        <td>${c.sqm ?? "—"}</td><td>${money(c.price)}</td><td>${c.pricePerSqm ? fmt(c.pricePerSqm) : "—"}</td>
        <td>${c.similarityScore ?? "—"}%</td>
        <td>${c.originalUrl && /^https?:\/\//.test(c.originalUrl) ? `<a href="${esc(c.originalUrl)}" target="_blank" rel="noreferrer">פתח מודעה ↗</a>` : "מקור פנימי"}</td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">לא נמצאו עסקאות/מודעות להשוואה ישירה.</p>`;

  const recentRows = [
    ...soldComps.map((c) => ({ addr: c.street || c.neighborhood || c.city || "—", price: c.price, ppsqm: c.pricePerSqm, date: c.saleDate })),
    ...v.brokerSold.map((b) => ({ addr: b.address || b.neighborhood || "—", price: b.salePrice, ppsqm: b.pricePerSqm, date: b.saleDate })),
  ].slice(0, 8);
  const recentTable = recentRows.length ? `<table class="lux-table"><thead><tr><th>כתובת</th><th>מחיר מכירה</th><th>למ"ר</th><th>תאריך</th></tr></thead><tbody>
      ${recentRows.map((x) => `<tr><td>${esc(x.addr)}</td><td>${money(x.price)}</td><td>${x.ppsqm ? fmt(x.ppsqm) : "—"}</td><td>${esc((x.date || "").slice(0, 10) || "—")}</td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">טרם נרשמו עסקאות מכירה מאומתות באזור.</p>`;

  const strategies = (r?.strategies ?? []).map((s) => `<div class="strat${s.recommended ? " rec" : ""}">
      <div class="strat-h">${esc(s.label)}${s.recommended ? ' <span class="tag">מומלץ</span>' : ""}</div>
      <div class="strat-price">${fmt(s.price)}</div>
      <div class="strat-meta">סיכוי מכירה ${s.saleProbability}% · ${s.daysOnMarket} ימים · סיכון ${esc(s.risk)}</div></div>`).join("");

  const strengths = (intel?.strengths ?? []).map((x) => `<b>${esc(x.label)}</b> — ${esc(x.detail)}`);
  const weaknesses = (intel?.weaknesses ?? []).map((x) => `<b>${esc(x.label)}</b> — ${esc(x.detail)}`);
  const sellerTips = buildSellerTips(intel);

  const trustItems = [
    `ההערכה מבוססת על ${r?.debug?.comparableCount ?? v.comparables.length} השוואות${sourceList.length ? ` ממקורות: ${sourceList.join(", ")}` : ""}.`,
    "עדיפות ניתנה לעסקאות שנסגרו על פני מודעות פעילות.",
    `הוסרו ${r?.debug?.outliersRemoved ?? 0} ערכים חריגים כדי למנוע הטיית מחיר.`,
    `רמת הביטחון (${esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"])}) נגזרת מכמות העסקאות, קרבתן, עדכניותן ושלמות פרטי הנכס.`,
    ...(r?.estimatedAccuracy?.text ? [esc(r.estimatedAccuracy.text)] : []),
  ];

  const slides = [
    // 1 — Cover / Executive headline
    slide("ZONO · דוח הערכת שווי", esc(addr), `
      <p class="lede">${esc(brand.brokerName || brand.orgName)} · ${esc(date)}</p>
      <div class="hero-value">${fmt(r?.estimatedValue)}</div>
      <div class="hero-sub">שווי מוערך · רמת ביטחון ${r?.confidenceScore ?? 0}% · ${esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"])}</div>`, 1),
    // 2 — Executive Summary
    slide("סיכום מנהלים", "תמונת מצב", execBody, 2),
    // 3 — Estimated Value + Price per sqm
    slide("הערכת שווי", "השווי והמחיר למ\"ר", `<div class="kpis">
        ${kpi("שווי מוערך", fmt(r?.estimatedValue))}
        ${kpi('מחיר מוערך למ"ר', fmt(r?.estimatedPricePerSqm))}
        ${kpi('מחיר בסיס למ"ר', r?.basePpsqm ? fmt(r.basePpsqm) : "—")}
        ${kpi('מחיר משוקלל למ"ר', r?.debug?.weightedPricePerSqm ? fmt(r.debug.weightedPricePerSqm) : "—")}
      </div>`, 3),
    // 4 — Confidence breakdown
    slide("שקיפות", "ניתוח רמת הביטחון", `<div class="kpis"><div class="kpi big"><div class="kpi-v">${r?.confidenceScore ?? 0}%</div><div class="kpi-l">${esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"])}</div></div></div>${list(confItems)}`, 4),
    // 5 — Market Trend
    slide("דופק השוק", "מגמת מחירים", `<div class="kpis">
        ${kpi("מגמה", m ? `${m.trendDirection === "up" ? "↑" : m.trendDirection === "down" ? "↓" : "→"} ${m.trendPercent}%` : "—")}
        ${kpi('מחיר חציוני למ"ר', insightVal("median_ppsqm"))}
        ${kpi('מחיר ממוצע למ"ר', insightVal("avg_ppsqm"))}
      </div>`, 5),
    // 6 — Area Statistics
    slide("האזור", "סטטיסטיקת אזור", `<div class="kpis">
        ${kpi("עסקאות שנסגרו", insightVal("recent_sold"))}
        ${kpi("מודעות פעילות", insightVal("active_listings"))}
        ${kpi("ביקוש", m ? esc(DEMAND_LABEL[m.demandLevel]) : "—")}
        ${kpi("היצע", m ? esc(DEMAND_LABEL[m.supplyLevel]) : "—")}
      </div>`, 6),
    // 7 — Comparable Properties
    slide("ראיות", "נכסים להשוואה", compsTable, 7),
    // 8 — Recent Transactions
    slide("ראיות", "עסקאות שנסגרו לאחרונה", recentTable, 8),
    // 9 — Supply vs Demand
    slide("דינמיקת שוק", "היצע מול ביקוש", `<div class="kpis">
        ${kpi("ביקוש", m ? esc(DEMAND_LABEL[m.demandLevel]) : "—")}
        ${kpi("היצע", m ? esc(DEMAND_LABEL[m.supplyLevel]) : "—")}
        ${kpi("קצב ספיגה", insightVal("absorption"))}
        ${kpi("פער מבוקש/נסגר", insightVal("ask_gap"))}
      </div>`, 9),
    // 10 — Competition Analysis
    slide("תחרות", "ניתוח תחרות באזור", `<div class="kpis">
        ${kpi("מודעות מתחרות", insightVal("active_listings"))}
        ${kpi("עוצמת היצע", m ? esc(DEMAND_LABEL[m.supplyLevel]) : "—")}
        ${kpi("פרמיית מבוקש", insightVal("ask_gap"))}
      </div><p class="note">ככל שההיצע גבוה והפער בין המחיר המבוקש לנסגר גדל — נדרש תמחור מדויק יותר.</p>`, 10),
    // 11–14 — Negotiation block
    slide("אסטרטגיה", "מחיר מומלץ וצפי מכירה", `<div class="kpis">
        ${kpi("מחיר מומלץ לפרסום", neg ? fmt(neg.recommendedAsking) : money(r?.recommendedListingPrice))}
        ${kpi("מחיר צפוי לסגירה", neg ? fmt(neg.expectedSelling) : money(r?.targetClosingPrice))}
        ${kpi("מרווח משא ומתן", neg ? `${fmt(neg.negotiationMargin)} (${neg.expectedDiscountPercent}%)` : "—")}
        ${kpi("זמן מכירה מוערך", `${r?.daysOnMarketEstimate ?? "—"} ימים`)}
      </div>
      <div class="price-ladder">
        ${kpi("מחיר למכירה מהירה", neg ? fmt(neg.quickSalePrice) : "—")}
        ${kpi("מחיר אופטימלי", neg ? fmt(neg.optimalSalePrice) : "—")}
        ${kpi("מחיר פרמיום", neg ? fmt(neg.premiumPrice) : "—")}
      </div>`, 11),
    // 15 — Marketing Strategy
    slide("שיווק", "אסטרטגיית שיווק", `<p class="lede">${esc(neg?.listingStrategy || "")}</p>${list(buildMarketing(intel))}`, 12),
    // 16 — Risk Analysis
    slide("ניהול סיכונים", "ניתוח סיכונים", `<div class="kpis">
        ${kpi("סיכון תמחור יתר", `${r?.overpricingRiskScore ?? "—"}`)}
        ${kpi("נזילות", `${r?.liquidityScore ?? "—"}`)}
      </div>${list(weaknesses)}`, 13),
    // 17 — Pricing Recommendations
    slide("המלצות", "אסטרטגיות תמחור", `<div class="strats">${strategies || '<div class="muted">—</div>'}</div>`, 14),
    // 18 — Seller Tips (+ strengths)
    slide("ליווי", "המלצות למוכר", `${strengths.length ? `<div class="block"><h3>נקודות החוזק של הנכס</h3>${list(strengths)}</div>` : ""}<div class="block"><h3>טיפים</h3>${list(sellerTips)}</div>`, 15),
    // 19 — Why trustworthy
    slide("אמון", "מדוע ההערכה אמינה", list(trustItems), 16),
  ].join("");

  return shell(addr, brandColor, gold, brand, slides);
}

// ── Derived, data-gated helper content ────────────────────────────────────────
function buildSellerTips(intel: ValuationIntelligence | undefined): string[] {
  const tips: string[] = [];
  if (!intel) return ["להשלים נתוני נכס מלאים לקבלת המלצות מדויקות יותר."];
  if (intel.marketInsights.find((x) => x.key === "demand")?.value === "גבוה") tips.push("הביקוש באזור גבוה — מומלץ לצאת לשוק בתמחור החזק שזוהה.");
  if (intel.weaknesses.some((w) => w.key === "slow_sale")) tips.push("צפי זמן מכירה ארוך — להשקיע בצילום מקצועי ובשיווק ממוקד מההתחלה.");
  if (intel.weaknesses.some((w) => w.key === "oversupply")) tips.push("תחרות גבוהה — לתמחר קרוב לשווי כדי לבלוט מול מודעות מתחרות.");
  if (intel.strengths.some((s) => s.key === "renovated")) tips.push("מצב הנכס מצוין — להדגיש זאת בכל חומרי השיווק.");
  tips.push("להכין את הנכס לסיורים: סדר, תאורה והסרת חפצים אישיים מגדילים את שיעור ההצעות.");
  return tips;
}

function buildMarketing(intel: ValuationIntelligence | undefined): string[] {
  const out = [
    "פרסום בפורטלים המובילים (יד2, Madlan) עם צילום מקצועי וסרטון.",
    "קמפיין ממוקד ברשתות החברתיות לקהל הרלוונטי באזור.",
    "פנייה יזומה למאגר הקונים והמתעניינים הקיים.",
  ];
  if (intel?.marketInsights.find((x) => x.key === "demand")?.value === "גבוה") out.unshift("מינוף הביקוש הגבוה: יום מכירות מרוכז להגדלת מספר ההצעות.");
  return out;
}

// ── Luxury document shell ──────────────────────────────────────────────────────
function shell(addr: string, brandColor: string, gold: string, brand: ReportPayload["brand"], slides: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>מצגת הערכת שווי — ${esc(addr)}</title>
<style>
:root{--brand:${brandColor};--gold:${gold}}
*{box-sizing:border-box}
body{margin:0;font-family:"Frank Ruhl Libre","Heebo","Assistant",serif;color:#1b1430;background:#0f0a1e}
.deck{max-width:980px;margin:0 auto}
.no-print{position:sticky;top:0;z-index:5;display:flex;gap:10px;justify-content:center;padding:14px;background:#0f0a1e}
.btn{background:var(--gold);color:#1b1430;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
.btn.ghost{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.slide{background:#fffdf9;margin:0 16px 18px;border-radius:18px;padding:46px;position:relative;min-height:62vh;display:flex;flex-direction:column;justify-content:center;box-shadow:0 24px 60px rgba(0,0,0,.35);border-top:4px solid var(--gold)}
.slide-inner{flex:1;display:flex;flex-direction:column;justify-content:center}
.eyebrow{color:var(--gold);font-weight:800;letter-spacing:.18em;font-size:12px;font-family:"Heebo",sans-serif;text-transform:uppercase;margin-bottom:8px}
.slide h2{font-size:34px;margin:0 0 18px;color:var(--brand);font-weight:800;line-height:1.15}
.slide h3{font-size:18px;color:var(--brand);margin:0 0 8px}
.lede{font-size:17px;line-height:1.7;color:#3a3252;max-width:62ch}
.hero-value{font-size:58px;font-weight:900;color:var(--brand);letter-spacing:-1px;margin:14px 0 4px}
.hero-sub{font-size:15px;color:#6b6385;font-family:"Heebo",sans-serif}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}
.hero-kpis{margin-top:22px}
.kpi{flex:1;min-width:150px;background:#faf6ef;border:1px solid #efe6d4;border-radius:14px;padding:16px}
.kpi.big{min-width:220px;text-align:center}.kpi.big .kpi-v{font-size:40px}
.kpi-l{font-size:12px;color:#8a7f6a;font-weight:700;font-family:"Heebo",sans-serif}
.kpi-v{font-size:23px;font-weight:900;color:var(--brand);margin-top:4px}
.kpi-s{font-size:12px;color:#6b6385;margin-top:2px}
.price-ladder{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px}
.lux-list{margin:8px 0 0;padding:0;list-style:none}
.lux-list li{padding:9px 0;border-bottom:1px solid #efe6d4;font-size:15px;line-height:1.6;position:relative;padding-inline-start:18px}
.lux-list li::before{content:"◆";color:var(--gold);position:absolute;inset-inline-start:0;font-size:10px;top:12px}
.lux-table{width:100%;border-collapse:collapse;font-size:13px;font-family:"Heebo",sans-serif}
.lux-table th,.lux-table td{text-align:right;padding:9px 8px;border-bottom:1px solid #efe6d4}
.lux-table th{color:#8a7f6a;font-size:11px;font-weight:800}
.muted{color:#9a8f7a;padding:14px 0}.note{color:#6b6385;font-size:14px;margin-top:12px}
.block{margin-top:14px}
.cta-line{margin-top:14px;background:#f6efff;border:1px solid #e7dbff;border-radius:12px;padding:14px;font-weight:800;color:var(--brand)}
.strats{display:flex;gap:14px;flex-wrap:wrap}
.strat{flex:1;min-width:180px;border:1px solid #efe6d4;border-radius:14px;padding:16px;background:#faf6ef}
.strat.rec{border-color:var(--gold);box-shadow:0 0 0 2px rgba(201,162,75,.25)}
.strat-h{font-weight:800;color:var(--brand)}.tag{background:var(--gold);color:#1b1430;border-radius:999px;padding:1px 9px;font-size:11px}
.strat-price{font-size:24px;font-weight:900;color:var(--brand);margin:6px 0}.strat-meta{font-size:12px;color:#6b6385;font-family:"Heebo",sans-serif}
.slide-foot{display:flex;justify-content:space-between;color:#9a8f7a;font-size:11px;font-family:"Heebo",sans-serif;border-top:1px solid #efe6d4;padding-top:12px;margin-top:18px}
.disclaimer{color:#7a7290;font-size:11px;text-align:center;padding:18px;font-family:"Heebo",sans-serif}
body.present .slide{min-height:100vh;margin:0;border-radius:0;scroll-snap-align:start}
body.present .deck{max-width:none}
@media print{.no-print{display:none}body{background:#fff}.slide{box-shadow:none;break-after:page;min-height:auto;margin:0 0 10mm}}
</style></head>
<body><div class="deck">
  <div class="no-print">
    <button class="btn" onclick="window.print()">ייצוא ל‑PDF</button>
    <button class="btn ghost" onclick="document.body.classList.toggle('present');document.documentElement.style.scrollSnapType=document.body.classList.contains('present')?'y mandatory':'';">מצב מצגת</button>
  </div>
  ${slides}
  <div class="disclaimer">${esc(VALUATION_DISCLAIMER)} · ${esc(brand.orgName)} ZONO</div>
</div></body></html>`;
}
