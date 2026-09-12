"use client";
// ============================================================================
// ZONO — Office Detail view. Premium, RTL, tabbed: Overview / Competitors /
// Agents / Listings / Territory. Reads the real backfilled office intelligence +
// activity-based competitor intelligence. Honest empty states, mobile-first.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficeDetail } from "@/lib/office-intel/office-detail";
import type { OfficeCompetitorReport, CompetitorView } from "@/lib/office-intel/competitor";

const ils = (n: number | null) => (n == null ? "—" : `₪${Number(n).toLocaleString("he-IL")}`);
const priceShort = (p: number | null) => (p == null ? "—" : p >= 1_000_000 ? `₪${(p / 1_000_000).toFixed(1)}M` : p >= 1000 ? `₪${Math.round(p / 1000)}K` : `₪${p}`);
const dateHe = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

type Tab = "overview" | "competitors" | "agents" | "listings" | "territory";

export function OfficeDetailView({ detail, competitors }: { detail: OfficeDetail; competitors?: OfficeCompetitorReport | null }) {
  const [tab, setTab] = useState<Tab>("overview");
  const k = detail.kpis;
  const rivals = competitors?.competitors ?? [];
  const momentum = competitors?.target.momentum ?? null;

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
        {([["overview", "סקירה"], ["competitors", "מתחרים"], ["agents", "מתווכים"], ["listings", "נכסים"], ["territory", "טריטוריה"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold transition ${tab === id ? "text-brand-strong border-brand-strong border-b-2" : "text-muted hover:text-ink"}`}>
            {label}{id === "competitors" ? ` (${rivals.length})` : id === "agents" ? ` (${detail.agents.length})` : id === "listings" ? ` (${detail.listings.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && momentum && (
        <Card title="מומנטום המשרד">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-3">
              <MomentumDial score={momentum.score} />
              <div>
                <p className="text-ink text-2xl font-black tabular-nums">{momentum.score}<span className="text-muted text-sm font-bold"> / 100</span></p>
                <p className="text-muted text-xs">מדד פעילות נצפית — קצב, פריסה ומתווכים</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              {momentum.breakdown.map((b) => (
                <div key={b.label} className="bg-surface border-line rounded-xl border p-2.5">
                  <div className="text-muted text-[10.5px] font-semibold">{b.label}</div>
                  <div className="text-ink mt-0.5 text-base font-black tabular-nums">{b.value}%</div>
                  <div className="text-muted text-[10px]">{b.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

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

      {tab === "competitors" && (
        <div className="flex flex-col gap-4">
          {competitors?.insights?.length ? (
            <Card title="מודיעין הזדמנויות">
              <ul className="flex flex-col gap-2">
                {competitors.insights.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px]">
                    <span className="text-brand-strong mt-0.5 shrink-0"><Icon name="Sparkles" size={14} /></span>
                    <span className="text-ink">{t}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-3 text-[11px]">התובנות מבוססות אך ורק על מלאי שנצפה בפועל — ZONO לעולם אינה ממציאה מספרים.</p>
            </Card>
          ) : null}

          <Card title="מתחרים ישירים">
            {rivals.length ? (
              <div className="flex flex-col gap-3">
                {rivals.map((r) => <CompetitorRow key={r.officeId} r={r} />)}
                <p className="text-muted mt-1 text-[11px]">הדירוג מבוסס על פעילות נצפית (חפיפת שכונות, עיר, סוגי נכסים, היקף וקצב) — לא על שמות. משרד לעולם אינו מתחרה של עצמו.</p>
              </div>
            ) : (
              <p className="text-muted text-sm">ZONO עדיין אוספת נתונים כדי לזהות מתחרים ישירים עם חפיפה טריטוריאלית עבור משרד זה.</p>
            )}
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

function MomentumDial({ score }: { score: number }) {
  return (
    <div className="relative h-16 w-16 shrink-0 rounded-full"
      style={{ background: `conic-gradient(var(--brand-strong, #6d28d9) ${score * 3.6}deg, var(--line, #e5e7eb) 0deg)` }}>
      <div className="bg-card absolute inset-[6px] grid place-items-center rounded-full">
        <span className="text-ink text-sm font-black tabular-nums">{score}</span>
      </div>
    </div>
  );
}

function CompetitorRow({ r }: { r: CompetitorView }) {
  return (
    <Link href={`/brokerage-data/offices/${r.officeId}`} prefetch={false}
      className="border-line hover:border-brand-light hover:bg-surface/60 flex flex-col gap-2 rounded-2xl border p-3.5 transition sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-ink truncate font-black">{r.name}</span>
          {r.brand && <span className="text-brand-strong shrink-0 text-xs font-bold">· {r.brand}</span>}
          {r.city && <span className="text-muted shrink-0 text-xs">· {r.city}</span>}
        </div>
        {r.sharedNeighborhoods.length > 0 && (
          <p className="text-muted mt-1 truncate text-[12px]">שכונות משותפות: {r.sharedNeighborhoods.slice(0, 4).join(" · ")}</p>
        )}
        <div className="text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
          <span>{r.kpis.total} מלאי</span>
          <span>{r.kpis.new30d} חדשים/30י׳</span>
          <span>{r.kpis.neighborhoods} שכונות</span>
          <span>{r.kpis.brokers} מתווכים</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="text-center">
          <div className="text-ink text-lg font-black tabular-nums">{r.score}</div>
          <div className="text-muted text-[9.5px] font-bold">ציון תחרות</div>
        </div>
        <div className="text-center">
          <div className="text-brand-strong text-lg font-black tabular-nums">{r.overlapPct}%</div>
          <div className="text-muted text-[9.5px] font-bold">חפיפת טריטוריה</div>
        </div>
      </div>
    </Link>
  );
}
