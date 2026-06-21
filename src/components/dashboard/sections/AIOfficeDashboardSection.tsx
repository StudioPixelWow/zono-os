import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getAIOfficeCommandCenter } from "@/lib/ai-office/service";

/** The AI brief + focus at the top of the home dashboard (server component). */
export async function AIOfficeDashboardSection() {
  let cc;
  try { cc = await getAIOfficeCommandCenter(); }
  catch (e) { console.error("[ai-office] dashboard failed:", e); return null; }
  if (cc.focus.length === 0 && cc.opportunities.length === 0 && cc.risks.length === 0) return null;

  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand text-white grid h-8 w-8 place-items-center rounded-xl"><Icon name="Sparkles" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מוח המשרד · AI</h2>
        </div>
        <Link href="/ai-office" className="text-brand-strong text-sm font-bold hover:underline">לשכבת ה-AI ←</Link>
      </div>
      <p className="text-muted text-[13px]">{cc.brief.summary}</p>
      <div className="grid grid-cols-3 gap-3">
        <Mini label="מוקדי פעולה" value={cc.brief.focusCount} tone="text-brand-strong" />
        <Mini label="הזדמנויות" value={cc.brief.opportunityCount} tone="text-success" />
        <Mini label="סיכונים" value={cc.brief.riskCount} tone="text-danger" />
      </div>
      {cc.focus[0] && (
        <div className="bg-brand-soft/40 text-brand-strong flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Flame" size={15} /><span>מוקד #1: {cc.focus[0].title}{cc.focus[0].recommended_action ? ` — ${cc.focus[0].recommended_action}` : ""}</span>
        </div>
      )}
    </section>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-surface flex flex-col gap-0.5 rounded-xl p-3"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}
