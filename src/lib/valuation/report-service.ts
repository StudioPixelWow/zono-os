// ============================================================================
// ZONO Price Intelligence — report service (server-only).
// Generates the seller-facing report (payload + branded html_snapshot + public
// token), records send events (WhatsApp / Email), and reads a report by token
// (service-role) for the public report page.
// ============================================================================
import "server-only";
import { randomUUID } from "crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getValuation } from "./service";
import { buildReportPayload, renderReportHtml, type ReportBrand } from "./report";
import { renderPresentationHtml } from "./presentation";
import type { ValuationRecord } from "./types";

export interface GeneratedReport {
  reportId: string;
  token: string;
  html: string;
}

async function buildBrand(record: ValuationRecord): Promise<ReportBrand> {
  const { profile, organization } = await getSessionContext();
  const org = organization as unknown as { name?: string; logo_url?: string; settings?: Record<string, unknown> } | null;
  const me = profile as unknown as { full_name?: string; email?: string; phone?: string } | null;
  const settings = (org?.settings ?? {}) as Record<string, unknown>;

  // Property image: prefer the linked property's image, else first comparable image.
  let propertyImageUrl: string | null = null;
  if (record.propertyId) {
    const db = await createClient();
    const { data } = await db.from("properties" as never).select("primary_image_url").eq("id", record.propertyId).maybeSingle();
    propertyImageUrl = (data as unknown as { primary_image_url?: string } | null)?.primary_image_url ?? null;
  }
  if (!propertyImageUrl) propertyImageUrl = record.comparables.find((c) => c.imageUrl)?.imageUrl ?? null;

  return {
    orgName: org?.name || "ZONO",
    brokerName: me?.full_name ?? null,
    brokerPhone: me?.phone ?? null,
    brokerEmail: me?.email ?? null,
    logoUrl: org?.logo_url ?? null,
    propertyImageUrl,
    brandColor: (settings.brand_color as string) || "#7c3aed",
    publicUrl: null,
  };
}

/** Build + persist the seller report. Idempotent-ish: always inserts a fresh report row. */
export async function generateValuationReport(valuationId: string): Promise<GeneratedReport> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const record = await getValuation(valuationId);
  if (!record) throw new Error("הערכת השווי לא נמצאה.");
  if (record.status !== "completed") throw new Error("יש להשלים את חישוב ההערכה לפני הפקת הדוח.");

  const brand = await buildBrand(record);
  const token = randomUUID().replace(/-/g, "");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  brand.publicUrl = baseUrl ? `${baseUrl}/valuation-report/${token}` : `/valuation-report/${token}`;

  const payload = buildReportPayload(record, brand);
  const html = renderReportHtml(payload);

  const db = await createClient();
  const { data, error } = await db.from("valuation_reports" as never).insert({
    organization_id: profile.org_id, valuation_id: valuationId, report_type: "seller_pdf",
    status: "generated", public_token: token, html_snapshot: html,
    report_payload: payload as unknown as Record<string, unknown>,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  return { reportId: (data as unknown as { id: string }).id, token, html };
}

/**
 * Build + persist the premium seller PRESENTATION (luxury consulting document).
 * Reuses the valuation_reports table + public token, so the same share link /
 * public viewer renders it. Exports: PDF (print), Presentation (slide mode), Share.
 */
export async function generateValuationPresentation(valuationId: string): Promise<GeneratedReport> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const record = await getValuation(valuationId);
  if (!record) throw new Error("הערכת השווי לא נמצאה.");
  if (record.status !== "completed") throw new Error("יש להשלים את חישוב ההערכה לפני הפקת המצגת.");

  const brand = await buildBrand(record);
  const token = randomUUID().replace(/-/g, "");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  brand.publicUrl = baseUrl ? `${baseUrl}/valuation-report/${token}` : `/valuation-report/${token}`;

  const payload = buildReportPayload(record, brand);
  const html = renderPresentationHtml(payload);

  const db = await createClient();
  const { data, error } = await db.from("valuation_reports" as never).insert({
    organization_id: profile.org_id, valuation_id: valuationId, report_type: "seller_presentation",
    status: "generated", public_token: token, html_snapshot: html,
    report_payload: payload as unknown as Record<string, unknown>,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  return { reportId: (data as unknown as { id: string }).id, token, html };
}

/** Most recent generated report for a valuation, if any. */
export async function getLatestReport(valuationId: string): Promise<{ id: string; token: string } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  const db = await createClient();
  const { data } = await db.from("valuation_reports" as never)
    .select("id,public_token").eq("valuation_id", valuationId).eq("organization_id", profile.org_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = data as unknown as { id: string; public_token: string } | null;
  return r ? { id: r.id, token: r.public_token } : null;
}

export interface SendReportInput {
  valuationId: string;
  channel: "whatsapp" | "email";
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  message?: string | null;
}

export interface SendReportResult {
  ok: boolean;
  reportId: string;
  token: string;
  channel: "whatsapp" | "email";
  /** Honest delivery handoff: a deep link the broker confirms+sends manually. */
  handoffUrl: string | null;
  message: string;
}

/**
 * Records a send event and returns a channel handoff link. We do NOT auto-send
 * on the seller's behalf — we prepare the message and hand the broker a wa.me /
 * mailto link to confirm + send, then log the event. Honest & compliant.
 */
export async function sendValuationReportAsPdf(input: SendReportInput): Promise<SendReportResult> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");

  // Ensure a report exists (generate if needed).
  let report = await getLatestReport(input.valuationId);
  if (!report) {
    const gen = await generateValuationReport(input.valuationId);
    report = { id: gen.reportId, token: gen.token };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const reportUrl = `${baseUrl}/valuation-report/${report.token}`;
  const body = (input.message?.trim() || "מצורף דוח הערכת שווי אינדיקטיבי לנכס.") + `\n${reportUrl}`;

  let handoffUrl: string | null = null;
  if (input.channel === "whatsapp" && input.recipientPhone) {
    const phone = input.recipientPhone.replace(/[^\d]/g, "").replace(/^0/, "972");
    handoffUrl = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
  } else if (input.channel === "email" && input.recipientEmail) {
    const subject = "דוח הערכת שווי לנכס";
    handoffUrl = `mailto:${input.recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const db = await createClient();
  await db.from("valuation_report_sends" as never).insert({
    organization_id: profile.org_id, valuation_id: input.valuationId, report_id: report.id,
    channel: input.channel, recipient_name: input.recipientName ?? null,
    recipient_phone: input.recipientPhone ?? null, recipient_email: input.recipientEmail ?? null,
    message: input.message ?? null, status: "prepared",
    metadata: { handoffUrl, reportUrl },
  } as never);

  return {
    ok: true, reportId: report.id, token: report.token, channel: input.channel, handoffUrl,
    message: handoffUrl
      ? "הדוח מוכן לשליחה — אישור סופי ושליחה דרך הערוץ."
      : "הדוח מוכן. הוסף נמען (טלפון/אימייל) כדי לשלוח.",
  };
}

/** Public read by token (service-role, bypasses RLS) for the seller report page. */
export async function getReportByToken(token: string): Promise<{ html: string } | null> {
  if (!token || token.length < 16) return null;
  const db = createServiceRoleClient();
  const { data } = await db.from("valuation_reports" as never)
    .select("html_snapshot").eq("public_token", token).maybeSingle();
  const r = data as unknown as { html_snapshot?: string } | null;
  return r?.html_snapshot ? { html: r.html_snapshot } : null;
}
