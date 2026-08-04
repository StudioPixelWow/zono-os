// ============================================================================
// ZONO-native content orchestration (OUTSIDE creative-studio).
//
// Coordinates the existing systems (campaigns, calendar/content items, brand
// profiles, creative-studio generation, approvals, scheduling, publishing,
// analytics) WITHOUT duplicating them. creative-studio owns generation/QA;
// this service owns the workflow: content item → generate → QA → review →
// approve → schedule → publish (via PublishingProvider) → performance.
//
// Everything is organization-scoped and idempotent: repeated refresh/retry/job
// execution never creates duplicate outputs, approvals, schedules or
// publications. Store + providers are injected (in-memory for tests, Supabase +
// real adapters for runtime) so the whole chain is deterministically testable.
// ============================================================================
import type { CreativeKind } from "../creative-studio/creative-kinds";
import type { PublishingProvider, PublishResult, OutputPublishState } from "../creative-studio/publishing-provider";
import { assertPublishable } from "../creative-studio/publishing-provider";
import { buildDerivedLineage } from "../creative-studio/output-lineage";
import type { OutputLineage } from "../creative-studio/output-lineage";
import { buildUsageEvent } from "../creative-studio/usage-logging";
import type { UsageEventRow } from "../creative-studio/usage-logging";

export interface GenImage { b64: string; mime: string }
export interface ImageProviderLike {
  readonly name: string;
  generate(p: { prompt: string; referenceImageUrls?: string[]; size?: string }): Promise<{ provider: string; model: string; images: GenImage[]; durationMs: number }>;
}

export interface OutputRecord {
  id: string;
  orgId: string;
  contentItemId: string | null;
  kind: CreativeKind;
  state: OutputPublishState;
  lineage: OutputLineage;
  assetRef: string;
  createdAt: string;
}
export interface PublicationRecord {
  id: string;
  orgId: string;
  outputId: string;
  platform: string;
  variantKey: string;
  status: string;
  providerConfirmationId: string | null;
  createdAt: string;
}

/** Minimal store the orchestration persists through (in-memory or Supabase). */
export interface OrchestrationStore {
  /** Idempotent: returns existing id for a seen key, else null. */
  getByIdempotencyKey(orgId: string, scope: string, key: string): Promise<string | null>;
  putIdempotencyKey(orgId: string, scope: string, key: string, id: string): Promise<void>;
  insertOutput(rec: OutputRecord): Promise<void>;
  getOutput(orgId: string, id: string): Promise<OutputRecord | null>;
  updateOutputState(orgId: string, id: string, state: OutputPublishState): Promise<void>;
  insertUsage(row: UsageEventRow): Promise<void>;
  insertPublication(rec: PublicationRecord): Promise<void>;
  getPublication(orgId: string, outputId: string, platform: string): Promise<PublicationRecord | null>;
  updatePublication(orgId: string, id: string, status: string, confirmation: string | null): Promise<void>;
}

export interface OrchestrationDeps {
  store: OrchestrationStore;
  image: ImageProviderLike;
  publisher: PublishingProvider;
  ids: () => string;
  now: () => string;
}

export interface JourneyCtx { orgId: string; userId: string | null }

export class OrchestrationError extends Error {
  constructor(message: string) { super(message); this.name = "OrchestrationError"; }
}

export class CreativeContentService {
  constructor(private d: OrchestrationDeps) {}

  /** Generate (idempotent by key). Persists output + usage + lineage. */
  async generate(ctx: JourneyCtx, input: {
    idempotencyKey: string; contentItemId: string | null; kind: CreativeKind; prompt: string;
    parentOutput?: { id: string; root_output_id?: string | null; generation_round?: number | null; status?: string | null } | null;
    refinementReason?: string | null;
  }): Promise<OutputRecord> {
    const existingId = await this.d.store.getByIdempotencyKey(ctx.orgId, "generate", input.idempotencyKey);
    if (existingId) {
      const prior = await this.d.store.getOutput(ctx.orgId, existingId);
      if (prior) return prior;   // idempotent: no duplicate generation on refresh/retry
    }
    const res = await this.d.image.generate({ prompt: input.prompt });
    const lineage = buildDerivedLineage(input.parentOutput ?? null, {
      mode: input.parentOutput ? "refine" : "initial",
      provider: res.provider, model: res.model, refinementReason: input.refinementReason ?? null,
    });
    const id = this.d.ids();
    const rec: OutputRecord = {
      id, orgId: ctx.orgId, contentItemId: input.contentItemId, kind: input.kind,
      state: "review", lineage, assetRef: `${ctx.orgId}/creative/${id}/master.png`, createdAt: this.d.now(),
    };
    await this.d.store.insertOutput(rec);
    await this.d.store.insertUsage(buildUsageEvent({
      orgId: ctx.orgId, actorId: ctx.userId, provider: res.provider, model: res.model, operation: "generate",
      contentItemId: input.contentItemId, outputId: id, outputImages: res.images.length, durationMs: res.durationMs,
      success: true, cost: { basis: "unavailable" },
    }));
    await this.d.store.putIdempotencyKey(ctx.orgId, "generate", input.idempotencyKey, id);
    return rec;
  }

  async approve(ctx: JourneyCtx, outputId: string): Promise<OutputRecord> {
    const o = await this.requireOutput(ctx, outputId);
    if (o.state === "qa_failed") throw new OrchestrationError("cannot approve a QA-failed output");
    await this.d.store.updateOutputState(ctx.orgId, outputId, "approved");
    return { ...o, state: "approved" };
  }
  async reject(ctx: JourneyCtx, outputId: string): Promise<OutputRecord> {
    const o = await this.requireOutput(ctx, outputId);
    await this.d.store.updateOutputState(ctx.orgId, outputId, "qa_failed");
    return { ...o, state: "qa_failed" };
  }
  async schedule(ctx: JourneyCtx, outputId: string): Promise<OutputRecord> {
    const o = await this.requireOutput(ctx, outputId);
    assertPublishable(o.state === "scheduled" ? "scheduled" : (o.state as OutputPublishState));
    await this.d.store.updateOutputState(ctx.orgId, outputId, "scheduled");
    return { ...o, state: "scheduled" };
  }

  /**
   * Publish via the injected provider. Only approved/scheduled outputs are
   * eligible. Idempotent per (output, platform): a duplicate dispatch returns
   * the existing publication. Generation is never lost if publishing fails.
   */
  async publish(ctx: JourneyCtx, outputId: string, platform: string, variantKey: string): Promise<{ publication: PublicationRecord; result: PublishResult }> {
    const o = await this.requireOutput(ctx, outputId);

    // Idempotency FIRST: an already-published (output, platform) returns the
    // existing publication as a duplicate — before eligibility, since the output
    // is now in the 'published' state.
    const existing = await this.d.store.getPublication(ctx.orgId, outputId, platform);
    if (existing && existing.status === "published") {
      return { publication: existing, result: { status: "duplicate", providerConfirmationId: existing.providerConfirmationId, orgId: ctx.orgId, outputId, platform, error: null } };
    }

    assertPublishable(o.state as OutputPublishState);
    const pubId = existing?.id ?? this.d.ids();
    if (!existing) {
      await this.d.store.insertPublication({ id: pubId, orgId: ctx.orgId, outputId, platform, variantKey, status: "processing", providerConfirmationId: null, createdAt: this.d.now() });
    }
    const result = await this.d.publisher.publish({
      idempotencyKey: `${ctx.orgId}:${outputId}:${platform}`, orgId: ctx.orgId, outputId,
      outputState: o.state as OutputPublishState, platform, variantKey,
      assetRef: `pub/${ctx.orgId}/${outputId}/${platform}.png`,   // publication-safe ref, not the private master
    });
    const status = result.status === "published" || result.status === "duplicate" ? "published" : result.status;
    await this.d.store.updatePublication(ctx.orgId, pubId, status, result.providerConfirmationId);
    if (result.status === "published" || result.status === "duplicate") {
      await this.d.store.updateOutputState(ctx.orgId, outputId, "published");
    }
    // generation output is preserved regardless; publication failure is retryable.
    const publication = (await this.d.store.getPublication(ctx.orgId, outputId, platform))!;
    return { publication, result };
  }

  private async requireOutput(ctx: JourneyCtx, id: string): Promise<OutputRecord> {
    const o = await this.d.store.getOutput(ctx.orgId, id);
    if (!o) throw new OrchestrationError(`output ${id} not found in org scope`);
    if (o.orgId !== ctx.orgId) throw new OrchestrationError("cross-organization denied");
    return o;
  }
}
