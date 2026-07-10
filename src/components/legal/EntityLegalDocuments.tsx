// ============================================================================
// 📄 EntityLegalDocuments — lists the legal documents already created for a CRM
// entity (buyer / seller / property / lead / deal), so the documents tab isn't
// a create-only dead end. Server component; reuses listLegalDocumentsAction.
// Each row links to /legal-templates/[id] where the doc is edited/signed.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { listLegalDocumentsAction } from "@/lib/legal/actions";
import { LEGAL_DOC_STATUS_LABEL, type LegalEntityType, type LegalDocStatus } from "@/lib/legal/types";

const STATUS_TONE: Record<LegalDocStatus, string> = {
  draft: "bg-surface text-muted",
  ready_for_signature: "bg-brand-soft text-brand",
  sent: "bg-brand-soft text-brand",
  viewed: "bg-brand-soft text-brand-strong",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  expired: "bg-surface text-muted",
  archived: "bg-surface text-muted",
};

export async function EntityLegalDocuments({ entityType, entityId }: { entityType: LegalEntityType; entityId: string }) {
  const docs = await listLegalDocumentsAction({ entityType, entityId }).catch(() => []);
  if (docs.length === 0) return null;

  return (
    <div className="bg-card border-line rounded-[16px] border p-4">
      <p className="text-ink mb-3 flex items-center gap-2 text-sm font-extrabold">
        <Icon name="FileText" size={15} /> מסמכים משפטיים ({docs.length})
      </p>
      <div className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <Link key={d.id} href={`/legal-templates/${d.id}`}
            className="border-line hover:bg-surface flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition">
            <div className="min-w-0">
              <p className="text-ink truncate text-sm font-bold">{d.title}</p>
              <p className="text-muted text-[11px]">{new Date(d.updated_at).toLocaleDateString("he-IL")}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[d.status]}`}>
              {LEGAL_DOC_STATUS_LABEL[d.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
