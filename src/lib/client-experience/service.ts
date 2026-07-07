// ============================================================================
// 🤝 ZONO — Client Experience 2.0 — service (server-only). PHASE 56.0.
// Builds the unified client experience by REUSING the existing portal getters —
// which already resolve the authenticated client and enforce the RLS/authorization
// boundary (PortalResult). This service adds NO new queries and NO new auth: it
// composes already-client-safe outputs, then the pure assembler redacts again.
// Do not duplicate portals — this UPGRADES them.
// ============================================================================
import "server-only";
import { getBuyerDashboard, getBuyerDocuments } from "@/lib/buyer-portal";
import { getSellerDashboard, getSellerDocuments, getSellerActivity } from "@/lib/seller-portal";
import { assembleClientExperience } from "./assemble";
import type { ClientExperience, SourceItem } from "./types";

type PR<T> = { state: "unauthenticated" } | { state: "unlinked"; email: string | null } | { state: "ready"; data: T };

/** Compose the buyer's unified experience (inherits the buyer-portal boundary). */
export async function getBuyerExperience(): Promise<PR<ClientExperience>> {
  const dash = await getBuyerDashboard();
  if (dash.state !== "ready") return dash as PR<ClientExperience>;
  const docsR = await getBuyerDocuments().catch(() => null);

  const d = dash.data.dashboard;
  const items: SourceItem[] = [];
  for (const a of d.upcomingAppointments ?? []) items.push({ id: a.id, at: a.startAt, kind: "appointment", title: a.title, detail: a.locationText, href: a.propertyId ? `/buyer/property/${a.propertyId}` : null, important: true });
  for (const c of d.recentConversations ?? []) items.push({ at: c.at, kind: "message", title: c.fromBroker ? "הודעה מהסוכן" : "הודעה שלך", detail: c.summary });
  for (const n of d.notifications ?? []) items.push({ id: n.id, at: n.at, kind: n.type === "opportunity" || n.type === "new_match" ? "update" : n.type === "appointment" ? "appointment" : n.type === "message" ? "message" : "status", title: n.title, detail: n.detail, requiresApproval: n.requiresApproval, important: n.type === "price_drop" || n.type === "sold" });
  for (const m of d.marketUpdates ?? []) items.push({ at: null, kind: "update", title: m.title, detail: m.body });
  for (const it of d.openItems ?? []) items.push({ at: null, kind: "action", title: it.title, detail: it.why, requiresApproval: it.requiresApproval });
  if (docsR && docsR.state === "ready") for (const doc of docsR.data.docs ?? []) items.push({ id: doc.id, at: null, kind: doc.category === "offer" ? "offer" : "document", title: doc.title, detail: doc.category, href: doc.url });

  const exp = assembleClientExperience({ role: "buyer", clientId: "self", clientName: dash.data.profileName, items });
  exp.generatedAt = new Date().toISOString();
  return { state: "ready", data: exp };
}

/** Compose the seller's unified experience (inherits the seller-portal boundary). */
export async function getSellerExperience(): Promise<PR<ClientExperience>> {
  const dash = await getSellerDashboard();
  if (dash.state !== "ready") return dash as PR<ClientExperience>;
  const [docsR, actR] = await Promise.all([getSellerDocuments().catch(() => null), getSellerActivity().catch(() => null)]);

  const d = dash.data.dashboard;
  const items: SourceItem[] = [];
  for (const a of d.upcomingAppointments ?? []) items.push({ id: a.id, at: a.startAt, kind: "appointment", title: a.title, detail: a.locationText, important: true });
  for (const c of d.recentConversations ?? []) items.push({ at: c.at, kind: "message", title: c.fromBroker ? "הודעה מהסוכן" : "הודעה שלך", detail: c.summary });
  for (const n of d.notifications ?? []) items.push({ id: n.id, at: n.at, kind: n.type === "viewing" ? "appointment" : n.type === "message" ? "message" : n.type === "market" || n.type === "price_reco" ? "marketing" : "status", title: n.title, detail: n.detail, requiresApproval: n.requiresApproval });
  for (const it of d.openItems ?? []) items.push({ at: null, kind: "action", title: it.title, detail: it.why, requiresApproval: it.requiresApproval });
  const activity = actR && actR.state === "ready" ? actR.data.activity : (d.todayActivity ?? []);
  for (const ev of activity ?? []) items.push({ at: ev.at, kind: ev.kind === "marketing" ? "marketing" : ev.kind === "appointment" ? "appointment" : ev.kind === "message" ? "message" : ev.kind === "price" ? "marketing" : "update", title: ev.title, detail: ev.detail });
  if (docsR && docsR.state === "ready") for (const doc of docsR.data.docs ?? []) items.push({ id: doc.id, at: null, kind: doc.category === "offer" ? "offer" : doc.category === "marketing" ? "marketing" : "document", title: doc.title, detail: doc.category, href: doc.url });

  const exp = assembleClientExperience({ role: "seller", clientId: "self", clientName: dash.data.profileName, items });
  exp.generatedAt = new Date().toISOString();
  return { state: "ready", data: exp };
}
