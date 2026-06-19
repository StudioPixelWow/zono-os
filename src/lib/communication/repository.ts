/** Communication intelligence repositories — RLS-scoped (server-only). */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type CommProfileRow = DB["communication_intelligence_profiles"]["Row"];
export type CommCommitmentRow = DB["communication_commitments"]["Row"];
export type CommFollowupRow = DB["communication_followups"]["Row"];
export type CommInsightRow = DB["communication_insights"]["Row"];
export type CommThreadRow = DB["communication_threads"]["Row"];
export type CommMessageRow = DB["communication_messages"]["Row"];

export const commProfileRepository = {
  async get(entityType: string, entityId: string): Promise<CommProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("communication_intelligence_profiles")
      .select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
    return data ?? null;
  },
  async upsert(row: DB["communication_intelligence_profiles"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("communication_intelligence_profiles")
      .upsert(row as never, { onConflict: "org_id,entity_type,entity_id" });
    if (error) throw new Error(error.message);
  },
};

export const commCommitmentRepository = {
  async listByEntity(entityType: string, entityId: string): Promise<CommCommitmentRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("communication_commitments")
      .select("*").eq("entity_type", entityType).eq("entity_id", entityId)
      .order("due_date", { ascending: true, nullsFirst: false }).limit(100);
    return data ?? [];
  },
  async insert(row: DB["communication_commitments"]["Insert"]): Promise<CommCommitmentRow> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("communication_commitments").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    const patch: DB["communication_commitments"]["Update"] =
      status === "fulfilled" ? { status, fulfilled_at: new Date().toISOString() }
      : status === "broken" ? { status, broken_at: new Date().toISOString() }
      : { status };
    await supabase.from("communication_commitments").update(patch).eq("id", id);
  },
};

export const commFollowupRepository = {
  async listByEntity(entityType: string, entityId: string): Promise<CommFollowupRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("communication_followups")
      .select("*").eq("entity_type", entityType).eq("entity_id", entityId)
      .order("due_at", { ascending: true, nullsFirst: false }).limit(100);
    return data ?? [];
  },
  async insert(row: DB["communication_followups"]["Insert"]): Promise<CommFollowupRow> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("communication_followups").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async complete(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("communication_followups").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
  },
};

export const commInsightRepository = {
  async insert(row: DB["communication_insights"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    await supabase.from("communication_insights").insert(row as never);
  },
};

export const commThreadRepository = {
  /** Find an existing thread for an entity, else create one. */
  async findOrCreate(params: {
    orgId: string; entityType: string; entityId: string; channel: string; title: string | null;
  }): Promise<string> {
    const supabase = await createClient();
    const col = params.entityType === "seller" ? "seller_id"
      : params.entityType === "buyer" ? "buyer_id"
      : params.entityType === "property" ? "property_id"
      : params.entityType === "deal" ? "deal_id" : null;
    if (col) {
      const { data: existing } = await supabase.from("communication_threads").select("id").eq(col, params.entityId).limit(1).maybeSingle();
      if (existing?.id) return existing.id;
    }
    const insert: DB["communication_threads"]["Insert"] = {
      org_id: params.orgId, channel: params.channel, title: params.title, status: "open",
      ...(col ? { [col]: params.entityId } : {}),
    } as DB["communication_threads"]["Insert"];
    const { data, error } = await supabase.from("communication_threads").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  },
  async addMessage(row: DB["communication_messages"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("communication_messages").insert(row);
    if (error) throw new Error(error.message);
    await supabase.from("communication_threads").update({ last_message_at: new Date().toISOString() }).eq("id", row.thread_id);
  },
};
