// ============================================================================
// ZONO — platform server surface (server-only). Admin-gated services + actions
// for the Health Center, feature flags and central audit. Pure layers live in
// ../ and remain client-safe; this barrel is server-only.
// ============================================================================
import "server-only";
export { assertPlatformAdminAccess, tryPlatformAdminAccess, type PlatformAccess } from "./permissions";
export { createPlatformRepository, flagRowToFeatureFlag, type PlatformRepository, type FlagRow, type AuditRow } from "./repository";
export { buildSystemHealth } from "./health-service";
export { recordAudit, type RecordAuditInput } from "./audit";
export {
  getSystemHealthAction, listFeatureFlagsAction, upsertFeatureFlagAction, listAuditLogAction,
} from "./actions";
