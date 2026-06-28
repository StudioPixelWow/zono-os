// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — producer/consumer registry.
// ----------------------------------------------------------------------------
// Every engine is BOTH a producer (publishes intelligence about entities) and a
// consumer (reads composed knowledge). They register a resolver here instead of
// being imported by other engines — this is what removes tight coupling. The
// Knowledge API fans a request out to all producers that handle the entity type
// and merges their contributions. Registration is idempotent (by name).
// ============================================================================
import type {
  EntityRef, FabricEntityType, MetricSet, ConfidenceSignal,
  RelationshipEdge, TimelineEntry, FabricRecommendation,
} from "./types";

/** What a single engine contributes about one entity. All fields optional. */
export interface ProducerContribution {
  /** Domain payload (merged shallowly into KnowledgeObject.data under the producer name). */
  data?: Record<string, unknown>;
  metrics?: MetricSet;
  confidence?: ConfidenceSignal[];
  relationships?: RelationshipEdge[];
  timeline?: TimelineEntry[];
  recommendations?: FabricRecommendation[];
  sources?: string[];
  /** ISO timestamp of the producer's freshest input (for lastUpdate). */
  lastUpdate?: string | null;
  reasons?: string[];
}

export interface Producer {
  /** Unique producer name (e.g. "brokerage-knowledge"). */
  name: string;
  /** Entity types this producer can describe. */
  types: FabricEntityType[];
  /**
   * Resolve a contribution for one entity. MUST be best-effort and RLS-safe:
   * it runs inside the caller's request (so existing RLS clients apply) and
   * should never throw — return {} on miss. The Fabric isolates failures.
   */
  resolve: (ref: EntityRef) => Promise<ProducerContribution>;
}

const g = globalThis as unknown as { __zonoFabricProducers?: Map<string, Producer> };
const producers: Map<string, Producer> = g.__zonoFabricProducers ?? (g.__zonoFabricProducers = new Map());

/** Register (or replace) a producer. Idempotent by name. */
export function registerProducer(p: Producer): void {
  producers.set(p.name, p);
}

/** All producers that can describe a given entity type. */
export function producersFor(type: FabricEntityType): Producer[] {
  return [...producers.values()].filter((p) => p.types.includes(type));
}

export function allProducers(): Producer[] {
  return [...producers.values()];
}

/** Run all matching producers for an entity, isolated + best-effort. */
export async function gather(ref: EntityRef): Promise<{ name: string; contribution: ProducerContribution }[]> {
  const matches = producersFor(ref.type);
  const results = await Promise.all(matches.map(async (p) => {
    try { return { name: p.name, contribution: await p.resolve(ref) }; }
    catch (e) { console.error(`[fabric] producer ${p.name} failed for ${ref.type}:${ref.id}:`, e); return { name: p.name, contribution: {} as ProducerContribution }; }
  }));
  return results;
}
