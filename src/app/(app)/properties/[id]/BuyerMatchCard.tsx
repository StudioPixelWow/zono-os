import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { matchTone, type MatchTone } from "@/lib/matching-intelligence/property-buyer-match-core";
import type { BuyerMatchView } from "@/lib/matching-intelligence/property-buyer-matches";

const TONE_TEXT: Record<MatchTone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const TONE_BG: Record<MatchTone, string> = { good: "bg-success-soft text-success", medium: "bg-brand-soft text-brand-strong", risk: "bg-danger-soft text-danger" };

function BuyerMatchCard({ m }: { m: BuyerMatchView }) {
  const tone = matchTone(m.matchPct);
  const meta = [m.budgetLabel, m.roomsLabel, m.areasLabel].filter(Boolean) as string[];
  return (
    <div className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={m.buyerHref} className="text-ink hover:text-brand truncate text-[15px] font-black">{m.buyerName}</Link>
            {m.stageHe && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10.5px] font-bold">{m.stageHe}</span>}
          </div>
          {meta.length > 0 && <p className="text-muted mt-0.5 line-clamp-1 text-[12px]">{meta.join(" · ")}</p>}
        </div>
        <div className={cn("flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5", TONE_BG[tone])}>
          <span className="text-lg font-black leading-none">{m.matchPct ?? "—"}</span>
          <span className="text-[9.5px] font-bold">התאמה</span>
        </div>
      </div>

      {/* WHY matched — evidence only, else the honest fallback */}
      {m.why.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {m.why.map((r, i) => (
            <span key={i} className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold">
              <Icon name="Check" size={12} strokeWidth={2.4} />{r.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted text-[12px]">התאמה לפי נתוני החיפוש השמורים.</p>
      )}

      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] font-semibold">
        {m.closingPct != null && <span className={TONE_TEXT[matchTone(m.closingPct)]}>סגירה {m.closingPct}%</span>}
        {m.lastContactLabel && <span>· {m.lastContactLabel}</span>}
        {m.advantage && <span className="line-clamp-1">· {m.advantage}</span>}
      </div>

      <div className="border-line flex flex-wrap gap-2 border-t pt-3">
        {m.whatsapp && <a href={m.whatsapp} target="_blank" rel="noopener noreferrer" className="bg-[#25D366] inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white"><Icon name="MessageCircle" size={14} />WhatsApp</a>}
        {m.tel && <a href={m.tel} className="border-line text-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-bold"><Icon name="Phone" size={14} />התקשר</a>}
        <Link href={m.buyerHref} className="border-line text-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-bold"><Icon name="UserCheck" size={14} />פתח קונה</Link>
      </div>
    </div>
  );
}

/** Rich buyer-match workspace block for the property "קונים ולידים" tab. */
export function BuyerMatchList({ matches }: { matches: BuyerMatchView[] }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Sparkles" size={16} /></span>
          <h3 className="text-ink text-sm font-extrabold">הכי מתאימים לנכס <span className="text-muted font-bold">· {matches.length}</span></h3>
        </div>
        <Link href="/matches" prefetch={false} className="text-brand-strong text-xs font-bold">כל הקונים המתאימים ←</Link>
      </div>
      {matches.length === 0 ? (
        <p className="text-muted py-4 text-center text-sm">אין התאמות עדיין — חשב התאמות במסך &apos;התאמות&apos;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {matches.map((m) => <BuyerMatchCard key={m.matchId} m={m} />)}
        </div>
      )}
    </div>
  );
}
