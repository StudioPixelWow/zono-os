// ============================================================================
// 🏢 Office profile presentation (RTL). Header + stats + agents + properties.
// Pure presentational — all data is passed in from the server page.
// ============================================================================
import Link from "next/link";
import type { OfficeProfile } from "@/lib/brokerage-data/office-profile";

const fmt = (n: number) => n.toLocaleString("he-IL");
const fmtPrice = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

const STATUS_HE: Record<string, string> = { active: "פעיל", candidate: "מועמד", rejected: "נדחה", verified: "מאומת" };

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "amber" }) {
  const c = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2.5">
      <div className={`text-lg font-black tabular-nums ${c}`}>{typeof value === "number" ? fmt(value) : value}</div>
      <div className="text-muted mt-0.5 text-[11px]">{label}</div>
    </div>
  );
}

export function OfficeProfileView({ profile }: { profile: OfficeProfile }) {
  const p = profile;
  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      {/* Back link */}
      <Link href="/brokerage-data" className="text-muted hover:text-ink w-fit text-[12px] font-bold">← חזרה לדאטה משרדי תיווך</Link>

      {/* Header */}
      <section className="border-brand/40 bg-brand-soft/40 flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-brand-strong text-2xl font-black">{p.name}</h1>
            <span className="bg-surface rounded-full px-2 py-0.5 text-[11px] font-bold">{STATUS_HE[p.status] ?? p.status}</span>
          </div>
          <p className="text-muted mt-1 text-[12px]">
            {[p.brandNetwork, p.city, p.phone].filter(Boolean).join(" · ") || "—"}
          </p>
          {(p.website || p.email) && (
            <p className="mt-1 flex flex-wrap gap-3 text-[12px]" dir="ltr">
              {p.website && <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="text-brand-strong">{p.website}</a>}
              {p.email && <span className="text-muted">{p.email}</span>}
            </p>
          )}
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="סוכנים" value={p.stats.agentCount} tone="green" />
        <Stat label="נכסים" value={p.stats.listingCount} tone="green" />
        <Stat label="ערים" value={p.stats.cities.length} />
        <Stat label="מקורות" value={p.stats.sources.length} />
        <Stat label="ביטחון" value={`${Math.round(p.confidenceScore)}%`} />
        <Stat label="איכות דאטה" value={`${Math.round(p.dataQualityScore)}%`} />
      </div>

      {(p.stats.cities.length > 0 || p.stats.sources.length > 0) && (
        <div className="border-line bg-card flex flex-wrap gap-1.5 rounded-2xl border p-3 text-[11px]">
          {p.stats.cities.map((c) => <span key={`c-${c}`} className="bg-surface text-muted rounded-full px-2 py-0.5 font-bold">{c}</span>)}
          {p.stats.sources.map((src) => <span key={`s-${src}`} className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{src}</span>)}
        </div>
      )}

      {/* Agents */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">סוכני המשרד ({fmt(p.agents.length)})</h2>
        {p.agents.length === 0 ? <p className="text-muted text-xs">אין סוכנים משויכים עדיין.</p> : (
          <div className="flex flex-col gap-1.5">
            {p.agents.map((a) => (
              <Link key={a.id} href={`/broker-intelligence/${a.id}`}
                className="border-line bg-surface hover:border-brand/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors">
                <span className="text-ink truncate font-bold">
                  {a.fullName}
                  <span className="text-muted font-normal"> · {a.city ?? "—"}{a.phone ? ` · ${a.phone}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="text-muted">{fmt(a.listingCount)} נכסים</span>
                  <span className="bg-surface rounded-full px-2 py-0.5 font-bold tabular-nums">{Math.round(a.confidenceScore)}%</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Listings / properties */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">נכסי המשרד ({fmt(p.stats.listingCount)})</h2>
        {p.listings.length === 0 ? <p className="text-muted text-xs">אין נכסים מקושרים עדיין.</p> : (
          <div className="flex flex-col gap-1.5">
            {p.listings.map((l) => (
              <div key={l.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="text-ink truncate font-bold">{l.title ?? "מודעה"}</div>
                  <div className="text-muted truncate text-[11px]">{[l.neighborhood, l.city, l.source].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="text-ink font-bold tabular-nums">{fmtPrice(l.price)}</span>
                  {l.listingUrl && <a href={l.listingUrl} target="_blank" rel="noreferrer" className="text-brand-strong font-bold">↗</a>}
                </div>
              </div>
            ))}
          </div>
        )}
        {p.stats.listingCount > p.listings.length && (
          <p className="text-muted mt-2 text-[11px]">מוצגים {fmt(p.listings.length)} מתוך {fmt(p.stats.listingCount)} נכסים.</p>
        )}
      </section>
    </div>
  );
}
