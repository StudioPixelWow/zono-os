// ============================================================================
// 🧠 AI Memory & Personal Context™ — types (client-safe, pure). Phase 27.7.
// ----------------------------------------------------------------------------
// Persistent, structured, user-controlled AI memory. AI never "remembers
// everything" — only explainable entries with a source, confidence, visibility
// and owner, that can be edited / archived / deleted / expired. No reasoning,
// no execution, no CRM changes here.
// ============================================================================

export const AI_MEMORY_VERSION = "27.7.0";

export type MemoryType =
  | "user_preference" | "broker_preference" | "office_preference" | "working_style"
  | "favorite_area" | "faq" | "pinned_intelligence" | "dismissed_insight"
  | "decision" | "rule" | "manual_note" | "context";

export type MemoryVisibility = "private" | "office" | "organization" | "system";
export type MemoryStatus = "active" | "archived" | "expired" | "deleted";
export type MemorySource =
  | "manual" | "reasoning_gateway" | "mission_planner" | "action_center"
  | "broker_coach" | "decision_brain" | "user_action";

export interface AiMemory {
  id: string;
  organizationId: string;
  userId: string | null;
  memoryType: MemoryType;
  title: string;
  summary: string | null;
  value: Record<string, unknown>;
  sourceType: MemorySource;
  sourceId: string | null;
  confidence: number;          // 0–100
  visibility: MemoryVisibility;
  status: MemoryStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  pinned: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when creating a memory (everything else is defaulted). */
export interface AiMemoryInput {
  memoryType: MemoryType;
  title: string;
  summary?: string | null;
  value?: Record<string, unknown>;
  sourceType?: MemorySource;
  sourceId?: string | null;
  confidence?: number;
  visibility?: MemoryVisibility;
  expiresAt?: string | null;
  pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryFilter {
  type?: MemoryType;
  visibility?: MemoryVisibility;
  status?: MemoryStatus;
  query?: string;
}

/** Inspector view — how a memory is explained to the user. */
export interface MemoryExplain {
  source: MemorySource;
  confidence: number;
  visibility: MemoryVisibility;
  lastUsed: string | null;
  usageCount: number;
  created: string;
  updated: string;
  expiresAt: string | null;
}

export interface MemoryGroups {
  pinned: AiMemory[];
  recent: AiMemory[];
  frequent: AiMemory[];
  expired: AiMemory[];
  archived: AiMemory[];
}
