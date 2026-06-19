/**
 * Property inventory taxonomy — source / ownership / exclusivity / priority.
 * Pure & client-safe (no server imports). Used for badges, tab filtering, and
 * deal-priority scoring.
 */

export interface InventoryShape {
  source_type: string;
  property_origin: string;
  ownership_scope: string;
  exclusivity_scope: string;
  external_source: string | null;
  is_internal_inventory: boolean;
  is_external_inventory: boolean;
  is_office_exclusive: boolean;
  is_agent_exclusive: boolean;
  internal_double_side_priority: boolean;
  assigned_agent_id: string | null;
  uploaded_by_user_id: string | null;
}

export type InventoryType =
  | "agent"
  | "office"
  | "office_exclusive"
  | "agent_exclusive"
  | "external"
  | "partner";

export type InventoryTab =
  | "all"
  | "mine"
  | "office"
  | "office_exclusive"
  | "agent_exclusive"
  | "external"
  | "opportunities";

export function classifyPropertyInventoryType(p: InventoryShape): InventoryType {
  if (p.source_type === "external" || p.is_external_inventory) return "external";
  if (p.property_origin === "partner_shared") return "partner";
  if (p.is_office_exclusive) return "office_exclusive";
  if (p.is_agent_exclusive) return "agent_exclusive";
  if (p.ownership_scope === "office" || p.property_origin === "office_uploaded") return "office";
  return "agent";
}

export interface Badge {
  label: string;
  tone: "brand" | "success" | "warning" | "accent" | "neutral";
}

export function inventoryBadges(p: InventoryShape, currentUserId: string | null): Badge[] {
  const b: Badge[] = [];
  if (currentUserId && (p.assigned_agent_id === currentUserId || p.uploaded_by_user_id === currentUserId))
    b.push({ label: "שלי", tone: "brand" });
  if (p.ownership_scope === "office" || p.property_origin === "office_uploaded")
    b.push({ label: "משרד", tone: "accent" });
  if (p.is_agent_exclusive) b.push({ label: "בלעדיות שלי", tone: "success" });
  if (p.is_office_exclusive) b.push({ label: "בלעדיות משרד", tone: "success" });
  if (p.is_external_inventory || p.source_type === "external") b.push({ label: "חיצוני", tone: "warning" });
  if (p.external_source === "yad2") b.push({ label: "יד2", tone: "neutral" });
  if (p.external_source === "madlan") b.push({ label: "מדלן", tone: "neutral" });
  if (p.internal_double_side_priority) b.push({ label: "דו״צ פוטנציאלי", tone: "brand" });
  return b;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Deal priority — office-exclusive + matching buyer is the top (double-sided). */
export function calculatePropertyDealPriority(p: InventoryShape, hasMatchingBuyer: boolean): number {
  let base: number;
  if (p.is_office_exclusive) base = 90;
  else if (p.is_agent_exclusive) base = 72;
  else if (p.ownership_scope === "office" || p.property_origin === "office_uploaded") base = 55;
  else if (p.source_type === "external") base = 32;
  else base = 45;
  if (hasMatchingBuyer) base += p.is_office_exclusive ? 10 : 15;
  return clamp(base);
}

/** Internal office property matching an internal buyer = double-sided deal. */
export function calculateDoubleSideOpportunityScore(p: InventoryShape, hasInternalBuyerMatch: boolean): number {
  if (!hasInternalBuyerMatch) return 0;
  if (p.is_office_exclusive) return 95;
  if (p.ownership_scope === "office" || p.property_origin === "office_uploaded") return 75;
  if (p.is_internal_inventory) return 60;
  return 0;
}

export function matchesInventoryTab(p: InventoryShape, tab: InventoryTab, currentUserId: string | null): boolean {
  switch (tab) {
    case "all": return p.source_type !== "external";
    case "mine": return !!currentUserId && (p.assigned_agent_id === currentUserId || p.uploaded_by_user_id === currentUserId);
    case "office": return p.ownership_scope === "office" || p.property_origin === "office_uploaded" || p.is_office_exclusive;
    case "office_exclusive": return p.is_office_exclusive;
    case "agent_exclusive": return p.is_agent_exclusive;
    case "external": return p.source_type === "external" || p.is_external_inventory;
    case "opportunities": return p.internal_double_side_priority || p.is_office_exclusive || p.is_agent_exclusive;
    default: return true;
  }
}

export const INVENTORY_TABS: { id: InventoryTab; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "mine", label: "הנכסים שלי" },
  { id: "office", label: "נכסי המשרד" },
  { id: "office_exclusive", label: "בלעדיות משרד" },
  { id: "agent_exclusive", label: "בלעדיות סוכן" },
  { id: "external", label: "נכסים חיצוניים" },
  { id: "opportunities", label: "הזדמנויות עסקה" },
];
