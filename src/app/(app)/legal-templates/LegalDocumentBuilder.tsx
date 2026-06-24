"use client";

// ============================================================================
// ZONO — Legal document builder. A dynamic form built from the template fields
// (an input per field_type, defaults prefilled, required marked), with a live
// RTL preview pane. Saves via saveLegalDocumentAction, prepares for signature
// via finalizeLegalDocumentAction (surfacing Hebrew required-field errors).
// Editing a signed (locked) document disables inputs and offers duplication.
// ============================================================================
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { cn } from "@/lib/utils";
import { renderSections, isLocked, type ValidationError } from "@/lib/legal/engine";
import {
  saveLegalDocumentAction,
  finalizeLegalDocumentAction,
  duplicateLegalDocumentAction,
} from "@/lib/legal/actions";
import {
  LEGAL_DOC_STATUS_LABEL,
  type LegalTemplateFull,
  type LegalTemplateFieldRow,
  type LegalDocumentRow,
} from "@/lib/legal/types";

export function LegalDocumentBuilder({
  document,
  template,
}: {
  document: LegalDocumentRow;
  template: LegalTemplateFull | null;
}) {
  const router = useRouter();
  const r = useActionRunner();
  const locked = isLocked(document.status);

  const fields = useMemo(() => template?.fields ?? [], [template]);
  const sections = useMemo(() => template?.sections ?? [], [template]);

  const [title, setTitle] = useState(document.title);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...document.field_values }));
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const set = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));

  const previewSections = useMemo(
    () => renderSections(sections, values, { keepUnfilled: false }),
    [sections, values],
  );

  const errorFor = (key: string) => errors.find((e) => e.field_key === key);

  const save = () =>
    r.run(
      async () => {
        const res = await saveLegalDocumentAction(document.id, { title: title.trim() || document.title, fieldValues: values });
        if (!res.ok) throw new Error(res.message ?? "השמירה נכשלה.");
        router.refresh();
        return res;
      },
      { id: "save", pendingMessage: "שומר טיוטה...", successMessage: "המסמך נשמר.", refresh: false },
    );

  const finalize = () =>
    r.run(
      async () => {
        // Persist the latest values first, then validate + finalize.
        const saveRes = await saveLegalDocumentAction(document.id, { title: title.trim() || document.title, fieldValues: values });
        if (!saveRes.ok) throw new Error(saveRes.message ?? "השמירה נכשלה.");
        const res = await finalizeLegalDocumentAction(document.id);
        if (!res.ok) {
          setErrors(res.errors ?? []);
          throw new Error(res.message ?? "ההכנה לחתימה נכשלה.");
        }
        setErrors([]);
        router.refresh();
        return res;
      },
      { id: "finalize", pendingMessage: "מאמת שדות חובה...", successMessage: "המסמך מוכן לחתימה.", refresh: false },
    );

  const duplicate = () =>
    r.run(
      async () => {
        const res = await duplicateLegalDocumentAction(document.id);
        if (!res.ok || !res.data?.documentId) throw new Error(res.message ?? "השכפול נכשל.");
        router.push(`/legal-templates/${res.data.documentId}`);
        return res;
      },
      { id: "duplicate", pendingMessage: "משכפל לגרסה חדשה...", refresh: false },
    );

  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-1 gap-5 lg:grid-cols-2"
    >
      {/* FORM PANE */}
      <div className="bg-card border-line flex flex-col gap-4 rounded-2xl border p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ink flex items-center gap-2 text-base font-black">
            <Icon name="PenLine" size={18} className="text-brand" />
            עריכת מסמך
          </h2>
          <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">
            {LEGAL_DOC_STATUS_LABEL[document.status]}
          </span>
        </div>

        {locked && (
          <div className="bg-warning-soft text-warning flex flex-col gap-2 rounded-xl px-3 py-3 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Icon name="Lock" size={15} />
              מסמך חתום נעול — לא ניתן לערוך. ניתן לשכפל לגרסה חדשה.
            </span>
            <div>
              <Button size="sm" variant="secondary" loading={r.busyId === "duplicate"} onClick={duplicate}>
                <Icon name="Copy" size={14} />
                שכפל לגרסה חדשה
              </Button>
            </div>
          </div>
        )}

        <ActionFeedback runner={r} />

        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">כותרת המסמך</span>
          <input
            value={title}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
            className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm disabled:opacity-60"
          />
        </label>

        {fields.length === 0 ? (
          <p className="text-muted text-[13px]">לתבנית זו אין שדות לעריכה.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {fields.map((f) => (
              <FieldInput
                key={f.id}
                field={f}
                value={values[f.field_key] ?? ""}
                disabled={locked}
                error={errorFor(f.field_key)?.message}
                onChange={(v) => set(f.field_key, v)}
              />
            ))}
          </div>
        )}

        {!locked && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button loading={r.busyId === "save"} onClick={save} variant="secondary" size="sm">
              <Icon name="Check" size={15} />
              שמור טיוטה
            </Button>
            <Button loading={r.busyId === "finalize"} onClick={finalize} size="sm">
              <Icon name="FileCheck2" size={15} />
              הכן לחתימה
            </Button>
          </div>
        )}
      </div>

      {/* LIVE PREVIEW PANE */}
      <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
        <h2 className="text-ink flex items-center gap-2 text-base font-black">
          <Icon name="Eye" size={18} className="text-brand" />
          תצוגה חיה
        </h2>
        <div className="bg-surface border-line flex flex-col gap-4 rounded-xl border p-4" style={{ fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif" }}>
          <h3 className="text-ink border-line border-b pb-2 text-center text-base font-black">{title || document.title}</h3>
          {previewSections.length === 0 ? (
            <p className="text-muted text-center text-sm">אין תוכן להצגה.</p>
          ) : (
            previewSections.map((s, i) => (
              <div key={`${s.order_index}-${i}`}>
                {s.title && <h4 className="text-ink mb-1 text-[14px] font-bold">{i + 1}. {s.title}</h4>}
                <p className="text-ink/90 whitespace-pre-wrap text-[13px] leading-relaxed">{s.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Per-field input by field_type ───────────────────────────────────────────────
function FieldInput({
  field,
  value,
  disabled,
  error,
  onChange,
}: {
  field: LegalTemplateFieldRow;
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  const base = "border-line bg-surface text-ink rounded-lg border px-3 text-sm disabled:opacity-60";
  const labelEl = (
    <span className="text-muted text-[11px] font-bold">
      {field.label}
      {field.is_required && <span className="text-danger"> *</span>}
    </span>
  );

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === "true" || value === "1" || value === "כן"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="h-4 w-4"
        />
        {labelEl}
        {error && <span className="text-danger text-[11px]">— {error}</span>}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {labelEl}
      {field.field_type === "textarea" || field.field_type === "signature" ? (
        <textarea
          value={value}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          rows={field.field_type === "signature" ? 2 : 3}
          className={cn(base, "min-h-[64px] py-2", error && "border-danger")}
        />
      ) : field.field_type === "select" ? (
        <input
          value={value}
          disabled={disabled}
          list={`opts-${field.id}`}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(base, "h-9", error && "border-danger")}
        />
      ) : (
        <input
          type={inputType(field.field_type)}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(base, "h-9", error && "border-danger")}
        />
      )}
      {error && <span className="text-danger text-[11px]">{error}</span>}
    </label>
  );
}

function inputType(t: LegalTemplateFieldRow["field_type"]): string {
  switch (t) {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    case "phone":
      return "tel";
    default:
      return "text";
  }
}
