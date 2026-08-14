"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ContextualZeroState } from "@/components/common/ContextualZeroState";
import { bulkLeadAction, type BulkLeadOp, type BulkLeadResult } from "@/lib/leads/actions";
import type { LeadListRow } from "@/lib/leads/service";

const STAGE_LABEL: Record<string, string> = {
  new: "חדש", contacted: "נוצר קשר", qualified: "מוסמך", nurturing: "בטיפוח",
  converted: "הומר", lost: "אבוד", disqualified: "נפסל",
};
const STAGE_TONE: Record<string, string> = {
  new: "bg-brand-soft text-brand-strong", contacted: "bg-warning-soft text-warning", qualified: "bg-success-soft text-success",
  nurturing: "bg-surface text-muted", converted: "bg-success-soft text-success", lost: "bg-danger-soft text-danger", disqualified: "bg-surface text-muted",
};
const STAGES = ["all", "new", "contacted", "qualified", "nurturing", "converted", "lost", "disqualified"];
const BULK_OPS: { value: BulkLeadOp; label: string }[] = [
  { value: "mark_contacted", label: "סמן כנוצר קשר" },
  { value: "assign_me", label: "שייך אליי" },
  { value: "stage:qualified", label: "העבר ל: מוסמך" },
  { value: "stage:nurturing", label: "העבר ל: בטיפוח" },
  { value: "stage:disqualified", label: "העבר ל: נפסל" },
];

export function LeadsListView({ leads, failed }: { leads: LeadListRow[]; failed: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<BulkLeadOp>("mark_contacted");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkLeadResult | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (!s) return true;
      return (l.full_name ?? "").toLowerCase().includes(s) || (l.email ?? "").toLowerCase().includes(s) || (digits && (l.phone ?? "").replace(/\D/g, "").includes(digits));
    });
  }, [q, stage, leads]);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected((prev) => {
    if (allShownSelected) { const n = new Set(prev); filtered.forEach((l) => n.delete(l.id)); return n; }
    const n = new Set(prev); filtered.forEach((l) => n.add(l.id)); return n;
  });
  const clearSel = () => { setSelected(new Set()); setResult(null); };

  const applyBulk = async () => {
    if (!selected.size) return;
    setBusy(true); setResult(null);
    try {
      const res = await bulkLeadAction(Array.from(selected), op);
      setResult(res);
      if (res.succeeded > 0) { setSelected(new Set()); router.refresh(); }
    } catch { setResult({ ok: false, error: "הפעולה נכשלה", results: [], succeeded: 0, failed: 0 }); }
    finally { setBusy(false); }
  };

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="UserPlus" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">לידים</h1>
          <span className="text-muted text-sm">{filtered.length}</span>
        </div>
        <p className="text-muted text-sm">כל הלידים — סינון לפי שלב, חיפוש, בחירה מרובה ופעולות באצווה, וכניסה לכרטיס הליד.</p>
      </header>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" className="bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none" />
      <nav className="flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setStage(s)} className={`rounded-full px-3 py-1 text-[12px] font-bold ${stage === s ? "bg-brand text-white" : "bg-surface text-muted"}`}>{s === "all" ? "הכל" : STAGE_LABEL[s]}</button>
        ))}
      </nav>

      {!failed && filtered.length > 0 && (
        <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
          <label className="text-ink flex items-center gap-1.5 text-[12px] font-bold">
            <input type="checkbox" checked={allShownSelected} onChange={toggleAll} />בחר הכל
          </label>
          <span className="text-muted text-[12px]">{selected.size} נבחרו</span>
          <select value={op} onChange={(e) => setOp(e.target.value as BulkLeadOp)} className="bg-surface border-line text-ink h-9 rounded-xl border px-2 text-sm outline-none">
            {BULK_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button size="sm" loading={busy} disabled={!selected.size} onClick={applyBulk}>החל על הנבחרים</Button>
          {selected.size > 0 && <Button size="sm" variant="ghost" onClick={clearSel}>נקה</Button>}
          {result && (
            <span className={`text-[12px] font-bold ${result.failed ? "text-warning" : "text-success"}`}>
              {result.error ? result.error : `${result.succeeded} עודכנו${result.failed ? ` · ${result.failed} נכשלו` : ""}`}
            </span>
          )}
        </div>
      )}

      {failed ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-6 text-center text-sm font-semibold">טעינת הלידים נכשלה — נסה לרענן</div>
      ) : leads.length === 0 ? (
        // P9.0B contextual zero-state — the office has no leads yet. Real CTA
        // (opens Quick-Create via the zono:new-lead event — never a no-op).
        <ContextualZeroState
          icon="Users"
          title="הלקוח הראשון עוד לא כאן."
          value="ZONO כבר מוכנה לנהל את הדרך שלו מהרגע הראשון ועד העסקה. הוסף ליד ונתחיל לעבוד."
          cta="הוסף ליד ראשון"
          onCta={() => window.dispatchEvent(new CustomEvent("zono:new-lead"))}
          secondaryLabel="הוסף קונה"
          secondaryHref="/buyers/new"
        />
      ) : filtered.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">לא נמצאו לידים התואמים לסינון</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((l) => {
            const sel = selected.has(l.id);
            const failedRow = result?.results.find((r) => r.id === l.id && !r.ok);
            return (
              <div key={l.id} className={`bg-card flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition ${sel ? "border-brand" : failedRow ? "border-danger/50" : "border-line"}`}>
                <input type="checkbox" checked={sel} onChange={() => toggle(l.id)} />
                <Link href={`/leads/${l.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:opacity-90">
                  <div className="min-w-0">
                    <p className="text-ink font-black">{l.full_name}</p>
                    <p className="text-muted text-[12px]">{l.phone ?? "—"}{l.email ? ` · ${l.email}` : ""}{l.source ? ` · מקור: ${l.source}` : ""}{failedRow?.error ? ` · ⚠ ${failedRow.error}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.score != null && <span className="text-muted text-[12px] font-bold">{l.score}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[l.stage] ?? "bg-surface text-muted"}`}>{STAGE_LABEL[l.stage] ?? l.stage}</span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
