// ============================================================================
// 🔐 Org-scoped write boundary — Wave 0 test.
// Run: npx tsx src/lib/security/org-scope.test.mts   (exit 0 = pass)
// ============================================================================
import { authorizeWrite, assertWrite, OrgScopeError, type ActorContext, type WriteTarget } from "./org-scope.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const alphaAgent: ActorContext = { userId: "u-a", organizationId: "ALPHA", role: "agent", status: "active" };
const alphaManager: ActorContext = { userId: "u-m", organizationId: "ALPHA", role: "manager", status: "active" };
const disabled: ActorContext = { userId: "u-d", organizationId: "ALPHA", role: "manager", status: "disabled" };

const inAlpha = (o: Partial<WriteTarget> = {}): WriteTarget => ({ targetOrganizationId: "ALPHA", action: "update", ...o });

console.log("\n— tenant isolation (the core) —");
check("agent cannot write to another org", authorizeWrite(alphaAgent, { targetOrganizationId: "BETA", action: "update" }).allow === false);
check("cross-tenant reason is stable", authorizeWrite(alphaAgent, { targetOrganizationId: "BETA", action: "create" }).reason === "cross_tenant_denied");
check("manager cannot write to another org either", authorizeWrite(alphaManager, { targetOrganizationId: "BETA", action: "delete" }).allow === false);

console.log("\n— deactivation enforcement —");
check("disabled member denied even as manager", authorizeWrite(disabled, inAlpha()).allow === false);
check("disabled reason stable", authorizeWrite(disabled, inAlpha()).reason === "inactive_member");

console.log("\n— ownership rules —");
check("agent may edit own record", authorizeWrite(alphaAgent, inAlpha({ ownerUserId: "u-a" })).allow === true);
check("agent may create unowned record", authorizeWrite(alphaAgent, inAlpha({ action: "create", ownerUserId: null })).allow === true);
check("agent may NOT edit another agent's record", authorizeWrite(alphaAgent, inAlpha({ ownerUserId: "u-other" })).allow === false);
check("manager may edit any in-org record", authorizeWrite(alphaManager, inAlpha({ ownerUserId: "u-other" })).allow === true);

console.log("\n— manager-gated actions —");
check("agent denied manager-gated action (reassign/deactivate)", authorizeWrite(alphaAgent, inAlpha({ requiresManager: true })).allow === false);
check("manager allowed manager-gated action", authorizeWrite(alphaManager, inAlpha({ requiresManager: true })).allow === true);

console.log("\n— assertWrite throws OrgScopeError on deny —");
{
  let threw = false, reason = "";
  try { assertWrite(alphaAgent, { targetOrganizationId: "BETA", action: "update" }); }
  catch (e) { threw = e instanceof OrgScopeError; reason = (e as OrgScopeError).reason; }
  check("throws OrgScopeError with reason", threw && reason === "cross_tenant_denied");
  check("assertWrite passes on allow", (() => { try { assertWrite(alphaManager, inAlpha({ ownerUserId: "x" })); return true; } catch { return false; } })());
}

console.log(`\n${failed === 0 ? "🟢" : "🔴"} org-scope: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
