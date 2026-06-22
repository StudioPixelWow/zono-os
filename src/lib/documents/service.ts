// ============================================================================
// ZONO — Documents & Signature OS · Service (server-only)
// ----------------------------------------------------------------------------
// Manages documents across the whole real-estate lifecycle: create from
// template, version, request signatures (DRAFT/manual only — never auto-sent),
// record manual signatures with audit trail, and compute per-deal checklists
// (required / missing / signed / expired / blocking). Permission-aware.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getSessionContext } from "@/lib/auth/session";
import {
  deriveSignatureStatus, computeChecklist, docCategoryLabel, isExpiringSoon,
  type ChecklistResult, type ParticipantLike,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

type DB = Awaited<ReturnType<typeof createClient>>;
async function audit(supabase: DB, orgId: string, documentId: string | null, actor: string, event: string, detail?: string) {
  try { await supabase.from("document_audit_logs").insert({ organization_id: orgId, document_id: documentId, actor_user_id: actor, event, detail: detail ?? null }); } catch { /* audit is best-effort */ }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface DocumentSummary {
  id: string; title: string; doc_category: string | null; categoryLabel: string; signature_status: string;
  deal_id: string | null; buyer_id: string | null; seller_id: string | null; lead_id: string | null;
  property_id: string | null; expires_at: string | null; current_version: number; is_required: boolean; updated_at: string;
  file_url: string | null;
}
export interface DocCommandCenter {
  pendingSignatures: number; blockedDeals: number; missingDocuments: number; expiringSoon: number;
  documents: DocumentSummary[]; pending: DocumentSummary[]; expiring: DocumentSummary[];
  templates: { template_key: string; name_he: string; doc_category: string; applies_to_stage: string | null }[];
  isManager: boolean;
}

function mapDoc(d: Record<string, unknown>): DocumentSummary {
  return {
    id: d.id as string, title: d.title as string, doc_category: (d.doc_category as string) ?? null,
    categoryLabel: docCategoryLabel(d.doc_category as string), signature_status: (d.signature_status as string) ?? "draft",
    deal_id: (d.deal_id as string) ?? null, buyer_id: (d.buyer_id as string) ?? null, seller_id: (d.seller_id as string) ?? null,
    lead_id: (d.lead_id as string) ?? null, property_id: (d.property_id as string) ?? null,
    expires_at: (d.expires_at as string) ?? null, current_version: (d.current_version as number) ?? 1,
    is_required: Boolean(d.is_required), updated_at: d.updated_at as string,
    file_url: (d.file_url as string) ?? null,
  };
}

// ── command center ─────────────────────────────────────────────────────────
export async function getDocumentsCommandCenter(): Promise<DocCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();
  const { data: docData } = await supabase.from("documents").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(300);
  const documents = ((docData ?? []) as Record<string, unknown>[]).map(mapDoc);

  const pending = documents.filter((d) => d.signature_status === "pending_signature" || d.signature_status === "partially_signed");
  const expiring = documents.filter((d) => d.signature_status !== "completed" && isExpiringSoon(d.expires_at));

  const { data: clData } = await supabase.from("document_checklists").select("blocking_count,missing_count").eq("organization_id", orgId);
  let blockedDeals = 0, missingDocuments = 0;
  for (const c of (clData ?? []) as { blocking_count: number; missing_count: number }[]) {
    if ((c.blocking_count ?? 0) > 0) blockedDeals++;
    missingDocuments += c.missing_count ?? 0;
  }

  const { data: tplData } = await supabase.from("document_templates").select("template_key,name_he,doc_category,applies_to_stage").eq("is_active", true).order("sort_order", { ascending: true });
  const templates = ((tplData ?? []) as { template_key: string; name_he: string; doc_category: string; applies_to_stage: string | null }[]);

  return { pendingSignatures: pending.length, blockedDeals, missingDocuments, expiringSoon: expiring.length, documents, pending, expiring, templates, isManager };
}

// ── document detail ──────────────────────────────────────────────────────────
export interface DocumentDetail {
  doc: DocumentSummary & { rejected_reason: string | null };
  participants: { id: string; role: string; participant_type: string; contact_name: string | null; status: string; order_index: number }[];
  signatures: { signer_name: string; signed_at: string; method: string; device: string | null }[];
  versions: { version: number; change_note: string | null; created_at: string }[];
  requests: { id: string; channel: string; status: string; due_at: string | null; note: string | null }[];
  audit: { event: string; detail: string | null; created_at: string }[];
}
export async function getDocumentDetail(documentId: string): Promise<DocumentDetail | null> {
  const { orgId, supabase } = await ctx();
  const { data: d } = await supabase.from("documents").select("*").eq("org_id", orgId).eq("id", documentId).maybeSingle();
  if (!d) return null;
  const row = d as Record<string, unknown>;
  const [{ data: parts }, { data: sigs }, { data: vers }, { data: reqs }, { data: logs }] = await Promise.all([
    supabase.from("document_participants").select("*").eq("organization_id", orgId).eq("document_id", documentId).order("order_index", { ascending: true }),
    supabase.from("document_signatures").select("*").eq("organization_id", orgId).eq("document_id", documentId).order("signed_at", { ascending: true }),
    supabase.from("document_versions").select("*").eq("organization_id", orgId).eq("document_id", documentId).order("version", { ascending: false }),
    supabase.from("document_requests").select("*").eq("organization_id", orgId).eq("document_id", documentId).order("created_at", { ascending: false }),
    supabase.from("document_audit_logs").select("*").eq("organization_id", orgId).eq("document_id", documentId).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    doc: { ...mapDoc(row), rejected_reason: (row.rejected_reason as string) ?? null },
    participants: ((parts ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, role: p.role as string, participant_type: p.participant_type as string, contact_name: (p.contact_name as string) ?? null, status: p.status as string, order_index: (p.order_index as number) ?? 0 })),
    signatures: ((sigs ?? []) as Record<string, unknown>[]).map((s) => ({ signer_name: s.signer_name as string, signed_at: s.signed_at as string, method: s.method as string, device: (s.device as string) ?? null })),
    versions: ((vers ?? []) as Record<string, unknown>[]).map((v) => ({ version: v.version as number, change_note: (v.change_note as string) ?? null, created_at: v.created_at as string })),
    requests: ((reqs ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, channel: r.channel as string, status: r.status as string, due_at: (r.due_at as string) ?? null, note: (r.note as string) ?? null })),
    audit: ((logs ?? []) as Record<string, unknown>[]).map((l) => ({ event: l.event as string, detail: (l.detail as string) ?? null, created_at: l.created_at as string })),
  };
}

// ── create / version / participants ──────────────────────────────────────────
export interface EntityRefs { deal_id?: string; buyer_id?: string; seller_id?: string; lead_id?: string; property_id?: string; project_id?: string; match_id?: string; title?: string }
export async function createDocumentFromTemplate(templateKey: string, refs: EntityRefs): Promise<{ id: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { data: tpl } = await supabase.from("document_templates").select("*").eq("template_key", templateKey).maybeSingle();
  if (!tpl) throw new Error("תבנית מסמך לא נמצאה");
  const t = tpl as Record<string, unknown>;
  const title = refs.title || (t.name_he as string);
  const { data: doc, error } = await supabase.from("documents").insert({
    org_id: orgId, owner_id: userId, title, doc_category: t.doc_category as string, signature_status: "draft", current_version: 1,
    template_id: t.id as string, source: "template",
    deal_id: refs.deal_id ?? null, buyer_id: refs.buyer_id ?? null, seller_id: refs.seller_id ?? null,
    lead_id: refs.lead_id ?? null, property_id: refs.property_id ?? null, project_id: refs.project_id ?? null, match_id: refs.match_id ?? null,
  }).select("id").single();
  if (error || !doc) throw new Error(error?.message ?? "יצירת המסמך נכשלה");
  const id = (doc as { id: string }).id;
  await supabase.from("document_versions").insert({ organization_id: orgId, document_id: id, version: 1, created_by: userId, change_note: "גרסה ראשונית" });
  await audit(supabase, orgId, id, userId, "created", `נוצר מתבנית ${t.name_he as string}`);
  return { id };
}

export interface ManualDocInput extends EntityRefs {
  title: string;
  docCategory: string;
  expiresAt?: string | null;
  notes?: string | null;
  fileUrl?: string | null;
  storagePath?: string | null;
  isChecklistItem?: boolean; // a tracked requirement without a file yet
}
/** Create a document manually (no template) — upload, classify, link, track. */
export async function createDocumentManual(input: ManualDocInput): Promise<{ id: string }> {
  const { orgId, userId, supabase } = await ctx();
  const title = input.title?.trim() || docCategoryLabel(input.docCategory);
  const { data: doc, error } = await supabase.from("documents").insert({
    org_id: orgId, owner_id: userId, title, doc_category: input.docCategory,
    signature_status: "draft", current_version: 1, source: "manual",
    file_url: input.fileUrl ?? null, storage_path: input.storagePath ?? null,
    expires_at: input.expiresAt ?? null,
    is_required: input.isChecklistItem ?? false,
    deal_id: input.deal_id ?? null, buyer_id: input.buyer_id ?? null, seller_id: input.seller_id ?? null,
    lead_id: input.lead_id ?? null, property_id: input.property_id ?? null, project_id: input.project_id ?? null, match_id: input.match_id ?? null,
    metadata: (input.notes ? { notes: input.notes } : {}) as unknown as Json,
  }).select("id").single();
  if (error || !doc) throw new Error(error?.message ?? "יצירת המסמך נכשלה");
  const id = (doc as { id: string }).id;
  await supabase.from("document_versions").insert({ organization_id: orgId, document_id: id, version: 1, file_url: input.fileUrl ?? null, created_by: userId, change_note: input.fileUrl ? "קובץ הועלה" : "נוצר ידנית" });
  await audit(supabase, orgId, id, userId, "created", input.fileUrl ? "מסמך נוצר עם קובץ" : "מסמך נוצר ידנית");
  return { id };
}

export async function addDocumentVersion(documentId: string, input: { fileUrl?: string; note?: string }): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data: d } = await supabase.from("documents").select("current_version").eq("org_id", orgId).eq("id", documentId).maybeSingle();
  const next = ((d as { current_version?: number } | null)?.current_version ?? 1) + 1;
  await supabase.from("document_versions").insert({ organization_id: orgId, document_id: documentId, version: next, file_url: input.fileUrl ?? null, change_note: input.note ?? null, created_by: userId });
  await supabase.from("documents").update({ current_version: next, file_url: input.fileUrl ?? undefined }).eq("org_id", orgId).eq("id", documentId);
  await audit(supabase, orgId, documentId, userId, "version_added", `גרסה ${next}`);
}

export async function addParticipant(documentId: string, input: { role?: string; participant_type?: string; contact_name?: string; contact_email?: string; contact_phone?: string }): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { count } = await supabase.from("document_participants").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("document_id", documentId);
  await supabase.from("document_participants").insert({
    organization_id: orgId, document_id: documentId, role: input.role ?? "signer", participant_type: input.participant_type ?? "external",
    contact_name: input.contact_name ?? null, contact_email: input.contact_email ?? null, contact_phone: input.contact_phone ?? null, order_index: count ?? 0,
  });
}

// ── signature lifecycle (DRAFT request; manual signing) ──────────────────────
export async function createSignatureRequest(documentId: string, input: { channel?: string; note?: string; dueAt?: string }): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("document_requests").insert({ organization_id: orgId, document_id: documentId, requested_by: userId, channel: input.channel ?? "manual", status: "pending", note: input.note ?? null, due_at: input.dueAt ?? null });
  await supabase.from("documents").update({ signature_status: "pending_signature" }).eq("org_id", orgId).eq("id", documentId).eq("signature_status", "draft");
  await audit(supabase, orgId, documentId, userId, "sent_for_signature", "בקשת חתימה הוכנה (טיוטה — לא נשלח אוטומטית)");
}

async function recomputeDocStatus(supabase: DB, orgId: string, documentId: string): Promise<string> {
  const { data: parts } = await supabase.from("document_participants").select("role,status").eq("organization_id", orgId).eq("document_id", documentId);
  const { data: doc } = await supabase.from("documents").select("signature_status,expires_at").eq("org_id", orgId).eq("id", documentId).maybeSingle();
  const cur = (doc as { signature_status?: string; expires_at?: string | null } | null);
  const status = deriveSignatureStatus((parts ?? []) as ParticipantLike[], cur?.signature_status ?? "draft", cur?.expires_at ?? null);
  const patch: { signature_status: string; signed_at?: string } = { signature_status: status };
  if (status === "completed") patch.signed_at = new Date().toISOString();
  await supabase.from("documents").update(patch).eq("org_id", orgId).eq("id", documentId);
  return status;
}

export async function recordSignature(documentId: string, input: { participantId?: string; signerName: string; ipHash?: string; device?: string }): Promise<{ status: string }> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("document_signatures").insert({ organization_id: orgId, document_id: documentId, participant_id: input.participantId ?? null, signer_name: input.signerName, ip_hash: input.ipHash ?? null, device: input.device ?? null, method: "manual" });
  if (input.participantId) await supabase.from("document_participants").update({ status: "signed" }).eq("organization_id", orgId).eq("id", input.participantId);
  const status = await recomputeDocStatus(supabase, orgId, documentId);
  await audit(supabase, orgId, documentId, userId, status === "completed" ? "completed" : "signed", `נחתם ע״י ${input.signerName}`);
  return { status };
}

export async function rejectDocument(documentId: string, reason: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("documents").update({ signature_status: "rejected", rejected_reason: reason }).eq("org_id", orgId).eq("id", documentId);
  await supabase.from("document_requests").update({ status: "cancelled" }).eq("organization_id", orgId).eq("document_id", documentId).eq("status", "pending");
  await audit(supabase, orgId, documentId, userId, "rejected", reason);
}

export async function cancelDocument(documentId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("documents").update({ signature_status: "cancelled" }).eq("org_id", orgId).eq("id", documentId);
  await supabase.from("document_requests").update({ status: "cancelled" }).eq("organization_id", orgId).eq("document_id", documentId).neq("status", "completed");
  await audit(supabase, orgId, documentId, userId, "cancelled", "המסמך בוטל");
}

// ── deal checklist ─────────────────────────────────────────────────────────────
export interface DealChecklist extends ChecklistResult { dealId: string }
export async function computeDealChecklist(dealId: string): Promise<DealChecklist> {
  const { orgId, supabase } = await ctx();
  const { data: reqData } = await supabase.from("document_requirements").select("*").eq("context", "deal").or(`organization_id.is.null,organization_id.eq.${orgId}`).order("sort_order", { ascending: true });
  const requirements = ((reqData ?? []) as Record<string, unknown>[]).map((r) => ({ doc_category: r.doc_category as string, is_blocking: Boolean(r.is_blocking), blocks_stage: (r.blocks_stage as string) ?? null, stage: (r.stage as string) ?? null, description_he: (r.description_he as string) ?? null }));
  const { data: docData } = await supabase.from("documents").select("doc_category,signature_status,expires_at").eq("org_id", orgId).eq("deal_id", dealId);
  const docs = ((docData ?? []) as Record<string, unknown>[]).map((d) => ({ doc_category: (d.doc_category as string) ?? null, signature_status: (d.signature_status as string) ?? "draft", expires_at: (d.expires_at as string) ?? null }));
  const result = computeChecklist(requirements, docs);
  // persist snapshot (best-effort)
  try {
    await supabase.from("document_checklists").upsert({
      organization_id: orgId, deal_id: dealId, context: "deal",
      total_required: result.totalRequired, completed_count: result.completed, missing_count: result.missing,
      blocking_count: result.blocking, completion_pct: result.completionPct, risk_level: result.riskLevel,
      items: result.items as unknown as Json, computed_at: new Date().toISOString(),
    }, { onConflict: "organization_id,deal_id" });
  } catch { /* snapshot is additive */ }
  return { ...result, dealId };
}

export async function getDocumentsForDeal(dealId: string): Promise<{ documents: DocumentSummary[]; checklist: DealChecklist }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("documents").select("*").eq("org_id", orgId).eq("deal_id", dealId).order("updated_at", { ascending: false });
  const documents = ((data ?? []) as Record<string, unknown>[]).map(mapDoc);
  const checklist = await computeDealChecklist(dealId);
  return { documents, checklist };
}
