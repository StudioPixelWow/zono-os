// ============================================================================
// 🧭 ZONO Website Design System™ — pure site-navigation model (client-safe). 38.1.
// Builds the navigation + footer model for a public office/agent site from the
// EXISTING SiteBranding — no new data, no schema. Consumed by the shared SiteNav
// and SiteFooter components so every ZONO site shares ONE navigation language.
// ============================================================================

export interface SiteBrandingLite {
  officeName: string; logo: string | null;
  phone: string | null; whatsapp: string | null; email: string | null; address: string | null;
}

export type SiteBase = "ai-site" | "ai-agent";

export interface NavLink { label: string; href: string; anchor: boolean }
export interface SiteCta { label: string; href: string; kind: "whatsapp" | "phone" | "ask" }
export interface SiteNavModel {
  brand: { name: string; logo: string | null; href: string };
  links: NavLink[];
  cta: SiteCta;
  contact: { phone: string | null; whatsapp: string | null; email: string | null; address: string | null };
}

const waHref = (wa: string) => `https://wa.me/${wa.replace(/[^0-9]/g, "")}`;

/** Canonical navigation for any ZONO public site. Office vs agent share the model. */
export function buildSiteNav(slug: string, b: SiteBrandingLite, base: SiteBase = "ai-site"): SiteNavModel {
  const root = `/${base}/${slug}`;
  const links: NavLink[] = [
    { label: "בית", href: root, anchor: false },
    { label: "נכסים", href: `${root}#featured`, anchor: true },
    { label: "אזורים", href: `${root}#areas`, anchor: true },
    { label: base === "ai-agent" ? "אודות" : "המשרד", href: base === "ai-agent" ? `${root}/about` : `${root}/office`, anchor: false },
    { label: "שאל AI", href: `${root}#ask`, anchor: true },
  ];
  // Preferred CTA: WhatsApp → phone → Ask.
  const cta: SiteCta = b.whatsapp
    ? { label: "דברו איתנו", href: waHref(b.whatsapp), kind: "whatsapp" }
    : b.phone
    ? { label: "התקשרו", href: `tel:${b.phone}`, kind: "phone" }
    : { label: "שאל את ZONO", href: `${root}#ask`, kind: "ask" };
  return {
    brand: { name: b.officeName, logo: b.logo, href: root },
    links,
    cta,
    contact: { phone: b.phone, whatsapp: b.whatsapp, email: b.email, address: b.address },
  };
}

/** Footer columns derived from the nav model + areas. */
export interface FooterColumn { title: string; links: NavLink[] }
export function buildSiteFooter(nav: SiteNavModel, areas: { name: string; href: string }[]): FooterColumn[] {
  const cols: FooterColumn[] = [
    { title: "ניווט", links: nav.links },
  ];
  if (areas.length) cols.push({ title: "אזורים", links: areas.slice(0, 6).map((a) => ({ label: a.name, href: a.href, anchor: false })) });
  const contact: NavLink[] = [];
  if (nav.contact.phone) contact.push({ label: nav.contact.phone, href: `tel:${nav.contact.phone}`, anchor: false });
  if (nav.contact.whatsapp) contact.push({ label: "WhatsApp", href: waHref(nav.contact.whatsapp), anchor: false });
  if (nav.contact.email) contact.push({ label: nav.contact.email, href: `mailto:${nav.contact.email}`, anchor: false });
  if (contact.length) cols.push({ title: "יצירת קשר", links: contact });
  return cols;
}
