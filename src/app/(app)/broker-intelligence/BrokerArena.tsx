"use client";
// ============================================================================
// Broker Intelligence — the players + directory + BROKER DRAWER (client). The
// landscape (ranked by observed inventory) and the bounded directory are both
// clickable; clicking a broker opens an in-place drawer with that broker's
// observed intelligence (inventory, areas, property types, first/last observed)
// — no navigation, no page reload. Pagination is a server Link (URL page param);
// the drawer is client state. All values come from the pure model; nothing here
// computes market share or performance.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { resolvePropertyTypeLabel } from "@/lib/property-marketing/presentation";
import { Icon } from "@/components/dashboard/Icon";
import type { LandscapeRow, Directory, BrokerAgg } from "@/lib/broker-intel/cockpit";

const ils = (n: number | null): string => (n == null || n <= 0 ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);
function dateHe(ms: number | null): string { return ms == null ? "—" : new Date(ms).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }); }

export function BrokerArena({ landscape, directory, detail, baseHref }: { landscape: LandscapeRow[]; directory: Directory; detail: Record<string, BrokerAgg>; baseHref: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const maxInv = Math.max(1, ...landscape.map((r) => r.observedInventory));
  const agg = open ? detail[open] : null;

  return (
    <>
      {/* Players */}
      <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="mb-4"><h2 className="text-ink text-base font-black tracking-tight sm:text-lg">השחקנים בזירה</h2><p className="text-muted mt-0.5 text-xs">מדורג לפי מלאי נצפה — נוכחות ופעילות, לא ביצועים/מכירות</p></div>
        {landscape.length === 0 ? <Empty text="לא זוהו מתווכים בטווח הנוכחי." /> : (
          <div className="flex flex-col gap-2.5">
            {landscape.map((r) => (
              <button key={r.name} onClick={() => detail[r.name] && setOpen(r.name)} className="hover:bg-surface -mx-2 rounded-lg px-2 py-1.5 text-right transition">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink truncate font-black">{r.name}</span>
                  <span className="text-muted shrink-0 tabular-nums">{r.observedInventory} מודעות{r.newInPeriod > 0 ? ` · +${r.newInPeriod} חדש` : ""}</span>
                </div>
                <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${(r.observedInventory / maxInv) * 100}%` }} /></div>
                {r.areas.length > 0 && <div className="text-muted mt-1 truncate text-[11px]">{r.areas.join(" · ")}</div>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Directory (secondary, bounded, paginated) */}
      <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-ink text-base font-black tracking-tight sm:text-lg">מאגר המתווכים</h2><p className="text-muted mt-0.5 text-xs">{directory.total} מתווכים שזוהו · מציג {directory.rows.length}</p></div>
        </div>
        {directory.rows.length === 0 ? <Empty text="לא נמצאו מתווכים." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead><tr className="text-muted border-line border-b text-[11px]"><th className="py-2 pe-3 font-bold">מתווך</th><th className="px-3 py-2 font-bold tabular-nums">מלאי נצפה</th><th className="px-3 py-2 font-bold">אזור מוביל</th><th className="px-3 py-2 font-bold tabular-nums">סוגי נכס</th><th className="ps-3 py-2 font-bold tabular-nums">חדש</th></tr></thead>
              <tbody>
                {directory.rows.map((r) => (
                  <tr key={r.name} onClick={() => detail[r.name] && setOpen(r.name)} className="border-line/60 hover:bg-surface cursor-pointer border-b transition last:border-0">
                    <td className="text-ink py-2.5 pe-3 font-black">{r.name}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{r.observedInventory}</td>
                    <td className="text-muted px-3 py-2.5">{r.topArea ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 tabular-nums">{r.propertyTypes}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.newInPeriod > 0 ? <span className="text-success font-bold">+{r.newInPeriod}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {directory.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-xs">
            {directory.page > 1 ? <Link href={`${baseHref}page=${directory.page - 1}`} scroll={false} className="text-brand font-bold">→ הקודם</Link> : <span className="text-muted/40">→ הקודם</span>}
            <span className="text-muted tabular-nums">עמוד {directory.page} מתוך {directory.totalPages}</span>
            {directory.page < directory.totalPages ? <Link href={`${baseHref}page=${directory.page + 1}`} scroll={false} className="text-brand font-bold">הבא ←</Link> : <span className="text-muted/40">הבא ←</span>}
          </div>
        )}
      </section>

      {/* Drawer */}
      {open && agg && (
        <div className="fixed inset-0 z-50 flex justify-start" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setOpen(null)} aria-hidden />
          <div dir="rtl" className="bg-card relative ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto shadow-2xl">
            <div className="border-line sticky top-0 flex items-start justify-between gap-2 border-b bg-card p-4">
              <div><p className="text-brand text-[11px] font-black">מתווך · מלאי נצפה</p><h3 className="text-ink text-lg font-black">{agg.name}</h3></div>
              <button onClick={() => setOpen(null)} className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="מלאי נצפה" value={String(agg.observedInventory)} />
                <Stat label={`חדש`} value={String(agg.newInPeriod)} />
                <Stat label="מחיר ממוצע" value={ils(agg.avgPrice)} />
              </div>
              <DrawerBlock title="אזורים">
                {agg.areas.length ? <div className="flex flex-wrap gap-1.5">{agg.areas.map((a) => <span key={a.name} className="bg-brand-soft text-brand-strong rounded-md px-2 py-0.5 text-[11px] font-bold">{a.name} · {a.count}</span>)}</div> : <Muted text="—" />}
              </DrawerBlock>
              <DrawerBlock title="סוגי נכסים">
                {agg.propertyTypes.length ? <div className="flex flex-wrap gap-1.5">{agg.propertyTypes.map((t) => <span key={t.type} className="bg-surface text-ink rounded-md px-2 py-0.5 text-[11px] font-bold">{resolvePropertyTypeLabel(t.type)} · {t.count}</span>)}</div> : <Muted text="—" />}
              </DrawerBlock>
              <DrawerBlock title="נצפה">
                <div className="text-muted text-xs">ראשון: <span className="text-ink font-bold">{dateHe(agg.firstObservedMs)}</span> · אחרון: <span className="text-ink font-bold">{dateHe(agg.lastObservedMs)}</span></div>
              </DrawerBlock>
              <Link href="/market-intelligence/listings" prefetch={false} className="border-line hover:border-brand-light bg-card text-ink block rounded-xl border px-4 py-2.5 text-center text-sm font-bold transition">צפה במודעות השוק ←</Link>
              <p className="text-muted/80 text-[10px]">מבוסס על המלאי הנצפה בלבד. אין מיזוג אוטומטי של וריאציות כתיב לשם המתווך.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Empty({ text }: { text: string }) { return <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">{text}</div>; }
function Muted({ text }: { text: string }) { return <span className="text-muted text-xs">{text}</span>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-surface rounded-xl p-2.5 text-center"><div className="text-ink text-lg font-black tabular-nums">{value}</div><div className="text-muted text-[10px] font-bold">{label}</div></div>; }
function DrawerBlock({ title, children }: { title: string; children: React.ReactNode }) { return <div><p className="text-ink mb-1.5 text-xs font-black">{title}</p>{children}</div>; }
