// ============================================================================
// ZONO — People directory · PURE contract (no I/O, no server-only).
// ----------------------------------------------------------------------------
// Shared types, labels and option lists used by BOTH the server query
// (directory-query.ts) and the client command table (PeopleDirectory.tsx).
// Kept free of any server import so a Client Component can import the VALUES
// (labels / option lists) without dragging server-only code into the bundle.
// ============================================================================

export type PersonRole = "buyer" | "seller" | "lead";
export const PEOPLE_ROLE_LABEL: Record<PersonRole, string> = { buyer: "קונה", seller: "מוכר", lead: "ליד" };

export type PeopleSortKey = "activity" | "created" | "name" | "roles";
export type PeopleAttentionKey = "uncontactable" | "unassigned" | "stale";

const SORT_KEYS: readonly PeopleSortKey[] = ["activity", "created", "name", "roles"];
export const isPeopleSortKey = (v: string | undefined): v is PeopleSortKey => !!v && SORT_KEYS.includes(v as PeopleSortKey);

export const PEOPLE_SORT_OPTIONS: { value: PeopleSortKey; label: string }[] = [
  { value: "activity", label: "פעילות אחרונה" }, { value: "created", label: "נוספו לאחרונה" },
  { value: "name", label: "שם (א׳→ת׳)" }, { value: "roles", label: "מספר תפקידים" },
];
export const PEOPLE_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "buyer", label: "קונים" }, { value: "seller", label: "מוכרים" }, { value: "lead", label: "לידים" }, { value: "multi", label: "רב-תפקיד" },
];

export interface PersonTarget { type: PersonRole; id: string }
export interface PersonAttention { key: PeopleAttentionKey; label: string; tone: "warning" | "danger" | "neutral" }
export interface PersonDirectoryRow {
  key: string; name: string; phone: string | null; email: string | null;
  roles: PersonRole[]; targets: PersonTarget[];
  ownerId: string | null; ownerMixed: boolean; agentName: string | null;
  lastActivity: string | null; createdAt: string | null;
  leadStage: string | null; buyerTemperature: string | null; sellerSigned: boolean;
  attention: PersonAttention | null;
}
export interface PersonKpi { key: string; label: string; value: number; tone: string }
export interface PeopleDirectoryParams {
  q?: string; role?: string | null; attention?: PeopleAttentionKey | "any" | null;
  sort?: PeopleSortKey; page?: number; pageSize?: number;
}
export interface PeopleDirectoryPage {
  rows: PersonDirectoryRow[]; total: number; page: number; pageSize: number; pageCount: number;
  kpis: PersonKpi[]; brief: { text: string; href: string }[];
}
