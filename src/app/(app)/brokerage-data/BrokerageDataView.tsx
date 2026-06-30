"use client";
// ============================================================================
// ZONO Core Data — Brokerage Data command center (RTL). 7 tabs. Owner sees the
// full national data + management tabs; office/agent users see city-scoped
// offices/agents/links only (RLS already returns nothing for owner-only tables).
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import type { BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import {
  resolveBrokerageNowAction, startBrokerageDataRefreshAction,
  reviewMatchAction, resolveConflictAction, decideLinkAction, discoverBrokeragePublishersAction,
  runNationalBrokerageDiscoveryAction,
} from "@/lib/brokerage-data/actions";
import { DnaDrawer, type DnaTarget } from "./DnaDrawer";
import {
  IntelligenceKpiGrid, IntelligenceKpi, IntelligenceSection, IntelligenceFeed, IntelligenceEmptyInline,
} from "@/components/intelligence/framework";

type Tab = "overview" | "offices" | "agents" | "links" | "conflicts" | "matches" | "sources";

const STATUS_HE: Record<string, string> = {
  active: "פעיל", verified: "מאומת", unverified: "לא מאומת", candidate: "מועמד",
  inactive: "לא פעיל", not_found_recently: "לא נמצא לאחרונה", conflict: "קונפליקט",
  auto_linked: "קושר אוטומטית", pending_review: "לבדיקה", confirmed: "אושר", rejected: "נדחה",
  completed: "הושלם", failed: "נכשל", running: "פועל", partial: "חלקי", pending: "ממתין",
};
const statusHe = (s: string) => STATUS_HE[s] ?? s;

const RUN_TYPE_HE: Record<string, string> = {
  full_country: "סריקה לאומית", city: "סריקת עיר", region: "סריקת אזור",
  source: "זיהוי זהויות", office: "סריקת משרד", agent: "סריקת מתווך", discovery: "גילוי מפרסמים",
};
const runTypeHe = (s: string) => RUN_TYPE_HE[s] ?? s;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap transition ${active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface hover:text-ink"}`}>{children}</button>
  );
}
function Badge({ children, tone = "white" }: { children: React.ReactNode; tone?: "white" | "green" | "amber" | "red" }) {
  const c = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-rose-50 text-rose-700" : "bg-surface text-muted";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}
function confTone(n: number): "green" | "amber" | "red" { return n >= 95 ? "green" : n >= 70 ? "amber" : "red"; }

export function BrokerageDataView({ cc }: { cc: BrokerageCommandCenter }) {
  const router = useRouter();
  const owner = cc.access.isOwner;
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setMsg(null); setErr(null);
    start(async () => { const r = await fn(); if (r?.error) setErr(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } });
  };

  // Start a brokerage scan, then poll the run until it reaches a terminal status.
  // (The current processor is synchronous, so it usually returns completed already;
  // polling is a safety net if a future async worker leaves it running.)
  const startScan = (params: Record<string, unknown>) => {
    setMsg(null); setErr(null);
    start(async () => {
      // 30s client-side timeout fallback so the button NEVER stays stuck even if
      // the server action hangs (the run still finalizes server-side; refresh shows it).
      const TIMEOUT = Symbol("timeout");
      let r: Awaited<ReturnType<typeof startBrokerageDataRefreshAction>> | typeof TIMEOUT;
      try {
        r = await Promise.race([
          startBrokerageDataRefreshAction(params),
          new Promise<typeof TIMEOUT>((res) => setTimeout(() => res(TIMEOUT), 30_000)),
        ]);
      } catch {
        setErr("הסריקה לא התחילה. נסה שוב או בדוק לוגים.");
        return;
      }
      if (r === TIMEOUT) { setErr("הסריקה לא התחילה. נסה שוב או בדוק לוגים."); router.refresh(); return; }
      router.refresh();
      // The server processes synchronously and returns a terminal status + message.
      if (!r.ok) { setErr(r.error ?? r.message ?? "הסריקה נכשלה. נסה שוב או בדוק לוגים."); return; }
      setMsg(r.message ?? "הסריקה הושלמה ✓");
    });
  };

  const [agentFilter, setAgentFilter] = useState<"all" | "resolved" | "unresolved" | "review" | "high">("all");
  const [agentSort, setAgentSort] = useState<"listings" | "confidence" | "lastSeen">("listings");
  const [cityFilter, setCityFilter] = useState<string>("");
  // Deep-link: open a broker's DNA profile drawer when arriving from the Broker
  // Directory (/brokerage-data?broker=<id>&name=<name>) — the canonical profile.
  // Computed in the lazy initializer (no setState-in-effect).
  const searchParams = useSearchParams();
  const [dnaTarget, setDnaTarget] = useState<DnaTarget | null>(() => {
    const brokerId = searchParams.get("broker");
    return brokerId ? { type: "broker", id: brokerId, name: searchParams.get("name") ?? "מתווך" } : null;
  });

  const q = search.trim().toLowerCase();
  const offices = useMemo(() => cc.offices.filter((o) => !q || o.name.toLowerCase().includes(q) || (o.city ?? "").toLowerCase().includes(q)), [cc.offices, q]);

  // Office name lookup + per-broker linked-listing counts. Counts come from the
  // SERVER aggregation across ALL links (cc.agentListingCounts) — not the capped
  // cc.links display list, which previously made every broker read as 0.
  const officeNameById = useMemo(() => { const m = new Map<string, string>(); for (const o of cc.offices) m.set(o.id, o.name); return m; }, [cc.offices]);
  const listingsByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, n] of Object.entries(cc.agentListingCounts)) m.set(id, n);
    return m;
  }, [cc.agentListingCounts]);

  const brokerCities = useMemo(() => {
    const set = new Set<string>();
    for (const a of cc.agents) if (a.city) set.add(a.city);
    return Array.from(set).sort((x, y) => x.localeCompare(y, "he"));
  }, [cc.agents]);

  const agents = useMemo(() => {
    const filtered = cc.agents.filter((a) => {
      if (q && !(a.fullName.toLowerCase().includes(q) || (a.city ?? "").toLowerCase().includes(q))) return false;
      if (cityFilter && a.city !== cityFilter) return false;
      if (agentFilter === "resolved") return !!a.officeId;
      if (agentFilter === "unresolved") return !a.officeId;
      if (agentFilter === "review") return a.confidenceScore < 70 || a.status === "unverified";
      if (agentFilter === "high") return a.confidenceScore >= 90;
      return true;
    });
    const byCount = (id: string) => cc.agentListingCounts[id] ?? 0;
    return [...filtered].sort((a, b) => {
      if (agentSort === "listings") return byCount(b.id) - byCount(a.id);
      if (agentSort === "confidence") return b.confidenceScore - a.confidenceScore;
      return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""); // last seen
    });
  }, [cc.agents, cc.agentListingCounts, q, cityFilter, agentFilter, agentSort]);

  // CANONICAL counters — the single source of truth across the whole page (hero,
  // tabs, KPI cards, integrity section). Service-role aggregation, RLS-independent.
  const ov = cc.overview;

  const tabs: { id: Tab; label: string; owner?: boolean }[] = [
    { id: "overview", label: "סקירה" },
    { id: "offices", label: `משרדים (${ov.officesTotal})` },
    { id: "agents", label: `סוכנים (${ov.agentsTotal})` },
    { id: "links", label: `קישורים (${ov.listingLinksTotal})` },
    { id: "conflicts", label: `קונפליקטים (${cc.stats.openConflicts})`, owner: true },
    { id: "matches", label: `התאמות (${ov.pendingOfficeMatches})`, owner: true },
    { id: "sources", label: "רענון ומקורות", owner: true },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="pointer-events-none absolute -top-24 -start-24 h-56 w-56 rounded-full bg-brand-soft/50 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl text-brand-strong">🏢</span>
            <div className="min-w-0">
            <p className="text-[11px] font-black tracking-wide text-brand">BROKERAGE INTELLIGENCE</p>
            <h1 className="text-2xl font-black text-ink sm:text-3xl">מודיעין משרדי תיווך</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">בניית גרף מודיעין מלא של משרדי תיווך, סוכנים, טריטוריות וקשרי שוק. כל סריקת מודעות חיצונית עוברת זיהוי זהויות מול שכבת הליבה הזו — מידע ציבורי/עסקי בלבד, ללא מחיקה אוטומטית.</p>
            <div className="mt-2">
              {owner
                ? <Badge tone="green">בעלים — גישה לאומית מלאה</Badge>
                : <Badge tone="amber">גישה מוגבלת לערי ההתמחות{cc.access.allowedCities.length ? `: ${cc.access.allowedCities.slice(0, 4).join(", ")}` : ""}</Badge>}
            </div>
            </div>
          </div>
          {owner && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run(resolveBrokerageNowAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>זהה עכשיו</Button>
              <Button size="sm" variant="ghost" onClick={() => startScan({ runType: "full_country" })} disabled={pending}>בקש רענון לאומי</Button>
            </div>
          )}
        </div>
        {(msg || err) && <p className={`relative mt-3 text-sm font-bold ${err ? "text-rose-700" : "text-emerald-700"}`}>{err ?? msg}</p>}
      </section>

      {/* First-run onboarding — shown only when the brokerage graph is truly empty
          (canonical counters, RLS-independent — never a false "empty" from RLS). */}
      {ov.agentsTotal === 0 && ov.officesTotal === 0 && ov.listingLinksTotal === 0 && (
        <section dir="rtl" className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 text-center sm:p-6">
          <span className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-2xl">🏢</span>
          <h2 className="text-lg font-black text-ink sm:text-xl">עדיין לא זוהו משרדי תיווך</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm text-muted">
            הפעל סריקה ראשונית כדי לבנות את גרף המודיעין של השוק. הסריקה תאסוף מודעות, תזהה משרדים וסוכנים, ותקשר ביניהם — ממידע ציבורי בלבד.
          </p>
          <p className="text-muted mt-1.5 text-xs">⏱ משך משוער: 1–3 דקות · מתעדכן אוטומטית ברקע</p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <Button className="!min-w-[320px]" onClick={() => startScan({ runType: "full_country" })} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>🚀 התחל סריקת מודיעין ראשונית</Button>
            <Button variant="ghost" onClick={() => run(resolveBrokerageNowAction)} disabled={pending}>⚙ זהה מתוך נתונים קיימים</Button>
          </div>
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-4 text-right">
            <p className="mb-2 text-xs font-black text-ink">מה יקרה אחרי הסריקה:</p>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              <li>✓ משרדי תיווך יזוהו וימופו</li>
              <li>✓ סוכנים יותאמו למשרדים</li>
              <li>✓ טריטוריות ואזורי שליטה יחושבו</li>
              <li>✓ גרף תחרות וקשרים ייבנה</li>
              <li>✓ דשבורדי מודיעין שוק ייפתחו</li>
            </ul>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-line bg-card p-1.5">
        {tabs.filter((t) => !t.owner || owner).map((t) => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>)}
      </div>

      {(tab === "offices" || tab === "agents") && (
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם או עיר…" className="w-full max-w-md rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink" />
      )}

      {/* ── Overview — premium KPI grid + intelligence widgets ── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          <IntelligenceKpiGrid>
            <IntelligenceKpi label="מתווכים" value={ov.agentsTotal.toLocaleString("he-IL")} hint={`${ov.agentsWithOffice.toLocaleString("he-IL")} משויכים למשרד`} accent />
            <IntelligenceKpi label="משרדי תיווך" value={ov.officesTotal.toLocaleString("he-IL")} hint={ov.officesTotal === 0 ? "טרם זוהו" : `${cc.stats.verifiedOffices} מאומתים`} accent />
            <IntelligenceKpi label="קישורי מודעות" value={ov.listingLinksTotal.toLocaleString("he-IL")} hint={`${ov.listingLinksWithAgent.toLocaleString("he-IL")} עם מתווך`} />
            <IntelligenceKpi label="מתווכים ללא משרד" value={ov.agentsWithoutOffice.toLocaleString("he-IL")} hint="ממתינים לשיוך משרד" />
            <IntelligenceKpi label="איכות נתונים" value={`${ov.dataQuality.score}%`} hint={ov.dataQuality.label} />
            {owner && <IntelligenceKpi label="התאמות לבדיקה" value={ov.pendingOfficeMatches.toLocaleString("he-IL")} hint="ממתינות לאישור" />}
          </IntelligenceKpiGrid>

          {/* ── Data Integrity — diagnostic, user-friendly, single source of truth ── */}
          <IntelligenceSection title="תקינות נתונים" subtitle="מצב צינור הנתונים: מודעה ← מתווך ← משרד (נתוני אמת מאומתים)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <IntegrityStat label="מודעות עם מתווך" value={ov.refreshMetrics?.externalListingsWithAgent ?? ov.listingLinksWithAgent} />
              <IntegrityStat label="מתווכים שזוהו" value={ov.agentsTotal} />
              <IntegrityStat label="קישורי מודעות שנוצרו" value={ov.listingLinksTotal} />
              <IntegrityStat label="קישורים עם מתווך" value={ov.listingLinksWithAgent} tone={ov.listingLinksWithAgent > 0 ? "green" : undefined} />
              <IntegrityStat label="משרדים שזוהו" value={ov.officesTotal} tone={ov.officesTotal === 0 ? "amber" : "green"} />
              <IntegrityStat label="מתווכים משויכים למשרד" value={ov.agentsWithOffice} />
              <IntegrityStat label="מתווכים ללא משרד" value={ov.agentsWithoutOffice} />
              <IntegrityStat label="כיסוי קישורים" value={`${ov.dataQuality.linkCoverage}%`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              {ov.latestRefreshRun ? (
                <>
                  <span>סריקה אחרונה:</span>
                  <Badge tone={ov.latestRefreshRun.status === "completed" ? "green" : ov.latestRefreshRun.status === "failed" ? "red" : "amber"}>{statusHe(ov.latestRefreshRun.status)}</Badge>
                  {ov.latestRefreshRun.finishedAt && <span dir="ltr">{new Date(ov.latestRefreshRun.finishedAt).toLocaleString("he-IL")}</span>}
                  {ov.refreshMetrics && (
                    <span>· {ov.refreshMetrics.agentsCreated} מתווכים חדשים · {ov.refreshMetrics.listingLinksCreated} קישורים נוצרו</span>
                  )}
                </>
              ) : <span>טרם בוצעה סריקה.</span>}
            </div>
            {ov.refreshMetrics && ov.refreshMetrics.skippedSources.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700">הערות: {ov.refreshMetrics.skippedSources.join(" · ")}</p>
            )}
          </IntelligenceSection>

          {/* ── Office Discovery status — honest. Brokers exist but no offices yet. ── */}
          {ov.agentsTotal > 0 && ov.officesTotal === 0 && (
            <section dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-100 text-xl">🏢</span>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-ink">עדיין לא זוהו משרדי תיווך</h3>
                  <p className="mt-1 text-sm text-muted">
                    כרגע המערכת זיהתה מתווכים ומודעות, אך עדיין לא נמצאה ראיה מספקת לשיוך מתווכים למשרדים.
                    שיוך משרד נוצר רק מראיות אמת (למשל קו טלפון משותף לכמה מתווכים) — לעולם לא משם מומצא.
                  </p>
                  <p className="mt-2 text-sm font-bold text-amber-800">
                    להפעלת מחקר משרדים ממקורות ציבוריים נדרש שלב Office Discovery (שלב הבא).
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceSection title="מתווכים מובילים" subtitle="לפי מספר מודעות מקושרות (נתוני אמת)">
              {ov.topAgentsByListings.length === 0
                ? <IntelligenceEmptyInline text="עדיין אין מתווכים עם מודעות מקושרות. הפעל סריקה כדי לבנות את הגרף." />
                : (
                  <div className="flex flex-col gap-2">
                    {ov.topAgentsByListings.slice(0, 8).map((a, i) => (
                      <button key={a.id} type="button" onClick={() => setDnaTarget({ type: "broker", id: a.id, name: a.fullName })}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-right transition hover:border-brand">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-black text-brand-strong">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-ink">{a.fullName}</span>
                          <span className="block truncate text-[11px] text-muted">{a.officeName ?? "משרד טרם זוהה"}{a.city ? ` · ${a.city}` : ""}</span>
                        </span>
                        <span className="shrink-0 text-left">
                          <span className="block text-base font-black tabular-nums text-violet-700">{a.listingCount}</span>
                          <span className="block text-[10px] text-muted">מודעות</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </IntelligenceSection>

            <IntelligenceSection title="פעילות אחרונה" subtitle="סריקות, גילוי וזיהוי זהויות">
              <IntelligenceFeed
                emptyText="עדיין לא בוצעו סריקות."
                items={cc.runs.slice(0, 8).map((r) => ({
                  id: r.id,
                  title: runTypeHe(r.runType),
                  detail: `${r.newAgents ? `${r.newAgents} מתווכים חדשים · ` : ""}${r.updatedRecords} עדכונים`,
                  meta: r.finishedAt ? new Date(r.finishedAt).toLocaleDateString("he-IL") : "",
                  badge: <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{statusHe(r.status)}</Badge>,
                }))}
              />
            </IntelligenceSection>
          </div>
        </div>
      )}

      {/* ── Offices ── */}
      {tab === "offices" && (
        <div className="grid gap-3 md:grid-cols-2">
          {offices.length === 0 && <Empty text="אין משרדים להצגה בערי ההתמחות שלך." />}
          {offices.map((o) => (
            <button key={o.id} type="button" onClick={() => setDnaTarget({ type: "office", id: o.id, name: o.name })}
              className="rounded-2xl border border-line bg-card p-4 text-right transition hover:border-brand hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-black text-ink">{o.name}</div>
                  <div className="text-xs text-muted">{[o.city, o.brandNetwork].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge tone={confTone(o.confidenceScore)}>{Math.round(o.confidenceScore)}%</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge>{statusHe(o.status)}</Badge>
                {o.primaryPhone && <span dir="ltr">{o.primaryPhone}</span>}
                {o.googleRating != null && <span>★ {o.googleRating}{o.googleReviewsCount ? ` (${o.googleReviewsCount})` : ""}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Agents ── */}
      {tab === "agents" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "הכל"],
              ["resolved", "משויכים למשרד"],
              ["unresolved", "ללא משרד"],
              ["review", "לבדיקה"],
              ["high", "ביטחון גבוה ≥90%"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAgentFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  agentFilter === key
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
                className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-ink">
                <option value="">כל הערים</option>
                {brokerCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={agentSort} onChange={(e) => setAgentSort(e.target.value as typeof agentSort)}
                className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-ink">
                <option value="listings">מיון: מודעות</option>
                <option value="confidence">מיון: ביטחון</option>
                <option value="lastSeen">מיון: נראה לאחרונה</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {agents.length === 0 && <Empty text="אין סוכנים להצגה בסינון הנוכחי." />}
            {agents.map((a) => {
              const officeName = a.officeId ? officeNameById.get(a.officeId) ?? null : null;
              const listings = listingsByAgent.get(a.id) ?? 0;
              return (
                <button key={a.id} type="button" onClick={() => setDnaTarget({ type: "broker", id: a.id, name: a.fullName })}
                  className="rounded-2xl border border-line bg-card p-4 text-right transition hover:border-brand hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-ink">{a.fullName}</div>
                      <div className="text-xs text-muted">{[a.city, a.roleTitle].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <Badge tone={confTone(a.confidenceScore)}>{Math.round(a.confidenceScore)}%</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    {officeName
                      ? <Badge tone="green">🏢 {officeName}</Badge>
                      : <Badge tone="amber">משרד טרם זוהה</Badge>}
                    {listings > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">{listings} מודעות מקושרות</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <Badge>{statusHe(a.status)}</Badge>
                    {a.primaryPhone && <span dir="ltr">{a.primaryPhone}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Links ── */}
      {tab === "links" && (
        <div className="grid gap-3 md:grid-cols-2">
          {cc.links.length === 0 && <Empty text="עדיין אין קישורים. הרץ סנכרון נכסים חיצוניים או 'זהה עכשיו'." />}
          {cc.links.map((l) => (
            <div key={l.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-ink">{l.matchedName || l.matchedPhone || "מודעה חיצונית"}</div>
                  <div className="text-xs text-muted">{[l.city, l.matchedSource].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge tone={confTone(l.confidenceScore)}>{Math.round(l.confidenceScore)}%</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge tone={l.status === "confirmed" ? "green" : l.status === "rejected" ? "red" : "amber"}>{statusHe(l.status)}</Badge>
                {l.matchReasons.slice(0, 3).map((r, i) => <span key={i}>· {r}</span>)}
              </div>
              {owner && l.status !== "confirmed" && l.status !== "rejected" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => run(() => decideLinkAction(l.id, "confirmed"))} disabled={pending}>אשר קישור</Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => decideLinkAction(l.id, "rejected"))} disabled={pending}>דחה</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Conflicts (owner) ── */}
      {tab === "conflicts" && owner && (
        <div className="grid gap-3">
          {cc.conflicts.length === 0 && <Empty text="אין קונפליקטים פתוחים." />}
          {cc.conflicts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="text-sm font-black text-ink">{c.conflictType}{c.fieldName ? ` · ${c.fieldName}` : ""}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted">
                <div className="rounded-lg bg-surface p-2">A: {c.valueA ?? "—"}{c.confidenceA != null ? ` (${Math.round(c.confidenceA)}%)` : ""}</div>
                <div className="rounded-lg bg-surface p-2">B: {c.valueB ?? "—"}{c.confidenceB != null ? ` (${Math.round(c.confidenceB)}%)` : ""}</div>
              </div>
              {c.aiRecommendation && <p className="mt-2 text-xs text-violet-700">המלצת AI: {c.aiRecommendation}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => run(() => resolveConflictAction(c.id, "resolved"))} disabled={pending}>פתור</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => resolveConflictAction(c.id, "ignored"))} disabled={pending}>התעלם</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Identity matches (owner) ── */}
      {tab === "matches" && owner && (
        <div className="grid gap-3 md:grid-cols-2">
          {cc.matches.length === 0 && <Empty text="אין התאמות הממתינות לבדיקה." />}
          {cc.matches.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-black text-ink">{m.matchType}</div>
                <Badge tone={confTone(m.confidenceScore)}>{Math.round(m.confidenceScore)}%</Badge>
              </div>
              <div className="mt-1 text-xs text-muted">{m.matchReasons.slice(0, 4).join(" · ") || "—"}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => run(() => reviewMatchAction(m.id, "approve"))} disabled={pending}>אשר</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => reviewMatchAction(m.id, "reject"))} disabled={pending}>דחה</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Refresh runs + sources (owner) ── */}
      {tab === "sources" && owner && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-brand/40 bg-brand-soft/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-brand-strong">🛰️ גילוי משרדי תיווך לאומי</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  בונה את גרף המשרדים מראיות בלבד: מודעות שנצפו · קווי טלפון/דומיין משותפים · הסקת AI על הראיות (אם מוגדר). משרד נוצר רק מעל סף ראיות — לעולם לא מומצא. כל פריט ראיה נשמר עם מקור, ביטחון ונימוק.
                </p>
              </div>
              <Button size="sm" onClick={() => run(() => runNationalBrokerageDiscoveryAction().then((r) => r.ok ? { message: r.result?.message } : { error: r.error }))} disabled={pending}>
                הפעל גילוי משרדים
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-brand-strong">🔎 גילוי מפרסמים</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  מאתר מתווכים חדשים מתוך מודעות שכבר נסרקו לארגון שלך (מקור ציבורי בלבד, ללא סריקת אינטרנט). מתווכים חדשים נשמרים כ&quot;מועמדים&quot; ומסוננים מול הקיימים.
                </p>
              </div>
              <Button size="sm" onClick={() => run(() => discoverBrokeragePublishersAction().then((r) => r.ok ? { message: r.result?.message } : { error: r.error }))} disabled={pending}>
                גלה מפרסמים
              </Button>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-black text-ink">מקורות נתונים</h3>
            <div className="grid gap-2">
              {cc.sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-bold text-ink">{s.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted"><Badge tone={s.isActive ? "green" : "red"}>{s.isActive ? "פעיל" : "כבוי"}</Badge>אמינות {s.reliabilityScore}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-black text-ink">היסטוריית רענון</h3>
            <div className="grid gap-2">
              {cc.runs.length === 0 && <Empty text="עדיין לא בוצעו רענונים." />}
              {cc.runs.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{r.runType}</span>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">חדשים: {r.newOffices}/{r.newAgents} · עודכנו: {r.updatedRecords} · קונפליקטים: {r.conflictsCreated}</div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted/70">מידע ציבורי/עסקי בלבד · אין מחיקה אוטומטית · כל שינוי מתועד עם מקור ורמת ביטחון.</p>

      <DnaDrawer target={dnaTarget} onClose={() => setDnaTarget(null)} onOpen={(t) => setDnaTarget(t)} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">{text}</div>;
}

function IntegrityStat({ label, value, tone }: { label: string; value: number | string; tone?: "green" | "amber" }) {
  const valColor = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className={`text-lg font-black tabular-nums ${valColor}`}>{typeof value === "number" ? value.toLocaleString("he-IL") : value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}
