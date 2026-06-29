"use client";
// ============================================================================
// 🌍 Market Intelligence Dashboard™ — executive morning briefing (presentation
// only · RTL). Every value comes from existing persisted intelligence; momentum
// windows and hot-area rankings are plain counts over already-fetched rows.
// ============================================================================
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, TerminalEmpty } from "@/components/intelligence/terminal";
import { NeighborhoodLink } from "@/components/intelligence/EntityLinks";
import { MorningBrief } from "@/components/intelligence/MorningBrief";
import { countSince, topAreas, type IntelligenceDashboardDTO } from "@/lib/intelligence-explorer/dashboard-shared";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { IntelligencePage, IntelligenceHeader, IntelligenceFirstRun } from "@/components/intelligence/framework";

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

export function MarketIntelligenceDashboardView({ data }: { data: IntelligenceDashboardDTO }) {
  const { explorer, overview, marketStats } = data;
  const areas = topAreas(explorer);
  const likelyExit = explorer.opportunitySignals.filter((o) => /יציאה|יורד|exit|הסר|delist/i.test(`${o.label} ${o.reason}`)).length;
  const feed = [...explorer.listings].filter((l) => l.firstSeenAt).sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime()).slice(0, 16);
  const hasData = explorer.listings.length > 0;

  return (
    <IntelligencePage>
      <MarketIntelNav active="dashboard" crumbs={[{ label: "דשבורד מודיעין" }]} />

      <IntelligenceHeader
        emoji="🌍"
        eyebrow="MARKET INTELLIGENCE"
        title="דשבורד מודיעין שוק"
        subtitle="מה השתנה · מה דורש תשומת לב · היכן ההזדמנויות."
      />

      {!hasData ? (
        <IntelligenceFirstRun
          emoji="🌍"
          title="עדיין אין מודיעין שוק"
          subtitle="כדי לבנות את דשבורד מודיעין השוק צריך קודם לסרוק נכסים חיצוניים מהשוק. הסריקה תאסוף מודעות, תזהה הזדמנויות ותחשב מגמות."
          primaryLabel="🚀 התחל סריקת שוק"
          primaryHref="/market-intelligence/listings"
          secondary={[{ label: "🗺️ מפת שוק חיה", href: "/market-intelligence/map" }, { label: "⚙️ רענן מערכת", href: "/admin/system-health" }]}
          whatNext={[
            "מודעות חיצוניות מיד2, מדלן ומקורות נוספים ייאספו",
            "הזדמנויות וירידות מחיר יזוהו אוטומטית",
            "שכונות וערים מובילות ידורגו לפי נפח",
            "מגמות שוק ומומנטום יחושבו",
          ]}
        />
      ) : (
      <>
      {/* Quick access — direct one-click entry to all external market listings. */}
      <Link href="/market-intelligence/listings" className="border-brand-light bg-brand-soft hover:bg-brand-soft/70 flex items-center justify-between gap-3 rounded-2xl border p-4 transition">
        <span className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🌍</span>
          <span>
            <span className="text-brand-strong block text-sm font-black">עיין במודעות השוק</span>
            <span className="text-muted block text-xs">כל המודעות החיצוניות — נקודת כניסה ישירה</span>
          </span>
        </span>
        <span className="text-brand-strong text-sm font-bold">פתח ←</span>
      </Link>

      <MorningBrief listings={explorer.listings} priceDrops={marketStats.priceDrops} activeSignals={overview?.activeSignals ?? 0} />

      {/* Today's Overview */}
      <TerminalSection title="סקירת היום" subtitle="מדדים מהנתונים הקיימים">
        <MetricGrid>
          <Metric label="מודעות חדשות (24ש׳)" value={String(countSince(explorer.listings, 1))} accent />
          <Metric label="ירידות מחיר" value={String(marketStats.priceDrops)} />
          <Metric label="יציאה צפויה מהשוק" value={String(likelyExit)} />
          <Metric label="התראות שוק" value={String(overview?.activeSignals ?? 0)} />
        </MetricGrid>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/transactions" className="border-line bg-card hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-bold transition">🏛️ עסקאות רשמיות ↗</Link>
          <Link href="/market-intelligence/listings" className="border-line bg-card hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-bold transition">🌍 כל המודעות החיצוניות ↗</Link>
        </div>
      </TerminalSection>

      {/* Hot Areas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TerminalSection title="שכונות מובילות" subtitle="לפי נפח מודעות פעיל">
          {areas.neighborhoods.length ? (
            <div className="flex flex-col gap-1.5">
              {areas.neighborhoods.map((n, i) => (
                <div key={n.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink truncate font-bold">{i + 1}. <NeighborhoodLink city={n.city} neighborhood={n.neighborhood} /><span className="text-muted"> · {n.city}</span></span>
                  <span className="text-muted shrink-0 text-xs tabular-nums">{n.listings} מודעות</span>
                </div>
              ))}
            </div>
          ) : <TerminalEmpty text="אין נתוני שכונות עדיין." />}
        </TerminalSection>
        <TerminalSection title="ערים מובילות" subtitle="לפי נפח מודעות פעיל">
          {areas.cities.length ? (
            <div className="flex flex-col gap-1.5">
              {areas.cities.map((c, i) => (
                <div key={c.city} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink truncate font-bold">{i + 1}. {c.city}</span>
                  <span className="text-muted shrink-0 text-xs tabular-nums">{c.listings} מודעות</span>
                </div>
              ))}
            </div>
          ) : <TerminalEmpty text="אין נתוני ערים עדיין." />}
        </TerminalSection>
      </div>

      {/* Market Momentum */}
      <TerminalSection title="מומנטום שוק" subtitle="מודעות חדשות לפי חלון זמן (ספירת רשומות קיימות)">
        <MetricGrid>
          <Metric label="30 ימים" value={String(countSince(explorer.listings, 30))} accent />
          <Metric label="60 ימים" value={String(countSince(explorer.listings, 60))} />
          <Metric label="90 ימים" value={String(countSince(explorer.listings, 90))} />
          <Metric label="365 ימים" value={String(countSince(explorer.listings, 365))} />
        </MetricGrid>
      </TerminalSection>

      {/* Property Radar (reuse, no recompute) */}
      <TerminalSection title="רדאר נכסים" subtitle="מרכז הפיקוד בזמן אמת — ללא חישוב מחדש">
        <Link href="/property-radar" className="bg-brand-soft text-brand-strong inline-flex rounded-xl px-4 py-2.5 text-sm font-black">📡 פתח את רדאר הנכסים החי ↗</Link>
      </TerminalSection>

      {/* Latest Intelligence Feed */}
      <TerminalSection title="פיד מודיעין אחרון" subtitle="כרונולוגי — מתוך אירועים קיימים">
        {feed.length ? (
          <div className="flex flex-col">
            {feed.map((l) => (
              <Link key={l.id} href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-3 border-b py-2.5 text-sm transition last:border-0">
                <span className="min-w-0">
                  <span className="text-ink block truncate font-bold">מודעה חדשה · {l.title ?? "מודעה"}</span>
                  <span className="text-muted text-[11px]">{[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"} · {ils(l.price)}{l.hasAgent === false ? " · ללא מתווך" : ""}</span>
                </span>
                <span className="text-muted shrink-0 text-[11px]">{l.firstSeenAt ? new Date(l.firstSeenAt).toLocaleDateString("he-IL") : ""}</span>
              </Link>
            ))}
          </div>
        ) : <TerminalEmpty text="אין אירועים אחרונים." />}
      </TerminalSection>
      </>
      )}
    </IntelligencePage>
  );
}
