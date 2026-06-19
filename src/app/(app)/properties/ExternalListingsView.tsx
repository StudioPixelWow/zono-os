"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  importAllAction,
  importMadlanAction,
  importYad2Action,
  promoteExternalListingAction,
} from "@/lib/external-listings/actions";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["external_listings"]["Row"];
const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", manual_external: "ידני", partner_api: "שותף" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function ExternalListingsView({ listings }: { listings: Row[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => { const r = await fn(); if (r?.error) setError(r.error); else router.refresh(); });
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4">
        <div>
          <p className="text-ink text-sm font-extrabold">מודעות חיצוניות (יד2 / מדלן)</p>
          <p className="text-muted text-xs">מודעות חיצוניות אינן נכסי CRM עד שתקודם אותן. הייבוא כרגע במצב הדמיה (mock).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(importYad2Action)} disabled={pending}>ייבוא יד2</Button>
          <Button size="sm" variant="secondary" onClick={() => run(importMadlanAction)} disabled={pending}>ייבוא מדלן</Button>
          <Button size="sm" onClick={() => run(importAllAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>ייבוא הכל</Button>
        </div>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {listings.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-warning-soft text-warning grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Map" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין מודעות חיצוניות</p>
          <p className="text-muted max-w-sm text-sm">לחץ על אחד מכפתורי הייבוא כדי למשוך מודעות (כרגע נתוני הדמיה). מודעה שתקודם תהפוך לנכס CRM.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead className="text-muted border-line border-b text-xs"><tr>{["מודעה", "מקור", "עיר", "מחיר", "חד׳", "הזדמנות", "פרטי?", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-line hover:bg-surface border-b last:border-0">
                  <td className="px-4 py-3">
                    {l.listing_url ? <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-brand font-bold">{l.title ?? "מודעה"}</a> : <span className="text-ink font-bold">{l.title ?? "מודעה"}</span>}
                  </td>
                  <td className="text-muted px-4 py-3">{SOURCE_LABELS[l.source] ?? l.source}</td>
                  <td className="text-muted px-4 py-3">{l.city ?? "—"}</td>
                  <td className="text-ink px-4 py-3 font-bold">{l.price ? formatShekels(l.price) : "—"}</td>
                  <td className="text-muted px-4 py-3">{l.rooms ?? "—"}</td>
                  <td className={cn("px-4 py-3 font-bold", tone(l.opportunity_score))}>{l.opportunity_score}</td>
                  <td className="text-muted px-4 py-3">{l.has_agent === false ? "פרטי" : l.has_agent ? "סוכן" : "—"}</td>
                  <td className="px-4 py-3">
                    {l.promoted_property_id ? <span className="text-success text-xs font-bold">קודם ✓</span> : <Button size="sm" variant="ghost" onClick={() => run(() => promoteExternalListingAction(l.id))} disabled={pending}>קדם ל-CRM</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
