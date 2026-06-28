// ============================================================================
// ZONO — Related Intelligence (presentation only · RTL · server-safe).
// ----------------------------------------------------------------------------
// A reusable "related" rail for any Intelligence Profile: related brokers /
// offices / nearby neighborhoods / nearby opportunities. It only RENDERS
// relations the caller already has from existing data (graph nodes, territory
// rows, signals) — it discovers nothing and computes nothing. Each item links
// to the existing profile; no screen is duplicated.
// ============================================================================
import Link from "next/link";
import { NeighborhoodLink } from "./EntityLinks";

export interface RelatedRef { id: string; name: string }
export interface RelatedHood { city: string | null; neighborhood: string }
export interface RelatedOpp { label: string; city?: string | null; neighborhood?: string | null }

const chip = "border-line bg-surface text-ink hover:border-brand-light inline-flex max-w-full items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold transition";

function Column({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div>
      <p className="text-ink mb-2 text-xs font-black">{title}</p>
      {empty ? <p className="text-muted text-[11px]">—</p> : <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

export function RelatedIntelligence({ brokers = [], offices = [], neighborhoods = [], opportunities = [] }: {
  brokers?: RelatedRef[]; offices?: RelatedRef[]; neighborhoods?: RelatedHood[]; opportunities?: RelatedOpp[];
}) {
  return (
    <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <h2 className="text-ink mb-4 text-base font-black sm:text-lg">מודיעין קשור</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Column title="מתווכים קשורים" empty={brokers.length === 0}>
          {brokers.slice(0, 8).map((b) => <Link key={b.id} href={`/broker-intelligence/${encodeURIComponent(b.id)}`} prefetch={false} className={chip}>{b.name}</Link>)}
        </Column>
        <Column title="משרדים קשורים" empty={offices.length === 0}>
          {offices.slice(0, 8).map((o) => <Link key={o.id} href={`/office-intelligence/${encodeURIComponent(o.id)}`} prefetch={false} className={chip}>{o.name}</Link>)}
        </Column>
        <Column title="שכונות סמוכות" empty={neighborhoods.length === 0}>
          {neighborhoods.slice(0, 8).map((n, i) => <span key={i} className={chip}><NeighborhoodLink city={n.city} neighborhood={n.neighborhood} /></span>)}
        </Column>
        <Column title="הזדמנויות סמוכות" empty={opportunities.length === 0}>
          {opportunities.slice(0, 6).map((o, i) => (
            o.neighborhood ? <span key={i} className={chip} title={o.label}><NeighborhoodLink city={o.city} neighborhood={o.neighborhood} /></span>
              : <span key={i} className={`${chip} cursor-default`} title={o.label}>{o.label.length > 22 ? o.label.slice(0, 21) + "…" : o.label}</span>
          ))}
        </Column>
      </div>
    </section>
  );
}
