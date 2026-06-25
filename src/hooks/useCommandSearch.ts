"use client";
// ============================================================================
// ZONO — Command Center search hook. Filters the unified command registry
// client-side and groups results by category for the search dropdown.
// Keyboard navigation state (active index) lives here too.
// ============================================================================
import { useMemo, useState } from "react";
import { searchCommands, type CommandItem } from "@/components/navigation/commandRegistry";

export interface CommandGroup { category: string; items: CommandItem[] }

export function useCommandSearch(query: string) {
  const [active, setActive] = useState(0);
  // Reset the highlight when the query changes — done during render (the
  // React-recommended pattern) rather than in an effect.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) { setPrevQuery(query); setActive(0); }

  const flat = useMemo<CommandItem[]>(() => searchCommands(query), [query]);

  const groups = useMemo<CommandGroup[]>(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of flat) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    // Preferred category ordering.
    const order = ["פעולות", "נכסים", "לקוחות", "עסקאות", "AI", "עמודים"];
    return Array.from(map.entries())
      .sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([category, items]) => ({ category, items }));
  }, [flat]);

  return { flat, groups, active, setActive, hasQuery: query.trim().length > 0 };
}
