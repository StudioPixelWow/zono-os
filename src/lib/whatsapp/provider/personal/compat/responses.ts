// ============================================================================
// 📘 C9 COMPAT — Evolution RESPONSE → canonical mapping (server-only, pure).
// ----------------------------------------------------------------------------
// Converts Evolution response shapes into ZONO's canonical connection/send
// results. The adapter consumes ONLY these canonical outputs.
// ============================================================================
import type { WaConnState, WaQr, WaSendResult } from "../../types";
import type { RawConnect, RawConnectionState, RawCreate, RawSendResult } from "./raw";
import { normalizeState } from "./status";

/** Canonical connection reading emitted by the compat layer. Never carries creds. */
export interface CanonicalConnection {
  state: WaConnState;
  qr: WaQr | null;
  phone: string | null;
  displayName: string | null;
}

const QR_TTL_MS = 60_000; // QR validity window we advertise to the client

function toQr(base64: string | null | undefined, code: string | null | undefined, nowIso: string): WaQr | null {
  if (!base64 && !code) return null;
  return { image: base64 ?? null, raw: code ?? null, expiresAt: new Date(Date.parse(nowIso) + QR_TTL_MS).toISOString() };
}

/** Map GET /instance/connect (QR/pairing) into a canonical connection. */
export function fromConnect(raw: RawConnect | null, nowIso: string): CanonicalConnection {
  const qr = toQr(raw?.base64, raw?.code, nowIso);
  return { state: qr ? "waiting_qr" : "connecting", qr, phone: null, displayName: null };
}

/** Map POST /instance/create into a canonical connection (may already carry a QR). */
export function fromCreate(raw: RawCreate | null, nowIso: string): CanonicalConnection {
  const qr = toQr(raw?.qrcode?.base64, raw?.qrcode?.code, nowIso);
  return { state: qr ? "waiting_qr" : "connecting", qr, phone: null, displayName: null };
}

/** Map GET /instance/connectionState into a canonical connection (no QR here). */
export function fromConnectionState(raw: RawConnectionState | null): CanonicalConnection {
  const s = raw?.instance?.state ?? raw?.state ?? null;
  return { state: normalizeState(s, false), qr: null, phone: null, displayName: null };
}

/** Map a send response into the canonical send result. */
export function fromSend(raw: RawSendResult | null): WaSendResult {
  const id = raw?.key?.id ?? null;
  if (!id) return { ok: false, error: "send_no_ack" };
  return { ok: true, providerMessageId: id };
}
