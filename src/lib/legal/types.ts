// ============================================================================
// ZONO — Legal Document Templates types (client + server safe).
// The legal_* tables are not in the generated Supabase Database type → the
// repository casts via `as never` and shapes results with the row types here.
// ============================================================================

export type LegalDocStatus =
  | "draft" | "ready_for_signature" | "sent" | "viewed"
  | "signed" | "declined" | "expired" | "archived";

export const LEGAL_DOC_STATUSES: LegalDocStatus[] = [
  "draft", "ready_for_signature", "sent", "viewed", "signed", "declined", "expired", "archived",
];

export const LEGAL_DOC_STATUS_LABEL: Record<LegalDocStatus, string> = {
  draft: "טיוטה",
  ready_for_signature: "מוכן לחתימה",
  sent: "נשלח",
  viewed: "נצפה",
  signed: "נחתם",
  declined: "נדחה",
  expired: "פג תוקף",
  archived: "בארכיון",
};

export type LegalTemplateStatus = "active" | "draft" | "archived";

export type LegalFieldType =
  | "text" | "textarea" | "number" | "date" | "email" | "phone"
  | "currency" | "select" | "signature" | "checkbox";

export const LEGAL_ENTITY_TYPES = ["lead", "buyer", "seller", "property", "deal"] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

// ── Table rows ────────────────────────────────────────────────────────────────
export interface LegalTemplateRow {
  id: string; key: string; title: string; category: string;
  description: string | null; default_language: string; version: number;
  status: LegalTemplateStatus; created_at: string; updated_at: string;
}

export interface LegalTemplateSectionRow {
  id: string; template_id: string; order_index: number;
  title: string | null; body: string; is_required: boolean;
  created_at: string; updated_at: string;
}

export interface LegalTemplateFieldRow {
  id: string; template_id: string; section_id: string | null;
  field_key: string; label: string; field_type: LegalFieldType;
  default_value: string | null; is_required: boolean; placeholder: string | null;
  created_at: string; updated_at: string;
}

export interface LegalDocumentRow {
  id: string; template_id: string | null; organization_id: string;
  agent_id: string | null; property_id: string | null; buyer_id: string | null;
  seller_id: string | null; lead_id: string | null; deal_id: string | null;
  title: string; status: LegalDocStatus; field_values: Record<string, string>;
  rendered_body: string | null; rendered_hash: string | null;
  template_version: number | null; version: number; parent_document_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface LegalDocumentSignatureRow {
  id: string; document_id: string; signer_name: string; signer_email: string | null;
  signer_phone: string | null; signer_role: string | null; signed_at: string | null;
  ip_address: string | null; device_info: string | null; signature_hash: string | null;
  audit_metadata: Record<string, unknown>; created_at: string;
}

export interface LegalDocumentAuditRow {
  id: string; document_id: string; event_type: string; actor_id: string | null;
  metadata: Record<string, unknown>; created_at: string;
}

// ── Composite view models ─────────────────────────────────────────────────────
export interface LegalTemplateFull {
  template: LegalTemplateRow;
  sections: LegalTemplateSectionRow[];
  fields: LegalTemplateFieldRow[];
}

export interface LegalDocumentFull {
  document: LegalDocumentRow;
  signatures: LegalDocumentSignatureRow[];
  audit: LegalDocumentAuditRow[];
}

export const DIST_LEGAL = {
  templates: "legal_templates",
  sections: "legal_template_sections",
  fields: "legal_template_fields",
  documents: "legal_documents",
  signatures: "legal_document_signatures",
  audit: "legal_document_audit_log",
} as const;
