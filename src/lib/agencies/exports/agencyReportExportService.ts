// ============================================================================
// ZONO — PHASE 26.15: Report export service (SERVER-ONLY). Builds the report
// from the API (renderer), renders print-ready HTML, uploads it to the org-scoped
// `documents` storage bucket, and tracks every export in agency_report_exports.
// Safe failure: a row is always written; storage failure falls back to inline
// HTML in metadata so the report is never lost. Real data only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { govContext } from "../governance/_ctx";
import {
  buildSingleAgencyModel, buildCompetitorOverviewModel, buildTerritoryModel, buildOpportunityModel,
} from "./agencyReportRenderer";
import { buildPrintableDocument } from "./agencyReportPdfBuilder";
import type { ReportModel, ReportExportType, ExportResult, ReportExportRecord, ReportExportStatus } from "./agencyExportTypes";
import type { AgencyIntelligenceFilters } from "../api/agencyIntelligenceApiTypes";

type Obj = Record<string, unknown>;
const STORAGE_BUCKET = "documents";

async function createExportRow(orgId: string, actorId: string | null, exportType: ReportExportType, agencyId: string | null, filters: Obj): Promise<string | null> {
  const db = await createClient();
  const { data, error } = await db.from("agency_report_exports").insert({
    organization_id: orgId, agency_id: agencyId, export_type: exportType, status: "generating",
    requested_by: actorId, metadata: { filters },
  } as never).select("id").single();
  if (error) { console.error("[agency-export] row insert failed", error.message); return null; }
  return (data as { id: string }).id;
}

async function finalizeExportRow(id: string | null, patch: { status: ReportExportStatus; fileUrl?: string | null; error?: string | null; metadata?: Obj }): Promise<void> {
  if (!id) return;
  const db = await createClient();
  await db.from("agency_report_exports").update({
    status: patch.status, file_url: patch.fileUrl ?? null, error_message: patch.error ?? null,
    generated_at: patch.status === "completed" ? new Date().toISOString() : null,
    ...(patch.metadata ? { metadata: patch.metadata } : {}),
  } as never).eq("id", id);
}

/** Upload the report HTML to org-scoped storage; returns a public URL or null. */
async function uploadReport(orgId: string, id: string, html: string): Promise<string | null> {
  try {
    const db = await createClient();
    const path = `${orgId}/agency-reports/${id}.html`;
    const body = Buffer.from(html, "utf-8");
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, body, { contentType: "text/html; charset=utf-8", upsert: true });
    if (error) { console.error("[agency-export] storage upload failed", error.message); return null; }
    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch (e) { console.error("[agency-export] storage threw", e); return null; }
}

async function runExport(exportType: ReportExportType, agencyId: string | null, filters: Obj, build: () => Promise<ReportModel | null>): Promise<ExportResult> {
  const { orgId, actorId } = await govContext();
  const id = await createExportRow(orgId, actorId, exportType, agencyId, filters);
  try {
    const model = await build();
    if (!model) { await finalizeExportRow(id, { status: "failed", error: "לא נמצאו נתונים להפקת הדוח." }); return { id, status: "failed", fileUrl: null, error: "לא נמצאו נתונים להפקת הדוח." }; }
    const doc = buildPrintableDocument(model);
    const fileUrl = id ? await uploadReport(orgId, id, doc.html) : null;
    const meta: Obj = { filters, data_confidence: model.dataConfidence, missing_data: model.missingData, filename: doc.filename };
    if (!fileUrl) meta.inline_html = doc.html; // graceful fallback: report not lost
    await finalizeExportRow(id, { status: "completed", fileUrl, metadata: meta });
    return { id, status: "completed", fileUrl, error: fileUrl ? null : "אחסון הקובץ אינו זמין — הדוח נשמר במערכת." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "אירעה שגיאה בהפקת הדוח.";
    await finalizeExportRow(id, { status: "failed", error: msg });
    return { id, status: "failed", fileUrl: null, error: msg };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function exportSingleAgencyReport(agencyId: string): Promise<ExportResult> {
  const { orgId } = await govContext();
  return runExport("single_agency_report", agencyId, { agencyId }, () => buildSingleAgencyModel(orgId, agencyId));
}
export async function exportCompetitorOverview(filters: AgencyIntelligenceFilters = {}): Promise<ExportResult> {
  const { orgId } = await govContext();
  return runExport("competitor_overview", null, { ...filters }, () => buildCompetitorOverviewModel(orgId, filters));
}
export async function exportTerritoryReport(city: string, neighborhood?: string | null): Promise<ExportResult> {
  const { orgId } = await govContext();
  return runExport("territory_report", null, { city, neighborhood: neighborhood ?? null }, () => buildTerritoryModel(orgId, city, neighborhood ?? null));
}
export async function exportOpportunityReport(filters: AgencyIntelligenceFilters = {}): Promise<ExportResult> {
  const { orgId } = await govContext();
  return runExport("opportunity_report", null, { ...filters }, () => buildOpportunityModel(orgId, filters));
}

/** Recent exports for the org (for a future history UI). */
export async function listAgencyReportExports(limit = 30): Promise<ReportExportRecord[]> {
  const { orgId } = await govContext();
  const db = await createClient();
  const { data } = await db.from("agency_report_exports")
    .select("id,agency_id,export_type,status,file_url,requested_at,generated_at,error_message")
    .eq("organization_id", orgId).order("requested_at", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map((r) => ({
    id: r.id as string, agencyId: (r.agency_id as string) ?? null, exportType: r.export_type as ReportExportType,
    status: r.status as ReportExportStatus, fileUrl: (r.file_url as string) ?? null,
    requestedAt: (r.requested_at as string) ?? "", generatedAt: (r.generated_at as string) ?? null,
    errorMessage: (r.error_message as string) ?? null,
  }));
}
