// ============================================================================
// 💬 ZONO OS 2.0 — STAGE 6 · Batch 6.3 · COMMUNICATION WORKSPACE — providers.
//
// The workspace's ONE data-access layer. It consumes ONLY the canonical
// Communication Provider (Batch 6.2) — never a channel adapter, never WhatsApp
// / Calendar / Gmail directly. loadConversation / loadMessages are wrapped in
// React cache() so the center and context panels asking for the same
// conversation trigger exactly ONE provider execution (no duplicate provider
// usage). listConversations / listPeople are already request-cached upstream.
// ============================================================================
import "server-only";
import { cache } from "react";
import {
  listConversations as providerListConversations,
  listPeople as providerListPeople,
  loadConversation as providerLoadConversation,
  loadMessages as providerLoadMessages,
} from "@/lib/communication-os/provider";

export const listConversations = providerListConversations;   // already cache()'d upstream
export const listPeople = cache(() => providerListPeople());
export const loadConversation = cache((id: string) => providerLoadConversation(id));
export const loadMessages = cache((id: string) => providerLoadMessages(id));
