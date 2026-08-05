"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
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

export function LeadsListView({ leads, failed }: { leads: LeadListRow[]; failed: boolean }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (!s) return true;
      return (l.full_name ?? "").toLowerCase().includes(s) || (l.email ?? "").toLowerCase().includes(s) || (digits && (l.phone ?? "").replace(/\D/g, "").includes(digits));
    });
  }, [q, stage, leads]);

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="UserPlus" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">לידים</h1>
          <span className="text-muted text-sm">{filtered.length}</span>
        </div>
        <p className="text-muted text-sm">כל הלידים — סינון לפי שלב, חיפוש, וכניסה לכרטיס הליד לניהול מלא.</p>
      </header>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" className="bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none" />
      <nav className="flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setStage(s)} className={`rounded-full px-3 py-1 text-[12px] font-bold ${stage === s ? "bg-brand text-white" : "bg-surface text-muted"}`}>{s === "all" ? "הכל" : STAGE_LABEL[s]}</button>
        ))}
      </nav>

      {failed ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-6 text-center text-sm font-semibold">טעינת הלידים נכשלה — נסה לרענן</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין לידים להצגה</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="bg-card border-line hover:border-brand-light flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm transition">
              <div className="min-w-0">
                <p className="text-ink font-black">{l.full_name}</p>
                <p className="text-muted text-[12px]">{l.phone ?? "—"}{l.email ? ` · ${l.email}` : ""}{l.source ? ` · מקור: ${l.source}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {l.score != null && <span className="text-muted text-[12px] font-bold">{l.score}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[l.stage] ?? "bg-surface text-muted"}`}>{STAGE_LABEL[l.stage] ?? l.stage}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
