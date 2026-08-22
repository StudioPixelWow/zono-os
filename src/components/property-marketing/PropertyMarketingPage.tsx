// ============================================================================
// ZONO Property Marketing Page — the ONE canonical engine (server component).
// STRUCTURE = ZONO · BRAND = office · PERSON = listing agent · CONTENT = property
// · CONVERSION = attributed lead. Reuses the office/agent brand engine + cards +
// map. Every section render/fallback/hide by data (§35). Property photography leads.
// ============================================================================
import Link from "next/link";
import type { PropertyMarketingPayload } from "@/lib/property-marketing/data";
import { money, SectionShell } from "@/components/agent-website/ui";
import { OfficePropertyCard } from "@/components/office-website/ui";
import { PropertyGallery } from "./PropertyGallery";
import { PropertyLeadForm } from "./PropertyLeadForm";
import { PropertyShare } from "./PropertyShare";
import { PropertyMap } from "./PropertyMap";
import { resolvePropertyTypeLabel } from "@/lib/property-marketing/presentation";

export function PropertyMarketingPage({ data }: { data: PropertyMarketingPayload }) {
  const d = data; const A = d.agent;
  const priceLabel = d.listingKind === "rent" ? (money(d.price ?? null) ? `${money(d.price)} / חודש` : null) : money(d.price);
  const specs = [
    d.rooms != null ? { v: `${d.rooms}`, l: "חדרים" } : null,
    d.sizeSqm != null ? { v: `${d.sizeSqm}`, l: "מ״ר" } : null,
    d.floor != null ? { v: `${d.floor}${d.totalFloors ? `/${d.totalFloors}` : ""}`, l: "קומה" } : null,
  ].filter(Boolean) as { v: string; l: string }[];

  return (
    <div id="top" dir="rtl" style={{ ...(d.brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] pb-[84px] text-[var(--brand-text)] antialiased sm:pb-[76px]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-[var(--brand-background)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          {d.brand.logo ? <img src={d.brand.logo} alt={d.office.name} className="h-9 w-auto max-w-[150px] object-contain" /> : <span className="text-lg font-black text-[var(--brand-text)]">{d.office.name}</span>}
          <div className="flex items-center gap-2">
            <PropertyShare title={d.title} />
            {A?.whatsapp && <a href={A.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[13px] font-bold text-[var(--brand-on-primary)]">WhatsApp</a>}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="relative h-[52vh] min-h-[360px] w-full overflow-hidden bg-[var(--brand-surface)] lg:h-[64vh]">
          {d.media.images[0] && <img src={d.media.images[0]} alt={d.title} className="h-full w-full object-cover" />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </div>
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <div className="relative z-10 mx-auto -mt-28 w-full max-w-3xl overflow-hidden rounded-[28px] border border-[var(--brand-border)] bg-[var(--brand-background)]/95 p-7 text-center shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:-mt-32 sm:p-10">
            {d.statusLabel && <span className="inline-block rounded-full bg-[var(--brand-primary)] px-4 py-1.5 text-[13px] font-bold tracking-wide text-[var(--brand-on-primary)]">{d.statusLabel}</span>}
            <h1 className="mt-4 text-[34px] font-black leading-[1.05] tracking-tight text-[var(--brand-text)] sm:text-[52px]">{d.title}</h1>
            <p className="mt-3 text-[16px] text-[var(--brand-muted)]">{d.address.display}{!d.address.exact && " (אזור)"}</p>
            {priceLabel && (
              <div className="mt-5 flex items-baseline justify-center gap-3">
                <span className="text-[44px] font-black leading-none text-[color:var(--brand-link)] sm:text-[56px]">{priceLabel}</span>
                {d.priceBefore && d.price && d.priceBefore > d.price && <span className="text-[17px] text-[var(--brand-muted)] line-through">{money(d.priceBefore)}</span>}
              </div>
            )}
            {specs.length > 0 && (
              <div className="mx-auto mt-7 flex max-w-lg flex-wrap items-stretch justify-center divide-x divide-x-reverse divide-[var(--brand-border)] border-t border-[var(--brand-border)] pt-6">
                {specs.map((s, i) => <div key={i} className="px-7 first:pr-0"><div className="text-[30px] font-black leading-none text-[var(--brand-text)]">{s.v}</div><div className="mt-1.5 text-[13px] font-semibold text-[var(--brand-muted)]">{s.l}</div></div>)}
              </div>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="#contact" className="rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[16px] font-black text-[var(--brand-on-primary)] shadow-lg shadow-[color:var(--brand-primary)]/20 transition hover:bg-[color:var(--brand-primary-hover)]">לתיאום ביקור בנכס</a>
              {A?.whatsapp && <a href={`${A.whatsapp}?text=${encodeURIComponent(d.shareText)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[var(--brand-border)] px-8 py-4 text-[16px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">שלחו הודעה</a>}
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      {d.media.images.length > 1 && <div className="py-12"><PropertyGallery images={d.media.images} title={d.title} /></div>}

      {/* OVERVIEW — editorial story + high-impact facts (large numbers, not a table) */}
      <SectionShell id="about" title="על הנכס">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_1fr]">
          <div className="text-[18px] leading-[1.85] text-[var(--brand-text)] whitespace-pre-line">{d.description || `${resolvePropertyTypeLabel(d.type)}${d.rooms ? ` · ${d.rooms} חדרים` : ""}${d.address.area ? ` · ${d.address.area}` : ""}.`}</div>
          <div className="rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-7 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.3)]">
            <h3 className="mb-5 text-[16px] font-black text-[var(--brand-text)]">פרטי הנכס</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-6">
              {[
                ["סוג נכס", resolvePropertyTypeLabel(d.type)],
                d.rooms != null ? ["חדרים", `${d.rooms}`] : null,
                d.sizeSqm != null ? ["שטח", `${d.sizeSqm} מ״ר`] : null,
                d.outdoorSqm ? ["שטח חוץ", `${d.outdoorSqm} מ״ר`] : null,
                d.floor != null ? ["קומה", `${d.floor}${d.totalFloors ? ` מתוך ${d.totalFloors}` : ""}`] : null,
                d.availabilityDate ? ["כניסה", d.availabilityDate] : null,
                d.pricePerSqm ? ["מחיר למ״ר", money(d.pricePerSqm) ?? "—"] : null,
              ].filter(Boolean).map((r, i) => { const [k, v] = r as [string, string]; return <div key={i}><div className="text-[22px] font-black leading-tight text-[var(--brand-text)]">{v}</div><div className="mt-0.5 text-[13px] font-semibold text-[var(--brand-muted)]">{k}</div></div>; })}
            </div>
          </div>
        </div>
      </SectionShell>

      {/* FEATURES */}
      {d.features.length > 0 && (
        <SectionShell title="מאפייני הנכס" tone="surface">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {d.features.map((f, i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-5 py-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)]"><FeatIcon name={f.icon} /></span>
                <span className="text-[16px] font-bold text-[var(--brand-text)]">{f.label}</span>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {/* FLOOR PLAN / VIDEO / 360 */}
      {(d.media.floorPlan || d.media.video || d.media.tour360) && (
        <SectionShell title="מדיה נוספת">
          <div className="grid gap-6 lg:grid-cols-2">
            {d.media.floorPlan && <figure><figcaption className="mb-2 text-[14px] font-bold text-[var(--brand-text)]">תוכנית הנכס</figcaption><a href={d.media.floorPlan} target="_blank" rel="noopener noreferrer"><img src={d.media.floorPlan} alt="תוכנית הנכס" className="w-full rounded-2xl border border-[var(--brand-border)] object-contain" /></a></figure>}
            {d.media.video && <figure><figcaption className="mb-2 text-[14px] font-bold text-[var(--brand-text)]">סרטון הנכס</figcaption><video src={d.media.video} controls preload="none" className="w-full rounded-2xl border border-[var(--brand-border)]" /></figure>}
            {d.media.tour360 && <a href={d.media.tour360} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-[15px] font-bold text-[color:var(--brand-link)]">סיור וירטואלי 360° ←</a>}
          </div>
        </SectionShell>
      )}

      {/* LOCATION */}
      <SectionShell id="location" title="מיקום וסביבה" subtitle={d.address.exact ? undefined : "מיקום מקורב — הכתובת המדויקת תימסר בפנייה"}>
        <PropertyMap lat={d.address.lat} lng={d.address.lng} exact={d.address.exact} area={d.address.area} title={d.title} />
      </SectionShell>

      {/* LISTING AGENT + testimonials */}
      {A && (
        <SectionShell tone="surface">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex items-center gap-6 rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-background)] p-7 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.3)]">
              {A.photo ? <img src={A.photo} alt={A.name} className="h-32 w-32 shrink-0 rounded-[22px] object-cover object-top sm:h-36 sm:w-36" /> : <div className="grid h-32 w-32 shrink-0 place-items-center rounded-[22px] bg-[var(--brand-soft)] text-5xl font-black text-[color:var(--brand-primary)] sm:h-36 sm:w-36">{A.name.slice(0, 1)}</div>}
              <div>
                <div className="text-[13px] font-bold text-[color:var(--brand-link)]">הסוכן שמלווה את הנכס</div>
                <div className="mt-1 text-[24px] font-black leading-tight text-[var(--brand-text)]">{A.name}</div>
                {A.title && <div className="text-[15px] font-semibold text-[color:var(--brand-link)]">{A.title}</div>}
                <div className="mt-0.5 text-[14px] text-[var(--brand-muted)]">{d.office.name}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {A.whatsapp && <a href={`${A.whatsapp}?text=${encodeURIComponent(d.shareText)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-primary)] px-5 py-2.5 text-[14px] font-black text-[var(--brand-on-primary)]">דברו איתי</a>}
                  {A.tel && <a href={A.tel} className="rounded-xl border border-[var(--brand-border)] px-5 py-2.5 text-[14px] font-bold text-[var(--brand-text)]">התקשרו</a>}
                  {A.href && <Link href={A.href} className="rounded-xl border border-[var(--brand-border)] px-5 py-2.5 text-[14px] font-bold text-[var(--brand-text)]">לכל הנכסים שלי</Link>}
                </div>
              </div>
            </div>
            {d.testimonials.length > 0 && (
              <div>
                <h3 className="mb-3 text-[16px] font-black text-[var(--brand-text)]">לקוחות ממליצים על {A.name.split(" ")[0]}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {d.testimonials.map((t, i) => (
                    <figure key={i} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5">
                      {t.rating ? <div className="text-[color:var(--brand-accent)]">{"★".repeat(Math.max(1, Math.min(5, Math.round(t.rating))))}</div> : null}
                      <blockquote className="mt-2 text-[14px] leading-relaxed text-[var(--brand-text)]">{t.text}</blockquote>
                      <figcaption className="mt-3 text-[12px] font-bold text-[var(--brand-muted)]">{t.name}{t.area ? ` · ${t.area}` : ""}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionShell>
      )}

      {/* LEAD CAPTURE */}
      <section id="contact" className="bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-[32px] font-black leading-[1.05] tracking-tight sm:text-[46px]">מעוניינים לראות את הנכס?</h2>
            <p className="mt-4 text-[18px] opacity-90">השאירו פרטים ו{A ? A.name.split(" ")[0] : "הסוכן"} יחזור אליכם לתיאום ביקור.</p>
            {A?.whatsapp && <a href={`${A.whatsapp}?text=${encodeURIComponent(d.shareText)}`} target="_blank" rel="noopener noreferrer" className="mt-7 inline-block rounded-xl bg-[var(--brand-background)] px-7 py-4 text-[16px] font-black text-[color:var(--brand-primary)]">שלחו הודעת WhatsApp</a>}
          </div>
          <div className="rounded-[24px] bg-[var(--brand-background)] p-7 text-[var(--brand-text)] shadow-2xl sm:p-8">
            <h3 className="mb-4 text-[20px] font-black">השאירו פרטים</h3>
            <PropertyLeadForm propertyId={d.id} />
          </div>
        </div>
      </section>

      {/* RELATED */}
      {d.related.length > 0 && (
        <SectionShell title="נכסים נוספים שעשויים להתאים לכם">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{d.related.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        </SectionShell>
      )}

      {/* FOOTER */}
      <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 py-8 text-[13px] text-[var(--brand-muted)] sm:flex-row sm:px-8">
          <div className="flex items-center gap-3">
            {d.brand.logo && <img src={d.brand.logo} alt={d.office.name} className="h-8 w-auto max-w-[120px] object-contain" />}
            <span className="font-black text-[var(--brand-text)]">{d.office.name}</span>
          </div>
          <Link href="/" className="opacity-70 transition hover:opacity-100">מופעל על ידי ZONO</Link>
        </div>
      </footer>

      {/* STICKY AGENT BAR — fixed across the bottom, desktop + mobile */}
      <PropertyAgentBar data={d} />
    </div>
  );
}

function PropertyAgentBar({ data: d }: { data: PropertyMarketingPayload }) {
  const A = d.agent;
  const tel = A?.tel ?? (d.office.phone ? `tel:${d.office.phone.replace(/[^0-9+]/g, "")}` : null);
  const whatsapp = A?.whatsapp ? `${A.whatsapp}?text=${encodeURIComponent(d.shareText)}` : null;
  const name = A?.name ?? d.office.name;
  const subtitle = A?.title || d.office.name;
  const initial = name.slice(0, 1);
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--brand-border)] bg-[var(--brand-background)]/95 backdrop-blur-xl shadow-[0_-12px_40px_-24px_rgba(15,23,42,0.5)]">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {A?.photo ? (
            <img src={A.photo} alt={name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-[var(--brand-soft)] sm:h-12 sm:w-12" />
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[17px] font-black text-[color:var(--brand-primary)] sm:h-12 sm:w-12">{initial}</div>
          )}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-black leading-tight text-[var(--brand-text)] sm:text-[15px]">{name}</div>
            <div className="truncate text-[12px] text-[var(--brand-muted)] sm:text-[13px]">{subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[13px] font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)] sm:px-6 sm:text-[14px]">דברו איתי</a>}
          {tel && <a href={tel} className="rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-[13px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)] sm:px-6 sm:text-[14px]">התקשרו</a>}
        </div>
      </div>
    </div>
  );
}

function FeatIcon({ name }: { name: string }) {
  const p: Record<string, string> = {
    car: "M5 13l1-4h12l1 4M5 13h14v4H5zM7 17v1M17 17v1",
    elevator: "M6 3h12v18H6zM9 8l3-3 3 3M9 16l3 3 3-3",
    balcony: "M4 10h16v10H4zM4 10V6h16v4M8 14v3M12 14v3M16 14v3",
    shield: "M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z",
    box: "M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8",
    access: "M12 6a2 2 0 100-4 2 2 0 000 4zm-3 3l3-1 3 1M9 21l3-6 3 6",
    check: "M4 12l5 5L20 6",
    // resolver icons (property features)
    ac: "M4 8h16M4 12h16M7 16c0 1.5 1 2.5 2 3M12 16c0 2-1 3-2 4M17 16c0 1.5-1 2.5-2 3",
    renovated: "M14 6l4 4-9 9-4 1 1-4zM13 7l4 4",
    bars: "M4 4v16M9 4v16M14 4v16M19 4v16",
    door: "M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M6 21h12M14 12h.5",
    kitchen: "M4 3h16v7H4zM4 10v11M20 10v11M8 6h.5M8 14v4M14 14v4",
    bed: "M3 18v-6h18v6M3 12V8a2 2 0 012-2h5v6M21 12v-2a2 2 0 00-2-2h-4",
    view: "M2 20s4-9 10-9 10 9 10 9M12 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
    building: "M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M15 21V9h4a1 1 0 011 1v11M8 7h3M8 11h3M8 15h3",
    sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M6 18l-1.5 1.5M19.5 4.5L18 6M12 8a4 4 0 100 8 4 4 0 000-8z",
  };
  return <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden><path d={p[name] ?? p.check} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
