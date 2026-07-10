// ============================================================================
// 📎 ZONO Website Design System™ — SiteFooter (premium, server-safe). 38.1.
// One footer language for every ZONO site: navigation + areas + contact columns
// + the ZONO branding line. Consumes the pure footer model. Official tokens, RTL.
// ============================================================================
import Link from "next/link";
import { buildSiteFooter, type SiteNavModel } from "@/lib/site-ui/nav";
import { OfficeBrandMark } from "./OfficeBrandMark";

export function SiteFooter({ nav, areas = [] }: { nav: SiteNavModel; areas?: { name: string; href: string }[] }) {
  const columns = buildSiteFooter(nav, areas);
  return (
    <footer dir="rtl" className="bg-card border-line mt-12 border-t">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <OfficeBrandMark name={nav.brand.name} logo={nav.brand.logo} variant="lockup" surface="light" size="sm" />
            {nav.contact.address && <p className="text-muted mt-2 text-[12px]">{nav.contact.address}</p>}
            <a href={nav.cta.href} className="btn-zono-secondary mt-3 inline-block rounded-xl px-4 py-2 text-[12px] font-bold">{nav.cta.label}</a>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-ink text-[13px] font-black">{col.title}</div>
              <ul className="mt-2 space-y-1.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/") ? (
                      <Link href={l.href} className="text-muted hover:text-brand zono-focus-ring rounded text-[13px] transition">{l.label}</Link>
                    ) : (
                      <a href={l.href} className="text-muted hover:text-brand zono-focus-ring rounded text-[13px] transition">{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-line mt-8 flex flex-col items-center gap-1 border-t pt-5 text-center">
          <span className="text-muted text-[11px]">{nav.brand.name} · המלאי מתעדכן אוטומטית</span>
          <span className="text-muted/70 text-[10.5px] font-semibold tracking-wide">Powered by ZONO</span>
        </div>
      </div>
    </footer>
  );
}
