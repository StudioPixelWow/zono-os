"use client";

import type { DistributionBoard } from "@/lib/distribution/service";
import type { CenterStats, CenterCampaign } from "@/lib/distribution/center-data";
import { Glass, StatTile, SectionHeading, EmptyState, Icon, nfmt, compact, pct } from "./shared";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה", scheduled: "מתוזמן", active: "פעיל", paused: "מושהה", completed: "הושלם", archived: "בארכיון",
};
const CAMPAIGN_STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success", scheduled: "bg-brand-soft text-brand-strong",
  paused: "bg-warning-soft text-warning", draft: "bg-line/70 text-muted",
  completed: "bg-brand-soft text-brand-strong", archived: "bg-line/70 text-muted",
};

export function OverviewSection({
  board,
  stats,
  campaigns,
  onBuild,
}: {
  board: DistributionBoard;
  stats: CenterStats;
  campaigns: CenterCampaign[];
  onBuild: () => void;
}) {
  const livePosts = stats.publishedPosts + stats.scheduledPosts;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="סקירת הפצה" subtitle="תמונת מצב חיה של ערוצי ההפצה שלך בפייסבוק" icon="LayoutDashboard" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatTile label="קבוצות" value={nfmt(stats.groups)} hint={`${nfmt(stats.activeGroups)} פעילות`} icon="Users" tone="brand" />
        <StatTile label="קמפיינים" value={nfmt(stats.campaigns)} hint={`${nfmt(stats.activeCampaigns)} פעילים`} icon="Megaphone" tone="accent" />
        <StatTile label="פוסטים" value={nfmt(livePosts)} hint={`${nfmt(stats.publishedPosts)} פורסמו · ${nfmt(stats.scheduledPosts)} מתוזמנים`} icon="Send" tone="brand" />
        <StatTile label="לידים" value={nfmt(stats.leads)} hint={`${nfmt(stats.newLeads)} חדשים`} icon="UserPlus" tone="success" />
        <StatTile label="חשיפות" value={compact(stats.impressions)} hint={`${compact(stats.clicks)} קליקים`} icon="Eye" tone="accent" />
        <StatTile label="קליקים" value={compact(stats.clicks)} hint="מצטבר מההפצה" icon="MousePointerClick" tone="brand" />
        <StatTile label="תגובות" value={compact(stats.comments)} hint="אינטראקציות בקהילות" icon="MessageSquare" tone="warning" />
        <StatTile label="שיעור המרה" value={pct(stats.conversionRate)} hint="קליקים ← לידים" icon="TrendingUp" tone={stats.conversionRate >= 5 ? "success" : "warning"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Active campaigns (real center data) */}
        <Glass className="flex flex-col gap-3 p-5">
          <SectionHeading title="קמפיינים פעילים" subtitle="קמפייני ההפצה שלך לפי ביצועים" icon="Rocket"
            action={<button type="button" onClick={onBuild} className="text-brand-strong text-sm font-bold">בנה קמפיין ←</button>} />
          {campaigns.length === 0 ? (
            <EmptyState icon="Rocket" title="אין עדיין קמפיינים" body="בנה קמפיין הפצה ראשון — בחר נכס, קהל יעד וקבוצות, וZONO יתחיל לעבוד." />
          ) : (
            <div className="flex flex-col gap-2">
              {campaigns.slice(0, 6).map((c, i) => (
                <div key={c.id} className="bg-card/60 border-line flex items-center gap-3 rounded-2xl border p-3">
                  <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-extrabold">{c.name}</p>
                    <p className="text-muted text-[11px]">{c.totalGroups} קבוצות · {c.totalPosts} פוסטים · {nfmt(c.totalLeads)} לידים{c.targetCity ? ` · ${c.targetCity}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${CAMPAIGN_STATUS_TONE[c.status] ?? "bg-line/70 text-muted"}`}>{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
              ))}
            </div>
          )}
        </Glass>

        {/* Opportunities feed (real board signals) */}
        <Glass className="flex flex-col gap-3 p-5">
          <SectionHeading title="הזדמנויות AI" subtitle="איתותים חיים ממנוע ההפצה" icon="Sparkles" />
          {board.opportunities.length === 0 ? (
            <EmptyState icon="Sparkles" title="אין כרגע איתותים" body="ZONO יציף כאן הזדמנויות הפצה ברגע שהמודיעין יזהה קהילות ROI גבוה, פערים גיאוגרפיים או נכסים חמים." />
          ) : (
            <div className="flex flex-col gap-2">
              {board.opportunities.slice(0, 6).map((o) => (
                <div key={o.id} className="bg-card/60 border-line flex items-start gap-2.5 rounded-2xl border p-3">
                  <span className="bg-brand-soft text-brand grid h-7 w-7 shrink-0 place-items-center rounded-lg">
                    <Icon name={o.signal_type === "risky_community" ? "ShieldAlert" : o.signal_type === "inactive_community" ? "Moon" : o.signal_type === "missing_community" ? "MapPin" : "TrendingUp"} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-[13px] font-bold">{o.title}</p>
                    {o.description && <p className="text-muted line-clamp-1 text-[11px]">{o.description}</p>}
                  </div>
                  <span className="text-brand-strong shrink-0 text-xs font-black tabular-nums">{Math.round(o.impact_score)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-line mt-1 grid grid-cols-2 gap-2 border-t pt-3 text-center">
            <div><p className="text-brand-strong text-xl font-black tabular-nums">{nfmt(stats.impressions ? Math.round((stats.clicks / Math.max(1, stats.impressions)) * 100) : 0)}%</p><p className="text-muted text-[11px] font-bold">שיעור הקלקה (CTR)</p></div>
            <div><p className="text-brand-strong text-xl font-black tabular-nums">{nfmt(stats.activeGroups)}</p><p className="text-muted text-[11px] font-bold">קבוצות פעילות</p></div>
          </div>
        </Glass>
      </div>
    </div>
  );
}
