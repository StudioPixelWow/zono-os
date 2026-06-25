// ============================================================================
// ZI Expert™ — context engine (Phase 22, PURE / client-safe).
// buildZIContext() assembles everything ZI should already know about the user's
// situation: route, module, page title, role, permissions, language, selected
// entities, filters and operating area. Smart page detection maps route→module
// →knowledge page so the user never has to explain where they are.
// All values here are non-sensitive (no secrets / tokens / raw ids of others).
// ============================================================================
import { MODULES, type ModuleEntry } from "@/lib/navigation/registry";
import { knowledgeForModule, knowledgeForRoute } from "./knowledge";
import { accessibleModuleIds } from "./permissions";
import type { RoleKey, ZiClientContext, ZiContext } from "./types";

/** Match a pathname to its navigation module (exact, then longest prefix). */
export function detectModule(route: string | null): ModuleEntry | null {
  if (!route) return null;
  const exact = MODULES.find((m) => m.route === route);
  if (exact) return exact;
  let best: ModuleEntry | null = null;
  let bestLen = 0;
  for (const m of MODULES) {
    if (m.route !== "/" && route.startsWith(m.route) && m.route.length > bestLen) { best = m; bestLen = m.route.length; }
  }
  return best;
}

/** The knowledge-base page key for a route (smart page detection). */
export function detectPageKey(route: string | null): string {
  const mod = detectModule(route);
  const byModule = mod ? knowledgeForModule(mod.id) : null;
  if (byModule && byModule.pageKey !== "general") return byModule.pageKey;
  return knowledgeForRoute(route).pageKey;
}

export interface ServerContextParts {
  organizationName: string | null;
  plan: string | null;
  roleKey: RoleKey | null;
  roleLabel: string | null;
  operatingCity: string | null;
  operatingNeighborhood: string | null;
  featureFlags: string[];
}

/**
 * Merge the client-collected context with server-derived identity/permission
 * context into the full, sanitized ZiContext used to prime the model.
 */
export function buildZIContext(client: ZiClientContext, server: ServerContextParts): ZiContext {
  const mod = detectModule(client.route);
  const knowledge = mod ? knowledgeForModule(mod.id) : knowledgeForRoute(client.route);
  return {
    route: client.route,
    moduleId: mod?.id ?? null,
    moduleLabel: mod?.label ?? knowledge.title,
    moduleDescription: mod?.description ?? knowledge.summary,
    pageKey: knowledge.pageKey,
    organizationName: server.organizationName,
    plan: server.plan,
    roleKey: server.roleKey,
    roleLabel: server.roleLabel,
    language: client.language || "he",
    selectedPropertyId: client.selectedPropertyId,
    selectedBuyerId: client.selectedBuyerId,
    selectedSellerId: client.selectedSellerId,
    selectedWorkflowId: client.selectedWorkflowId,
    selectedReportId: client.selectedReportId,
    filters: client.filters,
    operatingCity: server.operatingCity,
    operatingNeighborhood: server.operatingNeighborhood,
    featureFlags: server.featureFlags,
    accessibleModules: accessibleModuleIds(server.roleKey),
  };
}

/** Compact, human-readable context block for the prompt (no ids of other orgs). */
export function contextToPromptBlock(ctx: ZiContext): string {
  const lines: string[] = [];
  lines.push(`עמוד נוכחי: ${ctx.moduleLabel ?? "—"}${ctx.route ? ` (${ctx.route})` : ""}`);
  if (ctx.moduleDescription) lines.push(`תיאור העמוד: ${ctx.moduleDescription}`);
  if (ctx.organizationName) lines.push(`ארגון: ${ctx.organizationName}${ctx.plan ? ` · חבילה: ${ctx.plan}` : ""}`);
  if (ctx.roleLabel || ctx.roleKey) lines.push(`תפקיד המשתמש: ${ctx.roleLabel ?? ctx.roleKey}`);
  if (ctx.operatingCity) lines.push(`אזור התמחות: ${ctx.operatingCity}${ctx.operatingNeighborhood ? ` / ${ctx.operatingNeighborhood}` : ""}`);
  const sel: string[] = [];
  if (ctx.selectedPropertyId) sel.push("נכס נבחר");
  if (ctx.selectedBuyerId) sel.push("קונה נבחר");
  if (ctx.selectedSellerId) sel.push("מוכר נבחר");
  if (ctx.selectedWorkflowId) sel.push("מסע נבחר");
  if (ctx.selectedReportId) sel.push("דוח נבחר");
  if (sel.length) lines.push(`הקשר נבחר: ${sel.join(", ")}`);
  if (ctx.filters && Object.keys(ctx.filters).length) {
    lines.push(`מסננים פעילים: ${Object.entries(ctx.filters).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  lines.push(`שפה: ${ctx.language}`);
  return lines.join("\n");
}
