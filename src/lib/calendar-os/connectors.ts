// ============================================================================
// 🔌 ZONO — Calendar OS™ · provider connectors foundation. PHASE 43.2.
// Google / Outlook abstraction ONLY — no OAuth, no external calls ship here.
// Fixes the two-way-sync contract so real connectors can be added later without
// refactor. Nothing auto-creates external events — every draft op is gated
// behind a (future) connection + explicit approval.
// ============================================================================
import type { CalendarEvent, ProviderId } from "./types";

export interface ConnectorHealth {
  id: ProviderId; label: string; connected: boolean;
  lastSyncAt: string | null; syncStatus: "idle" | "syncing" | "error" | "not_connected";
  capabilities: { list: boolean; create: boolean; update: boolean; delete: boolean };
  note: string;
}
export interface DraftOpResult { ok: boolean; requiresConnection: boolean; externalId?: string; note: string }

/** Full connector contract (foundation: NoopConnector is the only impl). */
export interface ProviderConnector {
  id: ProviderId;
  label: string;
  listEvents(range: { start: string; end: string }): Promise<CalendarEvent[]>;
  createDraftEvent(event: CalendarEvent): Promise<DraftOpResult>;
  updateDraftEvent(externalId: string, event: CalendarEvent): Promise<DraftOpResult>;
  deleteDraftEvent(externalId: string): Promise<DraftOpResult>;
  health(): Promise<ConnectorHealth>;
}

const NOT_CONNECTED = "לא מחובר — נדרש חיבור מאושר (בקרוב).";
const gated = (): DraftOpResult => ({ ok: false, requiresConnection: true, note: NOT_CONNECTED });

/** Provider that is present but not connected — safe default until OAuth exists. */
export class NoopConnector implements ProviderConnector {
  constructor(public id: ProviderId, public label: string) {}
  async listEvents(): Promise<CalendarEvent[]> { return []; }               // nothing to import until connected
  async createDraftEvent(): Promise<DraftOpResult> { return gated(); }      // NEVER auto-creates externally
  async updateDraftEvent(): Promise<DraftOpResult> { return gated(); }
  async deleteDraftEvent(): Promise<DraftOpResult> { return gated(); }
  async health(): Promise<ConnectorHealth> {
    return { id: this.id, label: this.label, connected: false, lastSyncAt: null, syncStatus: "not_connected",
      capabilities: { list: true, create: true, update: true, delete: true }, note: NOT_CONNECTED };
  }
}

const REGISTRY: ProviderConnector[] = [
  new NoopConnector("google", "Google Calendar"),
  new NoopConnector("microsoft", "Outlook / Microsoft 365"),
  new NoopConnector("ical", "iCal"),
];

export function getConnector(id: ProviderId): ProviderConnector | null { return REGISTRY.find((c) => c.id === id) ?? null; }
export async function getConnectorHealthAll(): Promise<ConnectorHealth[]> { return Promise.all(REGISTRY.map((c) => c.health())); }
/** True only when at least one provider is really connected (always false in foundation). */
export async function anyConnected(): Promise<boolean> { return (await getConnectorHealthAll()).some((h) => h.connected); }
