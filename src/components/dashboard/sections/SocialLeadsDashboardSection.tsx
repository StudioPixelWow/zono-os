import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getSocialLeadsBoard } from "@/lib/social/service";

const INTENT: Record<string, string> = { asking_price: "שאלת מחיר", asking_viewing: "בקשת ביקור", buyer_interest: "מעוניין לקנות", seller_interest: "מעוניין למכור", investor_interest: "להשקיע", commercial_interest: "מסחרי", asking_details: "בקשת פרטים", asking_location: "שאלת מיקום", unknown: "לא ידוע" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

function Stat({ icon, label, value, t }: { icon: string; label: string; value: string; t: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${t}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Social lead capture KPIs on the home dashboard. */
export async function SocialLeadsDashboardSection() {
  let board;
  try { board = await getSocialLeadsBoard(); } catch (e) { console.error("[social] dashboard failed:", e); return null; }
  const total = board.counts.new + board.counts.reviewed + board.counts.qualified;
  if (total === 0 && board.counts.converted === 0) return null;
  const highIntent = board.topOpportunities.filter((l) => l.lead_quality_score >= 70).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="MessageCircle" size={16} /></span>
          <h2 className="text-ink text-lg font-black">לידים חברתיים</h2>
        </div>
        <Link href="/social-leads" className="text-brand-strong text-sm font-bold hover:underline">למרכז הלידים ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="Flame" label="לידים חדשים" value={String(board.counts.new)} t="text-brand-strong" />
        <Stat icon="Sparkles" label="כוונה גבוהה" value={String(highIntent)} t="text-success" />
        <Stat icon="Filter" label="לבדיקה" value={String(board.counts.reviewed)} t="text-warning" />
        <Stat icon="ArrowUpRight" label="הומרו" value={String(board.counts.converted)} t="text-success" />
      </div>
      {board.topOpportunities.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">לידים חברתיים לטיפול</p>
          <ul className="flex flex-col gap-1">{board.topOpportunities.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href="/social-leads" className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{l.person_name ?? "ליד חברתי"} <span className="text-muted text-[10px]">· {INTENT[l.intent ?? "unknown"] ?? l.intent}</span></Link>
              <span className={`shrink-0 text-xs font-black ${tone(l.lead_quality_score)}`}>{l.lead_quality_score}</span>
            </li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
