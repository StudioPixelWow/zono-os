"use client";
// ============================================================================
// 👤 Broker Directory™ (RTL). The real, searchable directory of brokers built
// from the CANONICAL brokerage data — real linked-listing counts, office names,
// observed top city + neighborhoods. No raw table; no fabricated metrics; a
// broker with links never shows 0. Search / filter / sort run in-memory over the
// server payload. Office-level metrics live on the Office Intelligence dashboard.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, Pill } from "@/components/intelligence/terminal";
import { WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";
import { EmptyGuidance } from "@/components/intelligence/EmptyGuidance";
import type { BrokerDirectory, DirectoryBroker } from "@/lib/brokerage-data/overview";

const STATUS_HE: Record<string, string> = {
  active: "פעיל", verified: "מאומת", unverified: "לא מאומת", candidate: "מועמד", inactive: "לא פעיל",
};
const statusHe = (s: string) => STATUS_HE[s] ?? s;
const fmt = (n: number) => n.toLocaleString("he-IL");

type Sort = "listings" | "lastSeen" | "confidence";
type Resolved = "all" | "resolved" | "unresolved";

function BrokerCard({ b }: { b: DirectoryBroker }) {
  return (
    <Link
      href={`/brokerage-data?broker=${encodeURIComponent(b.id)}&name=${encodeURIComponent(b.fullName)}`}
      prefetch={false}
      className="border-line bg-card hover:border-brand flex flex-col gap-2 rounded-2xl border p-4 text-right transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-ink truncate text-sm font-black">{b.fullName}</div>
          <div className="text-muted truncate text-xs">{[b.topCity, statusHe(b.status)].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        <span className="bg-brand-soft text-brand-strong shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums">{Math.round(b.confidenceScore)}%</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {b.officeName
          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">🏢 {b.officeName}</span>
          : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">משרד טרם זוהה</span>}
        <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">{fmt(b.listingCount)} מודעות מקושרות</span>
      </div>

      {b.topNeighborhoods.length > 0 && (
        <div className="text-muted flex flex-wrap gap-1 text-[11px]">
          {b.topNeighborhoods.map((n) => <span key={n} className="bg-surface rounded-full px-2 py-0.5">{n}</span>)}
        </div>
      )}

      <div className="text-muted flex flex-wrap items-center gap-2 text-[11px]">
        {b.primaryPhone && <span dir="ltr">{b.primaryPhone}</span>}
        {b.lastSeenAt && <span>· נראה {new Date(b.lastSeenAt).toLocaleDateString("he-IL")}</span>}
      </div>
    </Link>
  );
}

export function BrokerDirectoryView({ directory }: { directory: BrokerDirectory | null }) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [office, setOffice] = useState("");
  const [resolved, setResolved] = useState<Resolved>("all");
  const [minConf, setMinConf] = useState(0);
  const [sort, setSort] = useState<Sort>("listings");

  const brokers = useMemo(() => directory?.brokers ?? [], [directory]);
  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = brokers.filter((b) => {
      if (q && !(b.fullName.toLowerCase().includes(q) || (b.topCity ?? "").toLowerCase().includes(q) || (b.officeName ?? "").toLowerCase().includes(q))) return false;
      if (city && b.topCity !== city) return false;
      if (office && b.officeId !== office) return false;
      if (resolved === "resolved" && !b.resolved) return false;
      if (resolved === "unresolved" && b.resolved) return false;
      if (minConf && b.confidenceScore < minConf) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "listings") return b.listingCount - a.listingCount;
      if (sort === "confidence") return b.confidenceScore - a.confidenceScore;
      return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
    });
  }, [brokers, q, city, office, resolved, minConf, sort]);

  const ACCESS_LINKS: WorkspaceLink[] = [
    { href: "/brokerage-data", emoji: "🏢", label: "דאטה משרדי תיווך", hint: "Brokerage Data Platform" },
    { href: "/intelligence-explorer", emoji: "🔎", label: "חיפוש מתקדם", hint: "Intelligence Explorer" },
    { href: "/office-intelligence/dashboard", emoji: "🏬", label: "מודיעין משרדים", hint: "Office Intelligence" },
  ];

  const totalListingsLinked = directory?.listingLinksWithAgent ?? 0;
  const resolvedCount = brokers.filter((b) => b.resolved).length;

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">👤</span>
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">BROKER DIRECTORY™</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">ספריית מתווכים</h1>
          <p className="text-muted mt-0.5 text-sm">מתווכים שזוהו ממודעות אמת · מספר מודעות מקושרות לכל מתווך · שיוך משרד.</p>
        </div>
      </header>

      <WorkspaceLinks links={ACCESS_LINKS} />

      {!directory || brokers.length === 0 ? (
        <EmptyGuidance />
      ) : (
        <>
          <TerminalSection title="סקירה" subtitle="נתוני אמת מצינור מודעה ← מתווך">
            <MetricGrid>
              <Metric label="מתווכים" value={fmt(directory.agentsTotal)} accent />
              <Metric label="מודעות מקושרות למתווך" value={fmt(totalListingsLinked)} />
              <Metric label="משויכים למשרד" value={fmt(resolvedCount)} />
              <Metric label="משרדים שזוהו" value={fmt(directory.officesTotal)} />
            </MetricGrid>
          </TerminalSection>

          {/* Controls */}
          <div className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-3 sm:p-4">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש מתווך / עיר / משרד…"
              className="border-line bg-surface text-ink w-full rounded-xl border px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select value={city} onChange={(e) => setCity(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
                <option value="">כל הערים</option>
                {directory.cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={office} onChange={(e) => setOffice(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
                <option value="">כל המשרדים</option>
                {directory.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={resolved} onChange={(e) => setResolved(e.target.value as Resolved)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
                <option value="all">הכל</option>
                <option value="resolved">משויכים למשרד</option>
                <option value="unresolved">ללא משרד</option>
              </select>
              <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
                <option value={0}>כל רמות הביטחון</option>
                <option value={70}>ביטחון ≥ 70%</option>
                <option value={90}>ביטחון ≥ 90%</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="border-line bg-surface text-ink ms-auto rounded-full border px-3 py-1 text-xs font-bold">
                <option value="listings">מיון: מודעות מקושרות</option>
                <option value="lastSeen">מיון: נראה לאחרונה</option>
                <option value="confidence">מיון: ביטחון</option>
              </select>
            </div>
            <p className="text-muted text-[11px]">{fmt(filtered.length)} מתווכים מוצגים מתוך {fmt(brokers.length)}</p>
          </div>

          {filtered.length === 0
            ? <div className="border-line bg-surface text-muted rounded-2xl border border-dashed p-6 text-center text-sm">אין מתווכים בסינון הנוכחי.</div>
            : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((b) => <BrokerCard key={b.id} b={b} />)}
              </div>
            )}

          <p className="text-muted text-[11px]">
            מדדי שליטה אזורית / מומנטום / Winning DNA הם ברמת המשרד — ראה <Link href="/office-intelligence/dashboard" className="text-brand-strong font-bold">דשבורד מודיעין משרדים</Link>. <Pill tone="neutral">נתוני אמת בלבד</Pill>
          </p>
        </>
      )}
    </div>
  );
}
