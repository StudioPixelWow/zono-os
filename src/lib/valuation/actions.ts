"use server";
// ============================================================================
// ZONO Price Intelligence — server actions (thin wrappers over the service).
// Each returns a typed { ok, ... } shape so the UI's action runner can report
// real success/error messages. Auth + org scoping happen inside the service.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  createValuationDraft, updateValuationInput, runValuationById, getValuation,
  listValuations, saveValuationToProperty, createSellerFollowupFromValuation,
  type ValuationListItem, type RunOutput,
} from "./service";
import {
  generateValuationReport, generateValuationPresentation, sendValuationReportAsPdf, getLatestReport,
  type GeneratedReport, type SendReportInput, type SendReportResult,
} from "./report-service";
import { getBrokerSoldProperties } from "./providers";
import { diagnoseValuationEvidence, type ValuationEvidenceDiagnosis } from "./diagnostics";
import { getPropertyEvidence, type EvidencePackage } from "@/lib/evidence-search";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeInput } from "./valuation-engine";
import type { ValuationInput, ValuationRecord, BrokerSoldProperty } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function createValuationDraftAction(input?: ValuationInput, propertyId?: string | null): Promise<Result<{ id: string }>> {
  try {
    const id = await createValuationDraft(input, propertyId);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function updateValuationInputAction(id: string, input: ValuationInput): Promise<Result<null>> {
  try {
    await updateValuationInput(id, input);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function runValuationAction(id: string): Promise<Result<RunOutput>> {
  try {
    const out = await runValuationById(id);
    revalidatePath(`/valuation/${id}`);
    return { ok: true, data: out };
  } catch (e) { return fail(e); }
}

/** Create a draft from input and immediately run it (wizard "compute" step). */
export async function createAndRunValuationAction(input: ValuationInput, propertyId?: string | null): Promise<Result<{ id: string }>> {
  try {
    const id = await createValuationDraft(input, propertyId);
    await runValuationById(id);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function getValuationAction(id: string): Promise<Result<ValuationRecord | null>> {
  try { return { ok: true, data: await getValuation(id) }; }
  catch (e) { return fail(e); }
}

export async function listValuationsAction(): Promise<Result<ValuationListItem[]>> {
  try { return { ok: true, data: await listValuations() }; }
  catch (e) { return fail(e); }
}

export async function generateValuationReportAction(id: string): Promise<Result<GeneratedReport>> {
  try { return { ok: true, data: await generateValuationReport(id) }; }
  catch (e) { return fail(e); }
}

/** Generate the premium seller presentation; returns the share token + HTML. */
export async function generateValuationPresentationAction(id: string): Promise<Result<GeneratedReport>> {
  try { return { ok: true, data: await generateValuationPresentation(id) }; }
  catch (e) { return fail(e); }
}

export async function sendValuationReportAsPdfAction(input: SendReportInput): Promise<Result<SendReportResult>> {
  try {
    const r = await sendValuationReportAsPdf(input);
    revalidatePath(`/valuation/${input.valuationId}`);
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

export async function getLatestReportAction(id: string): Promise<Result<{ id: string; token: string } | null>> {
  try { return { ok: true, data: await getLatestReport(id) }; }
  catch (e) { return fail(e); }
}

/** Preview the broker's nearby closed deals for an ad-hoc input (no persistence). */
export async function getBrokerSoldPropertiesForValuationAction(input: ValuationInput): Promise<Result<BrokerSoldProperty[]>> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) throw new Error("אין הרשאה.");
    const db = await createClient();
    const rows = await getBrokerSoldProperties(db, profile.org_id, normalizeInput(input));
    return { ok: true, data: rows };
  } catch (e) { return fail(e); }
}

export async function saveValuationToPropertyAction(id: string, propertyId: string): Promise<Result<null>> {
  try {
    await saveValuationToProperty(id, propertyId);
    revalidatePath(`/valuation/${id}`);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function createSellerFollowupFromValuationAction(id: string): Promise<Result<{ taskId: string | null }>> {
  try { return { ok: true, data: await createSellerFollowupFromValuation(id) }; }
  catch (e) { return fail(e); }
}

/** READ-ONLY evidence diagnostic — why a valuation has no evidence. No writes. */
export async function diagnoseValuationEvidenceAction(id: string): Promise<Result<ValuationEvidenceDiagnosis | null>> {
  try { return { ok: true, data: await diagnoseValuationEvidence(id) }; }
  catch (e) { return fail(e); }
}

/** READ-ONLY Evidence Search™ — progressive evidence retrieval for a valuation. */
export async function getValuationEvidenceSearchAction(id: string, allowNearbyCities = false): Promise<Result<EvidencePackage>> {
  try { return { ok: true, data: await getPropertyEvidence({ valuationId: id, allowNearbyCities }) }; }
  catch (e) { return fail(e); }
}
