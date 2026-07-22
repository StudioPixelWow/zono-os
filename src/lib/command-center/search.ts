// ============================================================================
// ⌘ ZONO OS 2.0 — STAGE 6 · Batch 6.4 · COMMAND CENTER — search runtime (PURE).
//
// The ONE search/aggregation runtime. It does NOT search anything itself: it
// MAPS the output of existing providers into canonical commands —
//   · entities  ← the canonical omnisearch (search_documents via
//                 globalSearchAction) — the one search engine, no SQL here.
//   · navigation / quick actions ← the existing command registry.
//   · recent ← the existing useRecentItems store.
// Deterministic, side-effect free — safe to unit test offline. No AI, no
// scoring, no recommendations, no invented actions.
// ============================================================================
import type { SearchGroup } from "@/lib/search/service";
import { QUICK_ACTIONS, DEFAULT_FAVORITE_IDS, favoriteItems, searchCommands, type CommandItem } from "@/components/navigation/commandRegistry";
import type { CanonicalCommand, CommandGroup, CommandTargetKind } from "./types";

/** The canonical workspaces are static navigation targets (no provider needed). */
export const WORKSPACE_COMMANDS: CanonicalCommand[] = [
  { id: "ws-executive", kind: "navigate", groupKey: "workspace", label: "סביבת העבודה הניהולית", subtitle: "Executive Workspace", icon: "LayoutDashboard", target: { kind: "workspace", id: null, href: "/executive-workspace", event: null }, keywords: ["executive", "ניהול", "מנהל"] },
  { id: "ws-broker", kind: "navigate", groupKey: "workspace", label: "סביבת העבודה שלי", subtitle: "Broker Workspace", icon: "User", target: { kind: "workspace", id: null, href: "/broker-workspace", event: null }, keywords: ["broker", "סוכן", "שלי"] },
  { id: "ws-communication", kind: "navigate", groupKey: "workspace", label: "מרכז התקשורת", subtitle: "Communication Workspace", icon: "MessageSquare", target: { kind: "workspace", id: null, href: "/communication-workspace", event: null }, keywords: ["תקשורת", "שיחות", "inbox"] },
];

/** omnisearch entity_type → canonical command target kind. */
const TARGET_KIND: Record<string, CommandTargetKind> = {
  property: "property", external_listing: "property", buyer: "buyer", seller: "seller",
  lead: "lead", deal: "deal", meeting: "meeting", task: "task", journey: "journey",
  document: "document", agent: "agent",
};

/**
 * Map the canonical omnisearch result (already RLS + owner scoped) into JUMP
 * commands. Every field is inherited verbatim from the hit — no re-ranking, no
 * synthesis. This is the "provider search" path; the search itself ran in the
 * frozen search service.
 */
export function mapEntityGroups(groups: SearchGroup[]): CommandGroup[] {
  return groups.map((g) => ({
    key: `entity:${g.type}`,
    label: g.label,
    icon: g.icon,
    commands: g.hits.map((h): CanonicalCommand => ({
      id: `jump:${g.type}:${h.id}`,
      kind: "jump",
      groupKey: `entity:${g.type}`,
      label: h.title,
      subtitle: h.subtitle,
      icon: g.icon,
      target: { kind: TARGET_KIND[g.type] ?? "page", id: h.id, href: h.href, event: null },
      keywords: [],
    })),
  })).filter((grp) => grp.commands.length > 0);
}

/** One registry item → a canonical navigate / quick-action command. */
export function mapRegistryItem(item: CommandItem): CanonicalCommand {
  const isAction = item.type === "action";
  return {
    id: `reg:${item.id}`,
    kind: isAction ? "quick_action" : "navigate",
    groupKey: isAction ? "quick_action" : "navigate",
    label: item.label,
    subtitle: item.description ?? item.category,
    icon: item.icon,
    target: item.action
      ? { kind: "action", id: item.id, href: null, event: item.action }   // EXISTING window-event action
      : { kind: "page", id: item.id, href: item.href ?? null, event: null },
    keywords: item.keywords ?? [],
  };
}

/** Navigation matches for a typed query — from the existing registry only. */
export function navigationCommands(query: string): CommandGroup {
  const items = searchCommands(query).filter((i) => !i.disabled && i.type !== "action");
  const wsMatches = WORKSPACE_COMMANDS.filter((c) => matches(c, query));
  return { key: "navigate", label: "ניווט", icon: "Compass", commands: [...wsMatches, ...items.map(mapRegistryItem)] };
}

/** Quick-action matches for a typed query — existing actions only, never invented. */
export function quickActionCommands(query: string): CommandGroup {
  const src = query.trim() ? searchCommands(query).filter((i) => i.type === "action") : QUICK_ACTIONS;
  return { key: "quick_action", label: "פעולות מהירות", icon: "Zap", commands: src.filter((i) => !i.disabled).map(mapRegistryItem) };
}

/** Pinned commands — the existing favorites, as canonical navigate commands. */
export function pinnedCommands(): CommandGroup {
  return { key: "pinned", label: "נעוצים", icon: "Star", commands: favoriteItems(DEFAULT_FAVORITE_IDS).filter((i) => !i.disabled).map(mapRegistryItem) };
}

/** Suggested — the canonical workspaces (existing routes), a safe default entry
 *  point. NOT AI suggestions / recommendations. */
export function suggestedCommands(): CommandGroup {
  return { key: "suggested", label: "מוצע", icon: "Sparkles", commands: WORKSPACE_COMMANDS };
}

/** Recent items (from the existing store) → read-only recent commands. */
export interface RecentLike { id: string; label: string; href: string; icon?: string; category?: string }
export function recentCommands(items: RecentLike[]): CommandGroup {
  return {
    key: "recent",
    label: "אחרונים",
    icon: "Clock",
    commands: items.map((r): CanonicalCommand => ({
      id: `recent:${r.id}`,
      kind: "recent",
      groupKey: "recent",
      label: r.label,
      subtitle: r.category ?? null,
      icon: r.icon ?? "Clock",
      target: { kind: "page", id: r.id, href: r.href, event: null },
      keywords: [],
    })),
  };
}

const matches = (c: CanonicalCommand, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [c.label, c.subtitle ?? "", ...c.keywords].join(" ").toLowerCase().includes(q);
};

/** Flatten groups into the linear order used for keyboard navigation. */
export function flattenGroups(groups: CommandGroup[]): CanonicalCommand[] {
  return groups.flatMap((g) => g.commands);
}

/** Drop empty groups (honest empty state, never a fabricated group). */
export const nonEmpty = (groups: CommandGroup[]): CommandGroup[] => groups.filter((g) => g.commands.length > 0);
