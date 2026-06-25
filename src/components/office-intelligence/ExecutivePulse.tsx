"use client";
import { Sunrise } from "lucide-react";
import { AiActionButton } from "@/components/ai-copilot/AiCopilotPanel";
import { officeAiSummaryAction } from "@/lib/office-intelligence/actions";

export function ExecutivePulse({ managerName, pulse }: { managerName: string; pulse: string[] }) {
  return (
    <section className="zono-gradient relative overflow-hidden rounded-[20px] p-5 text-white">
      <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-white/80"><Sunrise size={16} /> מרכז מודיעין המשרד</p>
          <h1 className="mt-1 text-2xl font-black">בוקר טוב, {managerName}</h1>
        </div>
        <AiActionButton label="סכם לי את הבוקר" title="תדריך בוקר משרד — ZONO Copilot"
          run={() => officeAiSummaryAction("morning")}
          className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-3 py-2 text-sm font-black text-white hover:bg-white/30" />
      </div>
      <ul className="relative mt-3 flex flex-col gap-1.5">
        {pulse.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm font-semibold text-white/95">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />{p}
          </li>
        ))}
      </ul>
    </section>
  );
}
