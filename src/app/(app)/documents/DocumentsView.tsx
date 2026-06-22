"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  createDocumentFromTemplateAction, createDocumentManualAction, createSignatureRequestAction, recordSignatureAction,
  cancelDocumentAction, getDocumentDetailAction,
} from "@/lib/documents/actions";
import {
  signatureStatusLabel, STATUS_TONE, AUDIT_EVENT_LABELS, docCategoryLabel, DOC_CATEGORY_LABELS,
} from "@/lib/documents/engine";
import { uploadDocumentFile } from "@/lib/documents/upload";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import type { DocCommandCenter, DocumentSummary, DocumentDetail } from "@/lib/documents/service";

type Tab = "all" | "pending" | "expiring" | "new" | "templates";

export function DocumentsView({ cc }: { cc: DocCommandCenter }) {
  const [tab, setTab] = useState<Tab>("all");
  const r = useActionRunner();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "all", label: "כל המסמכים", icon: "Presentation" },
    { id: "pending", label: "ממתינים לחתימה", icon: "Clock" },
    { id: "expiring", label: "פגי תוקף בקרוב", icon: "AlertTriangle" },
    { id: "new", label: "מסמך חדש", icon: "FilePlus2" },
    { id: "templates", label: "תבניות", icon: "Plus" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Presentation" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">מסמכים וחתימות</h1>
        </div>
        <p className="text-muted text-sm">ניהול מסמכי הליבה לאורך כל מסע הנדל״ן — גרסאות, חתימות, רשימות בדיקה ומסלול ביקורת. הכנת בקשות חתימה בלבד — ללא שליחה אוטומטית.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ממתינים לחתימה" value={cc.pendingSignatures} icon="Clock" tone="text-warning" />
        <Stat label="עסקאות חסומות" value={cc.blockedDeals} icon="AlertTriangle" tone="text-danger" />
        <Stat label="מסמכים חסרים" value={cc.missingDocuments} icon="Minus" tone="text-danger" />
        <Stat label="פגי תוקף בקרוב" value={cc.expiringSoon} icon="TrendingDown" tone="text-warning" />
      </div>

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>

      {tab === "templates" ? <TemplatesTab cc={cc} r={r} />
        : tab === "new" ? <NewDocumentForm r={r} />
        : <DocList docs={tab === "pending" ? cc.pending : tab === "expiring" ? cc.expiring : cc.documents} r={r} />}
    </main>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`flex items-center gap-1.5 text-[12px] font-bold ${tone}`}><Icon name={icon} size={14} />{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

function TemplatesTab({ cc, r }: { cc: DocCommandCenter; r: Runner }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cc.templates.map((t) => (
        <div key={t.template_key} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Presentation" size={14} /></span>
            <p className="text-ink font-black">{t.name_he}</p>
          </div>
          <p className="text-muted text-[12px]">{docCategoryLabel(t.doc_category)}{t.applies_to_stage ? ` · שלב: ${t.applies_to_stage}` : ""}</p>
          <Button size="sm" className="mt-1 w-fit" loading={r.busyId === `new-${t.template_key}`}
            onClick={() => r.run(async () => { const res = await createDocumentFromTemplateAction(t.template_key, {}); if (res.error) throw new Error(res.error); return res; }, { id: `new-${t.template_key}`, pendingMessage: "יוצר מסמך...", success: (x) => x.message ?? null })}>
            <Icon name="Plus" size={14} />צור מסמך
          </Button>
        </div>
      ))}
    </div>
  );
}

const field = "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none";
const lbl = "text-muted text-[11px] font-bold";

function NewDocumentForm({ r }: { r: Runner }) {
  const org = useCurrentOrganization();
  const [title, setTitle] = useState("");
  const [docCategory, setDocCategory] = useState("custom");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isChecklist, setIsChecklist] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const submit = () =>
    r.run(async () => {
      setUploadErr(null);
      let fileUrl: string | undefined;
      let storagePath: string | undefined;
      if (file) {
        if (!org) throw new Error("לא ניתן לזהות ארגון להעלאה");
        const up = await uploadDocumentFile(file, org.id);
        fileUrl = up.url;
        storagePath = up.path;
      }
      const res = await createDocumentManualAction({
        title, docCategory, expiresAt: expiresAt || null, notes: notes || null,
        fileUrl, storagePath, isChecklistItem: isChecklist,
      });
      if (res.error) throw new Error(res.error);
      setTitle(""); setNotes(""); setExpiresAt(""); setFile(null); setIsChecklist(false);
      return res;
    }, { id: "new-doc", pendingMessage: file ? "מעלה ויוצר..." : "יוצר מסמך...", success: () => "המסמך נוצר ✓" });

  return (
    <div className="bg-card border-line flex flex-col gap-4 rounded-2xl border p-5 shadow-sm">
      <h2 className="text-ink text-base font-extrabold">צור מסמך חדש</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={lbl}>כותרת</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: הסכם בלעדיות — דירה ברחוב..." />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>סוג מסמך</span>
          <select className={field} value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
            {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>תאריך תפוגה (אופציונלי)</span>
          <input type="date" className={field} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>קובץ (PDF / תמונה / Word)</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="text-muted text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={lbl}>הערות</span>
        <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={isChecklist} onChange={(e) => setIsChecklist(e.target.checked)} />
        פריט נדרש ברשימת בדיקה (גם ללא קובץ)
      </label>
      <Button className="w-fit" loading={r.busyId === "new-doc"} onClick={submit}>
        <Icon name="FilePlus2" size={15} />צור מסמך
      </Button>
      {uploadErr && <p className="text-danger text-xs font-semibold">{uploadErr}</p>}
      <p className="text-muted text-[11px]">אפשר ליצור מסמך עם או בלי קובץ. לאחר היצירה ניתן להכין בקשת חתימה ולסמן כנחתם.</p>
    </div>
  );
}

function DocList({ docs, r }: { docs: DocumentSummary[]; r: Runner }) {
  if (docs.length === 0) return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין מסמכים להצגה</div>;
  return <div className="flex flex-col gap-2">{docs.map((d) => <DocCard key={d.id} d={d} r={r} />)}</div>;
}

function DocCard({ d, r }: { d: DocumentSummary; r: Runner }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && !detail) { try { setDetail(await getDocumentDetailAction(d.id)); } catch { /* silent */ } }
  };
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const entity = d.deal_id ? "עסקה" : d.buyer_id ? "קונה" : d.seller_id ? "מוכר" : d.property_id ? "נכס" : d.lead_id ? "ליד" : null;

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink font-black">{d.title}</p>
            <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{d.categoryLabel}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[d.signature_status] ?? "bg-surface text-muted"}`}>{signatureStatusLabel(d.signature_status)}</span>
          </div>
          <p className="text-muted mt-0.5 text-[12px]">גרסה {d.current_version}{entity ? ` · משויך ל${entity}` : ""}{d.expires_at ? ` · תוקף עד ${new Date(d.expires_at).toLocaleDateString("he-IL")}` : ""}</p>
        </div>
        <button onClick={toggle} className="text-brand-strong whitespace-nowrap text-[12px] font-bold">{open ? "סגור" : "פרטים"}</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {d.file_url && (
          <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="bg-surface text-ink hover:border-brand-light border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold">
            <Icon name="Download" size={14} />צפה / הורד
          </a>
        )}
        {(d.signature_status === "draft") && (
          <Button size="sm" loading={r.busyId === `req-${d.id}`}
            onClick={() => wrap(() => createSignatureRequestAction(d.id, "manual"), `req-${d.id}`, "מכין בקשה...")}>
            <Icon name="Send" size={14} />הכן בקשת חתימה
          </Button>
        )}
        {(d.signature_status === "pending_signature" || d.signature_status === "partially_signed") && (
          <Button size="sm" variant="secondary" loading={r.busyId === `sign-${d.id}`}
            onClick={() => wrap(() => recordSignatureAction(d.id, "חתימה ידנית"), `sign-${d.id}`, "רושם חתימה...")}>
            <Icon name="Check" size={14} />רשום חתימה
          </Button>
        )}
        {d.signature_status !== "completed" && d.signature_status !== "cancelled" && (
          <Button size="sm" variant="ghost" loading={r.busyId === `cancel-${d.id}`}
            onClick={() => wrap(() => cancelDocumentAction(d.id), `cancel-${d.id}`)}>
            <Icon name="Minus" size={14} />בטל
          </Button>
        )}
      </div>

      {open && detail && (
        <div className="border-line mt-3 flex flex-col gap-3 border-t pt-3">
          {detail.participants.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold">משתתפים</p>
              {detail.participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-ink">{p.contact_name ?? "—"} · {p.role === "signer" ? "חותם" : p.role}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === "signed" ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{p.status === "signed" ? "נחתם" : "ממתין"}</span>
                </div>
              ))}
            </div>
          )}
          {detail.signatures.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold">חתימות</p>
              {detail.signatures.map((s, i) => <p key={i} className="text-muted text-[12px]">✍ {s.signer_name} — {new Date(s.signed_at).toLocaleString("he-IL")}</p>)}
            </div>
          )}
          {detail.audit.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold">מסלול ביקורת</p>
              <ol className="flex flex-col gap-0.5">
                {detail.audit.slice(0, 8).map((a, i) => <li key={i} className="text-muted text-[12px]">• {AUDIT_EVENT_LABELS[a.event] ?? a.event}{a.detail ? ` — ${a.detail}` : ""}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
