// ============================================================================
// ZONO Office Website — SHARED chrome (header + footer). Every office-site page —
// homepage, agent profile, property listing — carries the same office header and
// footer, so an internal page never looks like a stranded fragment. Presentation
// only; all data comes from the page's selector (OfficeChrome).
// ============================================================================
import Link from "next/link";
import { AgentHeader, type HeaderNavItem } from "@/components/agent-website/AgentHeader";
import type { OfficeChrome } from "@/lib/office-website/site-data";

/** Header nav for internal pages — absolute anchors back to the homepage sections. */
export function officeSiteNav(slug: string): HeaderNavItem[] {
  return [
    { href: `/site/${slug}`, label: "ראשי" },
    { href: `/site/${slug}#properties`, label: "נכסים" },
    { href: `/site/${slug}#team`, label: "הצוות" },
    { href: `/site/${slug}#areas`, label: "אזורי פעילות" },
    { href: `/site/${slug}#about`, label: "אודות" },
    { href: `/site/${slug}#contact`, label: "צור קשר" },
  ];
}

export function OfficeSiteHeader({ chrome }: { chrome: OfficeChrome }) {
  return (
    <AgentHeader
      brandName={chrome.office.name}
      logo={chrome.logo}
      nav={officeSiteNav(chrome.slug)}
      whatsapp={chrome.office.whatsapp}
      tel={chrome.office.tel}
      phoneLabel={chrome.office.phone}
    />
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-3 text-[14px] font-black text-[var(--brand-text)]">{title}</h4><div className="space-y-2">{children}</div></div>;
}

export function OfficeSiteFooter({ chrome }: { chrome: OfficeChrome }) {
  const { office, logo } = chrome;
  const nav = officeSiteNav(chrome.slug);
  const socials = Object.entries(office.social).filter(([, v]) => typeof v === "string" && v);
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <div>
          {logo ? <img src={logo} alt={office.name} className="mb-3 h-10 w-auto max-w-[160px] object-contain" /> : <div className="mb-3 text-[16px] font-black text-[var(--brand-text)]">{office.name}</div>}
          {office.description && <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>}
          {socials.length > 0 && <div className="mt-4 flex gap-2">{socials.map(([k, v]) => <a key={k} href={v as string} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-muted)] transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-link)]">{k.slice(0, 1).toUpperCase()}</a>)}</div>}
        </div>
        <FooterCol title="ניווט מהיר">{nav.map((n) => <Link key={n.href} href={n.href} className="block text-[14px] text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</Link>)}</FooterCol>
        {chrome.areas.length > 0 && <FooterCol title="אזורי פעילות">{chrome.areas.slice(0, 6).map((a) => <span key={a} className="block text-[14px] text-[var(--brand-muted)]">{a}</span>)}</FooterCol>}
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
