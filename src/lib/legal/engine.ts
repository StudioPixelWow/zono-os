// ============================================================================
// ZONO — Legal documents PURE engine (client + server safe, deterministic).
// Renders {{field_key}} placeholders, validates required fields (Hebrew errors),
// applies template defaults, prefills from CRM context, and governs status
// transitions + signed-lock. No I/O, no randomness — legal text is never
// rewritten here, only placeholders are resolved.
// ============================================================================
import {
  type LegalTemplateSectionRow, type LegalTemplateFieldRow, type LegalDocStatus,
} from "./types";

const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;
const DEFAULT_BLANK = "______________________";

/** All distinct {{field_key}} tokens used across the supplied text. */
export function extractPlaceholders(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

/** Resolve placeholders in one text block. Unknown/empty → blank marker (or kept). */
export function renderText(
  text: string, values: Record<string, string | null | undefined>,
  opts: { keepUnfilled?: boolean; blank?: string } = {},
): string {
  return text.replace(PLACEHOLDER, (_full, key: string) => {
    const v = values[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
    return opts.keepUnfilled ? `{{${key}}}` : (opts.blank ?? DEFAULT_BLANK);
  });
}

export interface RenderedSection { order_index: number; title: string | null; body: string }

/** Render every section, ordered, with placeholders resolved. */
export function renderSections(
  sections: LegalTemplateSectionRow[], values: Record<string, string | null | undefined>,
  opts: { keepUnfilled?: boolean; blank?: string } = {},
): RenderedSection[] {
  return [...sections]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({ order_index: s.order_index, title: s.title, body: renderText(s.body, values, opts) }));
}

/** Full plain-text render (sections joined) — used for rendered_body + hashing. */
export function renderFullText(
  sections: LegalTemplateSectionRow[], values: Record<string, string | null | undefined>,
  opts: { keepUnfilled?: boolean; blank?: string } = {},
): string {
  return renderSections(sections, values, opts)
    .map((s) => (s.title ? `${s.title}\n${s.body}` : s.body))
    .join("\n\n");
}

/** Merge template defaults into the value map (only where the value is empty). */
export function applyDefaults(
  fields: LegalTemplateFieldRow[], values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...values };
  for (const f of fields) {
    if ((out[f.field_key] === undefined || out[f.field_key] === "") && f.default_value != null) {
      out[f.field_key] = f.default_value;
    }
  }
  return out;
}

export interface ValidationError { field_key: string; label: string; message: string }

/** Required-field validation with clear Hebrew errors. */
export function validateDocument(
  fields: LegalTemplateFieldRow[], values: Record<string, string>,
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  for (const f of fields) {
    if (!f.is_required) continue;
    const v = values[f.field_key];
    if (v === undefined || v === null || String(v).trim() === "") {
      errors.push({ field_key: f.field_key, label: f.label, message: `שדה חובה: ${f.label}` });
    }
  }
  return { ok: errors.length === 0, errors };
}

// ── CRM prefill ───────────────────────────────────────────────────────────────
export interface PrefillContext {
  office_name?: string | null; office_phone?: string | null; office_email?: string | null; office_address?: string | null;
  agent_name?: string | null; agent_license?: string | null; agent_phone?: string | null; agent_email?: string | null;
  client_name?: string | null; client_id?: string | null; client_phone?: string | null; client_email?: string | null; client_address?: string | null;
  buyer_name?: string | null; buyer_phone?: string | null; buyer_email?: string | null;
  seller_name?: string | null; seller_phone?: string | null; seller_email?: string | null;
  property_address?: string | null; city?: string | null; block?: string | null; parcel?: string | null;
  sub_parcel?: string | null; property_zono_id?: string | null; price?: string | null;
  agreement_date?: string | null;
}

/** Prefill values for known field_keys from CRM context (only fields that exist
 *  on the template and aren't already set). Never overwrites a provided value. */
export function prefillFromContext(
  fields: LegalTemplateFieldRow[], ctx: PrefillContext, existing: Record<string, string> = {},
): Record<string, string> {
  const present = new Set(fields.map((f) => f.field_key));
  const out: Record<string, string> = { ...existing };
  for (const [k, v] of Object.entries(ctx)) {
    if (v != null && String(v) !== "" && present.has(k) && (out[k] === undefined || out[k] === "")) {
      out[k] = String(v);
    }
  }
  return out;
}

// ── Status machine + signed lock ───────────────────────────────────────────────
const TRANSITIONS: Record<LegalDocStatus, LegalDocStatus[]> = {
  draft: ["ready_for_signature", "archived"],
  ready_for_signature: ["sent", "signed", "declined", "draft", "archived"],
  sent: ["viewed", "signed", "declined", "expired", "archived"],
  viewed: ["signed", "declined", "expired", "archived"],
  signed: ["archived"],          // a signed doc is locked — only archiving is allowed
  declined: ["draft", "archived"],
  expired: ["draft", "archived"],
  archived: [],
};

export function nextStatuses(status: LegalDocStatus): LegalDocStatus[] {
  return TRANSITIONS[status] ?? [];
}
export function canTransition(from: LegalDocStatus, to: LegalDocStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
/** A signed document is immutable (content/fields) — it may only be archived or
 *  duplicated into a new version. */
export function isLocked(status: LegalDocStatus): boolean {
  return status === "signed";
}
export function isEditable(status: LegalDocStatus): boolean {
  return status === "draft" || status === "ready_for_signature" || status === "declined" || status === "expired";
}
