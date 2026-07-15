// ============================================================================
// 🕸️ ZONO OS 2.0 — Stage 4 · Batch 4.3 · Event Kernel · Graph subscriber (PURE).
// Keeps the CANONICAL live relationship substrate (public.entity_relationships)
// fresh incrementally — create / update / retire edges from domain events, with
// NO batch recompute. Pure + deterministic + offline-testable; the processor
// applies each op via an idempotent upsert (stable key: org + source + rel_type
// + target) or a retire (status→inactive, valid_to=now — history preserved).
//
// EVIDENCE ONLY: an edge is emitted solely from ids carried by the event's
// payload. Missing ids → fewer edges (skipped honestly). Never fabricated,
// never cross-org (org comes from the event), never from private/inferred data.
// ============================================================================
import type { DomainEventLike } from "./subscriber";
import { isJourneyType, stageDef, stageLabel, statusForKind, type JourneyType } from "@/lib/journey-canonical";
import { JOURNEY_TYPE_LABEL } from "@/lib/search-projection/journey-document";

/** Lifecycle-moving journey events that maintain the canonical HAS_JOURNEY edge. */
const JOURNEY_GRAPH_EVENTS = new Set<string>([
  "journey.created", "journey.stage_changed", "journey.completed",
  "journey.blocked", "journey.paused", "journey.resumed", "journey.reopened",
]);

/** One graph operation: upsert (create/refresh) or retire (inactivate) an edge. */
export interface GraphEdgeUpsert {
  op: "upsert" | "retire";
  org_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  relationship_type: string;
  strength?: number;
  metadata?: Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function pid(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) { const v = str(p[k]); if (v) return v; }
  return null;
}

/**
 * Project a domain event into zero or more graph ops (upsert / retire).
 * Deterministic; only emits ops whose endpoints are present in the payload.
 */
export function projectEventToGraphEdges(evt: DomainEventLike): GraphEdgeUpsert[] {
  const org = evt.organization_id;
  if (!org || !evt.entity_id) return [];
  const p = evt.payload ?? {};
  const ops: GraphEdgeUpsert[] = [];
  const meta = { sourceEventId: evt.id };
  const push = (op: "upsert" | "retire", st: string, si: string, tt: string, ti: string, rt: string) =>
    ops.push({ op, org_id: org, source_entity_type: st, source_entity_id: si, target_entity_type: tt, target_entity_id: ti, relationship_type: rt, metadata: meta });
  const upsert = (st: string, si: string, tt: string, ti: string, rt: string) => push("upsert", st, si, tt, ti, rt);
  const retire = (st: string, si: string, tt: string, ti: string, rt: string) => push("retire", st, si, tt, ti, rt);

  switch (evt.event_type) {
    case "seller.linked_to_property": {
      const propertyId = pid(p, "propertyId", "property_id");
      if (propertyId) upsert("seller", evt.entity_id, "property", propertyId, "owns");
      break;
    }
    case "seller.unlinked_from_property": {
      const propertyId = pid(p, "propertyId", "property_id");
      if (propertyId) retire("seller", evt.entity_id, "property", propertyId, "owns");
      break;
    }
    case "lead.converted_to_buyer": {
      const buyerId = pid(p, "buyerId", "buyer_id");
      if (buyerId) upsert("lead", evt.entity_id, "buyer", buyerId, "converted_to");
      break;
    }
    case "lead.converted_to_seller": {
      const sellerId = pid(p, "sellerId", "seller_id");
      if (sellerId) upsert("lead", evt.entity_id, "seller", sellerId, "converted_to");
      break;
    }
    case "external_listing.promoted": {
      const propertyId = pid(p, "propertyId", "property_id");
      if (propertyId) upsert("external_listing", evt.entity_id, "property", propertyId, "promoted_to");
      break;
    }
    case "deal.created":
    case "deal.updated":
    case "deal.won": {
      const buyerId = pid(p, "buyerId", "buyer_id");
      const sellerId = pid(p, "sellerId", "seller_id");
      const propertyId = pid(p, "propertyId", "property_id");
      const agentId = pid(p, "agentId", "agent_id", "assigned_agent_id", "ownerUserId", "owner_user_id");
      if (propertyId) upsert("deal", evt.entity_id, "property", propertyId, evt.event_type === "deal.won" ? "closed_on" : "relates_to");
      if (buyerId) upsert("deal", evt.entity_id, "buyer", buyerId, "involves");
      if (sellerId) upsert("deal", evt.entity_id, "seller", sellerId, "involves");
      if (agentId) upsert("agent", agentId, "deal", evt.entity_id, "assigned_to");
      break;
    }
    case "deal.lost": {
      // Keep the historical relations — retire (inactivate) them, never delete.
      const buyerId = pid(p, "buyerId", "buyer_id");
      const sellerId = pid(p, "sellerId", "seller_id");
      const propertyId = pid(p, "propertyId", "property_id");
      if (propertyId) retire("deal", evt.entity_id, "property", propertyId, "relates_to");
      if (buyerId) retire("deal", evt.entity_id, "buyer", buyerId, "involves");
      if (sellerId) retire("deal", evt.entity_id, "seller", sellerId, "involves");
      break;
    }
    case "property.sold": {
      const buyerId = pid(p, "buyerId", "buyer_id");
      if (buyerId) upsert("buyer", buyerId, "property", evt.entity_id, "purchased");
      break;
    }
    case "meeting.created":
    case "meeting.completed": {
      // The meeting involves whichever linked entities the payload carries.
      for (const [type, ...keys] of [
        ["buyer", "buyerId", "buyer_id"], ["seller", "sellerId", "seller_id"],
        ["lead", "leadId", "lead_id"], ["property", "propertyId", "property_id"],
        ["deal", "dealId", "deal_id"],
      ] as [string, ...string[]][]) {
        const id = pid(p, ...keys);
        if (id) upsert("meeting", evt.entity_id, type, id, "involves");
      }
      break;
    }
    case "document.created":
    case "document.signed": {
      for (const [type, ...keys] of [
        ["deal", "dealId", "deal_id"], ["property", "propertyId", "property_id"],
        ["buyer", "buyerId", "buyer_id"], ["seller", "sellerId", "seller_id"],
      ] as [string, ...string[]][]) {
        const id = pid(p, ...keys);
        if (id) upsert("document", evt.entity_id, type, id, "relates_to");
      }
      break;
    }
    case "lead.assigned":
    case "task.assigned":
    case "agent.assigned": {
      // Agent assigned to the subject entity (agent id from payload).
      const agentId = pid(p, "agentId", "agent_id", "assigned_agent_id", "userId", "user_id");
      if (agentId) upsert("agent", agentId, evt.entity_type, evt.entity_id, "assigned_to");
      break;
    }
    // ── Batch 5.6C — Canonical Journey as a first-class graph node ────────────
    // subject → has_journey → journey (entity_type='journey', id=journeys.id).
    // Evidence-only: subject ids come from the journey event payload. Idempotent
    // on the 6-part key — a stage change refreshes the SAME edge (never a new
    // edge per stage). journey.completed preserves the edge and marks it
    // terminal/inactive (history kept). Missing subject → skipped honestly.
    default: {
      if (!JOURNEY_GRAPH_EVENTS.has(evt.event_type)) break;
      const jtRaw = str(p.journeyType) ?? str(p.subjectType);
      const subjectType = str(p.subjectType);
      const subjectId = str(p.subjectId);
      if (!jtRaw || !isJourneyType(jtRaw) || !subjectType || !subjectId) break; // missing subject → skip
      const jt = jtRaw as JourneyType;
      const toStage = str(p.toStage);
      const def = toStage ? stageDef(jt, toStage) : undefined;
      const stageLbl = toStage ? stageLabel(jt, toStage) : null;
      const terminal = def ? def.terminal : evt.event_type === "journey.completed";
      const status = def ? statusForKind(def.kind) : (evt.event_type === "journey.completed" ? "won" : "active");
      const blocked = evt.event_type === "journey.blocked";
      // target_name feeds the EXISTING graph node-label reader (nameFrom) so the
      // journey node renders "מסע נכס · שיווק" — never a raw UUID. The backfill
      // enriches this to include the subject title. Reuses 5.6B label maps.
      const jmeta: Record<string, unknown> = {
        sourceEventId: evt.id,
        journeyType: jt,
        subjectType,
        currentStage: toStage ?? null,
        canonicalStageLabel: stageLbl,
        status,
        terminal,
        blocked,
        stageEnteredAt: evt.occurred_at ?? null,
        target_name: `${JOURNEY_TYPE_LABEL[jt]}${stageLbl ? ` · ${stageLbl}` : ""}`,
      };
      ops.push({ op: "upsert", org_id: org, source_entity_type: subjectType, source_entity_id: subjectId, target_entity_type: "journey", target_entity_id: evt.entity_id, relationship_type: "has_journey", metadata: jmeta });
      if (evt.event_type === "journey.completed") {
        // Preserve the edge as historical/terminal — retire AFTER the metadata
        // upsert (status→inactive, valid_to=now; never hard-deleted).
        ops.push({ op: "retire", org_id: org, source_entity_type: subjectType, source_entity_id: subjectId, target_entity_type: "journey", target_entity_id: evt.entity_id, relationship_type: "has_journey", metadata: jmeta });
      }
      break;
    }
  }
  return ops;
}
