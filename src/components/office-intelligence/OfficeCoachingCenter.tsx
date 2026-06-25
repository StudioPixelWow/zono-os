"use client";
import { GraduationCap } from "lucide-react";
import { AiActionButton } from "@/components/ai-copilot/AiCopilotPanel";
import { officeAgentFeedbackAction } from "@/lib/office-intelligence/actions";
import type { CoachingItem } from "@/lib/office-intelligence/types";

const SEV: Record<string, string> = { urgent: "border-red-300 bg-red-50", high: "border-amber-300 bg-amber-50", medium: "border-sky-200 bg-sky-50", low: "border-black/10 bg-white" };

export function OfficeCoachingCenter({ coaching }: { coaching: CoachingItem[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><GraduationCap size={16} className="text-brand-strong" /> מרכז אימון</h2>
      {coaching.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-5 text-center text-sm font-bold text-emerald-700">אין פריטי אימון פתוחים. הצוות במצב טוב ✓</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {coaching.map((c) => (
            <li key={c.id} className={`rounded-2xl border p-3 ${SEV[c.severity]}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-black text-ink">{c.title}</p>
                  {c.agentName && <p className="text-[11px] font-bold text-ink/45">{c.agentName}</p>}
                </div>
                <AiActionButton label="נסח משוב" title={`משוב ל${c.agentName ?? "סוכן"} — ZONO Copilot`}
                  run={() => officeAgentFeedbackAction(c.agentName ?? "הסוכן", c.title, c.recommendedAction)} />
              </div>
              <p className="mt-1 text-[12px] text-ink/65">{c.message}</p>
              <p className="mt-1.5 text-[12px] font-bold text-brand-strong">{c.recommendedAction}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
