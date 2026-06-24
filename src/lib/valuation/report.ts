// ============================================================================
// ZONO Price Intelligence — seller-facing report builder (PURE, client-safe).
// Builds the report payload + a self-contained branded HTML document (RTL,
// print-to-PDF friendly) with all 9 sections + the mandatory indicative
// disclaimer. Uses ONLY real computed values from the valuation record.
// ============================================================================
import type { ValuationRecord } from "./types";
import { SOURCE_LABEL, CONFIDENCE_LABEL, DEMAND_LABEL, STRATEGY_LABEL, VALUATION_DISCLAIMER } from "./types";

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

  const comps = v.comparables.slice(0, 8);
  const pos = v.adjustments.filter((a) => a.direction === "positive");
  const neg = v.adjustments.filter((a) => a.direction === "negative");

  const section = (title: string, body: string) =>
    `<section class="card"><h2>${esc(title)}</h2>${body}</section>`;

  const compsRows = comps.length
    ? comps.map((c) => `<tr>
        <td>${esc(c.street || c.neighborhood || c.city || "—")}</td>
        <td><span class="badge${c.isDemo ? " demo" : ""}">${esc(SOURCE_LABEL[c.source] ?? c.source)}${c.isDemo ? " · דמו" : ""}</span></td>
        <td>${c.comparableType === "sold" ? "עסקה" : "מודעה"}</td>
        <td>${c.rooms ?? "—"} חד׳</td>
        <td>${c.sqm ?? "—"} מ"ר</td>
        <td>${fmt(c.price)}</td>
        <td>${c.pricePerSqm ? fmt(c.pricePerSqm) : "—"}</td>
        <td>${c.similarityScore ?? "—"}%</td>
      </tr>`).join("")
    : `<tr><td colspan="8" class="muted">לא נמצאו עסקאות/מודעות להשוואה ישירה באזור.</td></tr>`;

  const brokerRows = v.brokerSold.length
    ? v.brokerSold.slice(0, 8).map((b) => `<tr>
        <td>${esc(b.address || b.neighborhood || "—")}</td>
        <td>${fmt(b.salePrice)}</td>
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
    <div class="value">${fmt(r?.estimatedValue)}</div>
    <div class="range">טווח: ${fmt(r?.lowValue)} – ${fmt(r?.highValue)} · רמת ביטחון: ${esc(CONFIDENCE_LABEL[r?.confidenceLevel ?? "low"])} (${r?.confidenceScore ?? 0}%)</div>
  </div>

  <!-- 2. Valuation summary -->
  ${section("סיכום הערכה", `<div class="kpis">
    <div class="kpi"><div class="l">שווי מוערך</div><div class="v">${fmt(r?.estimatedValue)}</div></div>
    <div class="kpi"><div class="l">מחיר מומלץ לפרסום</div><div class="v">${fmt(r?.recommendedListingPrice)}</div></div>
    <div class="kpi"><div class="l">מחיר יעד לסגירה</div><div class="v">${fmt(r?.targetClosingPrice)}</div></div>
    <div class="kpi"><div class="l">מחיר למ"ר</div><div class="v">${fmt(r?.estimatedPricePerSqm)}</div></div>
  </div>`)}

  <!-- 3. Property details -->
  ${section("פרטי הנכס", `<div class="spec">${specRows.map(([k, val]) => `<div class="row"><span>${esc(k)}</span><b>${val}</b></div>`).join("")}</div>`)}

  <!-- 4. Market pulse -->
  ${section("דופק השוק", `<div class="kpis">
    <div class="kpi"><div class="l">מחיר חציוני למ"ר</div><div class="v">${v.market?.medianPricePerSqm ? fmt(v.market.medianPricePerSqm) : "—"}</div></div>
    <div class="kpi"><div class="l">ביקוש</div><div class="v">${esc(DEMAND_LABEL[v.market?.demandLevel ?? "low"])}</div></div>
    <div class="kpi"><div class="l">היצע</div><div class="v">${esc(DEMAND_LABEL[v.market?.supplyLevel ?? "low"])}</div></div>
    <div class="kpi"><div class="l">מגמה</div><div class="v">${v.market ? (v.market.trendDirection === "up" ? "↑" : v.market.trendDirection === "down" ? "↓" : "→") + " " + v.market.trendPercent + "%" : "—"}</div></div>
  </div>`)}

  <!-- 5. Comparable transactions -->
  ${section("עסקאות ומודעות דומות", `<table><thead><tr><th>כתובת</th><th>מקור</th><th>סוג</th><th>חדרים</th><th>שטח</th><th>מחיר</th><th>למ"ר</th><th>התאמה</th></tr></thead><tbody>${compsRows}</tbody></table>`)}

  <!-- 6. Broker sold nearby (only if exists) -->
  ${v.brokerSold.length ? section("נכסים שמכרתי באזור", `<table><thead><tr><th>כתובת</th><th>מחיר מכירה</th><th>למ"ר</th><th>תאריך</th><th>מול השוק</th></tr></thead><tbody>${brokerRows}</tbody></table>`) : ""}

  <!-- 7. AI explanation -->
  ${section("הסבר ההערכה", `<p style="font-size:14px">${esc(r?.explanation || "—")}</p>
    <div class="factors">
      <div><div class="pos">מעלי ערך</div><ul>${pos.length ? pos.map((a) => `<li><span>${esc(a.label)}</span><b class="pos">${a.percentageImpact ? `+${a.percentageImpact}%` : fmt(a.valueImpact)}</b></li>`).join("") : '<li class="muted">—</li>'}</ul></div>
      <div><div class="neg">מורידי ערך</div><ul>${neg.length ? neg.map((a) => `<li><span>${esc(a.label)}</span><b class="neg">${a.percentageImpact ? `-${a.percentageImpact}%` : ""}</b></li>`).join("") : '<li class="muted">—</li>'}</ul></div>
    </div>`)}

  <!-- 8. Pricing strategy -->
  ${section("אסטרטגיית תמחור", `<div class="strats">${strategies || '<div class="muted">—</div>'}</div>`)}

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
