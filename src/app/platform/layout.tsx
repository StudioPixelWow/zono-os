// ============================================================================
// ZONO — Platform Admin control-plane layout (P5.1). A SEPARATE top-level route
// segment (NOT the org-scoped /(app)/platform-admin tooling). Protected by the
// P5.0 platform boundary: only an active platform operator with the base
// platform.customers.read capability may enter. Everyone else — ordinary org
// owner/admin/agent, suspended operator, anonymous — gets a safe denial. This
// layout is the ONLY chrome for /platform/*; it never renders the customer app
// shell.
// ============================================================================
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getCurrentPlatformOperator, getPlatformOperatorDisplayName } from "@/lib/platform-admin/server/auth";
import { operatorCan, capabilitiesForRole } from "@/lib/platform-admin/capabilities";
import { PlatformShell } from "@/components/platform-admin/PlatformShell";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  if (state === "unauthenticated") redirect("/login");

  const operator = await getCurrentPlatformOperator();
  // Base gate: must be an active operator holding the universal read capability.
  if (!operatorCan(operator, "platform.customers.read") || !operator) {
    return <PlatformDenied />;
  }

  const name = await getPlatformOperatorDisplayName(operator.userId);
  const caps = capabilitiesForRole(operator.role);
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

  return (
    <PlatformShell operator={{ name, role: operator.role, caps }} env={env}>
      {children}
    </PlatformShell>
  );
}
