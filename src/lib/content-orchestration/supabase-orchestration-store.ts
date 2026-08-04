// ============================================================================
// ZONO — DB-backed OrchestrationStore.
//
// `DbOrchestrationStore` implements the OrchestrationStore contract over the
// narrow `StoreClient` seam (in-memory in tests, Supabase in runtime). Every
// read/write is organization-scoped; the org id comes from the trusted context,
// never from the client. Idempotency + optimistic locking are enforced here.
//
// `SupabaseStoreClient` is the real (server-only) Supabase implementation of the
// StoreClient seam — production-usable; not integration-tested against a live DB
// in this sandbox (no local Supabase stack).
// ============================================================================
import type { OrchestrationStore, OutputRecord, PublicationRecord } from "./creative-content-service";
import type { UsageEventRow } from "../creative-studio/usage-logging";
import type { StoreClient, WhereEq } from "./store-client";
import { OptimisticLockConflict } from "./store-client";

const T = {
  outputs: "zono_quick_creative_outputs",
  usage: "usage_events",
  publications: "creative_publications",
  idem: "creative_idempotency",
} as const;

export class DbOrchestrationStore implements OrchestrationStore {
  constructor(private db: StoreClient) {}

  async getByIdempotencyKey(orgId: string, scope: string, key: string): Promise<string | null> {
    const row = await this.db.selectOne<{ ref_id: string }>(T.idem, { org_id: orgId, scope, key });
    return row?.ref_id ?? null;
  }
  async putIdempotencyKey(orgId: string, scope: string, key: string, id: string): Promise<void> {
    await this.db.insert(T.idem, { org_id: orgId, scope, key, ref_id: id });
  }

  async insertOutput(rec: OutputRecord): Promise<void> {
    await this.db.insert(T.outputs, {
      id: rec.id, org_id: rec.orgId, content_item_id: rec.contentItemId, output_type: rec.kind,
      status: rec.state, root_output_id: rec.lineage.rootOutputId, parent_output_id: rec.lineage.parentOutputId,
      generation_round: rec.lineage.generationRound, refinement_reason: rec.lineage.refinementReason,
      source_brief_version: rec.lineage.briefVersion, source_brand_version: rec.lineage.brandVersion,
      private_master_path: rec.assetRef, version: 1, created_at: rec.createdAt,
    });
  }
  async getOutput(orgId: string, id: string): Promise<OutputRecord | null> {
    const r = await this.db.selectOne<Record<string, unknown>>(T.outputs, { org_id: orgId, id });
    if (!r) return null;
    return {
      id: String(r.id), orgId: String(r.org_id), contentItemId: (r.content_item_id as string) ?? null,
      kind: r.output_type as OutputRecord["kind"], state: r.status as OutputRecord["state"],
      assetRef: (r.private_master_path as string) ?? "", createdAt: String(r.created_at),
      lineage: {
        rootOutputId: (r.root_output_id as string) ?? null, parentOutputId: (r.parent_output_id as string) ?? null,
        generationRound: Number(r.generation_round ?? 1), mode: "initial", refinementReason: (r.refinement_reason as string) ?? null,
        briefVersion: (r.source_brief_version as string) ?? null, brandVersion: (r.source_brand_version as string) ?? null,
        provider: "", model: "", createdAtHint: null,
      },
    };
  }
  async updateOutputState(orgId: string, id: string, state: OutputRecord["state"]): Promise<void> {
    const n = await this.db.updateWhere(T.outputs, { status: state }, { org_id: orgId, id });
    if (n === 0) throw new Error(`output ${id} not found in org scope`);
  }
  /** Optimistic-locked state change (callers that hold a version). */
  async updateOutputStateChecked(orgId: string, id: string, state: OutputRecord["state"], expectedVersion: number): Promise<void> {
    const n = await this.db.updateWhere(T.outputs, { status: state }, { org_id: orgId, id }, expectedVersion);
    if (n === 0) throw new OptimisticLockConflict(T.outputs, id);
  }

  async insertUsage(row: UsageEventRow): Promise<void> {
    await this.db.insert(T.usage, { org_id: row.org_id, actor_id: row.actor_id, event_type: row.event_type, payload: row.payload });
  }

  async insertPublication(rec: PublicationRecord): Promise<void> {
    await this.db.insert(T.publications, {
      id: rec.id, org_id: rec.orgId, output_id: rec.outputId, platform: rec.platform, variant_key: rec.variantKey,
      status: rec.status, provider_confirmation_id: rec.providerConfirmationId,
      idempotency_key: `${rec.orgId}:${rec.outputId}:${rec.platform}`, created_at: rec.createdAt,
    });
  }
  async getPublication(orgId: string, outputId: string, platform: string): Promise<PublicationRecord | null> {
    const r = await this.db.selectOne<Record<string, unknown>>(T.publications, { org_id: orgId, output_id: outputId, platform });
    if (!r) return null;
    return {
      id: String(r.id), orgId: String(r.org_id), outputId: String(r.output_id), platform: String(r.platform),
      variantKey: String(r.variant_key), status: String(r.status), providerConfirmationId: (r.provider_confirmation_id as string) ?? null,
      createdAt: String(r.created_at),
    };
  }
  async updatePublication(orgId: string, id: string, status: string, confirmation: string | null): Promise<void> {
    const n = await this.db.updateWhere(T.publications, { status, provider_confirmation_id: confirmation }, { org_id: orgId, id });
    if (n === 0) throw new Error(`publication ${id} not found in org scope`);
  }
}

// ── Real Supabase StoreClient (server-only; production seam) ──────────────────
export function makeSupabaseStoreClient(): StoreClient {
  // Imported lazily to avoid pulling server-only into test/runtime that use the
  // in-memory client. The real client is created by the caller's server context.
  return {
    async insert(table, row) {
      const db = await client();
      const { error } = await db.from(table).insert(row);
      if (error) throw new Error(`insert ${table}: ${error.message}`);
    },
    async selectOne(table, where) {
      const db = await client();
      let q = db.from(table).select("*");
      for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`select ${table}: ${error.message}`);
      return (data as never) ?? null;
    },
    async selectMany(table, where) {
      const db = await client();
      let q = db.from(table).select("*");
      for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      const { data, error } = await q;
      if (error) throw new Error(`select ${table}: ${error.message}`);
      return (data as never[]) ?? [];
    },
    async updateWhere(table, patch, where: WhereEq, expectedVersion) {
      const db = await client();
      const p = expectedVersion === undefined ? patch : { ...patch, version: expectedVersion + 1 };
      let q = db.from(table).update(p);
      for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      if (expectedVersion !== undefined) q = q.eq("version", expectedVersion);
      const { data, error } = await q.select("id");
      if (error) throw new Error(`update ${table}: ${error.message}`);
      return (data as unknown[])?.length ?? 0;
    },
  };
}

type SbResult = { data: unknown; error: { message: string } | null };
interface SbBuilder extends PromiseLike<SbResult> {
  select(cols: string): SbBuilder;
  insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  update(patch: Record<string, unknown>): SbBuilder;
  eq(col: string, val: string | number | null): SbBuilder;
  maybeSingle(): PromiseLike<SbResult>;
}
interface SbClient { from(table: string): SbBuilder }

async function client(): Promise<SbClient> {
  const mod = await import("@/lib/supabase/server");
  return (await (mod as { createClient: () => Promise<unknown> }).createClient()) as SbClient;
}
