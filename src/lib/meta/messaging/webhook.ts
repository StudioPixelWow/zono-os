// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING WEBHOOK SIGNAL EXTRACTION (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Parses a VERIFIED webhook body into secret-free messaging SIGNALS. It reads only
// enough to (a) identify the trusted ASSET (never the org — the org is derived from
// the trusted asset→org mapping downstream) and (b) enqueue a bounded pull. It NEVER
// trusts a payload org id, NEVER copies the raw payload / message body, and NEVER
// performs a provider pull. Only Messenger + Instagram messaging topics are promoted.
// ============================================================================
export interface MessagingSignal {
  assetExternalId: string;             // trusted asset (verified upstream)
  platform: "facebook" | "instagram";
  externalThreadId: string | null;     // sender/thread anchor (never the org)
  hasMessage: boolean;
}

const asStr = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** Extract Messenger / IG-DM signals from a verified webhook payload (pure). */
export function extractMessagingSignals(parsed: unknown): MessagingSignal[] {
  const out: MessagingSignal[] = [];
  if (!parsed || typeof parsed !== "object") return out;
  const root = parsed as { object?: unknown; entry?: unknown };
  const platform: "facebook" | "instagram" = root.object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const entry = e as { id?: unknown; messaging?: unknown; changes?: unknown };
    const assetExternalId = asStr(entry.id);
    if (!assetExternalId) continue;                       // no trusted asset anchor → skip
    // Messenger/IG deliver messaging under `messaging[]` (or `changes[].value` for IG).
    const events = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const m of events) {
      if (!m || typeof m !== "object") continue;
      const msg = m as { sender?: { id?: unknown }; message?: unknown };
      const sender = asStr((msg.sender ?? {}).id);
      out.push({ assetExternalId, platform, externalThreadId: sender, hasMessage: !!msg.message });
    }
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const c of changes) {
      if (!c || typeof c !== "object") continue;
      const ch = c as { field?: unknown; value?: unknown };
      if (asStr(ch.field) !== "messages") continue;
      const v = (ch.value && typeof ch.value === "object") ? ch.value as Record<string, unknown> : {};
      out.push({ assetExternalId, platform, externalThreadId: asStr((v.sender as { id?: unknown } | undefined)?.id) ?? asStr(v.thread_id), hasMessage: !!v.message });
    }
  }
  return out;
}
