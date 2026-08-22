// ============================================================================
// ZONO Office Website — office-specific presentational primitives (token-driven).
// Reuses the shared agent-site primitives (SectionShell/StatStrip/…); adds the
// office relationships: property → handling agent, team cards, agent-linked
// testimonials. STRUCTURE = ZONO, IDENTITY = brand tokens.
// ============================================================================
import Link from "next/link";
import type { OfficeProperty, OfficeTeamMember, OfficeTestimonial, OfficeAgentRef } from "@/lib/office-website/site-data";
import { FavoriteButton } from "@/components/agent-website/FavoriteButton";
import { money } from "@/components/agent-website/ui";

function Avatar({ name, photo, size = 32 }: { name: string; photo: string | null; size?: number }) {
  return photo
    ? <img src={photo} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="grid place-items-center rounded-full bg-[var(--brand-soft)] font-black text-[color:var(--brand-primary)]" style={{ width: size, height: size, fontSize: size * 0.4 }}>{name.slice(0, 1)}</span>;
}

/** Tiny overlapping agent faces for an area card — "the agents strong here".
 *  Real avatars only (falls back to initials); names read as "דנה + מאיה מוכרים כאן".
 *  Non-interactive (safe inside an area <Link>): no nested anchors. */
export function AreaAgentAvatars({ agents }: { agents: OfficeAgentRef[] }) {
  if (agents.length === 0) return null;
  const faces = agents.slice(0, 3);
  const names = agents.slice(0, 2).map((a) => a.name.split(" ")[0]);
  const extra = agents.length - names.length;
  const line = extra > 0 ? `${names.join(" + ")} +${extra}` : names.join(" + ");
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-row-reverse items-center">
        {faces.map((a, i) => (
          <span key={a.id} className={`ring-2 ring-[var(--brand-background)] rounded-full ${i > 0 ? "-me-2" : ""}`}>
            <Avatar name={a.name} photo={a.photo} size={26} />
          </span>
        ))}
      </div>
      <span className="text-[12.5px] font-semibold text-[var(--brand-muted)]">{line} מוכרים כאן</span>
    </div>
  );
}

function AgentChip({ agent, label = "מטפל בנכס" }: { agent: OfficeAgentRef; label?: string }) {
  const inner = (
    <span className="flex items-center gap-2">
      <Avatar name={agent.name} photo={agent.photo} size={24} />
      <span className="text-[12px] font-bold text-[var(--brand-text)]">{agent.name}</span>
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-[var(--brand-muted)]">
      <span className="text-[11px]">{label}:</span>
      {agent.href ? <Link href={agent.href} className="hover:text-[color:var(--brand-link)]">{inner}</Link> : inner}
    </span>
  );
}

/** A branded no-image fallback — office-brand gradient + a building motif (never
 *  a gray box + tiny icon, never a fabricated photo). */
function PropertyBrandFallback() {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden" style={{ background: "linear-gradient(135deg, var(--brand-soft) 0%, var(--brand-hero) 130%)" }}>
      <svg viewBox="0 0 120 80" className="h-1/2 w-1/2 text-[color:var(--brand-primary)] opacity-40" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path d="M8 74V34l20-12 20 12v40M48 74V22l24-14 24 14v52M28 74v-14M28 48v-6M72 74v-16M88 74v-16M72 44v-6M88 44v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Premium office property card — image dominates (price over the image),
 *  sale/rent chip, branded fallback, subtle handling-agent footer. */
export function OfficePropertyCard({ property }: { property: OfficeProperty }) {
  const loc = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const priceLabel = property.listingKind === "rent"
    ? (money(property.monthlyRent) ? `${money(property.monthlyRent)} / חודש` : null)
    : money(property.price);
  const kindLabel = property.listingKind === "rent" ? "להשכרה" : property.listingKind === "sale" ? "למכירה" : null;
  const meta = [
    property.rooms != null ? `${property.rooms} חד׳` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ״ר` : null,
    property.floor != null ? `קומה ${property.floor}` : null,
  ].filter(Boolean);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-[var(--brand-background)] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)] ring-1 ring-[var(--brand-border)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_50px_-24px_rgba(15,23,42,0.42)]">
      <Link href={property.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]">
        <div className="relative aspect-[4/3] overflow-hidden">
          <FavoriteButton label={`שמירת ${property.title}`} />
          {kindLabel && <span className="absolute start-3 top-3 z-10 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-black text-[var(--brand-on-primary)] shadow">{kindLabel}</span>}
          {property.tag && property.tag !== kindLabel && <span className="absolute end-3 top-3 z-10 rounded-lg bg-white/90 px-3 py-1 text-[12px] font-black text-[var(--brand-text)] shadow-sm backdrop-blur">{property.tag}</span>}
          {property.image
            ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            : <PropertyBrandFallback />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5 pt-12">
            {priceLabel
              ? <div className="text-[24px] font-black text-white drop-shadow-sm">{priceLabel}</div>
              : <div className="text-[14px] font-bold text-white/90">מחיר לפי פנייה</div>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 p-5">
          <div className="line-clamp-1 text-[18px] font-black text-[var(--brand-text)]">{property.title}</div>
          {loc && <div className="line-clamp-1 text-[14px] text-[var(--brand-muted)]">{loc}</div>}
          {meta.length > 0 && <div className="mt-2 flex items-center gap-3 text-[14px] font-semibold text-[var(--brand-text)]">{meta.map((m, i) => <span key={i} className="flex items-center gap-3">{i > 0 && <i className="h-3.5 w-px bg-[var(--brand-border)]" />}{m}</span>)}</div>}
        </div>
      </Link>
      {property.agent && <div className="border-t border-[var(--brand-border)] px-5 py-3"><AgentChip agent={property.agent} /></div>}
    </div>
  );
}

/** Team member card (spec §6/§23) — large portrait, links to /agent/[slug].
 *  Server-safe: no event handlers; the WhatsApp link is a SIBLING of the profile
 *  link (never an <a> nested inside another <a>). */
export function TeamCard({ member }: { member: OfficeTeamMember }) {
  const photo = (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[var(--brand-soft)] shadow-[0_14px_34px_-20px_rgba(15,23,42,0.4)]">
      {member.photo
        ? <img src={member.photo} alt={member.name} loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]" />
        : <div className="grid h-full w-full place-items-center text-6xl font-black text-[color:var(--brand-primary)]">{member.name.slice(0, 1)}</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent p-4 pt-12">
        <div className="text-[19px] font-black leading-tight text-white drop-shadow">{member.name}</div>
        {member.title && <div className="text-[13px] font-semibold text-white/85">{member.title}</div>}
      </div>
    </div>
  );
  const meta = member.areas.length > 0 ? member.areas.join(" · ") : (member.activeProperties > 0 ? `${member.activeProperties} נכסים פעילים` : "");
  return (
    <div className="group flex flex-col gap-2.5">
      {member.href ? <Link href={member.href} className="block transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]">{photo}</Link> : photo}
      <div className="flex items-center justify-between gap-2 px-1">
        {meta && <span className="line-clamp-1 text-[12.5px] text-[var(--brand-muted)]">{meta}</span>}
        {member.href && <Link href={member.href} className="shrink-0 text-[12.5px] font-bold text-[color:var(--brand-link)] transition hover:opacity-80">לפרופיל ←</Link>}
      </div>
    </div>
  );
}

/** Testimonial card with agent attribution (integrity: linked agent only).
 *  `featured` renders the hero-sized quote for the lead review. */
export function OfficeTestimonialCard({ t, featured }: { t: OfficeTestimonial; featured?: boolean }) {
  return (
    <figure className={`flex h-full flex-col rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-background)] ${featured ? "p-7 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.3)] sm:p-9" : "p-6"}`}>
      {t.rating ? <div className={`text-[color:var(--brand-accent)] ${featured ? "text-lg" : ""}`} aria-label={`דירוג ${t.rating}`}>{"★".repeat(Math.max(1, Math.min(5, Math.round(t.rating))))}</div> : null}
      <blockquote className={`mt-3 flex-1 leading-relaxed text-[var(--brand-text)] ${featured ? "text-[19px] font-semibold sm:text-[23px]" : "text-[15px]"}`}>{featured ? `״${t.text}״` : t.text}</blockquote>
      <figcaption className="mt-4">
        <div className="text-[14px] font-black text-[var(--brand-text)]">{t.name}</div>
        {t.area && <div className="text-[12px] font-semibold text-[var(--brand-muted)]">{t.area}</div>}
        {t.agent && (
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--brand-border)] pt-3">
            <span className="text-[11px] text-[var(--brand-muted)]">טופל על ידי:</span>
            {t.agent.href
              ? <Link href={t.agent.href} className="flex items-center gap-2 hover:text-[color:var(--brand-link)]"><Avatar name={t.agent.name} photo={t.agent.photo} size={24} /><span className="text-[12px] font-bold text-[var(--brand-text)]">{t.agent.name}</span></Link>
              : <span className="flex items-center gap-2"><Avatar name={t.agent.name} photo={t.agent.photo} size={24} /><span className="text-[12px] font-bold text-[var(--brand-text)]">{t.agent.name}</span></span>}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
