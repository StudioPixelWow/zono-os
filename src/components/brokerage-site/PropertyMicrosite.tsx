/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would need remotePatterns */
// ============================================================================
// 🏛️ ZONO Website Design System™ — PropertyMicrosite (shared, server-safe).
// A LUXURY property microsite — one home, one campaign — rendered by BOTH the
// office (/ai-site) and agent (/ai-agent) property routes (no duplication):
//   premium header (office brand-mark + attribution + back + contact) →
//   cinematic hero (image + price/location + facts) → key-facts grid → one
//   accent intelligence language (no rainbow) → why-this-property → gallery
//   (graceful luxury fallback) → neighborhood → similar (shared luxury card) →
//   Ask-about-property → office/agent contact (brand-mark) → sticky mobile CTA.
// Public-safe only: consumes the already-redacted PropertyAI view model.
// ============================================================================
import type { PropertyAI } from "@/lib/brokerage-site/types";
import { Glass, PropertyCard } from "./ui";
import AskWidget from "./AskWidget";
import { OfficeBrandMark } from "../site-ui/OfficeBrandMark";

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);
const TRUST_HE = { verified: "מאומת ✓", reviewed: "נבדק", listed: "רשום" } as const;
const DEMAND_HE = { high: "ביקוש גבוה", medium: "ביקוש בינוני", low: "ביקוש נמוך" } as const;
const POS_HE = { below: "מתחת לשוק", within: "בטווח השוק", above: "מעל השוק", unknown: "—" } as const;
const STATUS_HE: Record<string, string> = { active: "למכירה", published: "למכירה", under_offer: "בהצעה", sold: "נמכר", reserved: "בהמתנה", draft: "בהכנה" };
const GRADIENT = "var(--site-gradient, linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%))";
const ACCENT = "var(--site-accent, #7c3aed)";

function LuxuryFallback() {
  return (
    <div className="absolute inset-0" style={{ background: GRADIENT }} aria-hidden>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 80% 0%, rgba(255,255,255,0.28), transparent 55%)" }} />
      <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <g fill="rgba(255,255,255,0.16)"><rect x="24" y="66" width="40" height="70" rx="3" /><rect x="72" y="44" width="52" height="92" rx="3" /><rect x="132" y="78" width="40" height="58" rx="3" /></g>
      </svg>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card/90 border-line rounded-2xl border px-4 py-3 text-center shadow-[var(--shadow-card)] backdrop-blur-sm">
      <div className="text-lg font-black" style={{ color: ACCENT }}>{value}</div>
      <div className="text-muted mt-0.5 text-[11px] font-bold">{label}</div>
    </div>
  );
}

export function PropertyMicrosite({
  property: p, slug, base, contactName, whatsapp, phone, calendarLink = null,
  attribution = null, askApiBase, askTitle, areaBase, logo = null, backHref,
}: {
  property: PropertyAI; slug: string; base: "ai-site" | "ai-agent";
  contactName: string; whatsapp: string | null; phone: string | null; calendarLink?: string | null;
  attribution?: string | null; askApiBase?: "site-ai" | "agent-site"; askTitle?: string;
  areaBase: "neighborhood" | "area";
  /** Office logo — integrated in the header, contact block and footer via OfficeBrandMark. */
  logo?: string | null;
  /** Back-to-listings target. Defaults to the site home. */
  backHref?: string;
}) {
  const b = p.badges;
  const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const facts = [
    p.rooms != null ? { label: "חדרים", value: String(p.rooms) } : null,
    p.area != null ? { label: "מ״ר", value: String(p.area) } : null,
    p.type ? { label: "סוג", value: p.type } : null,
    p.status ? { label: "סטטוס", value: STATUS_HE[p.status] ?? p.status } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const waText = encodeURIComponent(`היי, מתעניין/ת בנכס: ${p.title}${loc ? ` (${loc})` : ""}`);
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${waText}` : null;
  const areaHref = p.neighborhood ? `/${base}/${slug}/${areaBase}/${encodeURIComponent(p.neighborhood)}` : null;
  const listingsHref = backHref ?? `/${base}/${slug}`;

  return (
    <div dir="rtl">
      {/* ── Premium header — office brand-mark + attribution + back + contact ── */}
      <header className="zono-glass sticky top-0 z-40 border-b border-white/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <OfficeBrandMark name={contactName} logo={logo} href={listingsHref} variant="lockup" surface="light" size="sm" />
          <div className="flex items-center gap-2">
            <a href={listingsHref} className="text-muted hover:text-ink hidden text-[13px] font-bold sm:inline">← חזרה לנכסים</a>
            {waHref
              ? <a href={waHref} target="_blank" rel="noopener" className="bg-success rounded-xl px-3.5 py-2 text-[12px] font-black text-white shadow-[var(--shadow-soft)]">תיאום ביקור</a>
              : phone && <a href={`tel:${phone}`} className="btn-zono-primary rounded-xl px-3.5 py-2 text-[12px] font-black text-white">חייגו</a>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:px-6 sm:py-8">
        {attribution && <p className="text-muted mb-3 text-[12px] font-semibold">{attribution}</p>}

        {/* ── Cinematic hero — image with price/location overlay ── */}
        <section className="relative overflow-hidden rounded-[28px] shadow-[var(--shadow-lift)]">
          <div className="relative aspect-[4/5] w-full sm:aspect-[16/9]">
            {p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <LuxuryFallback />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4 sm:p-5">
              {p.status && <span className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-black shadow-sm backdrop-blur-sm" style={{ color: ACCENT }}>{STATUS_HE[p.status] ?? p.status}</span>}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
              <h1 className="max-w-3xl text-2xl font-black leading-tight drop-shadow-sm sm:text-5xl">{p.title}</h1>
              {loc && <p className="mt-1.5 text-[14px] font-semibold text-white/85 sm:text-base">📍 {loc}</p>}
              <div className="mt-3 inline-flex items-baseline gap-2 rounded-2xl bg-white/95 px-4 py-2 shadow-lg">
                {fmt(p.price) ? <span className="text-2xl font-black sm:text-3xl" style={{ color: ACCENT }}>{fmt(p.price)}</span> : <span className="text-lg font-black text-slate-500">מחיר לפי פנייה</span>}
              </div>
            </div>
          </div>
        </section>

        {/* ── Key facts grid ── */}
        {facts.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {facts.map((f) => <Fact key={f.label} label={f.label} value={f.value} />)}
          </div>
        )}

        {/* ── AI intelligence — one accent language (no rainbow), public-safe ── */}
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <span className="bg-success-soft text-success rounded-full px-3 py-1 font-bold">{TRUST_HE[b.trust]}</span>
          <span className="border-line bg-card text-ink inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-bold"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />{DEMAND_HE[b.demand]}</span>
          {b.marketScore != null && <span className="border-line bg-card text-ink rounded-full border px-3 py-1 font-bold">ביצועי שוק {b.marketScore}/100</span>}
          {b.pricePosition !== "unknown" && <span className="border-line bg-card text-ink rounded-full border px-3 py-1 font-bold">מחיר {POS_HE[b.pricePosition]}{b.priceGapPct != null ? ` (${b.priceGapPct > 0 ? "+" : ""}${b.priceGapPct}%)` : ""}</span>}
          {b.matchingBuyers > 0 && <span className="rounded-full px-3 py-1 font-bold text-white" style={{ background: GRADIENT }}>{b.matchingBuyers} קונים מתאימים</span>}
          {b.domBand === "fast" && <span className="border-line bg-card text-ink rounded-full border px-3 py-1 font-bold">קצב מכירה מהיר</span>}
          {b.strategyLabel && <span className="bg-surface text-muted rounded-full px-3 py-1 font-bold">{b.strategyLabel}</span>}
        </div>

        {/* ── Why this property — AI summary + highlights ── */}
        <Glass className="mt-5 p-5 sm:p-6">
          <h2 className="text-ink text-lg font-black">✨ למה הנכס הזה</h2>
          <p className="text-muted mt-1.5 text-[14px] leading-relaxed">{p.aiSummary}</p>
          {p.highlights.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {p.highlights.map((h, i) => (
                <li key={i} className="bg-card/70 border-line text-ink flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold"><span style={{ color: ACCENT }}>◆</span> {h}</li>
              ))}
            </ul>
          )}
        </Glass>

        {/* ── Gallery (premium fallback if thin) ── */}
        <section className="mt-6">
          <h2 className="text-ink mb-3 text-lg font-black">גלריה</h2>
          {p.gallery.length > 1 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {p.gallery.slice(0, 9).map((g, i) => (
                <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-2xl">
                  <img src={g} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                </div>
              ))}
            </div>
          ) : (
            <Glass className="p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-2xl text-white shadow-[var(--shadow-soft)]" style={{ background: GRADIENT }}>📷</div>
              <p className="text-ink mt-3 font-black">הגלריה המלאה בדרך</p>
              <p className="text-muted mt-1 text-sm">רוצים לראות תמונות נוספות של הנכס? צרו קשר ונשמח לשלוח.</p>
            </Glass>
          )}
        </section>

        {/* ── Neighborhood context ── */}
        {areaHref && (
          <a href={areaHref} className="border-line bg-card hover:border-brand-light mt-6 flex items-center justify-between gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)] transition">
            <div>
              <p className="text-muted text-[12px] font-bold">מדריך שכונה</p>
              <p className="text-ink text-lg font-black">🗺️ {p.neighborhood}{p.city ? ` · ${p.city}` : ""}</p>
              <p className="text-muted mt-0.5 text-[13px]">נתוני שוק, עסקאות ונכסים נוספים באזור</p>
            </div>
            <span className="shrink-0 text-2xl font-black" style={{ color: ACCENT }}>←</span>
          </a>
        )}

        {/* ── Similar properties (shared luxury card) ── */}
        {p.related.length > 0 && (
          <section className="mt-8">
            <h2 className="text-ink mb-3 text-xl font-black">נכסים דומים</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.related.map((x) => <PropertyCard key={x.id} slug={slug} id={x.id} title={x.title} price={x.price} image={x.image} base={base} />)}
            </div>
          </section>
        )}

        {/* ── Ask about this property ── */}
        <section className="mt-8">
          <AskWidget slug={slug} office={contactName} apiBase={askApiBase} title={askTitle ?? "שאל על הנכס"} suggestions={[`ספר לי עוד על ${p.title}`, "מה יש בסביבה?", "האם המחיר תחרותי?", "אפשר לתאם ביקור?"]} />
        </section>

        {/* ── Agent / office contact — office brand-mark + the obvious next step ── */}
        {(whatsapp || phone) && (
          <section className="relative mt-8 overflow-hidden rounded-[24px] p-6 text-white shadow-[var(--shadow-lift)] sm:p-7" style={{ background: GRADIENT }}>
            <div className="pointer-events-none absolute -left-14 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <OfficeBrandMark name={contactName} logo={logo} surface="dark" size="md" className="mb-3" />
                <p className="text-xl font-black">תיאום ביקור עם {contactName}</p>
                <p className="mt-0.5 text-[13px] text-white/80">תשובה מהירה · ליווי אישי לאורך כל הדרך</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {waHref && <a href={waHref} target="_blank" rel="noopener" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#1a1236] shadow-lg transition hover:-translate-y-0.5 sm:flex-none">💬 תיאום ביקור</a>}
                {phone && <a href={`tel:${phone}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/15 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/25 sm:flex-none">📞 חייגו</a>}
                {calendarLink && <a href={calendarLink} target="_blank" rel="noopener" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/15 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/25 sm:flex-none">📅 פגישה</a>}
              </div>
            </div>
          </section>
        )}

        {/* ── Footer — office brand-mark + subtle Powered by ZONO ── */}
        <footer className="border-line mt-10 flex flex-col items-center gap-2 border-t pt-6 text-center">
          <OfficeBrandMark name={contactName} logo={logo} href={listingsHref} variant="lockup" surface="light" size="sm" />
          <span className="text-muted/70 text-[10.5px] font-semibold tracking-wide">Powered by ZONO</span>
        </footer>
      </main>

      {/* ── Sticky mobile CTA — WhatsApp / call / schedule ── */}
      {(whatsapp || phone) && (
        <div className="zono-glass fixed inset-x-0 bottom-0 z-50 border-t border-white/40 p-2.5 sm:hidden" style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-5xl gap-2">
            {waHref && <a href={waHref} target="_blank" rel="noopener" className="bg-success flex flex-1 items-center justify-center rounded-xl py-3 text-[14px] font-black text-white">💬 תיאום ביקור</a>}
            {phone && <a href={`tel:${phone}`} className="btn-zono-primary flex flex-1 items-center justify-center rounded-xl py-3 text-[14px] font-black text-white">📞 חייגו</a>}
          </div>
        </div>
      )}
    </div>
  );
}
