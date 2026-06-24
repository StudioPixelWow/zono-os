import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getEntityGraphContext, type GraphContextItem } from "@/lib/graph/service";

const HREF: Record<string, (id: string) => string> = {
  buyer: (id) => `/buyers/${id}`, seller: (id) => `/sellers/${id}`, property: (id) => `/properties/${id}`,
  agent: () => "/routing", broker: (id) => `/broker-intelligence/${id}`, competitor: (id) => `/competitors/${id}`,
  external_listing: (id) => `/external-listings/${id}`, locality: () => "/market", acquisition: () => "/acquisition",
};
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

/** Server wrapper: 1-hop relationship context for an entity, rendered as a panel. */
export async function RelationshipSection({ entityType, entityId }: { entityType: string; entityId: string }) {
  let items: GraphContextItem[] = [];
  try {
    items = await getEntityGraphContext(entityType, entityId);
  } catch (e) {
    console.error("[graph] entity context failed:", e);
    return null;
  }
  if (items.length === 0) return null;

  // Group by node type.
  const groups = new Map<string, GraphContextItem[]>();
  for (const it of items) { const a = groups.get(it.typeLabel) ?? []; a.push(it); groups.set(it.typeLabel, a); }

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">מודיעין קשרים</h3>
        <Link href="/graph" className="text-brand-strong mr-auto text-xs font-bold hover:underline">לתובנות הקשרים ←</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([typeLabel, list]) => (
          <div key={typeLabel} className="bg-surface rounded-xl p-3">
            <p className="text-muted mb-1 text-[11px] font-bold">{typeLabel}</p>
            <ul className="flex flex-col gap-1">
              {list.slice(0, 6).map((it, i) => {
                const href = HREF[it.type]?.(it.id);
                return (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    {href ? <Link href={href} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{it.title}</Link> : <span className="text-ink min-w-0 flex-1 truncate font-semibold">{it.title}</span>}
                    <span className="text-muted shrink-0 text-[10px]">{it.relLabel}</span>
                    <span className={`shrink-0 text-[10px] font-black ${tone(it.strength)}`}>{it.strength}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
