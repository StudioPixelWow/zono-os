"use client";
// ============================================================================
// Office Intelligence — the office landscape + directory + OFFICE DRAWER (client).
// The landscape (ranked by observed inventory) and the bounded directory are
// clickable; clicking an office opens an in-place drawer with its observed
// intelligence (agents preview, areas, property types, brand) — no navigation,
// no reload. Agents link to the canonical broker drawer via the existing
// /brokerage-data?broker= contract. Pagination is a server Link; the drawer is
// client state. Nothing here computes market share or performance.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficeLandscapeRow, OfficeDirectory, OfficeRecord } from "@/lib/office-intel/cockpit";

function dateHe(ms: number | null): string { return ms == null ? "—" : new Date(ms).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }); }

export function OfficeArena({ landscape, directory, detail, baseHref }: { landscape: OfficeLandscapeRow[]; directory: OfficeDirectory; detail: Record<string, OfficeRecord>; baseHref: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const maxInv = Math.max(1, ...landscape.map((r) => r.observedListings));
  const o = open ? detail[open] : null;

  return (
    <>
      {/* Leaderboard */}
      <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="mb-4"><h2 className="text-ink text-base font-black tracking-tight sm:text-lg">המשרדים הפעילים בזירה</h2><p className="text-muted mt-0.5 text-xs">מדורג לפי מלאי נצפה משויך — נוכחות, לא ביצועים/מכירות</p></div>
        {landscape.length === 0 ? <Empty text="עדיין לא זוהו משרדים עם פעילות נצפית." /> : (
          <div className="flex flex-col gap-2.5">
            {landscape.map((r) => (
              <button key={r.id} onClick={() => detail[r.id] && setOpen(r.id)} className="hover:bg-surface -mx-2 rounded-lg px-2 py-1.5 text-right transition">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate"><span className="text-ink font-black">{r.name}</span>{r.brand && <span className="text-brand-strong"> · {r.brand}</span>}</span>
                  <span className="text-muted shrink-0 tabular-nums">{r.observedListings} מודעות · {r.agents} סוכנים</span>
                </div>
                <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${(r.observedListings / maxInv) * 100}%` }} /></div>
                {r.areas.length > 0 && <div className="text-muted mt-1 truncate text-[11px]">{r.areas.join(" · ")}</div>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Directory (secondary, bounded, paginated) */}
      <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="mb-4"><h2 className="text-ink text-base font-black tracking-tight sm:text-lg">כל המשרדים שזוהו</h2><p className="text-muted mt-0.5 text-xs">{directory.total} משרדים · מציג {directory.rows.length} · פעילים תחילה</p></div>
        {directory.rows.length === 0 ? <Empty text="לא נמצאו משרדים." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead><tr className="text-muted border-line border-b text-[11px]"><th className="py-2 pe-3 font-bold">משרד</th><th className="px-3 py-2 font-bold">רשת</th><th className="px-3 py-2 font-bold tabular-nums">סוכנים</th><th className="px-3 py-2 font-bold tabular-nums">מלאי נצפה</th><th className="ps-3 py-2 font-bold">אזור מוביל</th></tr></thead>
              <tbody>
                {directory.rows.map((r) => (
                  <tr key={r.id} onClick={() => detail[r.id] && setOpen(r.id)} className="border-line/60 hover:bg-surface cursor-pointer border-b transition last:border-0">
                    <td className="py-2.5 pe-3"><span className="text-ink font-black">{r.name}</span>{!r.hasActivity && <span className="bg-surface text-muted ms-2 rounded px-1 py-0.5 text-[9px] font-bold">מועמד</span>}</td>
                    <td className="text-muted px-3 py-2.5">{r.brand ?? "—"}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{r.agents}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{r.observedListings}</td>
                    <td className="text-muted px-3 py-2.5">{r.topArea ?? "—"}</td>
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
      {open && o && (
        <div className="fixed inset-0 z-50 flex justify-start" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setOpen(null)} aria-hidden />
          <div dir="rtl" className="bg-card relative ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto shadow-2xl">
            <div className="border-line bg-card sticky top-0 flex items-start justify-between gap-2 border-b p-4">
              <div><p className="text-brand text-[11px] font-black">משרד · מלאי נצפה</p><h3 className="text-ink text-lg font-black">{o.name}</h3>{o.brand && <p className="text-muted text-xs">{o.brand}{o.city ? ` · ${o.city}` : ""}</p>}</div>
              <button onClick={() => setOpen(null)} className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="מלאי נצפה" value={String(o.observedListings)} />
                <Stat label="סוכנים" value={String(o.agents)} />
                <Stat label="דירוג Google" value={o.rating != null ? String(o.rating) : "—"} />
              </div>
              <Block title="אזורים">{o.areas.length ? <Chips items={o.areas.map((a) => `${a.name} · ${a.count}`)} /> : <Muted />}</Block>
              <Block title="סוגי נכסים">{o.propertyTypes.length ? <Chips items={o.propertyTypes.map((t) => `${t.type} · ${t.count}`)} /> : <Muted />}</Block>
              <Block title={`סוכנים (${o.agents})`}>
                {o.agentSample.length ? (
                  <div className="flex flex-col gap-1">
                    {o.agentSample.map((a) => <Link key={a.id} href={`/brokerage-data?broker=${a.id}`} prefetch={false} className="text-ink hover:text-brand-strong text-xs font-bold">{a.name} ←</Link>)}
                    {o.agents > o.agentSample.length && <span className="text-muted text-[11px]">ועוד {o.agents - o.agentSample.length}…</span>}
                  </div>
                ) : <Muted />}
              </Block>
              <Block title="נצפה"><div className="text-muted text-xs">ראשון: <span className="text-ink font-bold">{dateHe(o.firstSeenMs)}</span> · אחרון: <span className="text-ink font-bold">{dateHe(o.lastSeenMs)}</span></div></Block>
              <Link href={`/brokerage-data/office/${o.id}`} prefetch={false} className="border-line hover:border-brand-light bg-card text-ink block rounded-xl border px-4 py-2.5 text-center text-sm font-bold transition">פרופיל מלא ←</Link>
              <p className="text-muted/80 text-[10px]">מבוסס על המלאי הנצפה. אין מיזוג אוטומטי של רשת/סניף או וריאציות כתיב.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function Empty({ text }: { text: string }) { return <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">{text}</div>; }
function Muted() { return <span className="text-muted text-xs">—</span>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-surface rounded-xl p-2.5 text-center"><div className="text-ink text-lg font-black tabular-nums">{value}</div><div className="text-muted text-[10px] font-bold">{label}</div></div>; }
function Block({ title, children }: { title: string; children: React.ReactNode }) { return <div><p className="text-ink mb-1.5 text-xs font-black">{title}</p>{children}</div>; }
function Chips({ items }: { items: string[] }) { return <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <span key={i} className="bg-brand-soft text-brand-strong rounded-md px-2 py-0.5 text-[11px] font-bold">{t}</span>)}</div>; }
