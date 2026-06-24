"use client";

import { useMemo, useState } from "react";
import type { CenterLead } from "@/lib/distribution/center-data";
import { createLeadAction, updateLeadStatusAction } from "@/lib/distribution/center-actions";
import type { DistLeadStatus } from "@/lib/distribution/db-types";
import { cn } from "@/lib/utils";
import { Glass, StatTile, SectionHeading, Chip, EmptyState, ScoreBar, Icon } from "./shared";
import type { RunAction } from "./DistributionCenterView";

const STATUS_LABEL: Record<string, string> = {
  new: "חדש", contacted: "נוצר קשר", qualified: "מוסמך", converted: "הומר", lost: "אבוד",
};
const STATUS_TONE: Record<string, string> = {
  new: "bg-warning-soft text-warning", contacted: "bg-brand-soft text-brand-strong",
  qualified: "bg-brand-soft text-brand-strong", converted: "bg-success-soft text-success", lost: "bg-line/70 text-muted",
};
const STATUS_ORDER: DistLeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"];
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "הכל" }, { key: "new", label: "חדשים" }, { key: "contacted", label: "נוצר קשר" },
  { key: "qualified", label: "מוסמכים" }, { key: "converted", label: "הומרו" }, { key: "lost", label: "אבודים" },
];

/** Next status in the funnel; converted/lost are terminal → loop back to contacted for re-engagement. */
function nextStatus(s: string): DistLeadStatus {
  const i = STATUS_ORDER.indexOf(s as DistLeadStatus);
  if (i < 0) return "contacted";
  if (s === "converted" || s === "lost") return "contacted";
  return STATUS_ORDER[Math.min(i + 1, 3)]; // advance up to "converted"
}

export function LeadCollectionSection({
  leads,
  runAction,
  pending,
}: {
  leads: CenterLead[];
  runAction: RunAction;
  pending: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.status] = (m[l.status] ?? 0) + 1;
    return m;
  }, [leads]);

  const rows = useMemo(() => (filter ? leads.filter((l) => l.status === filter) : leads), [leads, filter]);

  const field = "bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition w-full";

  function submit() {
    runAction(() => createLeadAction({ name: name || undefined, phone: phone || undefined, source: source || undefined, notes: notes || undefined }), "הליד נוסף");
    setName(""); setPhone(""); setSource(""); setNotes(""); setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="איסוף לידים" subtitle="לידים מההפצה — שם, טלפון, מקור, כוונה וסטטוס" icon="Inbox"
        action={
          <button type="button" onClick={() => setShowForm((s) => !s)} className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white">
            <Icon name="Plus" size={16} /> ליד חדש
          </button>
        } />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="סך לידים" value={String(leads.length)} hint="מצטבר" icon="UserPlus" tone="brand" />
        <StatTile label="חדשים" value={String(counts.new ?? 0)} hint="ממתינים לטיפול" icon="Sparkles" tone="warning" />
        <StatTile label="מוסמכים" value={String(counts.qualified ?? 0)} hint="כוונת רכישה" icon="Target" tone="accent" />
        <StatTile label="הומרו" value={String(counts.converted ?? 0)} hint="עסקאות שנסגרו" icon="Handshake" tone="success" />
      </div>

      {showForm && (
        <Glass className="flex flex-col gap-3 p-5">
          <p className="text-ink text-sm font-extrabold">הוספת ליד ידני</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם" className={field} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" className={field} dir="ltr" />
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="מקור (למשל: תגובה בקבוצה)" className={field} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות" className={field} />
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={submit} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">שמור ליד</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted rounded-xl px-4 py-2 text-sm font-bold">ביטול</button>
          </div>
        </Glass>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)} count={f.key ? (counts[f.key] ?? 0) : leads.length}>{f.label}</Chip>
        ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState icon="UserPlus" title="אין עדיין לידים" body="לידים שנוצרים מההפצה — תגובות והודעות שזוהו ככוונת רכישה — יופיעו כאן. אפשר גם להוסיף ליד ידנית."
          action={<button type="button" onClick={() => setShowForm(true)} className="btn-zono-primary mt-1 rounded-xl px-4 py-2 text-sm font-bold text-white">הוסף ליד ראשון</button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon="Inbox" title="אין לידים בסטטוס זה" body="נסה לבחור פילטר אחר." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((l) => (
            <Glass key={l.id} className="flex flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{l.name || "ליד ללא שם"}</p>
                  <p className="text-muted text-[11px]">{l.phone || "—"} · מקור: {l.source || "—"}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", STATUS_TONE[l.status] ?? "bg-line/70 text-muted")}>{STATUS_LABEL[l.status] ?? l.status}</span>
              </div>
              {l.notes && <p className="text-muted line-clamp-2 text-xs leading-relaxed">{l.notes}</p>}
              <div className="flex items-center gap-2">
                <span className="text-muted text-[11px] font-bold">כוונה</span>
                <ScoreBar value={l.intentScore} width="w-20" />
              </div>
              <div className="border-line flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                <button type="button" disabled={pending}
                  onClick={() => runAction(() => updateLeadStatusAction({ id: l.id, status: nextStatus(l.status) }), "סטטוס הליד עודכן")}
                  className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:brightness-95 disabled:opacity-50">
                  <Icon name="ArrowLeft" size={12} /> קדם ל{STATUS_LABEL[nextStatus(l.status)]}
                </button>
                {l.status !== "converted" && (
                  <button type="button" disabled={pending}
                    onClick={() => runAction(() => updateLeadStatusAction({ id: l.id, status: "converted" }), "הליד סומן כהומר")}
                    className="bg-success-soft text-success inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:brightness-95 disabled:opacity-50">
                    <Icon name="Check" size={12} /> הומר
                  </button>
                )}
                {l.status !== "lost" && (
                  <button type="button" disabled={pending}
                    onClick={() => runAction(() => updateLeadStatusAction({ id: l.id, status: "lost" }), "הליד סומן כאבוד")}
                    className="bg-line/70 text-muted inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:brightness-95 disabled:opacity-50">
                    <Icon name="X" size={12} /> אבוד
                  </button>
                )}
              </div>
            </Glass>
          ))}
        </div>
      )}
    </div>
  );
}
