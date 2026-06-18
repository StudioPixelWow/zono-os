/**
 * Buyers repository — RLS-scoped authenticated access.
 *
 * All reads/writes go through the cookie server client, so Postgres RLS keeps
 * everything organization-scoped. Create sets org_id/owner_id from the session.
 * Fields without a dedicated column (deal kind, source) live in preferences
 * (jsonb). Server-only — never import from a Client Component.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database, PropertyType } from "@/lib/supabase/types";
import type { BuyerFilters, BuyerInput, BuyerPreferences } from "./types";
import { buyerMissingPreferences } from "./labels";

export type BuyerRow = Database["public"]["Tables"]["buyers"]["Row"];
export type { BuyerFilters, BuyerInput } from "./types";

function toRecord(input: BuyerInput) {
  const preferences: BuyerPreferences = {};
  if (input.dealKind) preferences.deal_kind = input.dealKind;
  if (input.source) preferences.source = input.source;
  return {
    full_name: input.fullName.trim() || "קונה ללא שם",
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
    temperature: input.temperature ?? null,
    budget_min: input.budgetMin ?? null,
    budget_max: input.budgetMax ?? null,
    rooms_min: input.roomsMin ?? null,
    rooms_max: input.roomsMax ?? null,
    preferred_types: input.preferredTypes ?? [],
    preferred_areas: input.preferredAreas ?? [],
    must_have_parking: input.mustHaveParking,
    must_have_elevator: input.mustHaveElevator,
    must_have_safe_room: input.mustHaveSafeRoom,
    preferences: preferences as Database["public"]["Tables"]["buyers"]["Row"]["preferences"],
  };
}

/** Org-scoped list with filters (RLS guarantees the org boundary). */
export async function listBuyers(filters: BuyerFilters = {}): Promise<BuyerRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("buyers")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters.locality) q = q.contains("preferred_areas", [filters.locality]);
  if (filters.type) q = q.contains("preferred_types", [filters.type as PropertyType]);
  if (filters.status) q = q.eq("temperature", filters.status);
  if (filters.source) q = q.eq("preferences->>source", filters.source);
  if (filters.minBudget != null) q = q.gte("budget_max", filters.minBudget);
  if (filters.maxBudget != null) q = q.lte("budget_min", filters.maxBudget);
  if (filters.roomsMin != null) q = q.gte("rooms_max", filters.roomsMin);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBuyerById(id: string): Promise<BuyerRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buyers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function createBuyer(input: BuyerInput): Promise<BuyerRow> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyers")
    .insert({ ...toRecord(input), org_id: profile.org_id, owner_id: user.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateBuyer(
  id: string,
  input: BuyerInput,
): Promise<BuyerRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyers")
    .update(toRecord(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Stamp the last-contacted time (used by follow-up tracking). */
export async function markBuyerContacted(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("buyers")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
}

// ── Related records for the details page ─────────────────────────────────────
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];

export async function getBuyerActivities(id: string): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("buyer_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getBuyerTasks(id: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("buyer_id", id)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);
  return data ?? [];
}

export async function getBuyerNotes(id: string): Promise<NoteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("buyer_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getBuyerMeetings(id: string): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("buyer_id", id)
    .order("start_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

// ── Dashboard board ──────────────────────────────────────────────────────────
export interface BuyerBoard {
  newBuyers: BuyerRow[];
  followUp: BuyerRow[];
  missingPreferences: BuyerRow[];
  recentlyUpdated: BuyerRow[];
  total: number;
}

const DAY = 86_400_000;

export async function listBuyerBoard(): Promise<BuyerBoard> {
  const supabase = await createClient();
  const { data } = await supabase.from("buyers").select("*").limit(500);
  const buyers = (data ?? []) as BuyerRow[];
  const now = Date.now();

  const newBuyers = buyers
    .filter((b) => now - new Date(b.created_at).getTime() <= 7 * DAY)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Hot/warm buyers not contacted in the last 7 days (or never).
  const followUp = buyers
    .filter(
      (b) =>
        (b.temperature === "hot" || b.temperature === "warm") &&
        (!b.last_contacted_at ||
          now - new Date(b.last_contacted_at).getTime() >= 7 * DAY),
    )
    .sort((a, b) => {
      const ax = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
      const bx = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
      return ax - bx;
    });

  const missingPreferences = buyers.filter(buyerMissingPreferences);

  const recentlyUpdated = [...buyers]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  return {
    newBuyers: newBuyers.slice(0, 6),
    followUp: followUp.slice(0, 6),
    missingPreferences: missingPreferences.slice(0, 6),
    recentlyUpdated,
    total: buyers.length,
  };
}
