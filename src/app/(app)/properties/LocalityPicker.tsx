"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { searchLocalities, type LocalityOption } from "@/lib/localities/search";

const field =
  "bg-surface border-line text-ink focus-within:border-brand-light flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm transition";

/**
 * Single-locality picker backed by public.israel_localities (Hebrew search).
 * Stores the chosen locality's Hebrew name so it stays consistent with the
 * canonical dataset.
 */
export function LocalityPicker({
  value,
  onChange,
  placeholder = "חיפוש עיר…",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
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

  return (
    <div className="relative">
      <div className={field}>
        <Icon name="Search" size={16} className="text-muted" />
        <input
          className="text-ink h-full flex-1 bg-transparent outline-none"
          placeholder={placeholder}
          value={open ? query : (value ?? "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && !open && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(null);
            }}
            className="text-muted hover:text-danger"
            aria-label="נקה"
          >
            <Icon name="Minus" size={15} />
          </button>
        )}
      </div>

      {open && (
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
                  onChange(o.name_he);
                  setOpen(false);
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
