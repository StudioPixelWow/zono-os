"use client";

// ============================================================================
// ZONO — Reusable RTL, print/PDF-ready legal document renderer. Clean legal
// layout: numbered sections (title + body, line breaks preserved), a signature
// block, and a "ZONO Audit Trail" footer. Includes a print stylesheet so
// window.print() produces a clean PDF (app chrome hidden). Page-break friendly.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  LEGAL_DOC_STATUS_LABEL,
  type LegalDocumentRow,
  type LegalDocumentSignatureRow,
} from "@/lib/legal/types";

interface RenderedSection {
  order_index: number;
  title: string | null;
  body: string;
}

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function LegalDocumentRender({
  document,
  sections,
  signatures,
  showPrintButton = true,
  className,
}: {
  document: LegalDocumentRow;
  sections: RenderedSection[];
  signatures: LegalDocumentSignatureRow[];
  showPrintButton?: boolean;
  className?: string;
}) {
  const ordered = [...sections].sort((a, b) => a.order_index - b.order_index);

  return (
    <div dir="rtl" className={cn("zono-legal-doc flex flex-col gap-4", className)}>
      {/* Print stylesheet — hides app chrome, lays out a clean A4 document. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .zono-legal-print, .zono-legal-print * { visibility: visible !important; }
          .zono-legal-print { position: absolute; inset: 0; margin: 0; padding: 24mm 18mm; width: 100%; box-shadow: none !important; border: 0 !important; background: #fff !important; }
          .zono-legal-no-print { display: none !important; }
          .zono-legal-section { break-inside: avoid; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {showPrintButton && (
        <div className="zono-legal-no-print flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            leadingIcon={<Icon name="Download" size={15} />}
          >
            הדפס / PDF
          </Button>
        </div>
      )}

      <article className="zono-legal-print bg-card border-line rounded-2xl border p-6 shadow-sm sm:p-8" style={{ fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif" }}>
        {/* Document header */}
        <header className="border-line mb-6 border-b pb-4 text-center">
          <h1 className="text-ink text-xl font-black sm:text-2xl">{document.title}</h1>
          <p className="text-muted mt-1 text-[12px] font-semibold">
            {LEGAL_DOC_STATUS_LABEL[document.status]}
            {document.template_version != null ? ` · גרסת תבנית v${document.template_version}` : ""}
            {document.version > 1 ? ` · גרסה ${document.version}` : ""}
          </p>
        </header>

        {/* Numbered sections */}
        <div className="flex flex-col gap-5">
          {ordered.length === 0 ? (
            <p className="text-muted text-center text-sm">אין תוכן מוצג למסמך זה.</p>
          ) : (
            ordered.map((s, i) => (
              <section key={`${s.order_index}-${i}`} className="zono-legal-section break-inside-avoid">
                {s.title && (
                  <h2 className="text-ink mb-1.5 text-[15px] font-black">
                    {i + 1}. {s.title}
                  </h2>
                )}
                <p className="text-ink/90 whitespace-pre-wrap text-[14px] leading-relaxed">{s.body}</p>
              </section>
            ))
          )}
        </div>

        {/* Signature block */}
        <div className="zono-legal-section border-line mt-8 break-inside-avoid border-t pt-5">
          <h2 className="text-ink mb-3 text-[15px] font-black">חתימות</h2>
          {signatures.length === 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {["צד א׳", "צד ב׳"].map((role) => (
                <div key={role} className="flex flex-col gap-2">
                  <div className="border-ink/40 mt-6 border-b" />
                  <span className="text-muted text-[12px]">{role} — חתימה ותאריך</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {signatures.map((sig) => (
                <div key={sig.id} className="border-line bg-surface rounded-xl border p-3">
                  <p className="text-ink text-[14px] font-bold">{sig.signer_name}</p>
                  {sig.signer_role && <p className="text-muted text-[12px]">{sig.signer_role}</p>}
                  {(sig.signer_email || sig.signer_phone) && (
                    <p className="text-muted text-[11px]">
                      {[sig.signer_email, sig.signer_phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-muted mt-1 text-[11px]">נחתם: {fmtDateTime(sig.signed_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ZONO Audit Trail */}
        <div className="zono-legal-section border-line mt-6 break-inside-avoid border-t pt-4">
          <h2 className="text-muted mb-2 flex items-center gap-1.5 text-[12px] font-black">
            <Icon name="ShieldCheck" size={13} />
            ZONO Audit Trail
          </h2>
          <dl className="text-muted grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
            <AuditRow k="סטטוס" v={LEGAL_DOC_STATUS_LABEL[document.status]} />
            <AuditRow k="גרסת מסמך" v={String(document.version)} />
            <AuditRow k="גרסת תבנית" v={document.template_version != null ? `v${document.template_version}` : "—"} />
            <AuditRow k="חותמים" v={String(signatures.length)} />
            <AuditRow k="נוצר" v={fmtDateTime(document.created_at)} />
            <AuditRow k="עודכן" v={fmtDateTime(document.updated_at)} />
            <AuditRow k="Hash" v={document.rendered_hash ? `${document.rendered_hash.slice(0, 24)}…` : "—"} mono />
          </dl>
        </div>
      </article>
    </div>
  );
}

function AuditRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-transparent">
      <dt className="font-semibold">{k}</dt>
      <dd className={cn("text-ink/70 truncate text-left", mono && "font-mono")}>{v}</dd>
    </div>
  );
}
