// ============================================================================
// ZONO — Intelligence Navigation Layer (presentation only · RTL · server-safe).
// ----------------------------------------------------------------------------
// Canonical, reusable links so that EVERYWHERE a broker / office / neighborhood
// appears, clicking it opens its existing Intelligence Profile — never a
// duplicated screen. These are thin wrappers over the existing routes:
//   broker      → /broker-intelligence/[id]   (Broker Intelligence Profile)
//   office      → /office-intelligence         (Office Intelligence)
//   neighborhood→ /market?city=&neighborhood=  (Market / Neighborhood Intelligence)
// No new intelligence — only navigation into the screens that already exist.
// ============================================================================
import Link from "next/link";

const linkCls = "text-brand-strong hover:text-brand inline-flex items-center gap-0.5 font-bold underline-offset-2 hover:underline transition";

/** Broker → Broker Intelligence Profile. Falls back to the directory if no id. */
export function BrokerLink({ id, name, className }: { id?: string | null; name: string; className?: string }) {
  const href = id ? `/broker-intelligence/${encodeURIComponent(id)}` : "/broker-intelligence";
  return (
    <Link href={href} className={className ?? linkCls} title={`פרופיל מודיעין מתווך — ${name}`} prefetch={false}>
      {name}
    </Link>
  );
}

/** Office → Office Intelligence. Carries the office name as an informational hint. */
export function OfficeLink({ id, name, className }: { id?: string | null; name: string; className?: string }) {
  const href = id ? `/office-intelligence?office=${encodeURIComponent(id)}` : "/office-intelligence";
  return (
    <Link href={href} className={className ?? linkCls} title={`פרופיל מודיעין משרד — ${name}`} prefetch={false}>
      {name}
    </Link>
  );
}

/** Neighborhood → Market / Neighborhood Intelligence (city + neighborhood scope). */
export function NeighborhoodLink({ city, neighborhood, className }: { city?: string | null; neighborhood: string; className?: string }) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (neighborhood) params.set("neighborhood", neighborhood);
  const qs = params.toString();
  return (
    <Link href={`/market${qs ? `?${qs}` : ""}`} className={className ?? linkCls} title={`מודיעין שכונה — ${neighborhood}`} prefetch={false}>
      {neighborhood}
    </Link>
  );
}
