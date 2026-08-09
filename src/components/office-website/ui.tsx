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

/** Premium office property card — reference geometry + handling-agent footer. */
export function OfficePropertyCard({ property }: { property: OfficeProperty }) {
  const loc = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const priceLabel = property.listingKind === "rent"
    ? (money(property.monthlyRent) ? `${money(property.monthlyRent)} / חודש` : null)
    : money(property.price);
  const meta = [
    property.rooms != null ? `${property.rooms} חד׳` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ״ר` : null,
    property.floor != null ? `קומה ${property.floor}` : null,
  ].filter(Boolean);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] transition duration-200 hover:border-[color:var(--brand-primary)] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
      <Link href={property.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]">
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--brand-surface)]">
          <FavoriteButton label={`שמירת ${property.title}`} />
          {property.tag && <span className="absolute end-3 top-3 z-10 rounded-lg bg-[var(--brand-primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-on-primary)] shadow-sm">{property.tag}</span>}
          {property.image
            ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
            : <div className="grid h-full w-full place-items-center text-[var(--brand-muted)]"><HouseGlyph /></div>}
        </div>
        <div className="flex flex-col gap-1 p-4">
          <div className="line-clamp-1 text-[15px] font-black text-[var(--brand-text)]">{property.title}</div>
          {loc && <div className="line-clamp-1 text-[13px] text-[var(--brand-muted)]">{loc}</div>}
          <div className="mt-2 border-t border-[var(--brand-border)] pt-2">
            {priceLabel ? <div className="text-[17px] font-black text-[color:var(--brand-link)]">{priceLabel}</div> : <div className="text-[13px] font-semibold text-[var(--brand-muted)]">מחיר לפי פנייה</div>}
          </div>
          {meta.length > 0 && <div className="mt-1 flex items-center gap-3 text-[12px] font-semibold text-[var(--brand-muted)]">{meta.map((m, i) => <span key={i} className="flex items-center gap-3">{i > 0 && <i className="h-3 w-px bg-[var(--brand-border)]" />}{m}</span>)}</div>}
        </div>
      </Link>
      {property.agent && <div className="border-t border-[var(--brand-border)] px-4 py-2.5"><AgentChip agent={property.agent} /></div>}
    </div>
  );
}

/** Team member card (spec §6/§23) — large portrait, links to /agent/[slug]. */
export function TeamCard({ member }: { member: OfficeTeamMember }) {
  const body = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--brand-soft)]">
        {member.photo
          ? <img src={member.photo} alt={member.name} loading="lazy" className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.02]" />
          : <div className="grid h-full w-full place-items-center text-5xl font-black text-[color:var(--brand-primary)]">{member.name.slice(0, 1)}</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[16px] font-black text-[var(--brand-text)]">{member.name}</div>
        {member.title && <div className="text-[13px] font-semibold text-[color:var(--brand-link)]">{member.title}</div>}
        {member.areas.length > 0 && <div className="mt-1 line-clamp-1 text-[12px] text-[var(--brand-muted)]">{member.areas.join(" · ")}</div>}
        {member.activeProperties > 0 && <div className="mt-2 text-[12px] font-bold text-[var(--brand-text)]">{member.activeProperties} נכסים פעילים</div>}
        <div className="mt-3 flex items-center gap-2 pt-1">
          {member.whatsapp && <a href={member.whatsapp} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`WhatsApp ${member.name}`} className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-primary)] text-[var(--brand-on-primary)]"><WaGlyph /></a>}
          {member.href && <span className="text-[13px] font-bold text-[color:var(--brand-link)]">לפרופיל ←</span>}
        </div>
      </div>
    </>
  );
  const cls = "group flex flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] transition duration-200 hover:border-[color:var(--brand-primary)] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]";
  return member.href ? <Link href={member.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Testimonial card with agent attribution (integrity: linked agent only). */
export function OfficeTestimonialCard({ t }: { t: OfficeTestimonial }) {
  return (
    <figure className="flex flex-col rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-6">
      {t.rating ? <div className="text-[color:var(--brand-accent)]" aria-label={`דירוג ${t.rating}`}>{"★".repeat(Math.max(1, Math.min(5, Math.round(t.rating))))}</div> : null}
      <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-[var(--brand-text)]">{t.text}</blockquote>
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

function HouseGlyph() { return <svg viewBox="0 0 24 24" width={40} height={40} fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M3 11l9-7 9 7M5 10v9h5v-5h4v5h5v-9" strokeLinejoin="round" strokeLinecap="round" /></svg>; }
function WaGlyph() { return <svg viewBox="0 0 24 24" width={17} height={17} fill="currentColor" aria-hidden><path d="M12 2a10 10 0 00-8.5 15.3L2 22l4.8-1.5A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-2.9.9.9-2.8-.2-.3A8 8 0 1112 20zm4.5-6c-.25-.13-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.13-.17.25-.64.8-.78.97-.14.16-.29.18-.54.06a6.5 6.5 0 01-3.2-2.8c-.24-.42.24-.39.69-1.3.08-.16.04-.3-.02-.42-.06-.13-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42h-.48c-.16 0-.42.06-.64.3-.22.25-.85.83-.85 2.02s.87 2.35.99 2.51c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.06 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" /></svg>; }
