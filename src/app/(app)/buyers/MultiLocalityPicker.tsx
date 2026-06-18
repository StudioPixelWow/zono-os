"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { searchLocalities, type LocalityOption } from "@/lib/localities/search";

const box =
  "bg-surface border-line focus-within:border-brand-light flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5 transition";

/**
 * Multi-locality picker backed by public.israel_localities. Stores the chosen
 * Hebrew names as a string[] (matches buyers.preferred_areas).
 */
export function MultiLocalityPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [query, open]);

  const add = (name: string) => {
    if (!value.includes(name)) onChange([...value, name]);
    setQuery("");
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  return (
    <div className="relative">
      <div className={box}>
        {value.map((name) => (
          <span
            key={name}
            className="bg-brand-soft text-brand-strong flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
          >
            {name}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                remove(name);
              }}
              aria-label="הסר"
              className="hover:text-danger"
            >
              <Icon name="Minus" size={12} />
            </button>
          </span>
        ))}
        <input
          className="text-ink h-7 min-w-[100px] flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder={value.length ? "" : "הוסף עיר…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>

      {open && query.trim() && (
        <div className="bg-card border-line absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border shadow-[var(--shadow-lift)]">
          {loading && <p className="text-muted px-3 py-2 text-xs">מחפש…</p>}
          {!loading && results.length === 0 && (
            <p className="text-muted px-3 py-2 text-xs">לא נמצאו תוצאות</p>
          )}
          {!loading &&
            results.map((o) => (
              <button
                type="button"
                key={o.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o.name_he);
                }}
                className="hover:bg-brand-soft flex w-full items-center justify-between px-3 py-2 text-start text-sm transition"
              >
                <span className="text-ink font-semibold">{o.name_he}</span>
                {o.subdistrict && (
                  <span className="text-muted text-xs">{o.subdistrict}</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
