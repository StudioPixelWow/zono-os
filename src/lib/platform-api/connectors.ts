// ============================================================================
// 🔌 Platform API — Integration Hub connector catalog (pure). 31.0. Part 6.
// A reusable connector model listing the integrations ZONO can connect to.
// Metadata only — live provider OAuth is provisioned per-connector at runtime.
// ============================================================================
import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [
  { id: "google", name: "Google Workspace", category: "פרודוקטיביות", description: "Gmail, Calendar, Drive, Contacts.", capabilities: ["email", "calendar", "drive", "contacts"], authType: "oauth", status: "available" },
  { id: "microsoft", name: "Microsoft 365", category: "פרודוקטיביות", description: "Outlook, Calendar, OneDrive, Teams.", capabilities: ["email", "calendar", "files", "teams"], authType: "oauth", status: "available" },
  { id: "whatsapp", name: "WhatsApp Business", category: "תקשורת", description: "שליחת הודעות מאושרות ותבניות (Draft Studio מכין, נשלח באישור).", capabilities: ["messaging", "templates"], authType: "api_key", status: "beta" },
  { id: "slack", name: "Slack", category: "תקשורת", description: "התראות צוות, אישורי משימות/תהליכים.", capabilities: ["notifications", "approvals"], authType: "oauth", status: "available" },
  { id: "meta", name: "Meta (Facebook/Instagram)", category: "לידים", description: "Lead Ads → לידים ל-ZONO.", capabilities: ["lead_ingest", "audiences"], authType: "oauth", status: "beta" },
  { id: "crm", name: "CRM חיצוני", category: "CRM", description: "סנכרון דו-כיווני של קונים/מוכרים/לידים.", capabilities: ["contacts_sync", "deals_sync"], authType: "api_key", status: "planned" },
  { id: "automation", name: "Automation (Zapier/Make)", category: "אוטומציה", description: "Webhooks + Platform API לתהליכי אוטומציה חיצוניים.", capabilities: ["webhooks", "rest"], authType: "webhook", status: "available" },
];

export function findConnector(id: string): Connector | null { return CONNECTORS.find((c) => c.id === id) ?? null; }
