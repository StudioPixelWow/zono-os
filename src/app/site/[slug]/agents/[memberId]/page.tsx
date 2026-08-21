// ============================================================================
// ZONO — Public office-agent profile (/site/[slug]/agents/[memberId]). Canonical
// public profile for ONE office member; works for NON-auth roster members.
// Public-safe only (no CRM stats/leads/deals). Redirects unknown/non-public
// members back to the office site.
// ============================================================================
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOfficeSiteAgent } from "@/lib/office-website/site-data";
import { OfficePropertyCard } from "@/components/office-website/ui";
import { OfficeSiteHeader, OfficeSiteFooter } from "@/components/office-website/OfficeSiteChrome";
import { PublicIcon } from "@/components/public-site/PublicIcon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; memberId: string }> }): Promise<Metadata> {
  const { slug, memberId } = await params;
  const d = await getOfficeSiteAgent(slug, memberId).catch(() => null);
  if (!d || d === "disabled") return { title: "סוכן · ZONO", robots: { index: false } };
  const area = d.member.areas[0] ? ` · ${d.member.areas[0]}` : "";
  const title = `${d.member.name} · ${d.office.name}${area}`;
  const description = [d.member.title, d.member.areas.join(", ")].filter(Boolean).join(" · ") || d.member.name;
  return { title, description, openGraph: { title, description, type: "profile", locale: "he_IL", images: d.member.photo ? [{ url: d.member.photo }] : undefined } };
}

export default async function OfficeAgentProfilePage({ params }: { params: Promise<{ slug: string; memberId: string }> }) {
  const { slug, memberId } = await params;
  const d = await getOfficeSiteAgent(slug, memberId).catch(() => null);
  if (d === null) notFound();
  if (d === "disabled") {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4"><div className="rounded-3xl border border-[#e8eaf0] p-10 text-center"><div className="mb-3 text-4xl">🏢</div><h1 className="text-xl font-black text-[#0f172a]">האתר אינו פעיל כרגע</h1></div></main>;
  }
  const { member, office } = d;

  return (
    <div dir="rtl" style={{ ...(d.brandVars as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)]">
      <OfficeSiteHeader chrome={d.chrome} />

      <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
        <Link href={`/site/${slug}`} className="mb-6 inline-block text-[13px] font-bold text-[color:var(--brand-link)]">← חזרה לאתר המשרד</Link>
        {/* Agent hero */}
        <section className="grid items-center gap-8 rounded-[28px] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 sm:grid-cols-[auto_1fr] sm:p-8">
          <div className="mx-auto aspect-square w-40 overflow-hidden rounded-3xl bg-[var(--brand-soft)] sm:w-48">
            {member.photo
              ? <img src={member.photo} alt={member.name} loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
              : <div className="grid h-full w-full place-items-center text-6xl font-black text-[color:var(--brand-primary)]">{member.name.slice(0, 1)}</div>}
          </div>
          <div>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">{member.name}</h1>
            {member.title && <p className="mt-1.5 text-[16px] font-bold text-[color:var(--brand-link)]">{member.title}</p>}
            {(member.specialties.length > 0 || member.areas.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {member.specialties.map((s) => <span key={s} className="rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-[13px] font-bold text-[color:var(--brand-primary)]">{s}</span>)}
                {member.areas.map((a) => <span key={a} className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-background)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--brand-text)]">{a}</span>)}
              </div>
            )}
            {member.activeCount > 0 && <p className="mt-4 text-[14px] font-bold text-[var(--brand-text)]">{member.activeCount} נכסים פעילים</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              {member.whatsapp && <a href={member.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-[15px] font-black text-[var(--brand-on-primary)] shadow-lg transition hover:-translate-y-0.5"><PublicIcon name="whatsapp" size="inline" />שליחת WhatsApp</a>}
              {member.phone && <a href={`tel:${member.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-6 py-3 text-[15px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]"><PublicIcon name="phone" size="inline" />{member.phone}</a>}
            </div>
          </div>
        </section>

        {/* Listings */}
        <section className="mt-10">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-black">הנכסים של {member.name}</h2>
            <Link href={`/site/${slug}/properties?agent=${member.id}`} className="text-[14px] font-bold text-[color:var(--brand-link)]">לכל הנכסים ←</Link>
          </div>
          {d.listings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--brand-border)] py-12 text-center text-[15px] text-[var(--brand-muted)]">אין כרגע נכסים פעילים לסוכן/ת זה/זו.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{d.listings.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
          )}
        </section>

        {/* Office contact fallback */}
        <section className="mt-10 rounded-2xl bg-[var(--brand-primary)] p-6 text-[var(--brand-on-primary)] sm:p-8">
          <h2 className="text-xl font-black">מעוניינים לדבר עם {member.name}?</h2>
          <p className="mt-1.5 text-[15px] opacity-90">פנו ישירות או דרך המשרד — נשמח לעזור.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {member.whatsapp && <a href={member.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-6 py-3 text-[15px] font-bold text-[color:var(--brand-primary)]">WhatsApp לסוכן/ת</a>}
            {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/40 px-6 py-3 text-[15px] font-bold">WhatsApp למשרד</a>}
            {office.tel && <a href={office.tel} className="rounded-xl border border-white/40 px-6 py-3 text-[15px] font-bold">התקשרו למשרד {office.phone}</a>}
          </div>
        </section>
      </main>

      <OfficeSiteFooter chrome={d.chrome} />
    </div>
  );
}
