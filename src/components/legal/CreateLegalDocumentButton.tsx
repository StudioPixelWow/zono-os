"use client";

// ============================================================================
// ZONO — "צור מסמך משפטי" — a drop-in action for an entity detail page
// (lead / buyer / seller / property / deal). Lets the agent pick a legal
// template, creates a draft document linked to the entity (CRM-prefilled by the
// backend), and navigates to the new document. Additive + minimal; nothing is
// mocked, everything flows through the legal server actions.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  listLegalTemplatesAction,
  createLegalDocumentAction,
} from "@/lib/legal/actions";
import type { LegalTemplateRow, LegalEntityType } from "@/lib/legal/types";

const ENTITY_KEY: Record<LegalEntityType, "leadId" | "buyerId" | "sellerId" | "propertyId" | "dealId"> = {
  lead: "leadId",
  buyer: "buyerId",
  seller: "sellerId",
  property: "propertyId",
  deal: "dealId",
};

export function CreateLegalDocumentButton({
  entityType,
  entityId,
  size = "sm",
  variant = "secondary",
  label = "צור מסמך משפטי",
}: {
  entityType: LegalEntityType;
  entityId: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<LegalTemplateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const openPicker = async () => {
    setOpen(true);
    setError(null);
    if (templates) return;
    setLoading(true);
    try {
      const rows = await listLegalTemplatesAction();
      setTemplates(rows.filter((t) => t.status === "active"));
    } catch {
      setError("טעינת התבניות נכשלה.");
    } finally {
      setLoading(false);
    }
  };

  const create = (templateId: string) => {
    setError(null);
    setBusyId(templateId);
    start(async () => {
      try {
        const res = await createLegalDocumentAction({
          templateId,
          [ENTITY_KEY[entityType]]: entityId,
        });
        if (!res.ok || !res.data?.documentId) {
          setError(res.message ?? "יצירת המסמך נכשלה.");
          setBusyId(null);
          return;
        }
        setOpen(false);
        router.push(`/legal-templates/${res.data.documentId}`);
      } catch {
        setError("יצירת המסמך נכשלה.");
        setBusyId(null);
      }
    });
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={openPicker}
        leadingIcon={<Icon name="FilePlus2" size={size === "sm" ? 14 : 16} />}
      >
        {label}
      </Button>

      {open && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-card border-line w-full max-w-lg overflow-hidden rounded-2xl border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg">
                  <Icon name="FileText" size={16} />
                </span>
                <h3 className="text-ink text-sm font-black">בחר תבנית משפטית</h3>
              </div>
              <button
                onClick={() => !pending && setOpen(false)}
                className="text-muted hover:text-ink"
                aria-label="סגור"
              >
                <Icon name="X" size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {error && (
                <p className="bg-danger-soft text-danger mb-2 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>
              )}
              {loading ? (
                <div className="text-muted flex items-center justify-center gap-2 py-10 text-sm">
                  <Icon name="Loader" size={16} className="animate-spin" />
                  טוען תבניות...
                </div>
              ) : !templates || templates.length === 0 ? (
                <p className="text-muted py-10 text-center text-sm">אין תבניות פעילות זמינות.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => create(t.id)}
                        disabled={pending}
                        className={cn(
                          "border-line hover:border-brand/50 hover:bg-brand-soft/30 flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right transition-colors",
                          pending && "opacity-50",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="text-ink block truncate text-sm font-bold">{t.title}</span>
                          <span className="text-muted block text-[11px]">
                            {t.category} · v{t.version}
                            {t.description ? ` · ${t.description}` : ""}
                          </span>
                        </span>
                        {busyId === t.id && pending ? (
                          <Icon name="Loader" size={16} className="text-brand shrink-0 animate-spin" />
                        ) : (
                          <Icon name="FilePlus2" size={16} className="text-brand shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
