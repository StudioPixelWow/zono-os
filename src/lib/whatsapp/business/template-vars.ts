// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — pure template-variable helpers.
// No server imports — unit-testable in QA.
// ============================================================================

/** Count {{1}}, {{2}}, ... placeholders in a template body. */
export function countTemplateVariables(bodyText: string): number {
  const set = new Set<string>();
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) set.add(m[1]);
  return set.size;
}

/** Validate that the supplied variables satisfy a template's placeholder count. */
export function validateTemplateVariables(variableCount: number, supplied: string[]): { ok: boolean; error?: string } {
  if (supplied.length !== variableCount) return { ok: false, error: `template expects ${variableCount} variable(s), got ${supplied.length}` };
  if (supplied.some((v) => v == null || v === "")) return { ok: false, error: "template variables must be non-empty" };
  return { ok: true };
}
