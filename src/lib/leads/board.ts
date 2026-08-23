// ============================================================================
// ZONO — Leads board · PURE contract (no I/O, no server-only).
// Shared types + option lists used by the server query (board-query.ts) and the
// client command table (LeadsCommandTable.tsx). No server import, so the client
// bundle can import the values safely.
// ============================================================================

export const LEAD_BOARD_STAGES = ["new", "contacted", "qualified", "nurturing", "converted", "lost", "disqualified"] as const;

export type LeadAttentionKey = "overdue" | "unassigned" | "waiting" | "needs_action";
export type LeadSortKey = "urgency" | "recent" | "score" | "name";

const SORT_KEYS: readonly LeadSortKey[] = ["urgency", "recent", "score", "name"];
export const isLeadSortKey = (v: string | undefined): v is LeadSortKey => !!v && SORT_KEYS.includes(v as LeadSortKey);

export const LEAD_SORT_OPTIONS: { value: LeadSortKey; label: string }[] = [
  { value: "urgency", label: "דחיפות" }, { value: "recent", label: "נוספו לאחרונה" },
  { value: "score", label: "ניקוד" }, { value: "name", label: "שם (א׳→ת׳)" },
];
export const LEAD_ATTENTION_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "כל מה שדורש טיפול" }, { value: "overdue", label: "פולואפ באיחור" },
  { value: "unassigned", label: "ללא אחראי" }, { value: "waiting", label: "חדש — מחכה לחזרה" }, { value: "needs_action", label: "דורש פעולה" },
];

export interface LeadFollowUp { key: string; label: string; tone: "danger" | "warning" | "neutral" }
export interface LeadBoardRow {
  id: string; full_name: string; phone: string | null; email: string | null;
  stage: string; stageLabel: string; score: number | null; source: string | null; sourceLabel: string | null;
  createdAt: string; ownerId: string | null; agentName: string | null;
  followUp: LeadFollowUp | null; urgency: number;
}
export interface LeadKpi { key: string; label: string; value: number; tone: string }
export interface LeadsBoardParams {
  q?: string; stage?: string | null; attention?: LeadAttentionKey | "any" | null;
  sort?: LeadSortKey; page?: number; pageSize?: number;
}
export interface LeadsBoardPage {
  rows: LeadBoardRow[]; total: number; page: number; pageSize: number; pageCount: number;
  kpis: LeadKpi[]; brief: { text: string; href: string }[]; truncated: boolean;
}
