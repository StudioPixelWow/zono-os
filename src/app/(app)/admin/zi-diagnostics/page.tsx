import { ZiDiagnosticsAdminView } from "./ZiDiagnosticsAdminView";

export const dynamic = "force-dynamic";

// ZI Expert™ Diagnostics admin (Phase 24) — read-only log of recent diagnostic
// runs (redacted, non-sensitive). Managers+ see all runs in their org via RLS.
export default function ZiDiagnosticsPage() {
  return <ZiDiagnosticsAdminView />;
}
