// ============================================================================
// ZONO — PHASE 26.15: Report HTML template (PURE, client-safe). Renders a
// premium RTL, print-ready report from a ReportModel. Clean white background +
// ZONO purple accents + executive-dashboard feel. No IO. HTML is escaped; the
// model is assumed governance-sanitized upstream. Unit-tested directly.
// ============================================================================
import type { ReportModel, ReportSwotItem } from "./agencyExportTypes";

const esc = (s: string | null | undefined): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PURPLE = "#7c3aed";
const card = (inner: string): string => `<div class="card">${inner}</div>`;

function scoreCards(scores: { label: string; value: string }[]): string {
  if (!scores.length) return "";
  return `<div class="scores">${scores.map((s) => `<div class="score"><div class="score-v">${esc(s.value)}</div><div class="score-l">${esc(s.label)}</div></div>`).join("")}</div>`;
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return `<p class="muted">אין נתונים זמינים.</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}

function swotBlock(title: string, items: ReportSwotItem[], color: string): string {
  return `<div class="swot" style="border-top:3px solid ${color}"><h4>${esc(title)}</h4>${
    items.length ? `<ul>${items.map((i) => `<li><b>${esc(i.label)}</b>${i.detail ? ` — ${esc(i.detail)}` : ""}</li>`).join("")}</ul>` : `<p class="muted">—</p>`
  }</div>`;
}

/** Render the full self-contained report HTML (RTL, print-ready). */
export function renderReportHtml(model: ReportModel): string {
  const sections: string[] = [];

  if (model.overview) {
    sections.push(card(`<h3>סקירת מתחרים</h3>${scoreCards(model.overview.kpis.map((k) => ({ label: k.label, value: k.value })))}
      ${table(["משרד", "איום", "כללי"], model.overview.topAgencies.map((a) => [a.name, a.threat, a.overall]))}`));
  }

  if (model.agency) {
    const a = model.agency;
    sections.push(card(`<h3>${esc(a.name)}${a.city ? ` · ${esc(a.city)}` : ""}</h3>
      ${scoreCards(a.scores)}
      ${a.executiveSummary ? `<p class="summary">${esc(a.executiveSummary)}</p>` : ""}`));
    sections.push(card(`<h3>שליטה אזורית</h3>${table(["אזור", "שליטה", "נתח מלאי", "מומנטום", "ביטחון"], a.territories.map((t) => [t.label, t.dominance, t.share, t.momentum, t.confidence]))}`));
    sections.push(card(`<h3>אותות שוק</h3>${table(["אות", "חומרה", "אזור", "תאריך"], a.signals.map((s) => [s.title, s.severity, s.territory, s.detectedAt]))}`));
    sections.push(card(`<h3>ניתוח SWOT</h3><div class="swot-grid">
      ${swotBlock("חוזקות", a.swot.strengths, "#16a34a")}
      ${swotBlock("חולשות", a.swot.weaknesses, "#dc2626")}
      ${swotBlock("הזדמנויות", a.swot.opportunities, PURPLE)}
      ${swotBlock("איומים", a.swot.threats, "#d97706")}
    </div>`));
    if (a.recommendations.length) {
      sections.push(card(`<h3>המלצות פעולה</h3>${a.recommendations.map((r) => `<div class="rec"><div class="rec-h"><b>${esc(r.title)}</b><span class="pill">${esc(r.priority)}</span></div><p>${esc(r.reason)}</p></div>`).join("")}`));
    }
  }

  if (model.territory) {
    sections.push(card(`<h3>דוח אזור · ${esc(model.territory.label)}</h3><p class="muted">רמת תחרות: ${esc(model.territory.competitionLevel)}</p>
      ${table(["משרד", "שליטה", "נתח מלאי"], model.territory.agencies.map((a) => [a.name, a.dominance, a.share]))}`));
  }

  if (model.opportunities) {
    sections.push(card(`<h3>דוח הזדמנויות</h3>${table(["הזדמנות", "אזור", "סיבה"], model.opportunities.items.map((o) => [o.label, o.area, o.reason]))}`));
  }

  const confText = model.dataConfidence == null ? "—" : `${Math.round(model.dataConfidence)}%`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(model.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Heebo","Assistant",Arial,sans-serif; background:#fff; color:#1f2937; margin:0; padding:32px; line-height:1.55; }
  .doc { max-width: 880px; margin: 0 auto; }
  .head { border-bottom:3px solid ${PURPLE}; padding-bottom:16px; margin-bottom:20px; }
  .brand { color:${PURPLE}; font-weight:800; letter-spacing:.5px; font-size:13px; }
  h1 { font-size:26px; margin:6px 0 2px; }
  .sub { color:#6b7280; font-size:14px; }
  .meta { display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; font-size:12px; color:#4b5563; }
  .meta b { color:#111827; }
  .card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:18px; margin-bottom:16px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  h3 { font-size:17px; margin:0 0 12px; color:#111827; }
  h4 { margin:0 0 6px; font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:right; padding:8px 10px; border-bottom:1px solid #eef2f7; }
  th { background:#faf5ff; color:${PURPLE}; font-weight:700; }
  .muted { color:#9ca3af; font-size:13px; }
  .scores { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px; }
  .score { background:#faf5ff; border:1px solid #ede9fe; border-radius:12px; padding:12px 16px; min-width:96px; text-align:center; }
  .score-v { font-size:22px; font-weight:800; color:${PURPLE}; }
  .score-l { font-size:11px; color:#6b7280; margin-top:2px; }
  .summary { font-size:13px; color:#374151; background:#f9fafb; border-radius:10px; padding:12px; }
  .swot-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .swot { background:#fbfbfe; border:1px solid #eef2f7; border-radius:10px; padding:12px; }
  .swot ul { margin:0; padding-inline-start:18px; font-size:12px; }
  .rec { border:1px solid #eef2f7; border-radius:10px; padding:10px 12px; margin-bottom:8px; }
  .rec-h { display:flex; justify-content:space-between; align-items:center; }
  .pill { background:#ede9fe; color:${PURPLE}; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700; }
  .gov { margin-top:24px; padding-top:14px; border-top:1px dashed #d1d5db; font-size:11px; color:#6b7280; }
  .gov b { color:#374151; }
  @media print { body { padding:0; } .card { break-inside: avoid; } }
</style></head>
<body><div class="doc">
  <div class="head">
    <div class="brand">ZONO · מודיעין תחרותי</div>
    <h1>${esc(model.title)}</h1>
    ${model.subtitle ? `<div class="sub">${esc(model.subtitle)}</div>` : ""}
    <div class="meta">
      <span>תאריך הפקה: <b>${esc(model.generatedAt)}</b></span>
      <span>ביטחון נתונים: <b>${esc(confText)}</b></span>
    </div>
  </div>
  ${sections.join("\n")}
  <div class="gov">
    ${model.missingData.length ? `<div><b>נתונים חסרים:</b> ${esc(model.missingData.join(" · "))}</div>` : ""}
    ${model.sourceSummary.length ? `<div><b>מקורות:</b> ${esc(model.sourceSummary.join(" · "))}</div>` : ""}
    <div style="margin-top:8px">${esc(model.disclaimer)}</div>
  </div>
</div></body></html>`;
}
