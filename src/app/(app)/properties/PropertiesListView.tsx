"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RealEstatePropertyCard } from "@/components/property/RealEstatePropertyCard";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPE_OPTIONS,
  propertyAddressLine,
  type PropertyRow,
} from "@/lib/properties/labels";

import { inventoryBadges, type Badge as InvBadge } from "@/lib/properties/inventory";

interface Filters {
  city?: string;
  type?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
}

const BADGE_TONE: Record<InvBadge["tone"], string> = {
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  accent: "bg-sky-100 text-sky-700",
  neutral: "bg-surface text-muted",
};

function InventoryBadges({ badges }: { badges: InvBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE_TONE[b.tone])}>{b.label}</span>
      ))}
    </div>
  );
}

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";

export function PropertiesListView({
  properties,
  filters,
  error,
  currentUserId = null,
  covers = {},
}: {
  properties: PropertyRow[];
  filters: Filters;
  error?: boolean;
  currentUserId?: string | null;
  covers?: Record<string, string>;
}) {
  const [view, setView] = useState<"cards" | "table">("cards");

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold tracking-wide">CRM נכסים</p>
          <h1 className="text-ink text-2xl font-black">הנכסים שלך</h1>
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
              <Icon name="Building2" size={18} />
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
          <Link href="/properties/new">
            <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>
              נכס חדש
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
          name="city"
          defaultValue={filters.city ?? ""}
          placeholder="עיר"
          className={field}
        />
        <select name="type" defaultValue={filters.type ?? ""} className={field}>
          <option value="">כל הסוגים</option>
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className={field}>
          <option value="">כל הסטטוסים</option>
          {PROPERTY_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          name="minPrice"
          type="number"
          defaultValue={filters.minPrice ?? ""}
          placeholder="מחיר מ-"
          className={field}
        />
        <input
          name="maxPrice"
          type="number"
          defaultValue={filters.maxPrice ?? ""}
          placeholder="מחיר עד"
          className={field}
        />
        <input
          name="minRooms"
          type="number"
          step="0.5"
          defaultValue={filters.minRooms ?? ""}
          placeholder="חדרים מ-"
          className={field}
        />
        <div className="flex items-center gap-2">
          <input
            name="maxRooms"
            type="number"
            step="0.5"
            defaultValue={filters.maxRooms ?? ""}
            placeholder="חדרים עד"
            className={field}
          />
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-7">
          <Button type="submit" size="sm">
            סינון
          </Button>
          <Link href="/properties" className="text-muted hover:text-ink self-center text-sm font-semibold">
            נקה
          </Link>
        </div>
      </form>

      {/* States */}
      {error ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">
          לא ניתן לטעון את הנכסים כעת. נסה/י לרענן.
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl">
            <Icon name="Building2" size={26} />
          </span>
          <p className="text-ink text-lg font-extrabold">אין נכסים להצגה</p>
          <p className="text-muted max-w-sm text-sm">
            עדיין לא הוספת נכסים, או שאין נכסים שתואמים לסינון. אפשר להוסיף נכס חדש.
          </p>
          <Link href="/properties/new">
            <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>
              הוסף נכס ראשון
            </Button>
          </Link>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => (
            <RealEstatePropertyCard
              key={p.id}
              d={{
                href: `/properties/${p.id}`,
                title: p.title,
                imageUrl: covers[p.id] ?? p.primary_image_url,
                statusLabel: PROPERTY_STATUS_LABELS[p.status],
                statusTone: PROPERTY_STATUS_TONES[p.status],
                dealLabel: p.listing_kind === "rent" ? "להשכרה" : "למכירה",
                price: p.price,
                addressLine: `${PROPERTY_TYPE_LABELS[p.type]} · ${propertyAddressLine(p)}`,
                rooms: p.rooms,
                sqm: p.size_sqm,
                floor: p.floor,
                parking: p.parking_count,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
          <table className="w-full min-w-[640px] text-start text-sm">
            <thead className="text-muted border-line border-b text-xs">
              <tr>
                {["נכס", "סוג", "סטטוס", "מחיר", "חד׳", "מ״ר"].map((h) => (
                  <th key={h} className="px-4 py-3 text-start font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-line hover:bg-surface border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/properties/${p.id}`} className="text-ink font-bold hover:text-brand">
                      {p.title}
                    </Link>
                    <p className="text-muted text-xs">{propertyAddressLine(p)}</p>
                    <div className="mt-1"><InventoryBadges badges={inventoryBadges(p, currentUserId)} /></div>
                  </td>
                  <td className="text-muted px-4 py-3">{PROPERTY_TYPE_LABELS[p.type]}</td>
                  <td className="px-4 py-3">
                    <Badge tone={PROPERTY_STATUS_TONES[p.status]} size="sm">
                      {PROPERTY_STATUS_LABELS[p.status]}
                    </Badge>
                  </td>
                  <td className="text-ink px-4 py-3 font-bold">{formatShekels(p.price)}</td>
                  <td className="text-muted px-4 py-3">{p.rooms ?? "—"}</td>
                  <td className="text-muted px-4 py-3">{p.size_sqm ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
