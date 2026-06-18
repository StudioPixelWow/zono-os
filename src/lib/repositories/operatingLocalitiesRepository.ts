/**
 * Operating-localities repository.
 *
 * Writes (onboarding) run under service-role and fully replace a subject's
 * localities (idempotent). Reads run under the caller's RLS session and join
 * israel_localities for display names. Server-only.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export interface OperatingLocalityInput {
  locality_id: string;
  is_primary: boolean;
  min_price: number | null;
  max_price: number | null;
  min_rooms: number | null;
  max_rooms: number | null;
  property_types: string[];
  deal_types: string[];
}

export interface OperatingLocality extends OperatingLocalityInput {
  id: string;
  name_he: string;
  subdistrict: string | null;
}

const SELECT_WITH_NAME =
  "id, locality_id, is_primary, min_price, max_price, min_rooms, max_rooms, property_types, deal_types, israel_localities(name_he, subdistrict)";

type JoinedRow = {
  id: string;
  locality_id: string;
  is_primary: boolean;
  min_price: number | null;
  max_price: number | null;
  min_rooms: number | null;
  max_rooms: number | null;
  property_types: string[];
  deal_types: string[];
  israel_localities: { name_he: string; subdistrict: string | null } | null;
};

function shape(rows: JoinedRow[]): OperatingLocality[] {
  return rows.map((r) => ({
    id: r.id,
    locality_id: r.locality_id,
    is_primary: r.is_primary,
    min_price: r.min_price,
    max_price: r.max_price,
    min_rooms: r.min_rooms,
    max_rooms: r.max_rooms,
    property_types: r.property_types ?? [],
    deal_types: r.deal_types ?? [],
    name_he: r.israel_localities?.name_he ?? "",
    subdistrict: r.israel_localities?.subdistrict ?? null,
  }));
}

/** Replace an organization's operating localities (service-role). */
export async function setOrgOperatingLocalities(
  organizationId: string,
  rows: OperatingLocalityInput[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("organization_operating_localities")
    .delete()
    .eq("organization_id", organizationId);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("organization_operating_localities")
    .insert(rows.map((r) => ({ ...r, organization_id: organizationId })));
  if (error) throw new Error(`org operating localities: ${error.message}`);
}

/** Replace a user's operating localities (service-role). */
export async function setUserOperatingLocalities(
  userId: string,
  rows: OperatingLocalityInput[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("user_operating_localities").delete().eq("user_id", userId);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("user_operating_localities")
    .insert(rows.map((r) => ({ ...r, user_id: userId })));
  if (error) throw new Error(`user operating localities: ${error.message}`);
}

/** The current user's operating localities (RLS), with display names. */
export async function getCurrentUserOperatingLocalities(): Promise<OperatingLocality[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_operating_localities")
    .select(SELECT_WITH_NAME)
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false });
  if (error) return [];
  return shape((data ?? []) as unknown as JoinedRow[]);
}

/** The current organization's operating localities (RLS), with display names. */
export async function getOrgOperatingLocalities(
  organizationId: string,
): Promise<OperatingLocality[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_operating_localities")
    .select(SELECT_WITH_NAME)
    .eq("organization_id", organizationId)
    .order("is_primary", { ascending: false });
  if (error) return [];
  return shape((data ?? []) as unknown as JoinedRow[]);
}
