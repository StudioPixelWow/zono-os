"use client";

import { useEffect, useState } from "react";
import type { DistributionBoard } from "@/lib/distribution/service";
import type { CenterStats, CenterCampaign } from "@/lib/distribution/center-data";
import { getDistributionConnectionsAction } from "@/lib/distribution/provider-connections-actions";
import { cn } from "@/lib/utils";
import { Glass, StatTile, SectionHeading, EmptyState, Icon, nfmt, compact, pct } from "./shared";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה", scheduled: "מתוזמן", active: "פעיל", paused: "מושהה", completed: "הושלם", archived: "בארכיון",
};
const CAMPAIGN_STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success", scheduled: "bg-brand-soft text-brand-strong",
  paused: "bg-warning-soft text-warning", draft: "bg-line/70 text-muted",
  completed: "bg-brand-soft text-brand-strong", archived: "bg-line/70 text-muted",
};

/**
 * Tile placeholder for performance metrics that only exist once a live Meta /
 * Facebook analytics API is connected. Never shows a fabricated "0" — it
 * honestly says the data is waiting for the connection.
 */
function WaitingTile({ label, icon }: { label: string; icon: string }) {
  return (
    <Glass className="flex flex-col gap-2 p-4 opacity-80">
      <div className="flex items-center justify-between">
        <span className="bg-line/60 text-muted grid h-10 w-10 place-items-center rounded-xl">
          <Icon name={icon} size={19} />
        </span>
        <span className="text-muted text-[13px] font-bold">ממתין ל-Meta</span>
      </div>
      <div>
        <p className="text-ink text-sm font-extrabold">{label}</p>
        <p className="text-muted text-[11px] font-medium">יוצג לאחר חיבור API רשמי</p>
      </div>
    </Glass>
  );
}

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

  // Performance metrics (impressions / clicks / CTR / conversion) come from the
  // Meta analytics API, which nobody writes to until Facebook is API-connected.
  // Treat them as live only when (a) Facebook has a real API connection, or
  // (b) genuine analytics rows already exist. Otherwise show honest waiting
  // states instead of a permanent, misleading "0".
  const hasRealAnalytics = stats.impressions > 0 || stats.clicks > 0;
  const [metaConnected, setMetaConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    getDistributionConnectionsAction()
      .then((rows) => {
        if (!alive) return;
        const fb = rows.find((r) => r.provider === "facebook");
        setMetaConnected(fb?.status === "connected" && fb?.connectionMode === "api");
      })
      .catch(() => { /* keep gated on error */ });
    return () => { alive = false; };
  }, []);
  const analyticsLive = metaConnected || hasRealAnalytics;
  const ctr = stats.impressions ? Math.round((stats.clicks / stats.impressions) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="סקירת הפצה" subtitle="תמונת מצב חיה של ערוצי ההפצה שלך בפייסבוק" icon="LayoutDashboard" />

      {/* Honest operating-mode note — publishing is manual until Meta API is live. */}
      {!analyticsLive && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <Icon name="AlertTriangle" size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">
            כרגע הפרסום מתבצע ידנית. נתוני ביצועים חיים יופעלו לאחר חיבור Meta API.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* Real, locally-tracked metrics — always shown. */}
        <StatTile label="קבוצות" value={nfmt(stats.groups)} hint={`${nfmt(stats.activeGroups)} פעילות`} icon="Users" tone="brand" />
        <StatTile label="קמפיינים" value={nfmt(stats.campaigns)} hint={`${nfmt(stats.activeCampaigns)} פעילים`} icon="Megaphone" tone="accent" />
        <StatTile label="פוסטים" value={nfmt(livePosts)} hint={`${nfmt(stats.publishedPosts)} פורסמו · ${nfmt(stats.scheduledPosts)} מתוזמנים`} icon="Send" tone="brand" />
        <StatTile label="לידים" value={nfmt(stats.leads)} hint={`${nfmt(stats.newLeads)} חדשים`} icon="UserPlus" tone="success" />
        <StatTile label="תגובות" value={nfmt(stats.comments)} hint="אינטראקציות שתועדו" icon="MessageSquare" tone="warning" />

        {/* Meta-gated performance metrics — real numbers only when the API is live. */}
        {analyticsLive ? (
          <>
            <StatTile label="חשיפות" value={compact(stats.impressions)} hint={`${compact(stats.clicks)} קליקים`} icon="Eye" tone="accent" />
            <StatTile label="קליקים" value={compact(stats.clicks)} hint="מצטבר מההפצה" icon="MousePointerClick" tone="brand" />
            <StatTile label="שיעור הקלקה (CTR)" value={pct(ctr)} hint="קליקים ← חשיפות" icon="TrendingUp" tone={ctr >= 2 ? "success" : "warning"} />
            <StatTile label="שיעור המרה" value={pct(stats.conversionRate)} hint="קליקים ← לידים" icon="Target" tone={stats.conversionRate >= 5 ? "success" : "warning"} />
          </>
        ) : (
          <>
            <WaitingTile label="חשיפות" icon="Eye" />
            <WaitingTile label="קליקים" icon="MousePointerClick" />
            <WaitingTile label="שיעור הקלקה (CTR)" icon="TrendingUp" />
            <WaitingTile label="שיעור המרה" icon="Target" />
          </>
        )}
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
            <div>
              <p className={cn("text-xl font-black tabular-nums", analyticsLive ? "text-brand-strong" : "text-muted")}>
                {analyticsLive ? `${ctr}%` : "—"}
              </p>
              <p className="text-muted text-[11px] font-bold">{analyticsLive ? "שיעור הקלקה (CTR)" : "CTR · ממתין ל-Meta"}</p>
            </div>
            <div>
              <p className="text-brand-strong text-xl font-black tabular-nums">{nfmt(stats.activeGroups)}</p>
              <p className="text-muted text-[11px] font-bold">קבוצות פעילות</p>
            </div>
          </div>
        </Glass>
      </div>
    </div>
  );
}
