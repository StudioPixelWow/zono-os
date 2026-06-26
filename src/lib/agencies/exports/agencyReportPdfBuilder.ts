// ============================================================================
// ZONO — PHASE 26.15: Printable document builder (PURE, client-safe).
// Produces a self-contained, print-ready HTML document (the user prints to PDF
// from the browser — no heavy server-side PDF dependency). Real, dependency-free.
// ============================================================================
import { renderReportHtml } from "./agencyReportHtmlTemplate";
import type { ReportModel } from "./agencyExportTypes";

export interface PrintableDocument { html: string; filename: string; contentType: "text/html" }

const slug = (s: string): string => s.replace(/[^\p{L}\p{N}_]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";

export function buildPrintableDocument(model: ReportModel): PrintableDocument {
  return { html: renderReportHtml(model), filename: `zono-${slug(model.reportType)}-${model.generatedAt.slice(0, 10)}.html`, contentType: "text/html" };
}
