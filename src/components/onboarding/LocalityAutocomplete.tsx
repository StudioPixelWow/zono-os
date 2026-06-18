"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { searchLocalities, type LocalityOption } from "@/lib/localities/search";

export interface SelectedLocality {
  localityId: string;
  nameHe: string;
  subdistrict: string | null;
  isPrimary: boolean;
}

interface Props {
  value: SelectedLocality[];
  onChange: (next: SelectedLocality[]) => void;
}

/** Hebrew search-as-you-type over public.israel_localities with multi-select. */
export function LocalityAutocomplete({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      if (active) setLoading(true);
      try {
        const r = await searchLocalities(query);
        if (active) setResults(r);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  const add = (o: LocalityOption) => {
    if (value.some((v) => v.localityId === o.id)) return;
    onChange([
      ...value,
      {
        localityId: o.id,
        nameHe: o.name_he,
        subdistrict: o.subdistrict,
        isPrimary: value.length === 0, // first selection becomes primary
      },
    ]);
    setQuery("");
  };

  const remove = (id: string) => {
    const next = value.filter((v) => v.localityId !== id);
    if (next.length > 0 && !next.some((v) => v.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    onChange(next);
  };

  const setPrimary = (id: string) =>
    onChange(value.map((v) => ({ ...v, isPrimary: v.localityId === id })));

  return (
    <div className="flex flex-col gap-3">
      {/* Search box */}
      <div className="relative">
        <div className="bg-surface border-line focus-within:border-brand-light flex h-11 items-center gap-2 rounded-xl border px-3">
          <Icon name="Search" size={16} className="text-muted" />
          <input
            className="text-ink h-full flex-1 bg-transparent text-sm outline-none"
            placeholder="חיפוש עיר / יישוב בעברית…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>

        {open && (
          <div className="bg-card border-line absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border shadow-[var(--shadow-lift)]">
            {loading && <p className="text-muted px-3 py-2 text-xs">מחפש…</p>}
            {!loading && results.length === 0 && (
              <p className="text-muted px-3 py-2 text-xs">לא נמצאו תוצאות</p>
            )}
            {!loading &&
              results.map((o) => {
                const chosen = value.some((v) => v.localityId === o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(o);
                    }}
                    disabled={chosen}
                    className="hover:bg-brand-soft flex w-full items-center justify-between px-3 py-2 text-start text-sm transition disabled:opacity-40"
                  >
                    <span className="text-ink font-semibold">{o.name_he}</span>
                    {o.subdistrict && (
                      <span className="text-muted text-xs">{o.subdistrict}</span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((v) => (
            <div
              key={v.localityId}
              className="bg-surface border-line flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrimary(v.localityId)}
                  title="סמן כעיר ראשית"
                  className={
                    v.isPrimary ? "text-warning" : "text-muted hover:text-warning"
                  }
                >
                  <Icon name={v.isPrimary ? "Sparkles" : "Sparkles"} size={16} />
                </button>
                <span className="text-ink text-sm font-semibold">{v.nameHe}</span>
                {v.isPrimary && (
                  <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">
                    ראשי
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(v.localityId)}
                className="text-muted hover:text-danger transition"
                title="הסר"
              >
                <Icon name="Minus" size={16} />
              </button>
            </div>
          ))}
          <p className="text-muted text-[11px]">
            לחיצה על הכוכב מסמנת עיר ראשית. נבחרו {value.length} ערים.
          </p>
        </div>
      )}
    </div>
  );
}
