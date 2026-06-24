// ============================================================================
// ZONO — Legal documents repository (server-only). Org-scoped Supabase access
// over the legal_* tables (catalog is global; documents are org-scoped). The
// tables aren't in the generated Database type → `as never` casts + row shaping.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  DIST_LEGAL,
  type LegalTemplateRow, type LegalTemplateSectionRow, type LegalTemplateFieldRow,
  type LegalDocumentRow, type LegalDocumentSignatureRow, type LegalDocumentAuditRow,
  type LegalTemplateFull, type LegalDocumentFull,
} from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
export interface LegalScope {
  db: DB; orgId: string; userId: string | null;
  agentName: string | null; orgName: string | null;
  agentPhone: string | null; agentEmail: string | null;
}
export async function legalScope(): Promise<LegalScope | null> {
  const { profile, organization } = await getSessionContext();
  if (!profile?.org_id) return null;
  return {
    db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null,
    agentName: profile.full_name ?? null, orgName: organization?.name ?? null,
    agentPhone: profile.phone ?? null, agentEmail: (profile as { email?: string }).email ?? null,
  };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export const legalRepository = {
  // ── Templates (global catalog) ────────────────────────────────────────────
  async listTemplates(opts: { category?: string; search?: string } = {}): Promise<LegalTemplateRow[]> {
    const s = await legalScope(); if (!s) return [];
    let q = s.db.from(DIST_LEGAL.templates as never).select("*").order("category", { ascending: true }).order("title", { ascending: true });
    if (opts.category) q = q.eq("category", opts.category);
    if (opts.search) q = q.ilike("title", `%${opts.search}%`);
    const { data } = await q;
    return list<LegalTemplateRow>(data);
  },
  async getTemplate(id: string): Promise<LegalTemplateRow | null> {
    const s = await legalScope(); if (!s) return null;
    const { data } = await s.db.from(DIST_LEGAL.templates as never).select("*").eq("id", id).maybeSingle();
    return (data as unknown as LegalTemplateRow) ?? null;
  },
  async getTemplateFull(id: string): Promise<LegalTemplateFull | null> {
    const s = await legalScope(); if (!s) return null;
    const template = await this.getTemplate(id);
    if (!template) return null;
    const { data: sec } = await s.db.from(DIST_LEGAL.sections as never).select("*").eq("template_id", id).order("order_index", { ascending: true });
    const { data: fld } = await s.db.from(DIST_LEGAL.fields as never).select("*").eq("template_id", id).order("field_key", { ascending: true });
    return { template, sections: list<LegalTemplateSectionRow>(sec), fields: list<LegalTemplateFieldRow>(fld) };
  },
  async getTemplateFullByKey(key: string): Promise<LegalTemplateFull | null> {
    const s = await legalScope(); if (!s) return null;
    const { data } = await s.db.from(DIST_LEGAL.templates as never).select("id").eq("key", key).maybeSingle();
    const id = (data as { id: string } | null)?.id;
    return id ? this.getTemplateFull(id) : null;
  },
  async updateSection(id: string, patch: Partial<{ title: string | null; body: string; order_index: number; is_required: boolean }>): Promise<boolean> {
    const s = await legalScope(); if (!s) return false;
    const { error } = await s.db.from(DIST_LEGAL.sections as never).update(patch as never).eq("id", id);
    return !error;
  },
  async bumpTemplateVersion(id: string): Promise<void> {
    const s = await legalScope(); if (!s) return;
    const tpl = await this.getTemplate(id);
    if (tpl) await s.db.from(DIST_LEGAL.templates as never).update({ version: (tpl.version ?? 1) + 1 } as never).eq("id", id);
  },

  // ── Documents (org-scoped) ──────────────────────────────────────────────────
  async insertDocument(row: Partial<LegalDocumentRow>): Promise<LegalDocumentRow | null> {
    const s = await legalScope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST_LEGAL.documents as never).insert({
      ...row, organization_id: s.orgId, created_by: s.userId,
    } as never).select("*").single();
    if (error) { console.error("[legal] insertDocument:", error.message); return null; }
    return data as unknown as LegalDocumentRow;
  },
  async getDocument(id: string): Promise<LegalDocumentRow | null> {
    const s = await legalScope(); if (!s) return null;
    const { data } = await s.db.from(DIST_LEGAL.documents as never).select("*").eq("id", id).eq("organization_id", s.orgId).maybeSingle();
    return (data as unknown as LegalDocumentRow) ?? null;
  },
  async getDocumentFull(id: string): Promise<LegalDocumentFull | null> {
    const s = await legalScope(); if (!s) return null;
    const document = await this.getDocument(id);
    if (!document) return null;
    const { data: sig } = await s.db.from(DIST_LEGAL.signatures as never).select("*").eq("document_id", id).order("created_at", { ascending: true });
    const { data: aud } = await s.db.from(DIST_LEGAL.audit as never).select("*").eq("document_id", id).order("created_at", { ascending: false });
    return { document, signatures: list<LegalDocumentSignatureRow>(sig), audit: list<LegalDocumentAuditRow>(aud) };
  },
  async listDocuments(filter: { entityType?: string; entityId?: string; status?: string } = {}): Promise<LegalDocumentRow[]> {
    const s = await legalScope(); if (!s) return [];
    let q = s.db.from(DIST_LEGAL.documents as never).select("*").eq("organization_id", s.orgId).order("created_at", { ascending: false });
    if (filter.status) q = q.eq("status", filter.status);
    const col = filter.entityType ? `${filter.entityType}_id` : null;
    if (col && filter.entityId) q = q.eq(col, filter.entityId);
    const { data } = await q;
    return list<LegalDocumentRow>(data);
  },
  async updateDocument(id: string, patch: Partial<LegalDocumentRow>): Promise<{ ok: boolean; message?: string }> {
    const s = await legalScope(); if (!s) return { ok: false, message: "no_session" };
    const { error } = await s.db.from(DIST_LEGAL.documents as never).update(patch as never).eq("id", id).eq("organization_id", s.orgId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  },

  // ── Signatures + audit ──────────────────────────────────────────────────────
  async insertSignature(row: Partial<LegalDocumentSignatureRow>): Promise<LegalDocumentSignatureRow | null> {
    const s = await legalScope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST_LEGAL.signatures as never).insert(row as never).select("*").single();
    if (error) { console.error("[legal] insertSignature:", error.message); return null; }
    return data as unknown as LegalDocumentSignatureRow;
  },
  async insertAudit(documentId: string, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const s = await legalScope(); if (!s) return;
    await s.db.from(DIST_LEGAL.audit as never).insert({
      document_id: documentId, event_type: eventType, actor_id: s.userId, metadata,
    } as never);
  },
};
