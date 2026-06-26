// ============================================================================
// ZONO Orchestrator — central route revalidation. Call ONLY from server-action
// or route-handler contexts (where revalidatePath is valid).
// ============================================================================
import "server-only";
import { revalidatePath } from "next/cache";

export const ZONO_REVALIDATE_ROUTES = [
  "/", "/properties", "/market", "/command", "/property-radar",
  "/recommendations", "/buyers", "/sellers", "/deals", "/valuation",
] as const;

/** Revalidate every intelligence/dashboard route so fresh data shows next render. */
export function revalidateZonoRoutes(): number {
  let n = 0;
  for (const route of ZONO_REVALIDATE_ROUTES) {
    try { revalidatePath(route); n++; } catch { /* invalid context — skip */ }
  }
  return n;
}
