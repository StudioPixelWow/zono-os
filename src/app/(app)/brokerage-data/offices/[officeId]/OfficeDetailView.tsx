"use client";
// ============================================================================
// ZONO — Office Detail view. Premium, RTL, tabbed: Overview / Agents / Listings /
// Territory. Reads the real backfilled office intelligence. Honest empty states.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficeDetail } from "@/lib/office-intel/office-detail";

const ils = (n: number | null) => (n == null ? "—" : `₪${Number(n).toLocaleString("he-IL")}`);
const priceShort = (p: number | null) => (p == null ? "—" : p >= 1_000_000 ? `₪${(p / 1_000_000).toFixed(1)}M` : p >= 1000 ? `₪${Math.round(p / 1000)}K` : `₪${p}`);
const dateHe = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

type Tab = "overview" | "agents" | "listings" | "territory";

export function OfficeDetailView({ detail }: { detail: OfficeDetail }) {
  const [tab, setTab] = useState<Tab>("overview");
  const k = detail.kpis;

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-10">
      <Link href="/brokerage-data/offices" className="text-muted hover:text-ink inline-flex w-fit items-center gap-1 text-[13px] font-bold">
        <Icon name="ChevronRight" size={16} /> חזרה למודיעין המשרדים
      </Link>

      {/* Hero */}
      <header className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-brand-soft text-brand-strong grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Building2" size={28} /></span>
            <div>
              <h1 className="text-ink text-2xl font-black leading-tight">{detail.name}</h1>
              <p className="text-muted text-sm">
                {[detail.city, detail.brand].filter(Boolean).join(" · ") || "—"}
                {detail.status ? <span className="text-emerald-600"> · {detail.status === "active" ? "פעיל" : detail.status}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {detail.phone && <a href={`tel:${detail.phone}`} className="border-line hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 font-bold"><Icon name="Phone" size={14} /> {detail.phone}</a>}
            {detail.website && <a href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`} target="_blank" rel="noopener noreferrer" className="border-line hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 font-bold"><Icon name="Globe" size={14} /> אתר</a>}
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="מתווכים" value={String(k.agents)} icon="Users" />
          <Kpi label="נכסים פעילים" value={String(k.activeListings)} icon="Building" />
          <Kpi label="חדשים 7 ימים" value={String(k.new7d)} icon="Flame" hot={k.new7d > 0} />
          <Kpi label="חדשים 30 יום" value={String(k.new30d)} icon="TrendingUp" />
          <Kpi label="שכונות" value={String(k.neighborhoods)} icon="Map" />
          <Kpi label="מחיר ממוצע" value={priceShort(k.avgPriceIls)} icon="Tag" />
        </div>
      </header>

      {/* Tabs */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {([["overview", "סקירה"], ["agents", "מתווכים"], ["listings", "נכסים"], ["territory", "טריטוריה"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold transition ${tab === id ? "text-brand-strong border-brand-strong border-b-2" : "text-muted hover:text-ink"}`}>
            {label}{id === "agents" ? ` (${detail.agents.length})` : id === "listings" ? ` (${detail.listings.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="אזורי הפעילות החזקים">
            {detail.territory.length ? (
              <ol className="flex flex-col gap-1.5">
                {detail.territory.slice(0, 6).map((a, i) => (
                  <li key={a.name} className="flex items-center justify-between text-sm">
                    <span className="text-ink font-semibold"><span className="text-muted ms-1">{i + 1}.</span> {a.name}</span>
                    <span className="text-muted tabular-nums">{a.listings} נכסים</span>
                  </li>
                ))}
              </ol>
            ) : <Empty />}
          </Card>
          <Card title="מתווכים מובילים">
            {detail.agents.length ? (
              <ul className="flex flex-col gap-1.5">
                {detail.agents.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink font-semibold">{a.name}</span>
                    <span className="text-muted tabular-nums">{a.listings} נכסים</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted text-sm">ZONO עדיין אוספת את שיוך המתווכים למשרד זה.</p>}
          </Card>
        </div>
      )}

      {tab === "agents" && (
        <Card title="מתווכי המשרד">
          {detail.agents.length ? (
            <div className="overflow-x-auto"><table className="w-full text-right text-[13.5px]">
              <thead><tr className="text-muted text-[11px]"><th className="py-1.5 pl-3 font-semibold">מתווך</th><th className="py-1.5 pl-3 font-semibold">נכסים</th><th className="py-1.5 font-semibold">נראה לאחרונה</th></tr></thead>
              <tbody>{detail.agents.map((a) => (
                <tr key={a.id} className="border-line/60 border-t"><td className="py-2 pl-3 font-semibold">{a.name}</td><td className="py-2 pl-3 tabular-nums">{a.listings}</td><td className="text-muted py-2">{dateHe(a.lastSeen)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="text-muted text-sm">ZONO עדיין אוספת פעילות מתווכים עבור משרד זה.</p>}
        </Card>
      )}

      {tab === "listings" && (
        <Card title="נכסי המשרד">
          {detail.listings.length ? (
            <div className="overflow-x-auto"><table className="w-full text-right text-[13.5px]">
              <thead><tr className="text-muted text-[11px]"><th className="py-1.5 pl-3 font-semibold">נכס</th><th className="py-1.5 pl-3 font-semibold">שכונה</th><th className="py-1.5 pl-3 font-semibold">חדרים</th><th className="py-1.5 pl-3 font-semibold">מ״ר</th><th className="py-1.5 pl-3 font-semibold">מחיר</th><th className="py-1.5 font-semibold">מקור</th></tr></thead>
              <tbody>{detail.listings.map((l) => (
                <tr key={l.id} className="border-line/60 border-t">
                  <td className="py-2 pl-3 font-semibold">{l.title ?? "מודעה"}</td>
                  <td className="text-muted py-2 pl-3">{l.neighborhood ?? l.city ?? "—"}</td>
                  <td className="py-2 pl-3 tabular-nums">{l.rooms ?? "—"}</td>
                  <td className="py-2 pl-3 tabular-nums">{l.sqm ?? "—"}</td>
                  <td className="py-2 pl-3 tabular-nums">{ils(l.price)}</td>
                  <td className="text-muted py-2">{l.source ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty />}
        </Card>
      )}

      {tab === "territory" && (
        <Card title="טריטוריה — אזורי פעילות">
          {detail.territory.length ? (
            <div className="flex flex-col gap-2">
              {detail.territory.map((a) => {
                const max = detail.territory[0]?.listings || 1;
                return (
                  <div key={a.name} className="flex items-center gap-3">
                    <span className="text-ink w-40 shrink-0 truncate text-sm font-semibold">{a.name}</span>
                    <span className="bg-line/60 h-2.5 flex-1 overflow-hidden rounded-full"><i className="bg-brand-strong block h-full rounded-full" style={{ width: `${Math.round((a.listings / max) * 100)}%` }} /></span>
                    <span className="text-muted w-16 shrink-0 text-left text-[13px] tabular-nums">{a.listings}</span>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, icon, hot }: { label: string; value: string; icon: string; hot?: boolean }) {
  return (
    <div className="bg-surface border-line rounded-xl border p-3">
      <div className="text-muted flex items-center gap-1 text-[10.5px] font-semibold uppercase"><Icon name={icon} size={12} /> {label}</div>
      <div className={`mt-1 text-xl font-black tabular-nums ${hot ? "text-emerald-600" : "text-ink"}`}>{value}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[18px] border p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-ink mb-3 text-sm font-black">{title}</h2>
      {children}
    </div>
  );
}
function Empty() { return <p className="text-muted text-sm">ZONO עדיין אוספת פעילות עבור משרד זה.</p>; }
