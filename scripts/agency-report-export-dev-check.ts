/**
 * LOCAL-DEV-ONLY check for Report Export (Phase 26.15). Pure layers only (no DB).
 * Verifies: report HTML includes generated date · confidence · missing data ·
 * source summary · the mandated disclaimer · no blocked compliance wording ·
 * HTML escaping · printable-document builder (filename + content type).
 *
 * Run: npx tsx scripts/agency-report-export-dev-check.ts
 */
import { renderReportHtml } from "../src/lib/agencies/exports/agencyReportHtmlTemplate";
import { buildPrintableDocument } from "../src/lib/agencies/exports/agencyReportPdfBuilder";
import { REPORT_DISCLAIMER } from "../src/lib/agencies/exports/agencyExportTypes";
import type { ReportModel } from "../src/lib/agencies/exports/agencyExportTypes";
import { containsBlockedWording } from "../src/lib/agencies/governance/agencyVisibilityGuard";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function model(over: Partial<ReportModel> = {}): ReportModel {
  return {
    reportType: "single_agency_report", title: "דוח משרד · אנגלו סכסון", subtitle: "חיפה",
    generatedAt: "2026-06-26 10:00", dataConfidence: 72, missingData: ["ציון מומנטום חסר"],
    sourceSummary: ["ציוני משרדים (3)", "אותות שוק (5)"], disclaimer: REPORT_DISCLAIMER,
    agency: {
      name: "אנגלו סכסון", city: "חיפה",
      scores: [{ label: "כללי", value: "88" }, { label: "איום", value: "80" }],
      territories: [{ label: "אפקה", dominance: "82", share: "40%", momentum: "55", confidence: "60%" }],
      signals: [{ title: "נכנס ל-3 שכונות", severity: "גבוה", territory: "חיפה", detectedAt: "2026-06-20" }],
      swot: { strengths: [{ label: "נוכחות חזקה", detail: "" }], weaknesses: [], opportunities: [], threats: [] },
      recommendations: [{ title: "הגדר מעקב", reason: "איום גבוה", priority: "עדיפות גבוהה" }],
      executiveSummary: "המשרד מוביל באזור.",
    },
    ...over,
  };
}

function main(): void {
  console.log("Report Export dev-check\n");

  const html = renderReportHtml(model());
  console.log("Report content:");
  assert(html.includes("2026-06-26 10:00"), "includes generated date");
  assert(html.includes("72%"), "includes data confidence");
  assert(html.includes("ציון מומנטום חסר"), "includes missing data disclosure");
  assert(html.includes("ציוני משרדים (3)"), "includes source summary");
  assert(html.includes(REPORT_DISCLAIMER), "includes the mandated disclaimer");
  assert(html.includes("ניתוח SWOT") && html.includes("המלצות פעולה"), "renders SWOT + recommendations sections");
  assert(html.startsWith("<!doctype html>") && html.includes('dir="rtl"'), "is a complete RTL HTML document");

  console.log("\nGovernance wording:");
  assert(!containsBlockedWording(html), "no blocked wording in default report");
  // Even if a model field carried blocked wording, the renderer escapes but does not introduce it;
  // upstream sanitization is responsible — verify the template adds only compliant labels.
  assert(html.includes("מודיעין תחרותי"), "uses compliant ZONO wording in header");

  console.log("\nEscaping:");
  const xss = renderReportHtml(model({ title: "<script>alert(1)</script>" }));
  assert(!xss.includes("<script>alert(1)</script>") && xss.includes("&lt;script&gt;"), "HTML is escaped (no injection)");

  console.log("\nMissing data / confidence honesty:");
  const noData = renderReportHtml(model({ dataConfidence: null, missingData: ["אין עדיין ציונים"], agency: undefined, overview: { kpis: [], topAgencies: [] } }));
  assert(noData.includes("ביטחון נתונים: <b>—</b>"), "null confidence → em-dash (never fake 0)");
  assert(noData.includes("אין עדיין ציונים"), "honest missing-data note shown");

  console.log("\nPrintable document:");
  const doc = buildPrintableDocument(model());
  assert(doc.contentType === "text/html" && doc.filename.endsWith(".html"), "printable doc: html content type + filename");
  assert(doc.filename.includes("single_agency_report") && doc.filename.includes("2026-06-26"), "filename carries type + date");
  assert(doc.html === html, "printable doc html matches the template output");

  console.log(`\n${failures === 0 ? "✅ ALL REPORT EXPORT CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
