// ============================================================================
// 📘 ZONO — WhatsApp BRIDGE provider (server-only, TEMPORARY QR phase).
// ----------------------------------------------------------------------------
// Talks to an EXTERNAL bridge worker where whatsapp-web.js / Baileys actually
// runs (it needs Puppeteer / a long-lived socket, which cannot live in the
// Next.js serverless runtime). ZONO never imports the unofficial library; it
// only speaks a small HTTP contract to the bridge, scoped per (org, user).
//
// Bridge HTTP contract (all authenticated with Bearer WHATSAPP_BRIDGE_TOKEN):
//   POST   {BRIDGE}/sessions/{org}/{user}/connect      -> snapshot(+qr)
//   GET    {BRIDGE}/sessions/{org}/{user}/state        -> snapshot
//   POST   {BRIDGE}/sessions/{org}/{user}/qr           -> snapshot(fresh qr)
//   POST   {BRIDGE}/sessions/{org}/{user}/disconnect   -> { ok }
//   DELETE {BRIDGE}/sessions/{org}/{user}              -> { ok }
//   POST   {BRIDGE}/sessions/{org}/{user}/send         -> { ok, providerMessageId }
//   POST   {BRIDGE}/sessions/{org}/{user}/typing       -> { ok }
//   GET    {BRIDGE}/media/{ref}                        -> { url, mime }
// The bridge PUSHES inbound messages + connection events to ZONO's webhook at
// INBOUND_WEBHOOK_PATH. If the bridge is not configured, every method returns an
// honest `unavailable` snapshot — never a fake QR.
// ============================================================================
import "server-only";
import { writeSession, readSessionSnapshot } from "./session";
import type {
  WaConnectionSnapshot, WaMediaRef, WaSendInput, WaSendResult, WaSessionCtx, WhatsAppProvider,
} from "./types";
import { INBOUND_WEBHOOK_PATH } from "./types";

interface BridgeConfig { url: string; token: string }
function bridgeConfig(): BridgeConfig | null {
  const url = process.env.WHATSAPP_BRIDGE_URL?.trim();
  const token = process.env.WHATSAPP_BRIDGE_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

function unavailable(): WaConnectionSnapshot {
  return { providerKind: "bridge", state: "unavailable", qr: null, displayName: null, phone: null, lastConnectedAt: null, error: null };
}

/** Small JSON fetch with auth + timeout. Never throws — returns null on failure. */
async function call<T>(cfg: BridgeConfig, method: string, path: string, body?: unknown): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
  finally { clearTimeout(t); }
}

type BridgeSnapshot = Partial<Pick<WaConnectionSnapshot, "state" | "qr" | "displayName" | "phone" | "lastConnectedAt" | "error">> & { sessionRef?: string | null };

function applySnapshot(raw: BridgeSnapshot | null): Partial<WaConnectionSnapshot> & { ref?: string | null } {
  if (!raw) return { state: "error", error: "אין תשובה מהשרת" };
  return {
    state: raw.state ?? "connecting",
    qr: raw.qr ?? null,
    displayName: raw.displayName ?? null,
    phone: raw.phone ?? null,
    error: raw.error ?? null,
    ref: raw.sessionRef ?? null,
  };
}

const seg = (ctx: WaSessionCtx) => `/sessions/${encodeURIComponent(ctx.orgId)}/${encodeURIComponent(ctx.userId)}`;

/** The temporary QR/WhatsApp-Web provider (via external bridge). Swappable. */
export const bridgeProvider: WhatsAppProvider = {
  kind: "bridge",

  async connect(ctx) {
    const cfg = bridgeConfig();
    if (!cfg) { await writeSession(ctx, "bridge", { state: "unavailable", error: null }); return unavailable(); }
    const raw = await call<BridgeSnapshot>(cfg, "POST", `${seg(ctx)}/connect`);
    const s = applySnapshot(raw);
    await writeSession(ctx, "bridge", { state: s.state, qr: s.qr, error: s.error ?? null, ref: s.ref ?? null });
    return readSessionSnapshot(ctx, "bridge");
  },

  async connectionState(ctx) {
    const cfg = bridgeConfig();
    if (!cfg) return readSessionSnapshot(ctx, "bridge"); // returns stored (likely unavailable/disconnected)
    const raw = await call<BridgeSnapshot>(cfg, "GET", `${seg(ctx)}/state`);
    if (raw) {
      const s = applySnapshot(raw);
      await writeSession(ctx, "bridge", { state: s.state, qr: s.qr, displayName: s.displayName ?? null, phone: s.phone ?? null, error: s.error ?? null, ref: s.ref ?? null });
    }
    return readSessionSnapshot(ctx, "bridge");
  },

  async generateQR(ctx) {
    const cfg = bridgeConfig();
    if (!cfg) { await writeSession(ctx, "bridge", { state: "unavailable" }); return unavailable(); }
    const raw = await call<BridgeSnapshot>(cfg, "POST", `${seg(ctx)}/qr`);
    const s = applySnapshot(raw);
    await writeSession(ctx, "bridge", { state: s.state ?? "waiting_qr", qr: s.qr, error: s.error ?? null, ref: s.ref ?? null });
    return readSessionSnapshot(ctx, "bridge");
  },

  async disconnect(ctx) {
    const cfg = bridgeConfig();
    if (cfg) await call<{ ok: boolean }>(cfg, "POST", `${seg(ctx)}/disconnect`);
    await writeSession(ctx, "bridge", { state: "disconnected", qr: null, error: null, ref: null });
    return { ok: true };
  },

  async deleteSession(ctx) {
    const cfg = bridgeConfig();
    if (cfg) await call<{ ok: boolean }>(cfg, "DELETE", seg(ctx));
    await writeSession(ctx, "bridge", { state: "disconnected", qr: null, displayName: null, phone: null, error: null, ref: null });
    return { ok: true };
  },

  async listenMessages() {
    // Realized via the bridge PUSHING to ZONO's webhook. Nothing to poll here.
    return { webhookPath: INBOUND_WEBHOOK_PATH, subscribed: !!bridgeConfig() };
  },

  async sendMessage(ctx, input: WaSendInput): Promise<WaSendResult> {
    const cfg = bridgeConfig();
    if (!cfg) return { ok: false, error: "שירות ה-WhatsApp אינו פעיל בשרת." };
    const r = await call<{ ok?: boolean; providerMessageId?: string; error?: string }>(cfg, "POST", `${seg(ctx)}/send`, { toPhone: input.toPhone, text: input.text });
    if (!r?.ok) return { ok: false, error: r?.error ?? "השליחה נכשלה." };
    return { ok: true, providerMessageId: r.providerMessageId };
  },

  async typing(ctx, toPhone: string, on: boolean): Promise<void> {
    const cfg = bridgeConfig();
    if (cfg) await call(cfg, "POST", `${seg(ctx)}/typing`, { toPhone, on });
  },

  async media(_ctx, mediaRef: string): Promise<WaMediaRef> {
    const cfg = bridgeConfig();
    if (!cfg) return { url: null, mime: null, error: "unavailable" };
    const r = await call<{ url?: string; mime?: string }>(cfg, "GET", `/media/${encodeURIComponent(mediaRef)}`);
    return { url: r?.url ?? null, mime: r?.mime ?? null };
  },

  async session(ctx): Promise<{ exists: boolean; ref: string | null }> {
    const snap = await readSessionSnapshot(ctx, "bridge");
    const ref = (snap as unknown as { sessionRef?: string }).sessionRef ?? null;
    return { exists: snap.state === "connected", ref };
  },
};

export { bridgeConfig };
