// ============================================================================
// ZONO Price Intelligence — seller-facing report builder (PURE, client-safe).
// Builds the report payload + a self-contained branded HTML document (RTL,
// print-to-PDF friendly) with all 9 sections + the mandatory indicative
// disclaimer. Uses ONLY real computed values from the valuation record.
// ============================================================================
import type { ValuationRecord, ValuationQualityLevel } from "./types";
import { SOURCE_LABEL, CONFIDENCE_LABEL, DEMAND_LABEL, STRATEGY_LABEL, VALUATION_DISCLAIMER } from "./types";
import { normalizedComparableWeights } from "./valuation-engine";

const QUALITY_LABEL: Record<ValuationQualityLevel, string> = {
  high: "גבוהה", medium: "בינונית", low: "נמוכה", insufficient: "לא מספקת",
};
const TIER_LABEL: Record<string, string> = {
  building: "אותו בניין", street: "אותו רחוב", neighborhood: "אותה שכונה",
  r300: "רדיוס 300 מ'", r700: "רדיוס 700 מ'", city: "כלל העיר",
};

export interface ReportBrand {
  orgName: string;
  brokerName?: string | null;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
  logoUrl?: string | null;
  propertyImageUrl?: string | null;
  brandColor?: string | null;
  publicUrl?: string | null; // link/QR target
}

export interface ReportPayload {
  generatedAt: string;
  brand: ReportBrand;
  valuation: ValuationRecord;
}

export function buildReportPayload(record: ValuationRecord, brand: ReportBrand): ReportPayload {
  return { generatedAt: new Date().toISOString(), brand, valuation: record };
}

const fmt = (n: number | null | undefined) => `₪${Math.round(Number(n ?? 0)).toLocaleString("he-IL")}`;
/** Money or em-dash — never renders a misleading ₪0 for missing values. */
const money = (n: number | null | undefined) => (n != null && Number(n) > 0 ? fmt(n) : "—");
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Self-contained branded HTML for the seller report (used as html_snapshot + print view). */
export function renderReportHtml(payload: ReportPayload): string {
  const { brand, valuation: v, generatedAt } = payload;
  const r = v.result;
  const i = v.input;
  const brandColor = brand.brandColor || "#7c3aed";
  const addr = [i.street, i.houseNumber, i.neighborhood, i.city].filter(Boolean).join(" ") || i.city || "נכס";
  const date = new Date(generatedAt).toLocaleDateString("he-IL");

  const specRows: [string, string][] = [
    ["סוג נכס", esc(i.propertyType || "—")],
    ["חדרים", i.rooms ? String(i.rooms) : "—"],
    ['שטח בנוי (מ"ר)', i.builtSqm ? String(i.builtSqm) : "—"],
    ["קומה", i.floor != null ? `${i.floor}${i.totalFloors ? ` מתוך ${i.totalFloors}` : ""}` : "—"],
    ["מעלית", i.elevator ? "יש" : "אין"],
    ["חניות", i.parkingCount != null ? String(i.parkingCount) : "—"],
    ['ממ"ד', i.mamad ? "יש" : "אין"],
    ["מחסן", i.storage ? "יש" : "אין"],
    ['מרפסת (מ"ר)', i.balconySqm ? String(i.balconySqm) : "—"],
    ["שנת בנייה", i.buildingYear ? String(i.buildingYear) : "—"],
  ];

  // ── AVM availability + QA metadata (Phase 3) ───────────────────────────────
  const available = r?.valuationAvailable !== false && (r?.estimatedValue ?? 0) > 0;
  const debug = r?.debug ?? null;
  const quality = (r?.valuationQuality ?? (available ? r?.confidenceLevel : "insufficient")) as ValuationQualityLevel | undefined;

  // Comparables actually shown — ONLY traceable rows (real source row + raw
  // price + sqm). Untraceable evidence never reaches the shared report (VAL-QA-7).
  const comps = [...v.comparables]
    .filter((c) => (c.pricePerSqm ?? 0) > 0 && c.isTraceable !== false)
    .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0))
    .slice(0, 12);
  const weights = normalizedComparableWeights(i, comps);

  // Sources used, grouped the way the agent expects to see them.
  const sourceCounts = new Map<string, number>();
  for (const c of v.comparables) {
    const key = c.source === "zono"
      ? (c.comparableType === "sold" ? "עסקאות פנימיות (ZONO)" : "נכסים פנימיים (ZONO)")
      : c.source === "govmap" ? "GovMap (עסקאות רשמיות)"
      : c.source === "madlan" ? "Madlan"
      : c.source === "yad2" ? "יד2"
      : c.source === "tax_authority" ? "רשות המסים"
      : "ייבוא חיצוני";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const sourceList = [...sourceCounts.entries()];

  const pos = v.adjustments.filter((a) => a.direction === "positive");
  const neg = v.adjustments.filter((a) => a.direction === "negative");

  const section = (title: string, body: string) =>
    `<section class="card"><h2>${esc(title)}</h2>${body}</section>`;

  const compsRows = comps.length
    ? comps.map((c, idx) => `<tr>
        <td><span class="badge${c.isDemo ? " demo" : ""}">${esc(SOURCE_LABEL[c.source] ?? c.source)}${c.isDemo ? " · דמו" : ""}</span></td>
        <td>${esc(c.street || c.neighborhood || c.city || "—")}</td>
        <td>${esc(c.propertyType || "—")}</td>
        <td>${c.rooms ?? "—"}</td>
        <td>${c.sqm ?? "—"}</td>
        <td>${c.floor != null ? c.floor : "—"}</td>
        <td>${money(c.price)}</td>
        <td>${c.pricePerSqm ? fmt(c.pricePerSqm) : "—"}</td>
        <td>${c.comparableType === "sold" ? "עסקה" : "מודעה"}${(c.saleDate || c.listingDate) ? `<br><span class="muted-inline">${esc((c.saleDate || c.listingDate || "").slice(0, 10))}</span>` : ""}</td>
        <td>${c.distanceMeters != null ? `${Math.round(c.distanceMeters)} מ'` : "—"}</td>
        <td>${c.similarityScore ?? "—"}%</td>
        <td>${weights[idx] != null ? `${weights[idx]}%` : "—"}</td>
        <td>${c.originalUrl && /^https?:\/\//.test(c.originalUrl) ? `<a href="${esc(c.originalUrl)}" target="_blank" rel="noreferrer">פתח מודעה ↗</a>` : '<span class="muted-inline">מקור פנימי · אין קישור</span>'}</td>
      </tr>`).join("")
    : `<tr><td colspan="13" class="muted">לא נמצאו עסקאות/מודעות להשוואה ישירה באזור.</td></tr>`;

  const brokerRows = v.brokerSold.length
    ? v.brokerSold.slice(0, 8).map((b) => `<tr>
        <td>${esc(b.address || b.neighborhood || "—")}</td>
        <td>${money(b.salePrice)}</td>
        <td>${b.pricePerSqm ? fmt(b.pricePerSqm) : "—"}</td>
        <td>${b.saleDate ? esc(b.saleDate) : "—"}</td>
        <td>${b.performanceVsMarketPercent != null ? `${b.performanceVsMarketPercent > 0 ? "+" : ""}${b.performanceVsMarketPercent}%` : "—"}</td>
      </tr>`).join("")
    : "";

  const strategies = (r?.strategies ?? []).map((s) => `<div class="strat${s.recommended ? " rec" : ""}">
      <div class="strat-h">${esc(STRATEGY_LABEL[s.key] ?? s.label)}${s.recommended ? ' <span class="rec-tag">מומלץ</span>' : ""}</div>
      <div class="strat-price">${fmt(s.price)}</div>
      <div class="strat-meta">סיכוי מכירה ${s.saleProbability}% · ${s.daysOnMarket} ימים · סיכון ${esc(s.risk)}</div>
    </div>`).join("");

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>דוח הערכת שווי — ${esc(addr)}</title>
<style>
:root{--brand:${brandColor}}
*{box-sizing:border-box}
body{margin:0;font-family:"Heebo","Assistant",-apple-system,system-ui,sans-serif;color:#1c1530;background:#f6f4fb;line-height:1.6}
.page{max-width:840px;margin:0 auto;padding:28px}
.cover{background:linear-gradient(135deg,var(--brand),#3b1d6e);color:#fff;border-radius:24px;padding:36px;margin-bottom:20px;position:relative;overflow:hidden}
.cover .logo{height:40px;margin-bottom:18px}
.cover h1{font-size:30px;margin:6px 0;font-weight:900}
.cover .sub{opacity:.92;font-size:15px}
.cover .hero-img{width:100%;height:200px;object-fit:cover;border-radius:16px;margin-top:18px;border:1px solid rgba(255,255,255,.2)}
.value{font-size:44px;font-weight:900;letter-spacing:-1px;margin-top:14px}
.range{opacity:.9;font-size:14px}
.card{background:#fff;border:1px solid #ece7f7;border-radius:18px;padding:22px;margin-bottom:16px;box-shadow:0 6px 20px rgba(124,58,237,.05)}
.card h2{font-size:18px;margin:0 0 14px;color:var(--brand);font-weight:800}
.kpis{display:flex;gap:12px;flex-wrap:wrap}
.kpi{flex:1;min-width:150px;background:#faf8ff;border:1px solid #efeafb;border-radius:14px;padding:14px}
.kpi .l{font-size:12px;color:#6b6385;font-weight:700}
.kpi .v{font-size:20px;font-weight:900;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:right;padding:9px 8px;border-bottom:1px solid #f0ecf9}
th{color:#6b6385;font-weight:700;font-size:12px}
.badge{background:#efeafb;color:var(--brand);border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700}
.badge.demo{background:#fff3d6;color:#9a6b00}
.muted{color:#8a82a0;text-align:center;padding:18px}
.spec{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}
.spec .row{display:flex;justify-content:space-between;border-bottom:1px solid #f3f0fa;padding:6px 0;font-size:14px}
.spec .row b{color:#1c1530}
.factors{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.factors ul{margin:0;padding:0;list-style:none}
.factors li{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f3f0fa;font-size:13px}
.pos{color:#0f9d6b;font-weight:800}.neg{color:#e0455e;font-weight:800}
.strats{display:flex;gap:12px;flex-wrap:wrap}
.strat{flex:1;min-width:170px;border:1px solid #efeafb;border-radius:14px;padding:14px;background:#faf8ff}
.strat.rec{border-color:var(--brand);box-shadow:0 0 0 2px rgba(124,58,237,.15)}
.strat-h{font-weight:800;font-size:15px}.rec-tag{background:var(--brand);color:#fff;border-radius:999px;padding:1px 8px;font-size:11px}
.strat-price{font-size:22px;font-weight:900;margin:6px 0}
.strat-meta{font-size:12px;color:#6b6385}
.cta{background:linear-gradient(135deg,var(--brand),#3b1d6e);color:#fff;border-radius:18px;padding:24px;text-align:center}
.cta h2{color:#fff}
.contact{font-size:15px;margin-top:8px}
.tw{overflow-x:auto}
.muted-inline{color:#8a82a0;font-size:11px}
.srcs{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
.src{display:flex;justify-content:space-between;border-bottom:1px solid #f3f0fa;padding:6px 0;font-size:14px}
.src b{color:var(--brand)}
.rec-action{margin-top:10px;background:#faf5ff;border:1px solid #efeafb;border-radius:12px;padding:12px;font-weight:700;color:var(--brand)}
.method{background:#faf8ff;border:1px solid #efeafb;border-radius:12px;padding:12px 16px;margin:12px 0}
.method-h{font-weight:800;color:var(--brand);margin-bottom:6px}
.method ul{margin:0;padding-inline-start:18px}.method li{font-size:13px;padding:3px 0}
.disclaimer{font-size:12px;color:#6b6385;background:#f3f0fa;border-radius:12px;padding:14px;margin-top:16px}
.no-print{margin:16px 0;text-align:center}
.print-btn{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:800;cursor:pointer}
@media print{.no-print{display:none}body{background:#fff}.card,.cover,.cta{box-shadow:none}}
</style></head>
<body><div class="page">
  <div class="no-print"><button class="print-btn" onclick="window.print()">הורד / הדפס כ‑PDF</button></div>

  <!-- 1. Cover -->
  <div class="cover">
    ${brand.logoUrl ? `<img class="logo" src="${esc(brand.logoUrl)}" alt="">` : `<div style="font-size:22px;font-weight:900">${esc(brand.orgName)}</div>`}
    <div class="sub">דוח הערכת שווי אינדיקטיבי</div>
    <h1>${esc(addr)}</h1>
    <div class="sub">${esc(brand.brokerName || brand.orgName)} · ${esc(date)}</div>
    ${brand.propertyImageUrl ? `<img class="hero-img" src="${esc(brand.propertyImageUrl)}" alt="">` : ""}
    ${available
      ? `<div class="value">${fmt(r?.estimatedValue)}</div>
    <div class="range">טווח: ${fmt(r?.lowValue)} – ${fmt(r?.highValue)} · רמת ביטחון: ${esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"])} (${r?.confidenceScore ?? 0}%) · איכות נתונים: ${esc(QUALITY_LABEL[quality ?? "low"])}</div>`
      : `<div class="value" style="font-size:24px">לא נמצאו מספיק נתונים להערכת שווי אמינה</div>
    <div class="range">נדרשת השלמת נתונים או סריקת עסקאות לפני הפקת הערכה.</div>`}
  </div>

  <!-- 1b. No-data panel (honest — never shows a fabricated zero value) -->
  ${!available ? section("מדוע לא הופקה הערכת שווי", `
    <p style="font-size:14px">${esc(r?.unavailableReason || "לא נמצאו מספיק עסקאות ומודעות עם מחיר להשוואה אמינה באזור.")}</p>
    ${(r?.missingData?.length) ? `<div style="margin-top:6px"><b>נתונים חסרים:</b> ${r!.missingData!.map(esc).join(" · ")}</div>` : ""}
    ${sourceList.length ? `<div style="margin-top:6px"><b>מקורות שנבדקו:</b> ${sourceList.map(([s, n]) => `${esc(s)} (${n})`).join(" · ")}</div>` : `<div style="margin-top:6px"><b>מקורות שנבדקו:</b> פנימי, GovMap, Madlan, יד2 — ללא תוצאות מספיקות.</div>`}
    ${r?.recommendedAction ? `<div class="rec-action">המלצה: ${esc(r.recommendedAction)}</div>` : ""}
  `) : ""}

  <!-- 2. Valuation summary -->
  ${available ? section("סיכום הערכה", `<div class="kpis">
    <div class="kpi"><div class="l">שווי מוערך</div><div class="v">${fmt(r?.estimatedValue)}</div></div>
    <div class="kpi"><div class="l">מחיר מומלץ לפרסום</div><div class="v">${fmt(r?.recommendedListingPrice)}</div></div>
    <div class="kpi"><div class="l">מחיר יעד לסגירה</div><div class="v">${fmt(r?.targetClosingPrice)}</div></div>
    <div class="kpi"><div class="l">מחיר למ"ר</div><div class="v">${fmt(r?.estimatedPricePerSqm)}</div></div>
  </div>`) : ""}

  <!-- 2b. AVM analysis stats -->
  ${available ? section("בסיס החישוב (AVM)", `<div class="kpis">
    <div class="kpi"><div class="l">מחיר ממוצע למ"ר</div><div class="v">${debug?.avgPricePerSqm ? fmt(debug.avgPricePerSqm) : "—"}</div></div>
    <div class="kpi"><div class="l">מחיר חציוני למ"ר</div><div class="v">${debug?.medianPricePerSqm ? fmt(debug.medianPricePerSqm) : "—"}</div></div>
    <div class="kpi"><div class="l">מחיר משוקלל למ"ר</div><div class="v">${debug?.weightedPricePerSqm ? fmt(debug.weightedPricePerSqm) : "—"}</div></div>
    <div class="kpi"><div class="l">השוואות בשימוש</div><div class="v">${debug?.comparableCount ?? v.comparables.length}</div></div>
    <div class="kpi"><div class="l">עסקאות / מודעות</div><div class="v">${debug?.soldComparableCount ?? "—"} / ${debug?.activeComparableCount ?? "—"}</div></div>
    <div class="kpi"><div class="l">רמת קרבה</div><div class="v">${esc(TIER_LABEL[debug?.fallbackLevel ?? ""] ?? "—")}</div></div>
    <div class="kpi"><div class="l">חריגים שהוסרו</div><div class="v">${debug?.outliersRemoved ?? 0}</div></div>
    <div class="kpi"><div class="l">איכות הערכה</div><div class="v">${esc(QUALITY_LABEL[quality ?? "low"])}</div></div>
  </div>`) : ""}

  <!-- 2c. Sources used -->
  ${sourceList.length ? section("מקורות הנתונים", `<div class="srcs">${sourceList.map(([s, n]) => `<div class="src"><span>${esc(s)}</span><b>${n}</b></div>`).join("")}</div>`) : ""}

  <!-- 3. Property details -->
  ${section("פרטי הנכס", `<div class="spec">${specRows.map(([k, val]) => `<div class="row"><span>${esc(k)}</span><b>${val}</b></div>`).join("")}</div>`)}

  <!-- 4. Market pulse -->
  ${available ? section("דופק השוק", `<div class="kpis">
    <div class="kpi"><div class="l">מחיר חציוני למ"ר</div><div class="v">${v.market?.medianPricePerSqm ? fmt(v.market.medianPricePerSqm) : "—"}</div></div>
    <div class="kpi"><div class="l">ביקוש</div><div class="v">${esc(DEMAND_LABEL[v.market?.demandLevel ?? "low"])}</div></div>
    <div class="kpi"><div class="l">היצע</div><div class="v">${esc(DEMAND_LABEL[v.market?.supplyLevel ?? "low"])}</div></div>
    <div class="kpi"><div class="l">מגמה</div><div class="v">${v.market ? (v.market.trendDirection === "up" ? "↑" : v.market.trendDirection === "down" ? "↓" : "→") + " " + v.market.trendPercent + "%" : "—"}</div></div>
  </div>`) : ""}

  <!-- 5. Comparable transactions -->
  ${section("עסקאות ומודעות בשימוש בהערכה", `<div class="tw"><table><thead><tr><th>מקור</th><th>כתובת</th><th>סוג נכס</th><th>חד׳</th><th>מ"ר</th><th>קומה</th><th>מחיר</th><th>למ"ר</th><th>סטטוס/תאריך</th><th>מרחק</th><th>התאמה</th><th>משקל</th><th>קישור</th></tr></thead><tbody>${compsRows}</tbody></table></div>`)}

  <!-- 6. Broker sold nearby (only if exists) -->
  ${v.brokerSold.length ? section("נכסים שמכרתי באזור", `<table><thead><tr><th>כתובת</th><th>מחיר מכירה</th><th>למ"ר</th><th>תאריך</th><th>מול השוק</th></tr></thead><tbody>${brokerRows}</tbody></table>`) : ""}

  <!-- 7. AI explanation + methodology -->
  ${section("הסבר ההערכה", `<p style="font-size:14px">${available ? esc(r?.explanation || "—") : esc(r?.unavailableReason || "לא נמצאו מספיק נתונים להפקת הערכת שווי.")}</p>
    ${available ? `<div class="method">
      <div class="method-h">איך חושבה ההערכה</div>
      <ul>
        <li>ההערכה מבוססת על ${debug?.comparableCount ?? v.comparables.length} השוואות${sourceList.length ? ` ממקורות: ${sourceList.map(([s]) => esc(s)).join(", ")}` : ""}.</li>
        <li>עדיפות ניתנה לעסקאות שנסגרו על פני מודעות פעילות (עסקאות סגורות מקבלות משקל גבוה יותר).</li>
        <li>רמת הקרבה ששימשה לחישוב: ${esc(TIER_LABEL[debug?.fallbackLevel ?? ""] ?? "כלל העיר")} — ההשוואות הקרובות ביותר מקבלות משקל גבוה יותר.</li>
        <li>הוסרו ${debug?.outliersRemoved ?? 0} ערכים חריגים כדי למנוע הטיית מחיר.</li>
        <li>רמת הביטחון (${esc(QUALITY_LABEL[quality ?? "low"])}) נגזרת מכמות העסקאות, מידת הקרבה, עדכניות הנתונים ושלמות פרטי הנכס.</li>
      </ul>
    </div>` : ""}
    <div class="factors">
      <div><div class="pos">מעלי ערך</div><ul>${pos.length ? pos.map((a) => `<li><span>${esc(a.label)}</span><b class="pos">${a.percentageImpact ? `+${a.percentageImpact}%` : fmt(a.valueImpact)}</b></li>`).join("") : '<li class="muted">—</li>'}</ul></div>
      <div><div class="neg">מורידי ערך</div><ul>${neg.length ? neg.map((a) => `<li><span>${esc(a.label)}</span><b class="neg">${a.percentageImpact ? `-${a.percentageImpact}%` : ""}</b></li>`).join("") : '<li class="muted">—</li>'}</ul></div>
    </div>`)}

  <!-- 8. Pricing strategy -->
  ${available ? section("אסטרטגיית תמחור", `<div class="strats">${strategies || '<div class="muted">—</div>'}</div>`) : ""}

  <!-- 9. Summary + CTA -->
  <div class="cta">
    <h2>בואו נמכור את הנכס שלכם נכון</h2>
    <p>${esc(brand.brokerName || brand.orgName)} — ליווי מקצועי, תמחור מבוסס נתונים ושיווק ממוקד.</p>
    <div class="contact">${[brand.brokerPhone, brand.brokerEmail].filter(Boolean).map(esc).join(" · ")}</div>
    ${brand.publicUrl ? `<div class="contact"><a style="color:#fff" href="${esc(brand.publicUrl)}">${esc(brand.publicUrl)}</a></div>` : ""}
  </div>

  <div class="disclaimer">${esc(VALUATION_DISCLAIMER)}</div>
</div></body></html>`;
}
