// ============================================================================
// 🕸️ ZONO OS 2.0 — Stage 4A · Event Kernel · Graph subscriber (PURE).
// A third consumer of the domain_events outbox. Maps linkage-bearing events to
// an `entity_relationships` upsert so the relationship graph (Universal Graph,
// CRM graph, Ask ZONO) stays fresh WITHOUT a batch recompute. Pure + offline-
// testable; the processor writes the returned edge via the existing
// entityRelationshipRepository (idempotent on org+source+target+type).
//
// Design: an event yields ZERO OR MORE edges. Only real, event-carried links are
// emitted — never fabricated. Missing payload ids simply yield fewer edges.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

/** A ready-to-upsert entity_relationships row (columns match the table). */
export interface GraphEdgeUpsert {
  org_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  relationship_type: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Project a domain event into zero or more graph edges.
 * Deterministic; only emits edges whose endpoints are present.
 */
export function projectEventToGraphEdges(evt: DomainEventLike): GraphEdgeUpsert[] {
  const org = evt.organization_id;
  if (!org || !evt.entity_id) return [];
  const p = evt.payload ?? {};
  const edges: GraphEdgeUpsert[] = [];
  const edge = (st: string, si: string, tt: string, ti: string, rt: string) =>
    edges.push({ org_id: org, source_entity_type: st, source_entity_id: si, target_entity_type: tt, target_entity_id: ti, relationship_type: rt });

  switch (evt.event_type) {
    case "seller.linked_to_property": {
      // entity is the seller; payload.propertyId is the property.
      const propertyId = str(p.propertyId) ?? str(p.property_id);
      if (propertyId) edge("seller", evt.entity_id, "property", propertyId, "owns");
      break;
    }
    case "deal.created": {
      // entity is the deal; link whichever parties the payload carries.
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      const sellerId = str(p.sellerId) ?? str(p.seller_id);
      const propertyId = str(p.propertyId) ?? str(p.property_id);
      if (buyerId) edge("deal", evt.entity_id, "buyer", buyerId, "involves_buyer");
      if (sellerId) edge("deal", evt.entity_id, "seller", sellerId, "involves_seller");
      if (propertyId) edge("deal", evt.entity_id, "property", propertyId, "involves_property");
      break;
    }
    case "property.sold": {
      // entity is the property; payload.buyerId is the purchaser (if known).
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      if (buyerId) edge("buyer", buyerId, "property", evt.entity_id, "purchased");
      break;
    }
    case "lead.converted_to_buyer": {
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      if (buyerId) edge("lead", evt.entity_id, "buyer", buyerId, "became");
      break;
    }
    case "lead.converted_to_seller": {
      const sellerId = str(p.sellerId) ?? str(p.seller_id);
      if (sellerId) edge("lead", evt.entity_id, "seller", sellerId, "became");
      break;
    }
    default:
      break;
  }
  return edges;
}
