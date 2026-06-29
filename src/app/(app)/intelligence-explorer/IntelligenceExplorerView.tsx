"use client";
// ============================================================================
// 🌍 Intelligence Explorer™ — discovery experience (presentation only · RTL).
// One search engine over the EXISTING intelligence: brokers, offices,
// neighborhoods, external listings and market opportunities. All filter/sort is
// in-memory over the single payload — no duplicated queries, no recompute, no
// fake values (absent → —). Premium financial-terminal look. Cards open the
// existing Intelligence Profiles; nothing is duplicated.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { TerminalSection, Metric, StatusBadge, Pill, TerminalEmpty, val, type StatusTone } from "@/components/intelligence/terminal";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { NeighborhoodLink } from "@/components/intelligence/EntityLinks";
import type { IntelligenceExplorerDTO, ExplorerBroker, ExplorerOffice, ExplorerNeighborhood, ExplorerListing } from "@/lib/intelligence-explorer/types";

type Tab = "brokers" | "offices" | "neighborhoods" | "opportunities";
const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);
const has = (hay: (string | null | undefined)[], q: string) => hay.some((h) => (h ?? "").toLowerCase().includes(q));
const field = "border-line bg-card text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";

function officeStatus(overall: number | null): { label: string; tone: StatusTone } {
  if (overall == null) return { label: "—", tone: "neutral" };
  if (overall >= 80) return { label: "מוביל", tone: "leader" };
  if (overall >= 60) return { label: "סגן מוביל", tone: "runner" };
  if (overall >= 40) return { label: "מתמודד", tone: "contender" };
  return { label: "בעלייה", tone: "rising" };
}

export function IntelligenceExplorerView({ data }: { data: IntelligenceExplorerDTO }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("brokers");
  const query = q.trim().toLowerCase();

  // ── Global search (cross-category, in-memory) ──────────────────────────────
  const results = useMemo(() => {
    if (!query) return null;
    return {
      brokers: data.brokers.filter((b) => has([b.name, b.office, b.city], query)).slice(0, 12),
      offices: data.offices.filter((o) => has([o.name, o.city], query)).slice(0, 12),
      neighborhoods: data.neighborhoods.filter((n) => has([n.neighborhood, n.city], query)).slice(0, 12),
      listings: data.listings.filter((l) => has([l.title, l.city, l.neighborhood], query)).slice(0, 12),
    };
  }, [query, data]);

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <MarketIntelNav active="explorer" crumbs={[{ label: "חיפוש מודיעין" }]} />
      <header className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">🌍</span>
          <div className="min-w-0">
            <p className="text-brand text-[11px] font-black tracking-wide">INTELLIGENCE EXPLORER™</p>
            <h1 className="text-ink text-2xl font-black sm:text-3xl">חיפוש מודיעין</h1>
            <p className="text-muted mt-0.5 text-sm">גלה כל מתווך, משרד, שכונה או הזדמנות — ממקום אחד.</p>
          </div>
        </div>
        <div className="mt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש מתווך · משרד · שכונה · עיר · מודעה…" className={`${field} w-full`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/market-intelligence/listings" className="border-line bg-card hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-bold transition">🌍 צפה במודעות שוק ↗</Link>
        </div>
      </header>

      {results ? (
        <GlobalResults results={results} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {([["brokers", `מתווכים (${data.brokers.length})`], ["offices", `משרדים (${data.offices.length})`], ["neighborhoods", `שכונות (${data.neighborhoods.length})`], ["opportunities", "הזדמנויות"]] as [Tab, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${tab === id ? "bg-brand-strong text-white" : "border-line bg-card text-muted hover:text-ink border"}`}>{label}</button>
            ))}
          </div>
          {tab === "brokers" && <BrokerDirectory brokers={data.brokers} />}
          {tab === "offices" && <OfficeDirectory offices={data.offices} />}
          {tab === "neighborhoods" && <NeighborhoodExplorer neighborhoods={data.neighborhoods} />}
          {tab === "opportunities" && <OpportunityDiscovery data={data} />}
        </>
      )}
    </div>
  );
}

// ── Global results ───────────────────────────────────────────────────────────
function GlobalResults({ results }: { results: { brokers: ExplorerBroker[]; offices: ExplorerOffice[]; neighborhoods: ExplorerNeighborhood[]; listings: ExplorerListing[] } }) {
  const empty = !results.brokers.length && !results.offices.length && !results.neighborhoods.length && !results.listings.length;
  if (empty) return <TerminalSection title="תוצאות חיפוש"><TerminalEmpty text="לא נמצאו תוצאות. נסה מונח אחר." /></TerminalSection>;
  return (
    <div className="flex flex-col gap-4">
      {results.brokers.length > 0 && (
        <TerminalSection title={`מתווכים (${results.brokers.length})`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.brokers.map((b) => <BrokerCard key={b.id} b={b} />)}</div>
        </TerminalSection>
      )}
      {results.offices.length > 0 && (
        <TerminalSection title={`משרדים (${results.offices.length})`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.offices.map((o) => <OfficeCard key={o.id} o={o} />)}</div>
        </TerminalSection>
      )}
      {results.neighborhoods.length > 0 && (
        <TerminalSection title={`שכונות (${results.neighborhoods.length})`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.neighborhoods.map((n) => <NeighborhoodCard key={n.id} n={n} />)}</div>
        </TerminalSection>
      )}
      {results.listings.length > 0 && (
        <TerminalSection title={`מודעות (${results.listings.length})`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        </TerminalSection>
      )}
    </div>
  );
}

// ── Broker Directory ─────────────────────────────────────────────────────────
function BrokerDirectory({ brokers }: { brokers: ExplorerBroker[] }) {
  const [city, setCity] = useState(""); const [office, setOffice] = useState(""); const [minConf, setMinConf] = useState(0); const [sort, setSort] = useState<"listings" | "confidence">("listings");
  const rows = useMemo(() => {
    const c = city.trim().toLowerCase(), o = office.trim().toLowerCase();
    return brokers
      .filter((b) => (!c || (b.city ?? "").toLowerCase().includes(c)) && (!o || (b.office ?? "").toLowerCase().includes(o)) && b.confidence >= minConf)
      .sort((a, b) => (sort === "listings" ? b.listingsCount - a.listingsCount : b.confidence - a.confidence));
  }, [brokers, city, office, minConf, sort]);
  return (
    <TerminalSection title="מדריך מתווכים™" subtitle={`${rows.length} מתווכים`} action={
      <select value={sort} onChange={(e) => setSort(e.target.value as "listings" | "confidence")} className={field}><option value="listings">מיון: מספר מודעות</option><option value="confidence">מיון: ביטחון</option></select>
    }>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר" className={field} />
        <input value={office} onChange={(e) => setOffice(e.target.value)} placeholder="משרד" className={field} />
        <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className={field}>{[0, 50, 70, 90].map((n) => <option key={n} value={n}>ביטחון ≥ {n}</option>)}</select>
      </div>
      {rows.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.slice(0, 60).map((b) => <BrokerCard key={b.id} b={b} />)}</div> : <TerminalEmpty text="אין מתווכים תואמים." />}
    </TerminalSection>
  );
}

// ── Office Directory ─────────────────────────────────────────────────────────
function OfficeDirectory({ offices }: { offices: ExplorerOffice[] }) {
  const [city, setCity] = useState(""); const [minOverall, setMinOverall] = useState(0); const [sort, setSort] = useState<"overall" | "momentum" | "growth" | "threat">("overall");
  const rows = useMemo(() => {
    const c = city.trim().toLowerCase();
    return offices
      .filter((o) => (!c || (o.city ?? "").toLowerCase().includes(c)) && (o.overall ?? 0) >= minOverall)
      .sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
  }, [offices, city, minOverall, sort]);
  return (
    <TerminalSection title="מדריך משרדים™" subtitle={`${rows.length} משרדים`} action={
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={field}><option value="overall">מיון: ביצועים</option><option value="momentum">מיון: מומנטום</option><option value="growth">מיון: צמיחה</option><option value="threat">מיון: איום</option></select>
    }>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר" className={field} />
        <select value={minOverall} onChange={(e) => setMinOverall(Number(e.target.value))} className={field}>{[0, 40, 60, 80].map((n) => <option key={n} value={n}>ביצועים ≥ {n}</option>)}</select>
      </div>
      {rows.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.slice(0, 60).map((o) => <OfficeCard key={o.id} o={o} />)}</div> : <TerminalEmpty text="אין משרדים תואמים." />}
    </TerminalSection>
  );
}

// ── Neighborhood Explorer ────────────────────────────────────────────────────
function NeighborhoodExplorer({ neighborhoods }: { neighborhoods: ExplorerNeighborhood[] }) {
  const [city, setCity] = useState("");
  const rows = useMemo(() => { const c = city.trim().toLowerCase(); return neighborhoods.filter((n) => !c || n.city.toLowerCase().includes(c)); }, [neighborhoods, city]);
  return (
    <TerminalSection title="חוקר השכונות™" subtitle={`${rows.length} שכונות`}>
      <div className="mb-3 flex flex-wrap gap-2"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר" className={field} /></div>
      {rows.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.slice(0, 60).map((n) => <NeighborhoodCard key={n.id} n={n} />)}</div> : <TerminalEmpty text="אין שכונות תואמות." />}
    </TerminalSection>
  );
}

// ── Opportunity Discovery (existing intelligence only) ───────────────────────
function OpportunityDiscovery({ data }: { data: IntelligenceExplorerDTO }) {
  const newest = [...data.listings].filter((l) => l.firstSeenAt).sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime()).slice(0, 12);
  const offMarket = data.listings.filter((l) => l.hasAgent === false).slice(0, 12);
  const highOpp = [...data.listings].filter((l) => l.opportunityScore >= 70).sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 12);
  return (
    <div className="flex flex-col gap-4">
      <TerminalSection title="מודעות חדשות" subtitle="לפי מועד זיהוי ראשון">
        {newest.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{newest.map((l) => <ListingCard key={l.id} l={l} />)}</div> : <TerminalEmpty text="אין מודעות חדשות." />}
      </TerminalSection>
      <TerminalSection title="ללא מתווך / אוף-מרקט" subtitle="בעלי נכס פרטיים">
        {offMarket.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{offMarket.map((l) => <ListingCard key={l.id} l={l} />)}</div> : <TerminalEmpty text="אין מודעות אוף-מרקט." />}
      </TerminalSection>
      <TerminalSection title="פוטנציאל גבוה" subtitle="ציון הזדמנות ≥ 70">
        {highOpp.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{highOpp.map((l) => <ListingCard key={l.id} l={l} />)}</div> : <TerminalEmpty text="אין הזדמנויות בעלות פוטנציאל גבוה." />}
      </TerminalSection>
      <TerminalSection title="אותות שוק" subtitle="ירידות מחיר · יציאה צפויה · אותות מנוע המודיעין">
        {data.opportunitySignals.length ? (
          <div className="flex flex-col gap-1.5">{data.opportunitySignals.map((o, i) => (
            <div key={i} className="border-line flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
              <span className="min-w-0"><span className="text-ink block truncate font-bold">{o.label}</span><span className="text-muted text-[11px]">{o.reason}</span></span>
              {o.neighborhood && <span className="shrink-0"><NeighborhoodLink city={o.city} neighborhood={o.neighborhood} /></span>}
            </div>
          ))}</div>
        ) : <TerminalEmpty text="אין כרגע אותות הזדמנות פעילים." />}
      </TerminalSection>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────
function BrokerCard({ b }: { b: ExplorerBroker }) {
  return (
    <Link href={`/broker-intelligence/${encodeURIComponent(b.id)}`} prefetch={false} className="border-line hover:border-brand-light bg-card rounded-xl border p-3 transition">
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink truncate text-sm font-black">{b.name}</span>
        <Pill tone="neutral">ביטחון {val(b.confidence)}</Pill>
      </div>
      <p className="text-muted mt-0.5 truncate text-[11px]">{[b.office, b.city].filter(Boolean).join(" · ") || "—"}</p>
      <p className="text-muted mt-1 text-[11px]">{b.listingsCount} מודעות</p>
    </Link>
  );
}
function OfficeCard({ o }: { o: ExplorerOffice }) {
  const st = officeStatus(o.overall);
  return (
    <Link href={`/office-intelligence/${encodeURIComponent(o.id)}`} prefetch={false} className="border-line hover:border-brand-light bg-card rounded-xl border p-3 transition">
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink truncate text-sm font-black">{o.name}</span>
        <StatusBadge label={st.label} tone={st.tone} />
      </div>
      <p className="text-muted mt-0.5 truncate text-[11px]">{o.city ?? "—"}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Metric label="ביצועים" value={val(o.overall)} accent />
        <Metric label="מומנטום" value={val(o.momentum)} />
        <Metric label="צמיחה" value={val(o.growth)} />
      </div>
    </Link>
  );
}
function NeighborhoodCard({ n }: { n: ExplorerNeighborhood }) {
  return (
    <Link href={`/neighborhood-intelligence/${encodeURIComponent(n.id)}`} prefetch={false} className="border-line hover:border-brand-light bg-card rounded-xl border p-3 transition">
      <span className="text-ink block truncate text-sm font-black">{n.neighborhood}</span>
      <p className="text-muted mt-0.5 truncate text-[11px]">{n.city || "—"}</p>
      <p className="text-muted mt-1 text-[11px]">{n.listings} מודעות · {n.privateListings} ללא מתווך</p>
    </Link>
  );
}
function ListingCard({ l }: { l: ExplorerListing }) {
  return (
    <Link href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line hover:border-brand-light bg-card rounded-xl border p-3 transition">
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink truncate text-sm font-black">{l.title ?? "מודעה"}</span>
        {l.opportunityScore > 0 && <Pill tone={l.opportunityScore >= 70 ? "rising" : "neutral"}>{val(l.opportunityScore)}</Pill>}
      </div>
      <p className="text-muted mt-0.5 truncate text-[11px]">{[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"}</p>
      <p className="text-ink mt-1 text-sm font-bold tabular-nums">{ils(l.price)}{l.hasAgent === false && <span className="text-brand-strong ms-2 text-[11px] font-bold">ללא מתווך</span>}</p>
    </Link>
  );
}
