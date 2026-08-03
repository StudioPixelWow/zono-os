// ============================================================================
// 📥 ZONO — CRM import row validation/normalization (PURE, testable).
// Wave 1. Validates + normalizes a mapped import row against a field spec BEFORE
// any write. Never executes spreadsheet formulas; rejects unsupported cells.
// Returns per-row + per-field results so the pipeline can produce a partial-
// failure report (valid rows commit, invalid rows are reported, not aborted).
// ============================================================================
import { normalizePhone, normalizeEmail } from "../identity/resolution";

export type FieldType = "text" | "phone" | "email" | "date" | "currency" | "number" | "boolean" | "city" | "tags";

export interface FieldSpec {
  key: string;
  type: FieldType;
  required?: boolean;
}

export interface FieldResult {
  key: string;
  raw: unknown;
  value: unknown | null;
  ok: boolean;
  error?: string;
}

export interface RowResult {
  ok: boolean;
  values: Record<string, unknown>;
  fields: FieldResult[];
  errors: string[];
}

/** A cell that is a spreadsheet formula must never be executed — reject it. */
function isFormula(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().startsWith("=");
}

const TRUE_SET = new Set(["true", "1", "yes", "y", "כן", "אמת"]);
const FALSE_SET = new Set(["false", "0", "no", "n", "לא", "שקר", ""]);

function coerce(spec: FieldSpec, raw: unknown): { value: unknown | null; error?: string } {
  if (isFormula(raw)) return { value: null, error: "formula_not_allowed" };
  const s = raw == null ? "" : String(raw).trim();
  if (s === "") return { value: null };

  switch (spec.type) {
    case "text":
    case "city":
      return { value: s };
    case "tags":
      return { value: s.split(/[;,]/).map((t) => t.trim()).filter(Boolean) };
    case "phone": {
      const p = normalizePhone(s);
      return p ? { value: p } : { value: null, error: "invalid_phone" };
    }
    case "email": {
      const e = normalizeEmail(s);
      return e ? { value: e } : { value: null, error: "invalid_email" };
    }
    case "number": {
      const n = Number(s.replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? { value: n } : { value: null, error: "invalid_number" };
    }
    case "currency": {
      const n = Number(s.replace(/[₪$€,\s]/g, ""));
      return Number.isFinite(n) && n >= 0 ? { value: n } : { value: null, error: "invalid_currency" };
    }
    case "boolean": {
      const t = s.toLowerCase();
      if (TRUE_SET.has(t)) return { value: true };
      if (FALSE_SET.has(t)) return { value: false };
      return { value: null, error: "invalid_boolean" };
    }
    case "date": {
      // Accept ISO or dd/mm/yyyy (Israeli). Never trust ambiguous m/d.
      const iso = /^\d{4}-\d{2}-\d{2}/.test(s);
      const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      if (iso) { const d = new Date(s); return isNaN(+d) ? { value: null, error: "invalid_date" } : { value: d.toISOString().slice(0, 10) }; }
      if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (isNaN(+d) || d.getMonth() !== Number(mm) - 1) return { value: null, error: "invalid_date" };
        return { value: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` };
      }
      return { value: null, error: "invalid_date" };
    }
    default:
      return { value: s };
  }
}

/** Validate + normalize one mapped row against the field spec. */
export function validateRow(spec: FieldSpec[], row: Record<string, unknown>): RowResult {
  const fields: FieldResult[] = [];
  const values: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const f of spec) {
    const raw = row[f.key];
    const { value, error } = coerce(f, raw);
    const missing = value == null && (raw == null || String(raw).trim() === "");
    if (f.required && missing) {
      fields.push({ key: f.key, raw, value: null, ok: false, error: "required" });
      errors.push(`${f.key}: required`);
      continue;
    }
    if (error) {
      fields.push({ key: f.key, raw, value: null, ok: false, error });
      errors.push(`${f.key}: ${error}`);
      continue;
    }
    fields.push({ key: f.key, raw, value, ok: true });
    if (value != null) values[f.key] = value;
  }

  return { ok: errors.length === 0, values, fields, errors };
}

export interface BatchValidation {
  total: number;
  valid: number;
  invalid: number;
  rows: (RowResult & { index: number })[];
}

/** Validate a whole batch; every row keeps its index for the error report. */
export function validateBatch(spec: FieldSpec[], rows: Record<string, unknown>[]): BatchValidation {
  const out = rows.map((r, index) => ({ index, ...validateRow(spec, r) }));
  return { total: rows.length, valid: out.filter((r) => r.ok).length, invalid: out.filter((r) => !r.ok).length, rows: out };
}
