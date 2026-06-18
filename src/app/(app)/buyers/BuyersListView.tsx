"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  PROPERTY_TYPE_LABELS,
  SOURCE_OPTIONS,
  TEMPERATURE_LABELS,
  TEMPERATURE_OPTIONS,
  TEMPERATURE_TONES,
  buyerBudgetLine,
  buyerRoomsLine,
  type BuyerRow,
} from "@/lib/buyers/labels";
import { PROPERTY_TYPE_OPTIONS } from "@/lib/properties/labels";
import type { BuyerFilters } from "@/lib/buyers/types";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";

function areasLine(b: BuyerRow): string {
  return b.preferred_areas.length ? b.preferred_areas.join(", ") : "—";
}
function typesLine(b: BuyerRow): string {
  return b.preferred_types.length
    ? b.preferred_types.map((t) => PROPERTY_TYPE_LABELS[t]).join(", ")
    : "—";
}

export function BuyersListView({
  buyers,
  filters,
  error,
}: {
  buyers: BuyerRow[];
  filters: BuyerFilters;
  error?: boolean;
}) {
  const [view, setView] = useState<"cards" | "table">("cards");

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold tracking-wide">CRM קונים</p>
          <h1 className="text-ink text-2xl font-black">הקונים שלך</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-card border-line flex overflow-hidden rounded-xl border">
            <button
              type="button"
              onClick={() => setView("cards")}
              className={cn(
                "grid h-9 w-9 place-items-center transition",
                view === "cards" ? "bg-brand-soft text-brand-strong" : "text-muted",
              )}
              aria-label="תצוגת כרטיסים"
            >
              <Icon name="Users" size={18} />
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "grid h-9 w-9 place-items-center transition",
                view === "table" ? "bg-brand-soft text-brand-strong" : "text-muted",
              )}
              aria-label="תצוגת טבלה"
            >
              <Icon name="BarChart3" size={18} />
            </button>
          </div>
          <Link href="/buyers/new">
            <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>
              קונה חדש
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters (GET form → server refetch) */}
      <form
        method="get"
        className="bg-card border-line grid grid-cols-2 gap-3 rounded-[20px] border p-4 sm:grid-cols-3 lg:grid-cols-7"
      >
        <input
          name="locality"
          defaultValue={filters.locality ?? ""}
          placeholder="עיר מועדפת"
          className={field}
        />
        <select name="type" defaultValue={filters.type ?? ""} className={field}>
          <option value="">כל סוגי הנכס</option>
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className={field}>
          <option value="">כל הסטטוסים</option>
          {TEMPERATURE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} className={field}>
          <option value="">כל המקורות</option>
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          name="minBudget"
          type="number"
          defaultValue={filters.minBudget ?? ""}
          placeholder="תקציב מ-"
          className={field}
        />
        <input
          name="maxBudget"
          type="number"
          defaultValue={filters.maxBudget ?? ""}
          placeholder="תקציב עד"
          className={field}
        />
        <input
          name="roomsMin"
          type="number"
          step="0.5"
          defaultValue={filters.roomsMin ?? ""}
          placeholder="חדרים מ-"
          className={field}
        />
        <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-7">
          <Button type="submit" size="sm">
            סינון
          </Button>
          <Link
            href="/buyers"
            className="text-muted hover:text-ink self-center text-sm font-semibold"
          >
            נקה
          </Link>
        </div>
      </form>

      {/* States */}
      {error ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">
          לא ניתן לטעון את הקונים כעת. נסה/י לרענן.
        </div>
      ) : buyers.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl">
            <Icon name="Users" size={26} />
          </span>
          <p className="text-ink text-lg font-extrabold">אין קונים להצגה</p>
          <p className="text-muted max-w-sm text-sm">
            עדיין לא הוספת קונים, או שאין קונים שתואמים לסינון. אפשר להוסיף קונה חדש.
          </p>
          <Link href="/buyers/new">
            <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>
              הוסף קונה ראשון
            </Button>
          </Link>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {buyers.map((b) => (
            <Link
              key={b.id}
              href={`/buyers/${b.id}`}
              className="bg-card border-line hover:shadow-[var(--shadow-lift)] flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)] transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-ink text-base font-extrabold leading-snug">
                  {b.full_name}
                </h3>
                {b.temperature && (
                  <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
                    {TEMPERATURE_LABELS[b.temperature]}
                  </Badge>
                )}
              </div>
              <p className="text-brand-strong text-lg font-black">{buyerBudgetLine(b)}</p>
              <p className="text-muted text-sm">{typesLine(b)}</p>
              <div className="text-muted flex items-center gap-3 text-xs font-medium">
                <span>{buyerRoomsLine(b)}</span>
                <span className="bg-line h-3 w-px" />
                <span className="truncate">{areasLine(b)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
          <table className="w-full min-w-[680px] text-start text-sm">
            <thead className="text-muted border-line border-b text-xs">
              <tr>
                {["שם", "תקציב", "חדרים", "ערים", "סטטוס"].map((h) => (
                  <th key={h} className="px-4 py-3 text-start font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => (
                <tr key={b.id} className="border-line hover:bg-surface border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/buyers/${b.id}`} className="text-ink font-bold hover:text-brand">
                      {b.full_name}
                    </Link>
                    <p className="text-muted text-xs">{b.phone ?? "—"}</p>
                  </td>
                  <td className="text-ink px-4 py-3 font-bold">{buyerBudgetLine(b)}</td>
                  <td className="text-muted px-4 py-3">{buyerRoomsLine(b)}</td>
                  <td className="text-muted px-4 py-3">{areasLine(b)}</td>
                  <td className="px-4 py-3">
                    {b.temperature ? (
                      <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
                        {TEMPERATURE_LABELS[b.temperature]}
                      </Badge>
                    ) : (
                      "—"
                    )}
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
