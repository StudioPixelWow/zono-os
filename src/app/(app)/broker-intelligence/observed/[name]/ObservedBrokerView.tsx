// ============================================================================
// Observed-broker detail view. Rich, experiential (photo listing cards) — the
// same visual language as the Office Detail page — but built strictly from
// OBSERVED evidence. Every number is a real count; nothing asserts sales or
// performance. RTL throughout.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { resolvePropertyTypeLabel } from "@/lib/property-marketing/presentation";
import type { ObservedBrokerDetail, ObservedBrokerListing } from "@/lib/broker-intel/service";

const priceShort = (p: number | null) =>
  p == null || p <= 0 ? "—" : p >= 1_000_000 ? `₪${(p / 1_000_000).toFixed(1)}M` : p >= 1000 ? `₪${Math.round(p / 1000)}K` : `₪${p}`;
function dateHe(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function ObservedBrokerView({ detail }: { detail: ObservedBrokerDetail }) {
  const d = detail;
  const dealLabel = (t: string) => (t === "rent" ? "השכרה" : t === "sale" ? "מכירה" : t);
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* Header */}
      <section className="border-line bg-card relative overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,var(--brand-soft,#efe7ff)_0%,transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="bg-brand text-white grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black shadow-[0_10px_28px_-10px_rgba(109,40,217,.6)]">
              {d.name.trim().charAt(0) || "מ"}
            </span>
            <div>
              <p className="text-brand text-[11px] font-black">מתווך · מלאי נצפה</p>
              <h1 className="text-ink text-2xl font-black tracking-tight">{d.name}</h1>
              <p className="text-muted mt-0.5 text-xs">
                נצפה לראשונה {dateHe(d.firstObserved)} · לאחרונה {dateHe(d.lastObserved)}
              </p>
            </div>
          </div>
          <Link href="/broker-intelligence" className="text-muted hover:text-ink text-sm font-bold">→ חזרה לזירה</Link>
        </div>

        {/* KPIs */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="מלאי נצפה" value={String(d.observedInventory)} icon="Building2" />
          <Kpi label="חדשים ב-30 יום" value={String(d.new30d)} icon="Sparkles" />
          <Kpi label="אזורי פעילות" value={String(d.neighborhoods)} icon="Map" />
          <Kpi label="מחיר ממוצע" value={priceShort(d.avgPrice)} icon="Tag" />
        </div>

        {/* Price band + contact */}
        <div className="relative mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          {(d.minPrice || d.maxPrice) && (
            <span className="text-muted">
              טווח מחירים: <span className="text-ink font-bold tabular-nums">{priceShort(d.minPrice)}–{priceShort(d.maxPrice)}</span>
              {d.medianPrice != null && <> · חציון <span className="text-ink font-bold tabular-nums">{priceShort(d.medianPrice)}</span></>}
            </span>
          )}
          {d.contactPhones.length > 0 && (
            <span className="text-muted">טלפון נצפה: <span className="text-ink font-bold tabular-nums" dir="ltr">{d.contactPhones.join(" · ")}</span></span>
          )}
          <span className="text-muted">על המפה: <span className="text-ink font-bold tabular-nums">{d.geocodedPct}%</span></span>
        </div>
      </section>

      {/* Territory + property mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-ink mb-3 text-base font-black">אזורי הפעילות</h2>
          {d.areas.length === 0 ? <Empty /> : (
            <div className="flex flex-col gap-2">
              {d.areas.map((a) => {
                const max = d.areas[0]?.count || 1;
                return (
                  <div key={a.name}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="text-ink font-bold">{a.name}</span>
                      <span className="text-muted tabular-nums">{a.count} מודעות</span>
                    </div>
                    <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
                      <div className="bg-brand h-full rounded-full" style={{ width: `${(a.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border-line bg-card rounded-2xl border p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-ink mb-3 text-base font-black">תמהיל הנכסים</h2>
          {d.propertyTypes.length === 0 ? <Empty /> : (
            <div className="flex flex-wrap gap-2">
              {d.propertyTypes.map((t) => (
                <span key={t.type} className="bg-brand-soft text-brand-strong rounded-lg px-3 py-1.5 text-xs font-bold">
                  {resolvePropertyTypeLabel(t.type)} · {t.count}
                </span>
              ))}
            </div>
          )}
          {d.dealTypes.length > 0 && (
            <div className="mt-4">
              <p className="text-muted mb-1.5 text-[11px] font-bold">סוגי עסקה</p>
              <div className="flex flex-wrap gap-2">
                {d.dealTypes.map((t) => (
                  <span key={t.type} className="bg-surface text-ink rounded-lg px-3 py-1.5 text-xs font-bold">{dealLabel(t.type)} · {t.count}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Listings */}
      <section className="border-line bg-card rounded-2xl border p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-ink text-base font-black sm:text-lg">הנכסים של {d.name}</h2>
            <p className="text-muted mt-0.5 text-xs">מלאי נצפה · {d.listings.length} מודעות מוצגות</p>
          </div>
        </div>
        {d.listings.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.listings.map((l) => <ListingCard key={l.id} l={l} />)}
          </div>
        )}
      </section>

      <p className="text-muted/80 px-1 text-[10.5px]">
        מבוסס על המלאי הנצפה בלבד (מודעות חיצוניות + זיהוי מתווך), org-scoped. אין מיזוג אוטומטי של וריאציות כתיב לשם המתווך, ואין כאן נתוני מכירות או ביצועים — רק נוכחות ופעילות שנצפו.
      </p>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="border-line bg-surface/50 rounded-2xl border p-3.5">
      <div className="text-brand-strong mb-1"><Icon name={icon} size={18} /></div>
      <div className="text-ink text-xl font-black tabular-nums">{value}</div>
      <div className="text-muted text-[11px] font-bold">{label}</div>
    </div>
  );
}

function Empty() { return <p className="text-muted text-sm">אין עדיין מלאי נצפה עבור מתווך זה בטווח הנוכחי.</p>; }

function ListingCard({ l }: { l: ObservedBrokerListing }) {
  const cls = "group border-line bg-card hover:border-brand-light block overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] transition hover:-translate-y-0.5";
  const body = (
    <>
      <div className="bg-surface relative aspect-[4/3] w-full overflow-hidden">
        {l.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external scraped photo host; next/image domain allowlist not configured for it
          <img src={l.image} alt={l.title ?? "נכס"} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
        ) : (
          <div className="from-brand-soft to-surface text-brand-strong/40 grid h-full w-full place-items-center bg-gradient-to-br"><Icon name="Building2" size={40} /></div>
        )}
        {l.price != null && <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-2.5 py-1 text-sm font-black text-white backdrop-blur-sm">{priceShort(l.price)}</span>}
        {l.propertyType && <span className="bg-card/90 text-ink absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10.5px] font-bold backdrop-blur-sm">{resolvePropertyTypeLabel(l.propertyType)}</span>}
      </div>
      <div className="p-3">
        <div className="text-ink line-clamp-1 text-[13.5px] font-bold">{l.title ?? "מודעה"}</div>
        <div className="text-muted mt-0.5 line-clamp-1 text-[12px]">{l.address ?? l.neighborhood ?? l.city ?? "—"}</div>
        <div className="text-muted mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] tabular-nums">
          {l.rooms != null && <span className="bg-surface rounded px-1.5 py-0.5">{l.rooms} חד׳</span>}
          {l.sqm != null && <span className="bg-surface rounded px-1.5 py-0.5">{l.sqm} מ״ר</span>}
          {l.neighborhood && <span className="text-muted truncate">{l.neighborhood}</span>}
        </div>
      </div>
    </>
  );
  // Prefer the in-app listing page; fall back to the external source URL.
  return (
    <Link href={`/external-listings/${l.id}`} className={cls}>{body}</Link>
  );
}
