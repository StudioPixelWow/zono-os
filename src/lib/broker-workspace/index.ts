// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — barrel (pure, client-safe). 35.0.
// Exposes the pure types + assembler + QA. The server service and actions are
// imported directly on the server (they carry "server-only"). Client components
// import these pure submodules, never the server barrel.
// ============================================================================
export * from "./types";
export { assembleBrokerWorkspace } from "./assemble";
export { runSelfCheck } from "./qa";
