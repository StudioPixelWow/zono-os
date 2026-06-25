"use client";
// ============================================================================
// ZI Expert™ — client context collector (Phase 22).
// Gathers the non-sensitive client context ZI should already know: current
// route, selected entity ids (from the path), active filters (search params)
// and language. The server merges this with org/role/permissions.
// ============================================================================
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { knowledgeForRoute } from "@/lib/zi-expert/knowledge";
import { detectModule } from "@/lib/zi-expert/context";
import type { ZiClientContext, ZiSuggestion } from "@/lib/zi-expert/types";

const UUIDISH = /^[0-9a-f-]{8,}$/i;

/** Extract an id segment following a known collection prefix. */
function idAfter(pathParts: string[], collection: string): string | null {
  const i = pathParts.indexOf(collection);
  if (i === -1) return null;
  const next = pathParts[i + 1];
  if (next && next !== "new" && (UUIDISH.test(next) || next.length > 6)) return next;
  return null;
}

export interface ZiContextHook {
  client: ZiClientContext;
  moduleLabel: string | null;
  suggestions: ZiSuggestion[];
}

export function useZiContext(): ZiContextHook {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Stable string key so the memo recomputes when params change.
  const paramsKey = searchParams?.toString() ?? "";

  return useMemo(() => {
    const route = pathname || "/";
    const parts = route.split("/").filter(Boolean);

    const filters: Record<string, string> = {};
    if (paramsKey) {
      for (const [k, v] of new URLSearchParams(paramsKey).entries()) {
        if (v && !/token|secret|key|auth/i.test(k)) filters[k] = v.slice(0, 64);
      }
    }

    const client: ZiClientContext = {
      route,
      selectedPropertyId: idAfter(parts, "properties"),
      selectedBuyerId: idAfter(parts, "buyers"),
      selectedSellerId: idAfter(parts, "sellers"),
      selectedWorkflowId: idAfter(parts, "journeys") ?? idAfter(parts, "journey-builder"),
      selectedReportId: idAfter(parts, "executive-intelligence") ?? idAfter(parts, "reports"),
      filters: Object.keys(filters).length ? filters : null,
      language: typeof document !== "undefined" ? document.documentElement.lang || "he" : "he",
    };

    const mod = detectModule(route);
    const knowledge = knowledgeForRoute(route);
    return {
      client,
      moduleLabel: mod?.label ?? knowledge.title,
      suggestions: knowledge.suggestions,
    };
  }, [pathname, paramsKey]);
}
