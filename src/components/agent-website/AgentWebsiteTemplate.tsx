// ============================================================================
// ZONO Agent Website — the ONE canonical template (server component).
// ----------------------------------------------------------------------------
// STRUCTURE = ZONO (fixed grid/hierarchy). IDENTITY = brand tokens + data.
// Every section renders / falls back / hides based on real data (spec §18).
// Consumes the sanitised AgentSitePayload only (no private CRM data).
// ============================================================================
import Link from "next/link";
import type { AgentSitePayload } from "@/lib/agent-website/site-data";
import { AgentHeader, type HeaderNavItem } from "./AgentHeader";
import { PropertySearch } from "./PropertySearch";
import { ExpertiseMap } from "./ExpertiseMap";
import { Testimonials } from "./Testimonials";
import { MobileStickyCta } from "./MobileStickyCta";
import { AgentPropertyCard, SectionShell, TextLink, StatStrip, ProofPoints } from "./ui";
import { AgentLeadForm } from "@/app/agent/[slug]/AgentLeadForm";

const ADVANTAGES: { icon: string; title: string; text: string }[] = [
  { icon: "map", title: "היכרות עמוקה עם האזור", text: "ידע מקומי מדויק שמביא לעסקה הנכונה." },
  { icon: "megaphone", title: "שיווק מתקדם", text: "חשיפה מקסימלית לנכס מול הקהל הנכון." },
  { icon: "handshake", title: "ליווי אישי", text: "זמינות ויחס אישי מהשלב הראשון ועד המסירה." },
  { icon: "scale", title: "משא ומתן מקצועי", text: "מיצוי מלא של תנאי העסקה עבורכם." },
];

export function AgentWebsiteTemplate({ data }: { data: AgentSitePayload }) {
  const { agent, brand, slug } = data;
  const S = data.sections;
  const on = (k: string) => S[k] !== false;
  const propertiesHref = `/agent/${slug}/properties`;
  const primaryArea = agent.areas[0] ?? null;
  const types = Array.from(new Set([...data.featured, ...data.recommended, ...data.mapPoints].map((p) => p.type))).filter(Boolean);

  const nav: HeaderNavItem[] = [
    { href: "#top", label: "דף הבית" },
    { href: "#properties", label: "נכסים" },
    { href: "#areas", label: "אזורי התמחות" },
    { href: "#about", label: "אודות" },
    ...(data.testimonials.length ? [{ href: "#testimonials", label: "לקוחות ממליצים" }] : []),
    { href: "#contact", label: "צור קשר" },
  ];

  return (
    <div id="top" dir="rtl" style={{ ...(brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)] antialiased">
      <AgentHeader brandName={agent.officeName || agent.name} logo={brand.logo} nav={nav} whatsapp={agent.whatsapp} tel={agent.tel} phoneLabel={agent.phone} />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      {on("hero") && <Hero data={data} />}

      {/* ── PROPERTY SEARCH ──────────────────────────────────────────────── */}
      <div className="relative z-10">
        <PropertySearch slug={slug} areas={agent.areas} types={types} />
      </div>

      {/* ── FEATURED PROPERTIES ──────────────────────────────────────────── */}
      {on("featured_properties") && data.featured.length > 0 && (
        <SectionShell id="properties" title="נכסים נבחרים" action={<TextLink href={propertiesHref}>לכל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {data.featured.map((p) => <AgentPropertyCard key={p.id} property={p} />)}
          </div>
        </SectionShell>
      )}

      {/* ── EXPERTISE MAP + AREA EXPERTISE ───────────────────────────────── */}
      {on("market_expertise") && (data.mapPoints.length > 0 || data.areas.length > 0) && (
        <ExpertiseMap points={data.mapPoints} areas={data.areas} primaryArea={primaryArea} propertiesHref={propertiesHref} />
      )}

      {/* ── WHY WORK WITH ME ─────────────────────────────────────────────── */}
      {on("why_me") && (
        <SectionShell title="למה לעבוד איתי?">
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {ADVANTAGES.map((a) => (
              <div key={a.title}>
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)]"><AdvIcon name={a.icon} /></div>
                <h3 className="text-[16px] font-black text-[var(--brand-text)]">{a.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--brand-muted)]">{a.text}</p>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {/* ── ABOUT ────────────────────────────────────────────────────────── */}
      {on("about") !== false && (agent.bio || agent.specialties.length > 0) && <About data={data} />}

      {/* ── TRUST NUMBERS (only real) ────────────────────────────────────── */}
      {data.stats.length >= 2 && (
        <SectionShell tone="surface">
          <StatStrip stats={data.stats} />
        </SectionShell>
      )}

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      {on("testimonials") && data.testimonials.length > 0 && (
        <SectionShell id="testimonials" title="לקוחות מספרים" tone="surface">
          <Testimonials items={data.testimonials} />
        </SectionShell>
      )}

      {/* ── SECOND PROPERTY DISCOVERY ────────────────────────────────────── */}
      {data.recommended.length > 0 && (
        <SectionShell title="עוד נכסים שעשויים להתאים לכם" action={<TextLink href={propertiesHref}>לכל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {data.recommended.map((p) => <AgentPropertyCard key={p.id} property={p} />)}
          </div>
        </SectionShell>
      )}

      {/* ── CONTACT CTA ──────────────────────────────────────────────────── */}
      {on("contact") && <ContactCta data={data} />}

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <Footer data={data} nav={nav} />

      <MobileStickyCta whatsapp={agent.whatsapp} tel={agent.tel} />
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  const hasPhoto = !!brand.profileImage;
  const title = agent.valueProp || agent.headline || "הבית הבא שלכם מתחיל כאן";

  return (
    <section className="relative overflow-hidden border-b border-[var(--brand-border)] bg-gradient-to-b from-[var(--brand-surface)] to-[var(--brand-background)]">
      <div className={`mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:pb-24 lg:pt-14 ${hasPhoto ? "lg:grid-cols-2" : ""}`}>
        {/* Text (start / right) */}
        <div className={hasPhoto ? "" : "mx-auto max-w-3xl text-center"}>
          <div className="text-[15px] font-black text-[color:var(--brand-link)]">{agent.name}</div>
          <h1 className="mt-2 text-4xl font-black leading-[1.1] text-[var(--brand-text)] sm:text-5xl">{title}</h1>
          {(agent.bio || agent.title) && <p className={`mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)] ${hasPhoto ? "max-w-md" : "mx-auto max-w-xl"}`}>{agent.bio || agent.title}</p>}

          {data.proofPoints.length > 0 && <div className={`mt-6 ${hasPhoto ? "" : "flex justify-center"}`}><ProofPoints points={data.proofPoints} /></div>}

          <div className={`mt-8 flex flex-wrap gap-3 ${hasPhoto ? "" : "justify-center"}`}>
            <a href="#contact" className="rounded-xl bg-[var(--brand-primary)] px-6 py-3.5 text-[15px] font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)]">קבעו פגישת ייעוץ</a>
            {agent.whatsapp && <a href={agent.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-6 py-3.5 text-[15px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">שלחו הודעת WhatsApp</a>}
          </div>
        </div>

        {/* Photo + office card (end / left) */}
        {hasPhoto && (
          <div className="relative">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl bg-[var(--brand-soft)]">
              <img src={brand.profileImage as string} alt={agent.name} className="h-full w-full object-cover object-top" />
            </div>
            <OfficeCard data={data} />
          </div>
        )}
      </div>
    </section>
  );
}

function OfficeCard({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  return (
    <div className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)] lg:absolute lg:-bottom-8 lg:start-[-2rem] lg:mt-0 lg:max-w-xs">
      <div className="flex items-center gap-3">
        {brand.logo ? <img src={brand.logo} alt={agent.officeName ?? ""} className="h-9 w-auto max-w-[120px] object-contain" /> : <div className="text-[15px] font-black text-[var(--brand-text)]">{agent.officeName ?? agent.name}</div>}
      </div>
      <div className="mt-3 space-y-2 text-[13px] text-[var(--brand-muted)]">
        {agent.officeAddress && <div className="flex items-center gap-2"><PinIcon /> {agent.officeAddress}</div>}
        {agent.phone && <a href={agent.tel ?? undefined} className="flex items-center gap-2 hover:text-[color:var(--brand-link)]"><PhoneGlyph /> {agent.phone}</a>}
        {agent.email && <a href={`mailto:${agent.email}`} className="flex items-center gap-2 hover:text-[color:var(--brand-link)]"><MailIcon /> {agent.email}</a>}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <a href="#contact" className="rounded-xl bg-[var(--brand-primary)] py-2.5 text-center text-[13px] font-bold text-[var(--brand-on-primary)]">קביעת פגישה</a>
        {agent.whatsapp && <a href={agent.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[var(--brand-border)] py-2.5 text-center text-[13px] font-bold text-[var(--brand-text)]">שליחת הודעת WhatsApp</a>}
      </div>
    </div>
  );
}

// ── About ────────────────────────────────────────────────────────────────────
function About({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  return (
    <SectionShell id="about">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.3fr]">
        {brand.profileImage
          ? <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-[var(--brand-soft)]"><img src={brand.profileImage} alt={agent.name} className="h-full w-full object-cover" /></div>
          : <div className="grid aspect-square w-full max-w-sm place-items-center rounded-3xl bg-[var(--brand-soft)] text-6xl font-black text-[color:var(--brand-primary)]">{agent.firstName.slice(0, 1)}</div>}
        <div>
          <div className="mb-1 text-[13px] font-bold text-[color:var(--brand-link)]">קצת עליי</div>
          <h2 className="text-2xl font-black text-[var(--brand-text)] sm:text-3xl">נדל״ן הוא קודם כל אנשים</h2>
          {agent.bio
            ? <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">{agent.bio}</p>
            : <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">{agent.name}{agent.title ? ` · ${agent.title}` : ""}{agent.areas.length ? ` · מתמחה ב${agent.areas.slice(0, 3).join(", ")}` : ""}.</p>}
          {agent.specialties.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {agent.specialties.map((s) => <span key={s} className="rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-[13px] font-semibold text-[color:var(--brand-primary)]">{s}</span>)}
            </div>
          )}
          {agent.languages.length > 0 && <p className="mt-4 text-[13px] font-semibold text-[var(--brand-muted)]">שפות: {agent.languages.join(" · ")}</p>}
        </div>
      </div>
    </SectionShell>
  );
}

// ── Contact CTA ──────────────────────────────────────────────────────────────
function ContactCta({ data }: { data: AgentSitePayload }) {
  const { agent, brand, slug } = data;
  const area = agent.areas[0];
  return (
    <section id="contact" className="bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl">{area ? `מחפשים נכס ב${area}?` : "מחפשים את הבית הבא שלכם?"}</h2>
          <p className="mt-3 text-[16px] opacity-90">בואו נמצא יחד את הבית הבא שלכם — השאירו פרטים ואחזור אליכם.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {agent.whatsapp && <a href={agent.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-6 py-3.5 text-[15px] font-bold text-[color:var(--brand-primary)]">שלחו הודעת WhatsApp</a>}
            {agent.tel && <a href={agent.tel} className="rounded-xl border border-white/40 px-6 py-3.5 text-[15px] font-bold">התקשרו {agent.phone}</a>}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--brand-background)] p-6 text-[var(--brand-text)]">
          <h3 className="mb-4 text-[17px] font-black">השאירו פרטים</h3>
          <AgentLeadForm slug={slug} variant="contact" cta="שליחת פנייה" accent={brand.primary} />
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer({ data, nav }: { data: AgentSitePayload; nav: HeaderNavItem[] }) {
  const { agent, brand } = data;
  const socials = Object.entries(agent.social).filter(([, v]) => v);
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <div>
          {brand.logo ? <img src={brand.logo} alt={agent.officeName ?? ""} className="mb-3 h-9 w-auto max-w-[140px] object-contain" /> : <div className="mb-3 text-[16px] font-black text-[var(--brand-text)]">{agent.officeName ?? agent.name}</div>}
          <p className="text-[13px] leading-relaxed text-[var(--brand-muted)]">{agent.name}{agent.title ? ` · ${agent.title}` : ""}</p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-2">
              {socials.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-muted)] transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-link)]">{k.slice(0, 1).toUpperCase()}</a>)}
            </div>
          )}
        </div>
        <FooterCol title="ניווט מהיר">{nav.map((n) => <a key={n.href} href={n.href} className="block text-[14px] text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</a>)}</FooterCol>
        {agent.areas.length > 0 && <FooterCol title="אזורי התמחות">{agent.areas.slice(0, 6).map((a) => <span key={a} className="block text-[14px] text-[var(--brand-muted)]">{a}</span>)}</FooterCol>}
        <FooterCol title="צור קשר">
          {agent.phone && <a href={agent.tel ?? undefined} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{agent.phone}</a>}
          {agent.email && <a href={`mailto:${agent.email}`} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{agent.email}</a>}
          {agent.officeAddress && <span className="block text-[14px] text-[var(--brand-muted)]">{agent.officeAddress}</span>}
        </FooterCol>
      </div>
      <div className="border-t border-[var(--brand-border)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-5 py-5 text-[12px] text-[var(--brand-muted)] sm:flex-row sm:px-8">
          <span>© {agent.officeName ?? agent.name} — כל הזכויות שמורות</span>
          <div className="flex items-center gap-4">
            <span className="opacity-70">פרטיות · נגישות · תקנון</span>
            <Link href="/" className="font-semibold opacity-70 transition hover:opacity-100">מופעל על ידי ZONO</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-3 text-[14px] font-black text-[var(--brand-text)]">{title}</h4><div className="space-y-2">{children}</div></div>;
}

// ── Icons ────────────────────────────────────────────────────────────────────
function AdvIcon({ name }: { name: string }) {
  const p: Record<string, string> = {
    map: "M9 3l6 2 6-2v16l-6 2-6-2-6 2V5l6-2zm0 0v16m6-14v16",
    megaphone: "M3 11v2a1 1 0 001 1h3l4 4V6L7 10H4a1 1 0 00-1 1zm13-3a5 5 0 010 8",
    handshake: "M8 12l3 3 5-5m-9 2l-3-3 4-4 3 2 3-2 4 4-3 3",
    scale: "M12 3v18M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zm10 0l-3 6a3 3 0 006 0l-3-6z",
  };
  return <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden><path d={p[name] ?? p.map} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function PinIcon() { return <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx={12} cy={10} r={2.5} /></svg>; }
function PhoneGlyph() { return <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11 11 0 003.4.55 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.55 3.4 1 1 0 01-.25 1z" /></svg>; }
function MailIcon() { return <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><rect x={3} y={5} width={18} height={14} rx={2} /><path d="M3 7l9 6 9-6" /></svg>; }
