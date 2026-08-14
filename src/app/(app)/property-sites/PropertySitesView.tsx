"use client";
// ZONO — "אתרי נכסים" (Property Sites) admin view. Lists the broker's properties,
// each with its public /p/[id] landing page: live preview + copy-link. Read-only
// hub; the page itself is created by the property-marketing engine.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

export interface PropertySiteItem {
  id: string; title: string; status: string; city: string | null; neighborhood: string | null;
  image: string | null; listingKind: string | null; price: number | null; monthlyRent: number | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "מפורסם", cls: "bg-success-soft text-success" },
  active: { label: "פעיל", cls: "bg-success-soft text-success" },
  draft: { label: "טיוטה", cls: "bg-surface text-muted" },
  sold: { label: "נמכר", cls: "bg-brand-soft text-brand-strong" },
  rented: { label: "הושכר", cls: "bg-brand-soft text-brand-strong" },
  archived: { label: "בארכיון", cls: "bg-surface text-muted" },
};

function priceLabel(it: PropertySiteItem): string {
  const nf = new Intl.NumberFormat("he-IL");
  if (it.listingKind === "rent") return it.monthlyRent ? `₪${nf.format(it.monthlyRent)} / חודש` : "מחיר לפי פנייה";
  return it.price ? `₪${nf.format(it.price)}` : "מחיר לפי פנייה";
}

export function PropertySitesView({ items }: { items: PropertySiteItem[] }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => [it.title, it.city, it.neighborhood].filter(Boolean).some((v) => (v as string).toLowerCase().includes(s)));
  }, [items, q]);

  function copy(id: string) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${id}`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500); }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Property Sites</p>
          <h1 className="text-ink mt-1 text-2xl font-black">אתרי נכסים</h1>
          <p className="text-muted mt-1 text-sm">דף נחיתה שיווקי לכל נכס — תצוגה מקדימה והעתקת קישור לשיתוף.</p>
        </div>
        <Link href="/my-properties" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />הנכסים שלי</Link>
      </div>

      <div className="border-line bg-card flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3">
        <div className="border-line flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border bg-surface px-3">
          <Icon name="Search" size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי כותרת, עיר או שכונה…" className="text-ink h-full w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
        </div>
        <span className="text-muted text-[12px] font-semibold">{filtered.length} נכסים</span>
      </div>

      {filtered.length === 0 ? (
        <div className="border-line bg-card rounded-2xl border p-12 text-center">
          <span className="text-muted bg-surface mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Home" size={22} /></span>
          <p className="text-ink mt-3 font-black">אין נכסים להצגה</p>
          <p className="text-muted mt-1 text-sm">הוסף נכס כדי לקבל עבורו דף נחיתה שיווקי.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => {
            const st = STATUS[it.status] ?? { label: it.status, cls: "bg-surface text-muted" };
            const loc = [it.neighborhood, it.city].filter(Boolean).join(", ");
            const href = `/p/${it.id}`;
            return (
              <div key={it.id} className="border-line bg-card group flex flex-col overflow-hidden rounded-2xl border">
                <div className="relative aspect-[4/3] overflow-hidden bg-surface">
                  {it.image
                    ? // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Home" size={32} /></div>}
                  <span className={cn("absolute end-3 top-3 rounded-lg px-2 py-0.5 text-[11px] font-black", st.cls)}>{st.label}</span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-ink line-clamp-1 text-[15px] font-black">{it.title}</p>
                  {loc && <p className="text-muted mt-0.5 line-clamp-1 text-[13px]">{loc}</p>}
                  <p className="text-brand-strong mt-2 text-[15px] font-black">{priceLabel(it)}</p>
                  <div className="mt-3 flex items-center gap-2 pt-1">
                    <Link href={href} target="_blank" rel="noreferrer" className="border-line text-ink hover:border-brand-light inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-bold transition-colors">
                      <Icon name="ExternalLink" size={14} />תצוגה מקדימה
                    </Link>
                    <button type="button" onClick={() => copy(it.id)} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors", copied === it.id ? "bg-success-soft text-success" : "bg-brand-strong text-white")}>
                      <Icon name={copied === it.id ? "Check" : "Copy"} size={14} />{copied === it.id ? "הועתק" : "העתק קישור"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
