// ============================================================================
// 🏢 ZONO — Office AI Manager page (/office-manager). PHASE 55.0.
// One operational command center for office managers. Composed, advisory,
// approval-gated — nothing auto-assigns.
// ============================================================================
import { getOfficeManager } from "@/lib/office-manager/service";
import type { OfficeManagerReport } from "@/lib/office-manager/types";
import { OfficeManagerView } from "./OfficeManagerView";

export const dynamic = "force-dynamic";

export default async function OfficeManagerPage() {
  let report: OfficeManagerReport | null = null;
  try { report = await getOfficeManager(); } catch (e) { console.error("[office-manager] load failed:", e); }
  return <OfficeManagerView report={report} />;
}
