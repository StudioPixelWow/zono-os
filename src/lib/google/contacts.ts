// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Google Contacts (server-only).
//
// READ-ONLY People API. Reads names, emails, phones, organizations and STAGES
// them into google_contact_imports. It NEVER writes to the CRM and NEVER
// auto-merges: a staged contact only becomes a CRM link when the user takes an
// explicit merge action (markContactMerged), which records the CRM reference —
// it does not itself mutate any frozen CRM table (Part 4).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "./tokens";
import type { GoogleConnection, GoogleContact } from "./types";

const PEOPLE_BASE = "https://people.googleapis.com/v1";
const TABLE = "google_contact_imports";

interface RawPerson {
  resourceName?: string;
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string }[];
  organizations?: { name?: string }[];
}

/** Read the connected account's contacts (read-only). Honest empty when no
 *  valid token. Never writes anything. */
export async function listGoogleContacts(conn: GoogleConnection, max = 200): Promise<GoogleContact[]> {
  const token = await getValidAccessToken(conn);
  if (!token) return [];
  const url = new URL(`${PEOPLE_BASE}/people/me/connections`);
  url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations");
  url.searchParams.set("pageSize", String(Math.min(max, 1000)));
  try {
    const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const json = (await res.json()) as { connections?: RawPerson[] };
    return (json.connections ?? []).filter((p) => !!p.resourceName).map((p) => ({
      resourceName: p.resourceName as string,
      displayName: p.names?.[0]?.displayName ?? null,
      emails: (p.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => !!v),
      phones: (p.phoneNumbers ?? []).map((e) => e.value).filter((v): v is string => !!v),
      organization: p.organizations?.[0]?.name ?? null,
    }));
  } catch {
    return [];
  }
}

/** Stage contacts for review (service-role write to the staging table ONLY).
 *  This is the "import" — it does NOT touch the CRM. Idempotent per resourceName. */
export async function stageContacts(conn: GoogleConnection, contacts: GoogleContact[]): Promise<number> {
  if (contacts.length === 0) return 0;
  const db = createServiceRoleClient();
  const rows = contacts.map((c) => ({
    org_id: conn.orgId, user_id: conn.userId, connection_id: conn.id, resource_name: c.resourceName,
    display_name: c.displayName, emails: c.emails, phones: c.phones, organization: c.organization,
  }));
  const { error } = await db.from(TABLE as never).upsert(rows as never, { onConflict: "connection_id,resource_name" } as never);
  return error ? 0 : rows.length;
}

/** Read staged contacts for the current connection (RLS-scoped read at the UI). */
export async function listStagedContacts(orgId: string): Promise<Array<{ id: string; resourceName: string; displayName: string | null; emails: string[]; phones: string[]; organization: string | null; mergedInto: string | null }>> {
  const db = createServiceRoleClient();
  const { data } = await db.from(TABLE as never).select("*").eq("org_id", orgId).order("display_name", { ascending: true }).limit(500);
  return ((data as unknown as Array<{ id: string; resource_name: string; display_name: string | null; emails: string[] | null; phones: string[] | null; organization: string | null; merged_into: string | null }>) ?? []).map((r) => ({
    id: r.id, resourceName: r.resource_name, displayName: r.display_name, emails: r.emails ?? [], phones: r.phones ?? [], organization: r.organization, mergedInto: r.merged_into,
  }));
}

/**
 * EXPLICIT merge: record that the user chose to link a staged contact to a CRM
 * entity. This writes ONLY the mapping (merged_into / merged_at) on the staging
 * row — it never auto-creates or mutates a CRM record. Auto-merge is impossible
 * by construction: there is no code path that calls this without a user action.
 */
export async function markContactMerged(importId: string, crmRef: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { error } = await db.from(TABLE as never).update({ merged_into: crmRef, merged_at: new Date().toISOString() } as never).eq("id", importId);
  return !error;
}
