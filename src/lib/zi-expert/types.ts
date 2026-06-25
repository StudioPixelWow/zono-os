// ============================================================================
// ZI Expert™ — types (Phase 22, client-safe).
// ZI is the in-app PRODUCT SUPPORT EXPERT. It ONLY understands context,
// explains features, answers questions and guides users. It NEVER performs
// actions, never changes data, never bypasses permissions. Read-only by design.
// ============================================================================

export type ZiRole = "user" | "assistant";
export type ZiSource = "ai" | "fallback" | "cache";
export type RoleKey = "viewer" | "agent" | "manager" | "admin" | "owner";

// ── Context the assistant automatically knows about the user's situation ─────
// Everything here is non-sensitive, sanitized, and never contains secrets,
// tokens, raw payloads or another organization's data.
export interface ZiContext {
  route: string | null;            // current pathname
  moduleId: string | null;         // matched navigation module id
  moduleLabel: string | null;      // human page title (Hebrew)
  moduleDescription: string | null;
  pageKey: string | null;          // knowledge-base page key (smart page detection)
  organizationName: string | null;
  plan: string | null;             // starter | pro | team | enterprise
  roleKey: RoleKey | null;
  roleLabel: string | null;
  language: string;                // "he" default
  selectedPropertyId: string | null;
  selectedBuyerId: string | null;
  selectedSellerId: string | null;
  selectedWorkflowId: string | null;
  selectedReportId: string | null;
  filters: Record<string, string> | null;
  operatingCity: string | null;
  operatingNeighborhood: string | null;
  featureFlags: string[];          // names only, access-filtered
  accessibleModules: string[];     // module ids the role can access
}

/** The portion of context the client can collect by itself (no DB). */
export interface ZiClientContext {
  route: string | null;
  selectedPropertyId: string | null;
  selectedBuyerId: string | null;
  selectedSellerId: string | null;
  selectedWorkflowId: string | null;
  selectedReportId: string | null;
  filters: Record<string, string> | null;
  language: string;
}

// ── Conversation + messages ──────────────────────────────────────────────────
export interface ZiMessage {
  id: string;
  conversationId: string;
  role: ZiRole;
  content: string;
  source: ZiSource | null;         // for assistant messages
  route: string | null;            // page the message was sent from
  moduleId: string | null;
  rating: "up" | "down" | null;    // thumbs feedback
  createdAt: string;
}

export interface ZiConversation {
  id: string;
  title: string;
  route: string | null;
  moduleId: string | null;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ZiConversationWithMessages extends ZiConversation {
  messages: ZiMessage[];
}

// ── Ask request / result ─────────────────────────────────────────────────────
export interface ZiAskRequest {
  question: string;
  conversationId: string | null;   // null → create a new conversation
  client: ZiClientContext;
}

export interface ZiAskResult {
  conversationId: string;
  conversationTitle: string;
  question: ZiMessage;
  answer: ZiMessage;
  source: ZiSource;
  model: string | null;
}

// ── Page-aware starter suggestions ───────────────────────────────────────────
export interface ZiSuggestion {
  id: string;
  label: string;       // the button text
  question: string;    // the question actually asked
}

// ── Knowledge base entry (pure, deterministic feature explanations) ──────────
export interface ZiKnowledgeEntry {
  pageKey: string;
  /** Module ids whose routes map to this knowledge page. */
  matchModuleIds: string[];
  /** Route prefixes that map to this page (e.g. "/property-radar"). */
  matchRoutes: string[];
  title: string;
  summary: string;          // 1–3 sentence "what is this page" answer
  details: string[];        // bullet explanations used by the fallback builder
  glossary: { term: string; definition: string }[];
  suggestions: ZiSuggestion[];
}

export interface ZiPagination { limit: number; offset: number }
