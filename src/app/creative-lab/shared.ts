// Shared constant + client-facing types for /creative-lab. The cookie name is a
// value export (must NOT live in the "use server" actions module, which may only
// export async functions). The view/result types are re-exported (type-only, so
// no runtime code reaches the client bundle) from the next-free flow module.

export const LAB_SESSION_COOKIE = "zono_lab_session";

export type {
  LabSession, LabOutputView, LabActionResult, BulkRowResult, BulkResult, LabWorld,
} from "@/lib/creative-runtime/lab-flows";
