"use client";
// ============================================================================
// ⚡ Intelligence Action Center™ — turns existing intelligence into work (RTL).
// Presentation only. Opportunity queue + AI-Coach recommendations + broker focus
// + watchlist + unified feed. Everything is existing data; nothing is computed.
// Answers "מה לעשות היום?" immediately. Quick actions are links to existing flows.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, Pill, TerminalEmpty, val, type StatusTone } from "@/components/intelligence/terminal";
import { NeighborhoodLink } from "@/components/intelligence/EntityLinks";
import { bucketRecommendations, type ActionCenterDTO, type RecBucket } from "@/lib/intelligence-explorer/action-center";
import type { RecommendationView } from "@/lib/recommendations/service";
import type { ExplorerListing, ExplorerOffice } from "@/lib/intelligence-explorer/types";

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);
const WL_KEY = "zono_action_watchlist";
const BUCKET_HE: Record<RecBucket, string> = { today: "היום", week: "השבוע", monitor: "מעקב", completed: "הושלם" };

interface PinItem { id: string; kind: string; label: string; href: string }
function recHref(r: RecommendationView): string | null {
  const t = r.source_entity_type, id = r.source_entity_id;
  if (!id) return null;
  if (t === "property") return `/properties/${encodeURIComponent(id)}`;
  if (t === "buyer") return `/buyers/${encodeURIComponent(id)}`;
  if (t === "seller") return `/sellers/${encodeURIComponent(id)}`;
  if (t === "broker") return `/broker-intelligence/${encodeURIComponent(id)}`;
  if (t === "agency" || t === "office") return `/office-intelligence/${encodeURIComponent(id)}`;
  return null;
}

export function ActionCenterView({ data }: { data: ActionCenterDTO }) {
  const { recommendations, dashboard } = data;
  const recs = useMemo(() => bucketRecommendations(recommendations), [recommendations]);
  const [recTab, setRecTab] = useState<RecBucket>("today");
  const [pins, setPins] = useState<PinItem[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of the watchlist from localStorage
  useEffect(() => { try { setPins(JSON.parse(localStorage.getItem(WL_KEY) || "[]")); } catch { /* optional */ } }, []);
  const savePins = (next: PinItem[]) => { setPins(next); try { localStorage.setItem(WL_KEY, JSON.stringify(next)); } catch { /* optional */ } };
  const pin = (it: PinItem) => { if (pins.some((p) => p.id === it.id)) return; savePins([it, ...pins].slice(0, 40)); };
  const unpin = (id: string) => savePins(pins.filter((p) => p.id !== id));
  const pinned = (id: string) => pins.some((p) => p.id === id);

  // Opportunity queue — group existing rows by urgency.
  const L = dashboard.explorer.listings;
  const highOpp = L.filter((l) => l.opportunityScore >= 70).sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 12);
  const offMarket = L.filter((l) => l.hasAgent === false).slice(0, 12);
  const newest = [...L].filter((l) => l.firstSeenAt).sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime()).slice(0, 12);

  // Broker / Office focus from existing agency cards.
  const offices = dashboard.explorer.offices;
  const fastGrowing = [...offices].filter((o) => o.growth != null).sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0)).slice(0, 5);
  const losingMomentum = [...offices].filter((o) => (o.overall ?? 0) >= 60 && (o.momentum ?? 100) < 40).slice(0, 5);
  const topThreat = [...offices].filter((o) => o.threat != null).sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0)).slice(0, 5);

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">⚡</span>
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">INTELLIGENCE ACTION CENTER™</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">מרכז הפעולות</h1>
          <p className="text-muted mt-0.5 text-sm">מה לעשות היום — מהמודיעין הקיים, מאורגן לעבודה.</p>
        </div>
      </header>

      {/* Recommended Actions (existing AI Coach) */}
      <TerminalSection title="פעולות מומלצות" subtitle="AI Coach קיים בלבד — לא נוצרות חדשות" action={
        recommendations ? <Pill tone="neutral">{recommendations.highPriority} בעדיפות גבוהה</Pill> : null
      }>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["today", "week", "monitor", "completed"] as RecBucket[]).map((b) => (
            <button key={b} onClick={() => setRecTab(b)} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${recTab === b ? "bg-brand-strong text-white" : "border-line bg-card text-muted hover:text-ink border"}`}>{BUCKET_HE[b]} ({recs[b].length})</button>
          ))}
        </div>
        {recs[recTab].length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {recs[recTab].slice(0, 12).map((r) => {
              const href = recHref(r);
              return (
                <div key={r.id} className="border-line rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-ink text-sm font-black">{r.title_hebrew}</span>
                    <Pill tone={r.urgency_score >= 70 ? "warn" : r.urgency_score >= 40 ? "contender" : "neutral"}>דחיפות {val(r.urgency_score)}</Pill>
                  </div>
                  {r.reason_hebrew && <p className="text-muted mt-1 text-[11px]">{r.reason_hebrew}</p>}
                  {r.next_best_action_hebrew && <p className="text-brand-strong mt-1 text-[11px] font-bold">▸ {r.next_best_action_hebrew}</p>}
                  {href && <Link href={href} prefetch={false} className="text-muted hover:text-brand mt-2 inline-block text-[11px] font-bold">פתח פרופיל ←</Link>}
                </div>
              );
            })}
          </div>
        ) : <TerminalEmpty text={recommendations ? "אין פעולות בקטגוריה זו." : "אין כרגע המלצות AI Coach."} />}
      </TerminalSection>

      {/* Opportunity Queue */}
      <TerminalSection title="תור הזדמנויות" subtitle="מקובץ לפי דחיפות — מהפיד הקיים">
        <OppGroup title="פוטנציאל גבוה" tone="rising" rows={highOpp} pin={pin} unpin={unpin} pinned={pinned} />
        <OppGroup title="ללא מתווך / אוף-מרקט" tone="contender" rows={offMarket} pin={pin} unpin={unpin} pinned={pinned} />
        <OppGroup title="מודעות חדשות" tone="neutral" rows={newest} pin={pin} unpin={unpin} pinned={pinned} />
        {dashboard.explorer.opportunitySignals.length > 0 && (
          <div className="mt-3">
            <p className="text-ink mb-1.5 text-xs font-black">ירידות מחיר · יציאה צפויה (אותות שוק)</p>
            <div className="flex flex-col gap-1.5">
              {dashboard.explorer.opportunitySignals.slice(0, 10).map((o, i) => (
                <div key={i} className="border-line flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                  <span className="min-w-0"><span className="text-ink block truncate font-bold">{o.label}</span><span className="text-muted text-[11px]">{o.reason}</span></span>
                  {o.neighborhood && <span className="shrink-0"><NeighborhoodLink city={o.city} neighborhood={o.neighborhood} /></span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </TerminalSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Broker Focus */}
        <TerminalSection title="פוקוס מתווכים/משרדים" subtitle="מהמודיעין הקיים">
          <FocusGroup title="מתחרים בצמיחה מהירה" tone="rising" rows={fastGrowing} metric={(o) => `+${val(o.growth)} צמיחה`} pin={pin} pinned={pinned} />
          <FocusGroup title="מובילים שמאבדים מומנטום" tone="warn" rows={losingMomentum} metric={(o) => `מומנטום ${val(o.momentum)}`} pin={pin} pinned={pinned} />
          <FocusGroup title="האיום הגבוה ביותר" tone="contender" rows={topThreat} metric={(o) => `איום ${val(o.threat)}`} pin={pin} pinned={pinned} />
        </TerminalSection>

        {/* Watchlist */}
        <TerminalSection title="רשימת מעקב" subtitle="נעוצים — שכונות · משרדים · מתווכים · מודעות">
          {pins.length ? (
            <div className="flex flex-col gap-1.5">
              {pins.map((p) => (
                <div key={p.id} className="border-line flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <Link href={p.href} prefetch={false} className="text-ink min-w-0 truncate font-bold hover:text-brand-strong">{p.kind} · {p.label}</Link>
                  <button onClick={() => unpin(p.id)} className="text-muted hover:text-danger shrink-0 text-[11px] font-bold">הסר</button>
                </div>
              ))}
            </div>
          ) : <TerminalEmpty text="עדיין לא נעצו פריטים. לחץ 📌 על כרטיס כדי להוסיף למעקב." />}
        </TerminalSection>
      </div>

      {/* My Intelligence Feed */}
      <TerminalSection title="פיד המודיעין שלי" subtitle="כרונולוגי — אירועים קיימים">
        {newest.length ? (
          <div className="flex flex-col">
            {[...L].filter((l) => l.firstSeenAt).sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime()).slice(0, 20).map((l) => (
              <Link key={l.id} href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-3 border-b py-2 text-sm transition last:border-0">
                <span className="min-w-0"><span className="text-ink block truncate font-bold">מודעה חדשה · {l.title ?? "מודעה"}</span><span className="text-muted text-[11px]">{[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"} · {ils(l.price)}</span></span>
                <span className="text-muted shrink-0 text-[11px]">{l.firstSeenAt ? new Date(l.firstSeenAt).toLocaleDateString("he-IL") : ""}</span>
              </Link>
            ))}
          </div>
        ) : <TerminalEmpty text="אין אירועים אחרונים." />}
      </TerminalSection>

      <MetricStrip dashboard={dashboard} />
    </div>
  );
}

function MetricStrip({ dashboard }: { dashboard: ActionCenterDTO["dashboard"] }) {
  return (
    <MetricGrid>
      <Metric label="מודעות חיצוניות" value={String(dashboard.explorer.listings.length)} accent />
      <Metric label="הזדמנויות פתוחות" value={String(dashboard.overview?.opportunities ?? 0)} />
      <Metric label="התראות שוק" value={String(dashboard.overview?.activeSignals ?? 0)} />
      <Metric label="ירידות מחיר" value={String(dashboard.marketStats.priceDrops)} />
    </MetricGrid>
  );
}

// ── Sub-cards ────────────────────────────────────────────────────────────────
function QuickActions({ l, pin, unpin, pinned }: { l: ExplorerListing; pin: (i: PinItem) => void; unpin: (id: string) => void; pinned: (id: string) => boolean }) {
  const pid = `listing_${l.id}`;
  const isPinned = pinned(pid);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
      <Link href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="text-brand-strong hover:underline">פתח הזדמנות</Link>
      <span className="text-muted">·</span>
      <Link href="/market-intelligence/map" className="text-muted hover:text-brand">מפה</Link>
      <span className="text-muted">·</span>
      <Link href="/market-intelligence" className="text-muted hover:text-brand">מודעות</Link>
      <span className="text-muted">·</span>
      <Link href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="text-muted hover:text-brand">משימה / מעקב</Link>
      <span className="text-muted">·</span>
      <button onClick={() => (isPinned ? unpin(pid) : pin({ id: pid, kind: "מודעה", label: l.title ?? "מודעה", href: `/external-listings/${encodeURIComponent(l.id)}` }))} className={isPinned ? "text-brand-strong" : "text-muted hover:text-brand"}>{isPinned ? "📌 נעוץ" : "📌 נעץ"}</button>
    </div>
  );
}

function OppGroup({ title, tone, rows, pin, unpin, pinned }: { title: string; tone: StatusTone; rows: ExplorerListing[]; pin: (i: PinItem) => void; unpin: (id: string) => void; pinned: (id: string) => boolean }) {
  if (!rows.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">{title} <Pill tone={tone}>{rows.length}</Pill></p>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((l) => (
          <div key={l.id} className="border-line rounded-xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-ink truncate text-sm font-black">{l.title ?? "מודעה"}</span>
              {l.opportunityScore > 0 && <Pill tone={l.opportunityScore >= 70 ? "rising" : "neutral"}>{val(l.opportunityScore)}</Pill>}
            </div>
            <p className="text-muted mt-0.5 truncate text-[11px]">{[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"} · {ils(l.price)}{l.hasAgent === false ? " · ללא מתווך" : ""}</p>
            <QuickActions l={l} pin={pin} unpin={unpin} pinned={pinned} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FocusGroup({ title, tone, rows, metric, pin, pinned }: { title: string; tone: StatusTone; rows: ExplorerOffice[]; metric: (o: ExplorerOffice) => string; pin: (i: PinItem) => void; pinned: (id: string) => boolean }) {
  if (!rows.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">{title} <Pill tone={tone}>{rows.length}</Pill></p>
      <div className="flex flex-col">
        {rows.map((o) => {
          const pid = `office_${o.id}`;
          return (
            <div key={o.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
              <Link href={`/office-intelligence/${encodeURIComponent(o.id)}`} prefetch={false} className="text-ink min-w-0 truncate font-bold hover:text-brand-strong">{o.name}<span className="text-muted font-normal"> · {o.city ?? "—"}</span></Link>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-brand-strong text-[11px] tabular-nums">{metric(o)}</span>
                <button onClick={() => pin({ id: pid, kind: "משרד", label: o.name, href: `/office-intelligence/${encodeURIComponent(o.id)}` })} className={pinned(pid) ? "text-brand-strong text-[11px]" : "text-muted hover:text-brand text-[11px]"}>📌</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
