// ============================================================================
// 📘 ZONO — Facebook Groups Campaign Wizard — service (server-only). 33.2.
// Thin loader that REUSES existing systems: listProperties (inventory), the
// distribution repository's group library (distribution_groups) and the manual-
// publish provider status (Facebook connection). It adds NO tables and NO
// publishing/comment/connection logic — those already live in src/lib/distribution.
// The wizard PLANS only (pure planner); scheduling/publishing hands off to the
// existing distribution flow. Nothing auto-executes.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { listProperties } from "@/lib/properties/repository";
import { distributionRepo } from "@/lib/distribution/repository";
import { manualPublishService } from "@/lib/distribution/manual-publish-service";
import { foldersFromGroups, type WizardGroup, type GroupFolder } from "./planner";
import type { PropertyFacts } from "./content";

type Rec = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export interface WizardProperty extends PropertyFacts { id: string; image: string | null }
export interface ConnectionState { provider: string; label: string; status: string; connected: boolean; message: string; requiresMembership: boolean }
export interface WizardBootstrap {
  properties: WizardProperty[];
  folders: GroupFolder[];
  connection: ConnectionState;
  notes: string[];
}

function toProperty(p: Rec): WizardProperty {
  const image = s(p.primary_image_url);
  return {
    id: String(p.id), title: s(p.title) ?? "נכס", price: num(p.price), city: s(p.city), neighborhood: s(p.neighborhood),
    rooms: num(p.rooms), area: num(p.size_sqm), floor: s(p.floor), type: s(p.type),
    amenities: arr(p.amenities), summary: s(p.ai_summary) ?? s(p.description), hasPhotos: !!image, image,
  };
}

export async function getWizardBootstrap(): Promise<WizardBootstrap> {
  const { organization } = await getSessionContext();
  const orgId = organization?.id ?? "";
  const [props, groupsRaw, conn] = await Promise.all([
    listProperties({}).catch(() => []),
    distributionRepo.listGroups({ limit: 500 }).catch(() => []),
    orgId ? manualPublishService.providerStatus(orgId, "facebook_group").catch(() => null) : Promise.resolve(null),
  ]);

  const properties = (props as unknown as Rec[]).slice(0, 200).map(toProperty);
  const groups: WizardGroup[] = (groupsRaw as unknown as Rec[]).map((gr) => ({
    id: String(gr.id), name: s(gr.name) ?? "קבוצה", category: s(gr.category), city: s(gr.city),
    url: s(gr.group_url), membersCount: num(gr.members_count) ?? 0, lastPostAt: s(gr.last_post_at),
  }));
  const folders = foldersFromGroups(groups);

  // The provider status is a stub union ("not_connected" | "pending" | "error")
  // until an official Meta connection is approved — so "connected" is currently
  // never true. Kept as a forward-compatible check.
  const connected = !!conn && conn.status !== "not_connected" && conn.status !== "error" && conn.status !== "pending";
  const connection: ConnectionState = conn
    ? { provider: conn.provider, label: conn.label, status: conn.status, connected, message: conn.message, requiresMembership: conn.requiresMembership }
    : { provider: "facebook", label: "Facebook", status: "not_connected", connected: false, message: "פייסבוק לא מחובר עדיין", requiresMembership: true };

  const notes: string[] = [];
  if (!folders.length) notes.push("אין עדיין קבוצות בספרייה — הוסיפו קבוצות במסך ״קבוצות״ (Distribution) כדי לשייך לתיקיות.");
  if (!connection.connected) notes.push("ניתן להכין ולשמור קמפיין גם ללא חיבור פייסבוק — אך לא ניתן לתזמן/לפרסם עד לחיבור.");
  return { properties, folders, connection, notes };
}
