// ============================================================================
// ZONO — Correlation / request / execution IDs (pure). Deterministic format,
// collision-resistant (time + counter + entropy). One vocabulary for tracing a
// request across modules (request → trace → execution → journey/property/...).
// ============================================================================
let counter = 0;

function rand(): string {
  // Math.random is fine for non-cryptographic correlation ids.
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

/** Generic prefixed id: <prefix>_<base36 time><counter><entropy>. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 0xffffff;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand()}`;
}

export const newRequestId = (): string => newId("req");
export const newTraceId = (): string => newId("trace");
export const newCorrelationId = (): string => newId("corr");
export const newExecutionId = (): string => newId("exec");

/** Validate an id has the expected prefix (best-effort, defensive). */
export function isId(value: string | null | undefined, prefix: string): boolean {
  return typeof value === "string" && value.startsWith(`${prefix}_`);
}
