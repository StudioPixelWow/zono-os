import { Icon } from "@/components/dashboard/Icon";
import type { RelationshipRow } from "@/lib/activity/types";

const REL_LABELS: Record<string, string> = {
  seller_owns_property: "מוכר",
  agent_assigned_to_property: "סוכן מטפל",
  buyer_interested_in_property: "קונה מתעניין",
  buyer_viewed_property: "קונה צפה",
  buyer_visited_property: "קונה ביקר",
  buyer_rejected_property: "קונה דחה",
  buyer_liked_property: "קונה אהב",
  buyer_sent_offer: "הצעת קונה",
  seller_received_report: "מוכר קיבל דוח",
  document_related_to_property: "מסמך מקושר",
  task_related_to_property: "משימה מקושרת",
  meeting_related_to_buyer: "פגישה עם קונה",
  opportunity_related_to_property: "הזדמנות",
};

const TYPE_LABELS: Record<string, string> = {
  property: "נכס",
  buyer: "קונה",
  seller: "מוכר",
  user: "סוכן",
  lead: "ליד",
  deal: "עסקה",
  task: "משימה",
  meeting: "פגישה",
  document: "מסמך",
};

/**
 * Lightweight relationship list for an entity (placeholder for a future graph).
 */
export function RelationshipGraphMini({
  relationships,
  selfType,
}: {
  relationships: RelationshipRow[];
  selfType: string;
}) {
  if (relationships.length === 0) {
    return (
      <p className="text-muted py-6 text-center text-sm">אין קשרים מתועדים עדיין.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {relationships.map((r) => {
        // Show the "other side" of the relationship relative to this entity.
        const otherType = r.source_entity_type === selfType ? r.target_entity_type : r.source_entity_type;
        return (
          <li key={r.id} className="border-line flex items-center justify-between border-b py-2 last:border-0">
            <span className="flex items-center gap-2">
              <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg">
                <Icon name="Users" size={14} />
              </span>
              <span className="text-ink text-sm font-semibold">
                {REL_LABELS[r.relationship_type] ?? r.relationship_type}
              </span>
            </span>
            <span className="text-muted text-xs">{TYPE_LABELS[otherType] ?? otherType}</span>
          </li>
        );
      })}
    </ul>
  );
}
