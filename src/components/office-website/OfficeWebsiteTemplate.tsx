// ============================================================================
// ZONO Office Website — the ONE canonical office template (server component).
// STRUCTURE = ZONO · IDENTITY = office brand · PEOPLE = office agents ·
// CONTENT = live office data. Reuses the agent-site engine (brand tokens, map,
// search, header/footer primitives) and adds the office relationships:
// team, property→agent, testimonial→agent. Every section render/fallback/hide.
// ============================================================================
import Link from "next/link";
import type { OfficeSitePayload } from "@/lib/office-website/site-data";
import { AgentHeader, type HeaderNavItem } from "@/components/agent-website/AgentHeader";
import { PropertySearch } from "@/components/agent-website/PropertySearch";
import { ExpertiseMap } from "@/components/agent-website/ExpertiseMap";
import { MobileStickyCta } from "@/components/agent-website/MobileStickyCta";
import { SectionShell, TextLink, StatStrip, AreaChips } from "@/components/agent-website/ui";
import { OfficePropertyCard, TeamCard, OfficeTestimonialCard } from "./ui";
import { SiteLeadForm } from "@/app/site/[slug]/SiteLeadForm";

const ADVANTAGES: { icon: string; title: string; text: string }[] = [
  { icon: "map", title: "היכרות עמוקה עם האזור", text: "ידע מקומי מדויק שמביא לעסקה הנכונה." },
  { icon: "team", title: "צוות מקצועי", text: "סוכנים מנוסים שמלווים אתכם אישית." },
  { icon: "megaphone", title: "שיווק מתקדם", text: "חשיפה מקסימלית לנכס מול הקהל הנכון." },
  { icon: "scale", title: "משא ומתן מקצועי", text: "מיצוי מלא של תנאי העסקה עבורכם." },
];

export function OfficeWebsiteTemplate({ data }: { data: OfficeSitePayload }) {
  const { office, brand, slug } = data;
  const S = data.sections; const on = (k: string) => S[k] !== false;
  const propertiesHref = `/site/${slug}/properties`;
  const primaryArea = data.areas[0]?.name ?? null;
  const types = Array.from(new Set([...data.featured, ...data.recommended].map((p) => p.type))).filter(Boolean);
  const areaNames = data.areas.map((a) => a.name);

  const nav: HeaderNavItem[] = [
    { href: "#top", label: "דף הבית" },
    { href: "#properties", label: "נכסים" },
    { href: "#areas", label: "אזורי התמחות" },
    ...(data.team.length ? [{ href: "#team", label: "הצוות" }] : []),
    { href: "#about", label: "אודות" },
    ...(data.testimonials.length ? [{ href: "#testimonials", label: "המלצות" }] : []),
    { href: "#contact", label: "צור קשר" },
  ];

  return (
    <div id="top" dir="rtl" style={{ ...(brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)] antialiased">
      <AgentHeader brandName={office.name} logo={brand.logo} nav={nav} whatsapp={office.whatsapp} tel={office.tel} phoneLabel={office.phone} />

      {/* HERO */}
      {on("hero") && <Hero data={data} />}

      {/* PROPERTY SEARCH */}
      <div className="relative z-10"><PropertySearch slug={slug} areas={areaNames} types={types} basePath="/site" /></div>

      {/* FEATURED PROPERTIES (with handling agent) */}
      {on("featured_properties") && data.featured.length > 0 && (
        <SectionShell id="properties" eyebrow="נכסים נבחרים" title="הזדמנויות שלא כדאי לפספס" action={<TextLink href={propertiesHref}>לכל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.featured.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        </SectionShell>
      )}

      {/* TEAM */}
      {on("agents") && data.team.length > 0 && (
        <SectionShell id="team" eyebrow="הצוות" title="הצוות שלנו" subtitle="הכירו את הסוכנים שילוו אתכם לאורך כל הדרך" tone="surface" action={data.team.length > 8 ? <TextLink href={`/site/${slug}/agents`}>לכל הצוות ←</TextLink> : undefined}>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{data.team.slice(0, 8).map((m) => <TeamCard key={m.id} member={m} />)}</div>
        </SectionShell>
      )}

      {/* EXPERTISE MAP + AREAS */}
      {on("market_expertise") && (data.mapPoints.length > 0 || data.areas.length > 0) && (
        <ExpertiseMap points={data.mapPoints} areas={data.areas.map((a) => ({ name: a.name, deals: null, inventory: a.properties }))} primaryArea={primaryArea} propertiesHref={propertiesHref} />
      )}

      {/* STATS */}
      {data.stats.length >= 2 && <SectionShell tone="surface"><StatStrip stats={data.stats} /></SectionShell>}

      {/* WHY THIS OFFICE */}
      {on("why_us") && (
        <SectionShell eyebrow="למה אנחנו" title="למה לעבוד איתנו?" subtitle="ליווי מקצועי, היכרות עמוקה עם השוק המקומי ותוצאות מוכחות.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ADVANTAGES.map((a) => (
              <div key={a.title} className="group rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)] ring-1 ring-[color:var(--brand-primary)]/15 transition group-hover:scale-105"><AdvIcon name={a.icon} /></div>
                <h3 className="text-[16px] font-black text-[var(--brand-text)]">{a.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--brand-muted)]">{a.text}</p>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {/* ABOUT */}
      {(office.description || office.cover) && <About data={data} />}

      {/* TESTIMONIALS (agent-linked) */}
      {on("testimonials") && data.testimonials.length > 0 && (
        <SectionShell id="testimonials" eyebrow="המלצות" title="הלקוחות שלנו מספרים" tone="surface">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.testimonials.slice(0, 6).map((t, i) => <OfficeTestimonialCard key={i} t={t} />)}</div>
        </SectionShell>
      )}

      {/* SECOND PROPERTY DISCOVERY */}
      {data.recommended.length > 0 && (
        <SectionShell title="עוד נכסים שעשויים להתאים לכם" action={<TextLink href={propertiesHref}>לכל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.recommended.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        </SectionShell>
      )}

      {/* CONTACT CTA */}
      {on("contact") && <ContactCta data={data} />}

      {/* FOOTER */}
      <Footer data={data} nav={nav} />
      <MobileStickyCta whatsapp={office.whatsapp} tel={office.tel} />
    </div>
  );
}

function Hero({ data }: { data: OfficeSitePayload }) {
  const { office, brand } = data;
  const title = office.tagline || `${office.name} — הבית שלכם להחלטה נכונה`;
  const hasCover = !!office.cover;
  return (
    <section className="relative isolate overflow-hidden">
      {/* Immersive background — cover photo when available, else a rich brand
          gradient, so the hero always feels premium (never a flat white block). */}
      <div className="absolute inset-0 -z-10">
        {hasCover ? (
          <>
            <img src={office.cover!} alt={office.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
          </>
        ) : (
          <>
            {/* Premium dark, brand-tinted band (works for light brands like gold) */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--brand-hero) 0%, var(--brand-hero-2) 100%)" }} />
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/45" />
            {/* Brand-color glow so the hue is present without washing out the band */}
            <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ background: "var(--brand-primary)" }} />
          </>
        )}
        <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: "radial-gradient(58% 58% at 80% 6%, #fff, transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.6px)", backgroundSize: "24px 24px" }} />
      </div>

      <div className="mx-auto flex min-h-[82vh] w-full max-w-7xl flex-col justify-center gap-6 px-5 py-24 sm:px-8">
        {brand.logo
          ? <img src={brand.logo} alt={office.name} className="mb-2 h-24 w-auto max-w-[300px] self-start rounded-3xl bg-white/95 p-4 object-contain shadow-2xl ring-1 ring-white/40 sm:h-28" />
          : <div className="text-2xl font-black text-white/95">{office.name}</div>}
        <h1 className="max-w-4xl text-4xl font-black leading-[1.05] text-white drop-shadow-sm sm:text-6xl lg:text-7xl">{title}</h1>
        {office.description && <p className="max-w-xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">{office.description}</p>}

        {data.proofPoints.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {data.proofPoints.slice(0, 4).map((pp) => (
              <div key={pp.label} className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black text-[color:var(--brand-primary)] drop-shadow sm:text-3xl">{pp.value}</div>
                <div className="mt-0.5 text-[12.5px] font-semibold text-white/80">{pp.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <a href="#contact" className="rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[15px] font-black text-[color:var(--brand-on-primary)] shadow-2xl transition hover:-translate-y-0.5">דברו איתנו</a>
          <a href="#properties" className="rounded-xl border border-white/40 bg-white/10 px-8 py-4 text-[15px] font-bold text-white backdrop-blur-md transition hover:bg-white/20">צפו בנכסים</a>
          {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/40 bg-white/10 px-8 py-4 text-[15px] font-bold text-white backdrop-blur-md transition hover:bg-white/20">שלחו WhatsApp</a>}
        </div>
      </div>
    </section>
  );
}

function About({ data }: { data: OfficeSitePayload }) {
  const { office } = data;
  return (
    <SectionShell id="about">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="mb-1 text-[13px] font-bold text-[color:var(--brand-link)]">אודות המשרד</div>
          <h2 className="text-2xl font-black text-[var(--brand-text)] sm:text-3xl">{office.name}</h2>
          {office.description
            ? <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>
            : <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">{office.name}{data.areas.length ? ` · פעילים ב${data.areas.slice(0, 3).map((a) => a.name).join(", ")}` : ""}.</p>}
          {data.areas.length > 0 && <div className="mt-5"><AreaChips areas={data.areas.map((a) => a.name)} /></div>}
        </div>
        {office.cover && <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl bg-[var(--brand-soft)]"><img src={office.cover} alt={office.name} className="h-full w-full object-cover" /></div>}
      </div>
    </SectionShell>
  );
}

function ContactCta({ data }: { data: OfficeSitePayload }) {
  const { office, slug } = data;
  const area = data.areas[0]?.name;
  return (
    <section id="contact" className="bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl">{area ? `מחפשים לקנות או למכור נכס ב${area}?` : "מחפשים לקנות או למכור נכס?"}</h2>
          <p className="mt-3 text-[16px] opacity-90">אנחנו כאן בשבילכם — השאירו פרטים ונחזור אליכם.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-6 py-3.5 text-[15px] font-bold text-[color:var(--brand-primary)]">שלחו הודעת WhatsApp</a>}
            {office.tel && <a href={office.tel} className="rounded-xl border border-white/40 px-6 py-3.5 text-[15px] font-bold">התקשרו {office.phone}</a>}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--brand-background)] p-6 text-[var(--brand-text)]">
          <h3 className="mb-4 text-[17px] font-black">השאירו פרטים</h3>
          <SiteLeadForm slug={slug} variant="contact" cta="שליחת פנייה" />
        </div>
      </div>
    </section>
  );
}

function Footer({ data, nav }: { data: OfficeSitePayload; nav: HeaderNavItem[] }) {
  const { office, brand } = data;
  const socials = Object.entries(office.social).filter(([, v]) => typeof v === "string" && v);
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <div>
          {brand.logo ? <img src={brand.logo} alt={office.name} className="mb-3 h-10 w-auto max-w-[160px] object-contain" /> : <div className="mb-3 text-[16px] font-black text-[var(--brand-text)]">{office.name}</div>}
          {office.description && <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>}
          {socials.length > 0 && <div className="mt-4 flex gap-2">{socials.map(([k, v]) => <a key={k} href={v as string} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-muted)] transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-link)]">{k.slice(0, 1).toUpperCase()}</a>)}</div>}
        </div>
        <FooterCol title="ניווט מהיר">{nav.map((n) => <a key={n.href} href={n.href} className="block text-[14px] text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</a>)}</FooterCol>
        {data.areas.length > 0 && <FooterCol title="אזורי פעילות">{data.areas.slice(0, 6).map((a) => <span key={a.name} className="block text-[14px] text-[var(--brand-muted)]">{a.name}</span>)}</FooterCol>}
        <FooterCol title="צור קשר">
          {office.phone && <a href={office.tel ?? undefined} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{office.phone}</a>}
          {office.email && <a href={`mailto:${office.email}`} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{office.email}</a>}
          {office.address && <span className="block text-[14px] text-[var(--brand-muted)]">{office.address}</span>}
        </FooterCol>
      </div>
      <div className="border-t border-[var(--brand-border)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-5 py-5 text-[12px] text-[var(--brand-muted)] sm:flex-row sm:px-8">
          <span>© {office.name} — כל הזכויות שמורות</span>
          <div className="flex items-center gap-4"><span className="opacity-70">פרטיות · נגישות · תקנון</span><Link href="/" className="font-semibold opacity-70 transition hover:opacity-100">מופעל על ידי ZONO</Link></div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-3 text-[14px] font-black text-[var(--brand-text)]">{title}</h4><div className="space-y-2">{children}</div></div>;
}

function AdvIcon({ name }: { name: string }) {
  const p: Record<string, string> = {
    map: "M9 3l6 2 6-2v16l-6 2-6-2-6 2V5l6-2zm0 0v16m6-14v16",
    team: "M17 20v-2a4 4 0 00-3-3.87M9 20v-2a4 4 0 013-3.87M12 7a3 3 0 100-6 3 3 0 000 6zm7 13a3 3 0 00-2-2.8M5 20a3 3 0 012-2.8",
    megaphone: "M3 11v2a1 1 0 001 1h3l4 4V6L7 10H4a1 1 0 00-1 1zm13-3a5 5 0 010 8",
    scale: "M12 3v18M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zm10 0l-3 6a3 3 0 006 0l-3-6z",
  };
  return <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden><path d={p[name] ?? p.map} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
