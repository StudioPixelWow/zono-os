"use client";

// ============================================================================
// ZONO — Single legal document view. Shows the editable builder (drafts) +/or
// the print-ready render, plus a side panel of actions: status transitions,
// MANUAL signing (records a signature + locks the doc — no e-signature provider),
// duplicate, and an audit-trail timeline. Two view modes: "edit" and "preview".
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { cn } from "@/lib/utils";
import { nextStatuses, isLocked, isEditable } from "@/lib/legal/engine";
import {
  changeLegalDocumentStatusAction,
  signLegalDocumentAction,
  duplicateLegalDocumentAction,
} from "@/lib/legal/actions";
import {
  LEGAL_DOC_STATUS_LABEL,
  type LegalTemplateFull,
  type LegalDocStatus,
  type LegalDocumentAuditRow,
} from "@/lib/legal/types";
import type { DocumentRenderView } from "@/lib/legal/service";
import { LegalDocumentRender } from "@/components/legal/LegalDocumentRender";
import { LegalDocumentBuilder } from "../LegalDocumentBuilder";

const AUDIT_LABEL: Record<string, string> = {
  created: "נוצר",
  updated: "עודכן",
  status_changed: "שינוי סטטוס",
  signed: "נחתם",
  duplicated: "שוכפל",
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });

export function LegalDocumentView({
  view,
  template,
}: {
  view: DocumentRenderView;
  template: LegalTemplateFull | null;
}) {
  const router = useRouter();
  const r = useActionRunner();
  const { document, sections, full } = view;
  const locked = isLocked(document.status);
  const editable = isEditable(document.status);

  const [mode, setMode] = useState<"edit" | "preview">(editable ? "edit" : "preview");

  // Manual signing form
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");

  const transitions = nextStatuses(document.status);

  const changeStatus = (status: LegalDocStatus) =>
    r.run(
      async () => {
        const res = await changeLegalDocumentStatusAction(document.id, status);
        if (!res.ok) throw new Error(res.message ?? "שינוי הסטטוס נכשל.");
        router.refresh();
        return res;
      },
      { id: `status-${status}`, pendingMessage: "מעדכן סטטוס...", successMessage: "הסטטוס עודכן.", refresh: false },
    );

  const sign = () =>
    r.run(
      async () => {
        if (!signerName.trim()) throw new Error("נדרש שם חותם.");
        const res = await signLegalDocumentAction(document.id, {
          signerName: signerName.trim(),
          signerRole: signerRole.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
          signerPhone: signerPhone.trim() || undefined,
        });
        if (!res.ok) throw new Error(res.message ?? "החתימה נכשלה.");
        setSignerName(""); setSignerRole(""); setSignerEmail(""); setSignerPhone("");
        router.refresh();
        return res;
      },
      { id: "sign", pendingMessage: "רושם חתימה...", successMessage: "המסמך נחתם ונעול.", refresh: false },
    );

  const duplicate = () =>
    r.run(
      async () => {
        const res = await duplicateLegalDocumentAction(document.id);
        if (!res.ok || !res.data?.documentId) throw new Error(res.message ?? "השכפול נכשל.");
        router.push(`/legal-templates/${res.data.documentId}`);
        return res;
      },
      { id: "duplicate", pendingMessage: "משכפל...", refresh: false },
    );

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      {/* HEADER */}
      <div className="zono-legal-no-print flex flex-col gap-2">
        <Link href="/legal-templates" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
          <Icon name="ChevronRight" size={16} />
          חזרה למסמכים
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-ink truncate text-2xl font-black">{document.title}</h1>
              <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">
                {LEGAL_DOC_STATUS_LABEL[document.status]}
              </span>
              {locked && (
                <span className="bg-line/70 text-muted flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
                  <Icon name="Lock" size={11} />
                  נעול
                </span>
              )}
            </div>
            {document.version > 1 && <p className="text-muted mt-1 text-[12px]">גרסה {document.version}</p>}
          </div>
          {/* mode toggle */}
          <div className="border-line bg-surface flex items-center gap-1 rounded-lg border p-0.5">
            {editable && (
              <button
                onClick={() => setMode("edit")}
                className={cn("rounded-md px-3 py-1 text-[12px] font-bold", mode === "edit" ? "bg-card text-ink shadow-sm" : "text-muted")}
              >
                עריכה
              </button>
            )}
            <button
              onClick={() => setMode("preview")}
              className={cn("rounded-md px-3 py-1 text-[12px] font-bold", mode === "preview" ? "bg-card text-ink shadow-sm" : "text-muted")}
            >
              תצוגה / הדפסה
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* MAIN — builder (edit) or render (preview) */}
        <div className="min-w-0">
          {mode === "edit" && editable ? (
            <LegalDocumentBuilder document={document} template={template} />
          ) : (
            <LegalDocumentRender document={document} sections={sections} signatures={full.signatures} />
          )}
        </div>

        {/* SIDE PANEL */}
        <aside className="zono-legal-no-print flex flex-col gap-4">
          <ActionFeedback runner={r} />

          {/* Status transitions */}
          <Panel title="סטטוס" icon="ListChecks">
            {transitions.length === 0 ? (
              <p className="text-muted text-[12px]">אין מעברי סטטוס זמינים.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {transitions.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="secondary"
                    loading={r.busyId === `status-${s}`}
                    onClick={() => changeStatus(s)}
                  >
                    {LEGAL_DOC_STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
            )}
          </Panel>

          {/* Manual signature */}
          {!locked && (
            <Panel title="חתימה ידנית" icon="PenLine">
              <p className="text-muted mb-2 text-[11px] leading-relaxed">
                אין ספק חתימה אלקטרונית — פעולה זו רושמת חתימה ידנית ונועלת את המסמך.
              </p>
              <div className="flex flex-col gap-2">
                <SignField label="שם החותם *" value={signerName} onChange={setSignerName} />
                <SignField label="תפקיד" value={signerRole} onChange={setSignerRole} />
                <SignField label="אימייל" value={signerEmail} onChange={setSignerEmail} type="email" />
                <SignField label="טלפון" value={signerPhone} onChange={setSignerPhone} type="tel" />
                <Button size="sm" loading={r.busyId === "sign"} disabled={!signerName.trim()} onClick={sign}>
                  <Icon name="PenLine" size={14} />
                  חתום ונעל
                </Button>
              </div>
            </Panel>
          )}

          {/* Duplicate */}
          <Panel title="פעולות" icon="Copy">
            <Button size="sm" variant="secondary" fullWidth loading={r.busyId === "duplicate"} onClick={duplicate}>
              <Icon name="Copy" size={14} />
              שכפל לגרסה חדשה
            </Button>
          </Panel>

          {/* Signatures summary */}
          {full.signatures.length > 0 && (
            <Panel title={`חתימות (${full.signatures.length})`} icon="FileCheck2">
              <ul className="flex flex-col gap-2">
                {full.signatures.map((sig) => (
                  <li key={sig.id} className="border-line rounded-lg border p-2">
                    <p className="text-ink text-[13px] font-bold">{sig.signer_name}</p>
                    {sig.signer_role && <p className="text-muted text-[11px]">{sig.signer_role}</p>}
                    <p className="text-muted text-[11px]">{sig.signed_at ? fmtDateTime(sig.signed_at) : "—"}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Audit trail timeline */}
          <Panel title="נתיב ביקורת" icon="Clock">
            <AuditTimeline audit={full.audit} />
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function SignField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[11px] font-bold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm"
      />
    </label>
  );
}

function AuditTimeline({ audit }: { audit: LegalDocumentAuditRow[] }) {
  if (audit.length === 0) return <p className="text-muted text-[12px]">אין רישומי ביקורת.</p>;
  const ordered = [...audit].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <ul className="flex flex-col gap-3">
      {ordered.map((a) => (
        <li key={a.id} className="flex items-start gap-2">
          <span className="bg-brand-soft text-brand mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg">
            <Icon name="Check" size={12} />
          </span>
          <div className="min-w-0">
            <p className="text-ink text-[12px] font-bold">{AUDIT_LABEL[a.event_type] ?? a.event_type}</p>
            <p className="text-muted text-[10px]">{fmtDateTime(a.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-card border-line rounded-2xl border p-4 shadow-sm"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg">
          <Icon name={icon} size={14} />
        </span>
        <h3 className="text-ink text-sm font-black">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}
