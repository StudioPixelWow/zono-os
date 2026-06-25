"use client";
import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { AiActionButton } from "@/components/ai-copilot/AiCopilotPanel";
import { generateOfficeReportAction, officeAiSummaryAction } from "@/lib/office-intelligence/actions";

const TYPES: { v: "daily" | "weekly" | "monthly"; l: string }[] = [
  { v: "daily", l: "יומי" }, { v: "weekly", l: "שבועי" }, { v: "monthly", l: "חודשי" },
];

export function OfficeReportsPanel() {
  const [type, setType] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const generate = () => start(async () => {
    setErr(null); setDone(null);
    const r = await generateOfficeReportAction(type, null, null);
    if (r.ok) setDone(`הדוח נוצר ונשמר (${r.data.reportId.slice(0, 8)}).`); else setErr(r.error);
  });

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><FileText size={16} /> דוחות מנהלים</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[12px] font-semibold text-ink">
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <button onClick={generate} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-brand-strong px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
          {pending && <Loader2 size={13} className="animate-spin" />} צור דוח
        </button>
        <AiActionButton label="סיכום שבועי AI" title="סיכום שבועי מנהלי — ZONO Copilot"
          run={() => officeAiSummaryAction("weekly")}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-1.5 text-[12px] font-bold text-violet-700 hover:bg-violet-100" />
      </div>
      {done && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700">{done}</p>}
      {err && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{err}</p>}
    </section>
  );
}
