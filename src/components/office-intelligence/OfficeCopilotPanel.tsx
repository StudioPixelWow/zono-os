"use client";
import { Sparkles } from "lucide-react";
import { AiActionButton } from "@/components/ai-copilot/AiCopilotPanel";
import { officeAiSummaryAction } from "@/lib/office-intelligence/actions";

const ACTIONS: { kind: "morning" | "team" | "coaching" | "weekly"; label: string; title: string }[] = [
  { kind: "morning", label: "תדריך בוקר", title: "תדריך בוקר משרד — ZONO Copilot" },
  { kind: "team", label: "סיכום צוות", title: "סיכום ביצועי צוות — ZONO Copilot" },
  { kind: "coaching", label: "המלצות אימון", title: "המלצות אימון לצוות — ZONO Copilot" },
  { kind: "weekly", label: "סיכום שבועי", title: "סיכום שבועי מנהלי — ZONO Copilot" },
];

export function OfficeCopilotPanel() {
  return (
    <section className="rounded-[20px] border border-violet-200 bg-violet-50/40 p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-black text-violet-800"><Sparkles size={16} /> ZONO Copilot</h2>
      <p className="mb-3 text-[12px] text-violet-700/70">סיכומים והסברים מבוססי-AI על נתוני המשרד. החישובים והדירוגים נשארים דטרמיניסטיים — ה-AI מסביר בלבד.</p>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <AiActionButton key={a.kind} label={a.label} title={a.title}
            run={() => officeAiSummaryAction(a.kind)}
            className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-[12px] font-bold text-violet-700 shadow-sm hover:bg-violet-100" />
        ))}
      </div>
    </section>
  );
}
