// ============================================================================
// ☀️ ZONO — Daily AI Operating System page (/today). 40.0.
// The new default workspace: one morning surface unifying the existing broker
// workspace (missions/inbox/whatsapp/facebook/website/territory/performance) +
// Chief-of-Staff executive mode. Cached read-only; approval-gated CTAs.
// ============================================================================
import Link from "next/link";
import { getDailyOS } from "@/lib/daily-os/service";
import { DailyOS } from "@/components/daily-os/DailyOS";
import { BrokerIntelligenceQueuePanel } from "@/components/broker-intelligence/BrokerIntelligenceQueuePanel";
import { BrokerTodayAgenda } from "@/components/broker-intelligence/BrokerTodayAgenda";
import { AgentWorkQueue } from "@/components/today/AgentWorkQueue";
import { ClaimTodayCard } from "@/components/claim/ClaimTodayCard";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await getDailyOS();
  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* Agent Daily Autopilot — "תכנן לי את היום": the one capacity-aware, time-
          anchored operating plan across CRM + marketing + viewings + sellers + deals. */}
      <Link href="/today/plan" className="bg-brand flex items-center justify-between gap-3 rounded-[22px] p-5 text-white transition hover:opacity-95">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20"><Icon name="Sparkles" size={22} /></span>
          <div>
            <p className="text-base font-black">תכנן לי את היום</p>
            <p className="text-sm opacity-90">בדיוק מה לעשות היום, באיזה סדר, ולמה — מסך אחד</p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-extrabold">פתיחה ←</span>
      </Link>
      {/* P10A — "נכסים שלי": external listings that look like the broker's, waiting
          for a one-click claim. Renders only when there is something to review. */}
      <ClaimTodayCard />
      {/* Epic 3 hardening — the explicit prioritized work-queue: overdue tasks,
          meetings, offers/documents/commissions/collections awaiting action. */}
      <AgentWorkQueue />
      {/* Broker OS · Phase 2 — the chronological workday, built live from the
          shared queue. Leads the morning: "what to do, in what order, when". */}
      <BrokerTodayAgenda />
      {/* The shared Broker-Intelligence priority queue — highest-impact, deduped,
          evidence-based recommendations across all areas, first thing each morning. */}
      <BrokerIntelligenceQueuePanel zono title="תובנות ZONO" subtitle="מה שדורש את הטיפול שלך היום — מדורג ומאוחד מכל תחומי המודיעין" options={{ limit: 6 }} />
      <DailyOS data={data} />
    </div>
  );
}
