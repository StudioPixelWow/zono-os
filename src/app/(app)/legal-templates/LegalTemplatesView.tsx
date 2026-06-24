"use client";

// ============================================================================
// ZONO — Legal Documents / Templates main view. Two areas:
//   • תבניות — the template catalog (filter by category, search, preview with
//     {{tokens}} visible, inline admin section editing, create a document).
//   • מסמכים — generated documents (status badge, title, date → open viewer).
// All data flows through the legal server actions; nothing is mocked. RTL Hebrew.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { cn, formatDate } from "@/lib/utils";
import {
  getLegalTemplateAction,
  previewLegalTemplateAction,
  updateLegalTemplateSectionAction,
  createLegalDocumentAction,
} from "@/lib/legal/actions";
import {
  LEGAL_DOC_STATUS_LABEL,
  type LegalTemplateRow,
  type LegalTemplateFull,
  type LegalTemplateSectionRow,
  type LegalDocumentRow,
  type LegalDocStatus,
} from "@/lib/legal/types";

const TEMPLATE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-success-soft text-success" },
  draft: { label: "טיוטה", cls: "bg-line/60 text-muted" },
  archived: { label: "בארכיון", cls: "bg-line/60 text-muted" },
};

const DOC_STATUS_BADGE: Record<LegalDocStatus, string> = {
  draft: "bg-line/60 text-muted",
  ready_for_signature: "bg-brand-soft text-brand-strong",
  sent: "bg-brand-soft text-brand-strong",
  viewed: "bg-brand-soft text-brand-strong",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  expired: "bg-warning-soft text-warning",
  archived: "bg-line/60 text-muted",
};

type Tab = "templates" | "documents";

export function LegalTemplatesView({
  templates,
  documents,
}: {
  templates: LegalTemplateRow[];
  documents: LegalDocumentRow[];
}) {
  const router = useRouter();
  const r = useActionRunner();
  const [tab, setTab] = useState<Tab>("templates");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  // Drawer state: preview / edit-sections for a given template.
  const [drawer, setDrawer] = useState<{ mode: "preview" | "edit"; templateId: string } | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category))).sort(),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [templates, search, category]);

  const createFromTemplate = (templateId: string) =>
    r.run(
      async () => {
        const res = await createLegalDocumentAction({ templateId });
        if (!res.ok || !res.data?.documentId) throw new Error(res.message ?? "יצירת המסמך נכשלה.");
        router.push(`/legal-templates/${res.data.documentId}`);
        return res;
      },
      { id: `create-${templateId}`, pendingMessage: "יוצר מסמך מהתבנית...", refresh: false },
    );

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start gap-3"
      >
        <div className="from-brand to-brand-strong grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm">
          <Icon name="FileText" size={24} className="text-white" />
        </div>
        <div>
          <p className="text-brand text-xs font-bold">ZONO Legal OS</p>
          <h1 className="text-ink mt-0.5 text-2xl font-black">מסמכים משפטיים ותבניות</h1>
          <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">
            ספריית תבניות משפטיות והמסמכים שנוצרו מהן — יצירה, עריכה, הכנה לחתימה וחתימה ידנית. כל מסמך
            נשמר עם נתיב ביקורת מלא.
          </p>
        </div>
      </motion.header>

      {/* TABS */}
      <div className="border-line flex gap-1 border-b">
        {([
          { id: "templates", label: "תבניות", icon: "FileText", count: templates.length },
          { id: "documents", label: "מסמכים", icon: "FileCheck2", count: documents.length },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition",
              tab === t.id ? "text-brand-strong" : "text-muted hover:text-ink",
            )}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
            <span className="bg-line/60 text-muted rounded-full px-1.5 text-[11px] font-bold">{t.count}</span>
            {tab === t.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        ))}
      </div>

      <ActionFeedback runner={r} />

      {tab === "templates" ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-line bg-surface flex h-9 flex-1 items-center gap-2 rounded-lg border px-3">
              <Icon name="Search" size={15} className="text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש תבנית..."
                className="text-ink w-full bg-transparent text-sm outline-none"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm font-semibold outline-none"
            >
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {filteredTemplates.length === 0 ? (
            <EmptyState icon="FileText" title="אין תבניות תואמות" text="נסה לשנות את החיפוש או הקטגוריה." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((t) => {
                const badge = TEMPLATE_STATUS_BADGE[t.status] ?? TEMPLATE_STATUS_BADGE.draft;
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-ink truncate text-sm font-black">{t.title}</h3>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", badge.cls)}>{badge.label}</span>
                        </div>
                        <p className="text-muted mt-0.5 text-[11px] font-bold">
                          {t.category} · v{t.version}
                        </p>
                      </div>
                      <span className="bg-brand-soft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl">
                        <Icon name="FileText" size={16} />
                      </span>
                    </div>
                    {t.description && <p className="text-muted text-[12px] leading-relaxed">{t.description}</p>}
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setDrawer({ mode: "preview", templateId: t.id })}>
                        <Icon name="Eye" size={14} />
                        תצוגה מקדימה
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDrawer({ mode: "edit", templateId: t.id })}>
                        <Icon name="PenLine" size={14} />
                        ערוך סעיפים
                      </Button>
                      <Button
                        size="sm"
                        loading={r.busyId === `create-${t.id}`}
                        onClick={() => createFromTemplate(t.id)}
                      >
                        <Icon name="FilePlus2" size={14} />
                        צור מסמך
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <DocumentsList documents={documents} />
      )}

      {/* DRAWER */}
      {drawer && (
        <TemplateDrawer
          mode={drawer.mode}
          templateId={drawer.templateId}
          onClose={() => setDrawer(null)}
          onCreate={createFromTemplate}
        />
      )}
    </main>
  );
}

// ── Documents list ──────────────────────────────────────────────────────────────
function DocumentsList({ documents }: { documents: LegalDocumentRow[] }) {
  const router = useRouter();
  if (documents.length === 0) {
    return <EmptyState icon="FileCheck2" title="אין עדיין מסמכים" text="צור מסמך מתבנית כדי להתחיל." />;
  }
  return (
    <div className="flex flex-col gap-2">
      {documents.map((d) => (
        <button
          key={d.id}
          onClick={() => router.push(`/legal-templates/${d.id}`)}
          className="bg-card border-line hover:border-brand/50 flex items-center justify-between gap-3 rounded-2xl border p-4 text-right shadow-sm transition-colors"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-brand-soft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl">
              <Icon name="FileText" size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-ink truncate text-sm font-bold">{d.title}</p>
              <p className="text-muted text-[11px]">
                נוצר {formatDate(d.created_at)}
                {d.version > 1 ? ` · גרסה ${d.version}` : ""}
              </p>
            </div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", DOC_STATUS_BADGE[d.status])}>
            {LEGAL_DOC_STATUS_LABEL[d.status]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Template drawer (preview with tokens / edit sections) ───────────────────────
function TemplateDrawer({
  mode,
  templateId,
  onClose,
  onCreate,
}: {
  mode: "preview" | "edit";
  templateId: string;
  onClose: () => void;
  onCreate: (templateId: string) => void;
}) {
  const [full, setFull] = useState<LegalTemplateFull | null>(null);
  const [previewSections, setPreviewSections] = useState<{ order_index: number; title: string | null; body: string }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const tpl = await getLegalTemplateAction(templateId);
        if (!active) return;
        setFull(tpl);
        if (mode === "preview") {
          const prev = await previewLegalTemplateAction(templateId, {});
          if (active) setPreviewSections(prev?.sections ?? []);
        }
      } catch {
        if (active) setLoadError("טעינת התבנית נכשלה.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [templateId, mode]);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex justify-start bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-card border-line ms-auto flex h-full w-full max-w-2xl flex-col border-s shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-line flex items-center justify-between gap-2 border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg">
              <Icon name={mode === "preview" ? "Eye" : "PenLine"} size={16} />
            </span>
            <div>
              <h3 className="text-ink text-sm font-black">
                {mode === "preview" ? "תצוגה מקדימה" : "עריכת סעיפים"}
              </h3>
              {full && <p className="text-muted text-[11px]">{full.template.title} · v{full.template.version}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="סגור">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-muted flex items-center justify-center gap-2 py-16 text-sm">
              <Icon name="Loader" size={16} className="animate-spin" />
              טוען...
            </div>
          ) : loadError ? (
            <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{loadError}</p>
          ) : mode === "preview" ? (
            <PreviewBody title={full?.template.title ?? ""} sections={previewSections ?? []} />
          ) : (
            full && <EditSectionsBody sections={full.sections} />
          )}
        </div>

        {mode === "preview" && full && (
          <div className="border-line flex justify-end gap-2 border-t px-5 py-3">
            <Button size="sm" onClick={() => onCreate(templateId)}>
              <Icon name="FilePlus2" size={14} />
              צור מסמך מתבנית זו
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewBody({ title, sections }: { title: string; sections: { order_index: number; title: string | null; body: string }[] }) {
  return (
    <div className="bg-surface border-line flex flex-col gap-4 rounded-xl border p-4" style={{ fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif" }}>
      <h3 className="text-ink border-line border-b pb-2 text-center text-base font-black">{title}</h3>
      <p className="text-muted text-[11px]">שדות בסוגריים מסולסלים <code className="bg-brand-soft text-brand-strong rounded px-1">{"{{שדה}}"}</code> יוחלפו בערכים בעת יצירת המסמך.</p>
      {sections.length === 0 ? (
        <p className="text-muted text-center text-sm">אין סעיפים בתבנית.</p>
      ) : (
        sections
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((s, i) => (
            <div key={`${s.order_index}-${i}`}>
              {s.title && <h4 className="text-ink mb-1 text-[14px] font-bold">{i + 1}. {s.title}</h4>}
              <p className="text-ink/90 whitespace-pre-wrap text-[13px] leading-relaxed">{s.body}</p>
            </div>
          ))
      )}
    </div>
  );
}

function EditSectionsBody({ sections }: { sections: LegalTemplateSectionRow[] }) {
  const ordered = [...sections].sort((a, b) => a.order_index - b.order_index);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-[12px]">
        עריכת תוכן הסעיפים שמורה למנהלי המערכת. שמירה תכשל עם הודעה מתאימה אם אין לך הרשאה.
      </p>
      {ordered.map((s) => (
        <EditSectionCard key={s.id} section={s} />
      ))}
    </div>
  );
}

function EditSectionCard({ section }: { section: LegalTemplateSectionRow }) {
  const r = useActionRunner();
  const [title, setTitle] = useState(section.title ?? "");
  const [body, setBody] = useState(section.body);

  const save = () =>
    r.run(
      async () => {
        const res = await updateLegalTemplateSectionAction(section.id, { title: title.trim() || null, body });
        if (!res.ok) throw new Error(res.message ?? "עדכון הסעיף נכשל (נדרשת הרשאת מנהל).");
        return res;
      },
      { id: "save", pendingMessage: "שומר סעיף...", successMessage: "הסעיף עודכן.", refresh: false },
    );

  return (
    <div className="border-line bg-surface flex flex-col gap-2 rounded-xl border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px] font-bold">כותרת הסעיף</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-line bg-card text-ink h-9 rounded-lg border px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px] font-bold">תוכן (השתמש ב-{"{{field_key}}"} עבור שדות)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="border-line bg-card text-ink rounded-lg border px-3 py-2 text-sm font-mono leading-relaxed"
        />
      </label>
      <ActionFeedback runner={r} />
      <div>
        <Button size="sm" variant="secondary" loading={r.busyId === "save"} onClick={save}>
          <Icon name="Check" size={14} />
          שמור סעיף
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="bg-card border-line flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
      <div className="bg-brand-soft text-brand grid h-12 w-12 place-items-center rounded-full">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-ink text-sm font-bold">{title}</p>
      <p className="text-muted max-w-sm text-[13px]">{text}</p>
    </div>
  );
}
