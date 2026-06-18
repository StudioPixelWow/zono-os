"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LocalityPicker } from "./LocalityPicker";
import {
  ISRAELI_REGION_LABELS,
  LISTING_KIND_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
} from "@/lib/properties/labels";
import type { PropertyInput } from "@/lib/properties/types";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

const DEFAULTS: PropertyInput = {
  title: "",
  description: "",
  type: "apartment",
  listingKind: "sale",
  status: "draft",
  price: 0,
  monthlyRent: null,
  rooms: null,
  sizeSqm: null,
  outdoorSqm: null,
  floor: null,
  totalFloors: null,
  city: "",
  region: null,
  address: "",
  neighborhood: "",
  hasParking: false,
  hasElevator: false,
  hasBalcony: false,
  hasSafeRoom: false,
  hasStorage: false,
  isAccessible: false,
  hasExclusivity: false,
  exclusivityEndsAt: null,
};

const FEATURES: { key: keyof PropertyInput; label: string }[] = [
  { key: "hasParking", label: "חניה" },
  { key: "hasElevator", label: "מעלית" },
  { key: "hasBalcony", label: "מרפסת" },
  { key: "hasSafeRoom", label: 'ממ"ד' },
  { key: "hasStorage", label: "מחסן" },
  { key: "isAccessible", label: "נגיש" },
];

const REGION_OPTIONS = Object.entries(ISRAELI_REGION_LABELS).map(([value, l]) => ({
  value,
  label: l,
}));

interface Props {
  initial?: Partial<PropertyInput>;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: PropertyInput) => Promise<{ error?: string }>;
}

export function PropertyForm({ initial, submitLabel, cancelHref, onSubmit }: Props) {
  const [form, setForm] = useState<PropertyInput>({ ...DEFAULTS, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await onSubmit(form);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* Basics */}
      <div className="bg-card border-line rounded-[20px] border p-5">
        <h2 className="text-ink mb-4 text-base font-extrabold">פרטי הנכס</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>כותרת *</span>
            <input
              className={`${field} mt-1`}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className="block">
            <span className={label}>סוג נכס</span>
            <select
              className={`${field} mt-1`}
              value={form.type}
              onChange={(e) => set("type", e.target.value as PropertyInput["type"])}
            >
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>סוג עסקה</span>
            <select
              className={`${field} mt-1`}
              value={form.listingKind}
              onChange={(e) =>
                set("listingKind", e.target.value as PropertyInput["listingKind"])
              }
            >
              {LISTING_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>סטטוס</span>
            <select
              className={`${field} mt-1`}
              value={form.status}
              onChange={(e) => set("status", e.target.value as PropertyInput["status"])}
            >
              {PROPERTY_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>מחיר (₪) *</span>
            <input
              type="number"
              className={`${field} mt-1`}
              value={form.price || ""}
              onChange={(e) => set("price", Number(e.target.value))}
            />
          </label>
          {form.listingKind === "rent" && (
            <label className="block">
              <span className={label}>שכ״ד חודשי (₪)</span>
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.monthlyRent ?? ""}
                onChange={(e) => set("monthlyRent", numOrNull(e.target.value))}
              />
            </label>
          )}
        </div>
      </div>

      {/* Specs */}
      <div className="bg-card border-line rounded-[20px] border p-5">
        <h2 className="text-ink mb-4 text-base font-extrabold">מאפיינים</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={label}>חדרים</span>
            <input
              type="number"
              step="0.5"
              className={`${field} mt-1`}
              value={form.rooms ?? ""}
              onChange={(e) => set("rooms", numOrNull(e.target.value))}
            />
          </label>
          <label className="block">
            <span className={label}>מ״ר</span>
            <input
              type="number"
              className={`${field} mt-1`}
              value={form.sizeSqm ?? ""}
              onChange={(e) => set("sizeSqm", numOrNull(e.target.value))}
            />
          </label>
          <label className="block">
            <span className={label}>מ״ר חוץ</span>
            <input
              type="number"
              className={`${field} mt-1`}
              value={form.outdoorSqm ?? ""}
              onChange={(e) => set("outdoorSqm", numOrNull(e.target.value))}
            />
          </label>
          <label className="block">
            <span className={label}>קומה</span>
            <input
              type="number"
              className={`${field} mt-1`}
              value={form.floor ?? ""}
              onChange={(e) => set("floor", numOrNull(e.target.value))}
            />
          </label>
          <label className="block">
            <span className={label}>סה״כ קומות</span>
            <input
              type="number"
              className={`${field} mt-1`}
              value={form.totalFloors ?? ""}
              onChange={(e) => set("totalFloors", numOrNull(e.target.value))}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FEATURES.map((f) => {
            const active = Boolean(form[f.key]);
            return (
              <button
                type="button"
                key={f.key}
                onClick={() => set(f.key, !active as never)}
                className={
                  "rounded-full border px-3.5 py-2 text-sm font-semibold transition " +
                  (active
                    ? "bg-brand border-brand text-white"
                    : "bg-card border-line text-ink hover:border-brand-light")
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Location */}
      <div className="bg-card border-line rounded-[20px] border p-5">
        <h2 className="text-ink mb-4 text-base font-extrabold">מיקום</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>עיר</span>
            <div className="mt-1">
              <LocalityPicker
                value={form.city ?? null}
                onChange={(v) => set("city", v)}
              />
            </div>
          </label>
          <label className="block">
            <span className={label}>אזור</span>
            <select
              className={`${field} mt-1`}
              value={form.region ?? ""}
              onChange={(e) => set("region", e.target.value || null)}
            >
              <option value="">—</option>
              {REGION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>כתובת</span>
            <input
              className={`${field} mt-1`}
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </label>
          <label className="block">
            <span className={label}>שכונה</span>
            <input
              className={`${field} mt-1`}
              value={form.neighborhood ?? ""}
              onChange={(e) => set("neighborhood", e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Exclusivity + description */}
      <div className="bg-card border-line rounded-[20px] border p-5">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.hasExclusivity}
              onChange={(e) => set("hasExclusivity", e.target.checked)}
            />
            בלעדיות
          </label>
          {form.hasExclusivity && (
            <label className="block">
              <span className={label}>בלעדיות עד</span>
              <input
                type="date"
                className={`${field} mt-1`}
                value={form.exclusivityEndsAt ?? ""}
                onChange={(e) => set("exclusivityEndsAt", e.target.value || null)}
              />
            </label>
          )}
        </div>
        <label className="mt-4 block">
          <span className={label}>תיאור</span>
          <textarea
            className={`${field} mt-1 h-24 py-2`}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? "שומר…" : submitLabel}
        </Button>
        <Link href={cancelHref} className="text-muted hover:text-ink text-sm font-semibold">
          ביטול
        </Link>
      </div>
    </div>
  );
}
