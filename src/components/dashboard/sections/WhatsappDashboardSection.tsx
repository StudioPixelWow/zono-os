import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getWhatsappCommandCenter } from "@/lib/whatsapp/service";

/** WhatsApp Execution OS summary on the home dashboard (server component). */
export async function WhatsappDashboardSection() {
  let cc;
  try { cc = await getWhatsappCommandCenter(); }
  catch (e) { console.error("[whatsapp] dashboard failed:", e); return null; }
  const k = cc.kpis;
  if (k.openConversations === 0 && k.missedCalls === 0 && k.pendingApprovals === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="MessageCircle" size={16} /></span>
          <h2 className="text-ink text-lg font-black">WhatsApp OS</h2>
        </div>
        <Link href="/whatsapp" className="text-brand-strong text-sm font-bold hover:underline">למרכז הוואטסאפ ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="דורש מענה" value={k.needsReply} tone="text-warning" />
        <Card label="לידים חמים" value={k.hotLeads} tone="text-success" />
        <Card label="שלא נענו" value={k.missedCalls} tone="text-danger" />
        <Card label="ממתין לאישור" value={k.pendingApprovals} tone="text-danger" />
      </div>
      {k.pendingApprovals > 0 && (
        <Link href="/whatsapp" className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Shield" size={15} />{k.pendingApprovals} הודעות רגישות ממתינות לאישור לפני שליחה
        </Link>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
