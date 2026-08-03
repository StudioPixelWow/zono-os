// ============================================================================
// 🔐 Authorized document access — Wave 0 Phase 4 test.
// Run: npx tsx src/lib/security/file-access.test.mts   (exit 0 = pass)
// ============================================================================
import { authorizeFileAccess, isSafeObjectPath, validateUpload, buildObjectPath, type FileRecord } from "./file-access.ts";
import type { ActorContext } from "./org-scope.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const alphaMgr: ActorContext = { userId: "u-m", organizationId: "ALPHA", role: "manager", status: "active" };
const alphaAgent: ActorContext = { userId: "u-a", organizationId: "ALPHA", role: "agent", status: "active" };
const betaMgr: ActorContext = { userId: "u-b", organizationId: "BETA", role: "manager", status: "active" };
const disabled: ActorContext = { userId: "u-d", organizationId: "ALPHA", role: "manager", status: "disabled" };

const alphaDoc: FileRecord = { bucket: "documents", path: "ALPHA/deal-1/contract.pdf", organizationId: "ALPHA", ownerUserId: "u-a" };

console.log("\n— cross-tenant + auth —");
check("Alpha manager reads own-org doc", authorizeFileAccess(alphaMgr, alphaDoc).allow === true);
check("Beta manager CANNOT read Alpha doc", authorizeFileAccess(betaMgr, alphaDoc).allow === false && authorizeFileAccess(betaMgr, alphaDoc).reason === "cross_tenant_denied");
check("disabled member denied", authorizeFileAccess(disabled, alphaDoc).allow === false && authorizeFileAccess(disabled, alphaDoc).reason === "inactive_member");
check("agent reads doc they own", authorizeFileAccess(alphaAgent, alphaDoc).allow === true);

console.log("\n— client cannot widen access via path —");
check("requested path != stored path → denied", authorizeFileAccess(alphaMgr, alphaDoc, "ALPHA/deal-2/secret.pdf").allow === false);
check("requested path == stored path → ok", authorizeFileAccess(alphaMgr, alphaDoc, "ALPHA/deal-1/contract.pdf").allow === true);

console.log("\n— path safety —");
check("traversal rejected", isSafeObjectPath("documents", "ALPHA/../BETA/x.pdf", "ALPHA") === false);
check("cross-org path rejected", isSafeObjectPath("documents", "BETA/x.pdf", "ALPHA") === false);
check("unknown bucket rejected", isSafeObjectPath("evil", "ALPHA/x.pdf", "ALPHA") === false);
check("valid path ok", isSafeObjectPath("documents", "ALPHA/rec/x.pdf", "ALPHA") === true);

console.log("\n— upload validation —");
check("pdf ok", validateUpload({ filename: "חוזה.pdf", mime: "application/pdf", size: 1000 }).ok === true);
check("exe blocked", validateUpload({ filename: "x.exe", mime: "application/pdf", size: 1000 }).ok === false);
check("script mime/ext blocked", validateUpload({ filename: "x.js", mime: "text/plain", size: 10 }).ok === false);
check("oversize rejected", validateUpload({ filename: "x.pdf", mime: "application/pdf", size: 99 * 1024 * 1024 }).ok === false);
check("unsupported mime rejected", validateUpload({ filename: "x.pdf", mime: "application/x-msdownload", size: 10 }).ok === false);
check("name sanitized", (() => { const r = validateUpload({ filename: "a/b\\c.pdf", mime: "application/pdf", size: 10 }); return r.ok === true && !r.safeName!.includes("/") && !r.safeName!.includes("\\"); })());

console.log("\n— server-built path —");
check("path prefixed by org + record", buildObjectPath("ALPHA", "rec1", "x.pdf").startsWith("ALPHA/rec1/"));

console.log(`\n${failed === 0 ? "🟢" : "🔴"} file-access: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
