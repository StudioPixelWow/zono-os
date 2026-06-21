// ============================================================================
// ZONO — Documents & Signature OS · Pure engine (client-safe, deterministic)
// ----------------------------------------------------------------------------
// Catalogs + the signature lifecycle state machine + the per-deal checklist
// computation (required vs missing vs signed vs expired, blocking, completion %,
// risk). No I/O. No autonomous sending — signature requests are drafts only.
// ============================================================================

export type DocCategory =
  | "buyer_representation" | "seller_representation" | "exclusive_agreement" | "marketing_authorization"
  | "viewing_form" | "offer" | "negotiation" | "deal_checklist" | "purchase_agreement" | "broker_fee"
  | "lead_consent" | "referral_agreement" | "office_document" | "custom";

export type SignatureStatus =
  | "draft" | "pending_signature" | "partially_signed" | "completed" | "rejected" | "expired" | "cancelled";

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  buyer_representation: "הסכם ייצוג קונה", seller_representation: "הסכם ייצוג מוכר",
  exclusive_agreement: "הסכם בלעדיות", marketing_authorization: "אישור שיווק נכס",
  viewing_form: "טופס צפייה", offer: "מסמך הצעה", negotiation: "מסמך משא ומתן",
  deal_checklist: "רשימת בדיקה לעסקה", purchase_agreement: "הסכם רכישה", broker_fee: "הסכם דמי תיווך",
  lead_consent: "הסכמת ליד", referral_agreement: "הסכם הפניה", office_document: "מסמך משרד", custom: "מסמך מותאם",
};
export const docCategoryLabel = (c: string | null | undefined) => (c ? DOC_CATEGORY_LABELS[c] ?? c : "מסמך");

export const SIGNATURE_STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", pending_signature: "ממתין לחתימה", partially_signed: "נחתם חלקית",
  completed: "הושלם", rejected: "נדחה", expired: "פג תוקף", cancelled: "בוטל",
};
export const signatureStatusLabel = (s: string) => SIGNATURE_STATUS_LABELS[s] ?? s;

export const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface text-muted", pending_signature: "bg-warning-soft text-warning",
  partially_signed: "bg-brand-soft text-brand-strong", completed: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger", expired: "bg-danger-soft text-danger", cancelled: "bg-surface text-muted",
};

export const ENTITY_LABELS: Record<string, string> = {
  lead: "ליד", buyer: "קונה", seller: "מוכר", property: "נכס", match: "התאמה",
  deal: "עסקה", agent: "סוכן", office: "משרד", project: "פרויקט",
};

// ── signature state machine ───────────────────────────────────────────────────
export interface ParticipantLike { role: string; status: string }
/** Derive a document's signature_status from its signer participants. */
export function deriveSignatureStatus(participants: ParticipantLike[], current: string, expiresAt?: string | null): SignatureStatus {
  if (current === "cancelled") return "cancelled";
  if (expiresAt && new Date(expiresAt).getTime() < Date.now() && current !== "completed") return "expired";
  const signers = participants.filter((p) => p.role === "signer");
  if (signers.some((p) => p.status === "rejected")) return "rejected";
  if (signers.length === 0) return current === "pending_signature" ? "pending_signature" : "draft";
  const signed = signers.filter((p) => p.status === "signed").length;
  if (signed === 0) return current === "draft" ? "draft" : "pending_signature";
  if (signed >= signers.length) return "completed";
  return "partially_signed";
}

export const isComplete = (s: string) => s === "completed";
export const isBlockingStatus = (s: string) => s !== "completed"; // for required docs, anything not completed blocks
export const isExpiringSoon = (expiresAt: string | null | undefined, days = 14): boolean => {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime(); const now = Date.now();
  return t > now && t - now <= days * 86_400_000;
};

// ── checklist computation ──────────────────────────────────────────────────────
export interface RequirementLike { doc_category: string; is_blocking: boolean; blocks_stage: string | null; stage: string | null; description_he: string | null }
export interface DocLike { doc_category: string | null; signature_status: string; expires_at: string | null }
export interface ChecklistItem {
  doc_category: string; label: string; required: boolean; blocking: boolean; blocks_stage: string | null;
  present: boolean; signed: boolean; expired: boolean; status: string;
}
export interface ChecklistResult {
  items: ChecklistItem[]; totalRequired: number; completed: number; missing: number; blocking: number;
  completionPct: number; riskLevel: "low" | "medium" | "high" | "critical"; blockedStages: string[];
}

/** Compute a deal checklist from its requirements + the documents attached to it. */
export function computeChecklist(requirements: RequirementLike[], docs: DocLike[]): ChecklistResult {
  const byCat = new Map<string, DocLike[]>();
  for (const d of docs) { if (!d.doc_category) continue; const a = byCat.get(d.doc_category) ?? []; a.push(d); byCat.set(d.doc_category, a); }

  const items: ChecklistItem[] = requirements.map((r) => {
    const matches = byCat.get(r.doc_category) ?? [];
    const present = matches.length > 0;
    const signed = matches.some((d) => d.signature_status === "completed");
    const expired = matches.some((d) => d.signature_status === "expired") && !signed;
    const status = signed ? "completed" : expired ? "expired" : present ? matches[0].signature_status : "missing";
    return { doc_category: r.doc_category, label: docCategoryLabel(r.doc_category), required: true, blocking: r.is_blocking, blocks_stage: r.blocks_stage, present, signed, expired, status };
  });

  const totalRequired = items.length;
  const completed = items.filter((i) => i.signed).length;
  const missing = items.filter((i) => !i.signed).length;
  const blockingItems = items.filter((i) => i.blocking && !i.signed);
  const blocking = blockingItems.length;
  const completionPct = totalRequired === 0 ? 100 : Math.round((completed / totalRequired) * 100);
  const blockedStages = Array.from(new Set(blockingItems.map((i) => i.blocks_stage).filter((s): s is string => !!s)));

  let riskLevel: ChecklistResult["riskLevel"] = "low";
  if (blocking > 0) riskLevel = blocking >= 2 ? "critical" : "high";
  else if (missing > 0) riskLevel = "medium";

  return { items, totalRequired, completed, missing, blocking, completionPct, riskLevel, blockedStages };
}

/** Can a deal advance to `targetStage`? Blocked if a blocking requirement for that stage isn't completed. */
export function canAdvanceToStage(checklist: ChecklistResult, targetStage: string): { allowed: boolean; blockedBy: string[] } {
  const blockedBy = checklist.items.filter((i) => i.blocking && !i.signed && i.blocks_stage === targetStage).map((i) => i.label);
  return { allowed: blockedBy.length === 0, blockedBy };
}

export const RISK_LABELS: Record<string, string> = { low: "תקין", medium: "חסר מסמכים", high: "חוסם", critical: "חוסם קריטי" };
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  created: "נוצר", version_added: "גרסה נוספה", sent_for_signature: "נשלח לחתימה (טיוטה)",
  signed: "נחתם", rejected: "נדחה", expired: "פג תוקף", completed: "הושלם", cancelled: "בוטל", viewed: "נצפה",
};
