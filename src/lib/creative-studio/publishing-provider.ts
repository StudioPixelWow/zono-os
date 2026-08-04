// ============================================================================
// ZONO — PublishingProvider abstraction (pure; deterministic mock + real seam).
//
// The same interface backs the MockPublishingProvider (deterministic, used by
// tests + local runtime) and the real distribution/Meta adapter (wired without
// live credentials). Only APPROVED/SCHEDULED outputs are eligible; draft /
// qa_failed / rejected / review can never publish. Duplicate dispatch (same
// idempotency key) never creates a second publication.
// ============================================================================

export type OutputPublishState = "draft" | "qa_failed" | "review" | "approved" | "scheduled" | "published" | "archived";
export type PublishStatus = "accepted" | "processing" | "published" | "failed_transient" | "failed_permanent" | "duplicate";

export interface PublishRequest {
  idempotencyKey: string;
  orgId: string;
  outputId: string;
  outputState: OutputPublishState;
  platform: string;
  variantKey: string;
  scheduledAt?: string | null;
  assetRef: string;            // publication-safe asset reference (never a draft/master)
}

export interface PublishResult {
  status: PublishStatus;
  providerConfirmationId: string | null;
  orgId: string;
  outputId: string;
  platform: string;
  error?: { klass: "transient" | "permanent"; message: string } | null;
}

export class PublishEligibilityError extends Error {
  constructor(message: string) { super(message); this.name = "PublishEligibilityError"; }
}

const PUBLISHABLE_STATES = new Set<OutputPublishState>(["approved", "scheduled"]);

/** Only approved/scheduled outputs may publish. Throws otherwise. Pure. */
export function assertPublishable(state: OutputPublishState): void {
  if (!PUBLISHABLE_STATES.has(state)) {
    throw new PublishEligibilityError(`output in state '${state}' cannot be published (must be approved or scheduled)`);
  }
}

export interface PublishingProvider {
  readonly name: string;
  publish(req: PublishRequest): Promise<PublishResult>;
}

/**
 * Deterministic mock. Behavior is driven by markers in the idempotency key so
 * tests are reproducible:
 *   ...:transient  → one transient failure then success on retry
 *   ...:permanent  → permanent failure
 *   ...:dupe       → duplicate on the second identical key
 * Otherwise → accepted→published with a stable confirmation id.
 */
export class MockPublishingProvider implements PublishingProvider {
  readonly name = "mock";
  private seen = new Map<string, PublishResult>();
  private transientHits = new Set<string>();

  async publish(req: PublishRequest): Promise<PublishResult> {
    assertPublishable(req.outputState);
    const key = req.idempotencyKey;
    // idempotency: identical key returns the same prior result (no duplicate publication)
    const prior = this.seen.get(key);
    if (prior) return { ...prior, status: prior.status === "published" ? "duplicate" : prior.status };

    if (key.includes(":permanent")) {
      const r: PublishResult = { status: "failed_permanent", providerConfirmationId: null, orgId: req.orgId, outputId: req.outputId, platform: req.platform, error: { klass: "permanent", message: "mock permanent failure" } };
      this.seen.set(key, r); return r;
    }
    if (key.includes(":transient") && !this.transientHits.has(key)) {
      this.transientHits.add(key);
      // transient failures are NOT memoized as final — a retry can succeed
      return { status: "failed_transient", providerConfirmationId: null, orgId: req.orgId, outputId: req.outputId, platform: req.platform, error: { klass: "transient", message: "mock transient failure" } };
    }
    const confirmation = `mockpub_${req.orgId}_${req.outputId}_${req.platform}`;
    const r: PublishResult = { status: "published", providerConfirmationId: confirmation, orgId: req.orgId, outputId: req.outputId, platform: req.platform, error: null };
    this.seen.set(key, r);
    return r;
  }
}
