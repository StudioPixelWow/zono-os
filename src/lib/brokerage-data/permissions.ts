// ============================================================================
// ZONO Core Data — Brokerage Data access model (server-only).
// zono_owner → full national access; brokerage_office/agent → city-scoped reads.
// RLS already enforces this at the DB; this layer is for app-level gating of
// owner-only actions (refresh / merge / resolve-conflict / sources / export).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { BrokerageAccess, OrgRoleType } from "./types";

/** Resolve the current org's brokerage access (role + allowed cities). */
export async function getBrokerageAccess(): Promise<BrokerageAccess | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  const db = createServiceRoleClient();
  const { data } = await db
    .from("organizations" as never)
    .select("role_type,allowed_data_cities")
    .eq("id", profile.org_id)
    .maybeSingle();
  const row = (data ?? null) as { role_type?: string; allowed_data_cities?: string[] } | null;
  const roleType = (row?.role_type ?? "brokerage_office") as OrgRoleType;
  return {
    isOwner: roleType === "zono_owner",
    allowedCities: Array.isArray(row?.allowed_data_cities) ? row!.allowed_data_cities! : [],
    roleType,
  };
}

/** Throw unless the current org is the ZONO owner (for management actions). */
export async function requireOwner(): Promise<BrokerageAccess> {
  const access = await getBrokerageAccess();
  if (!access) throw new Error("not authenticated");
  if (!access.isOwner) throw new Error("forbidden — owner only");
  return access;
}
