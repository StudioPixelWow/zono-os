// ============================================================================
// ZONO — WhatsApp BRIDGE webhook (server-only). The external bridge worker (where
// whatsapp-web.js / Baileys runs) POSTs inbound messages + connection events
// here. Authenticated with Bearer WHATSAPP_BRIDGE_TOKEN. Inbound messages are
// mapped onto the EXISTING conversation model (no new inbox). Always returns 200
// once accepted so the bridge doesn't retry-storm. Never exposes tokens.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { ingestBridgeMessage, ingestBridgeStatus } from "@/lib/whatsapp/provider/ingest";
import type { WaConnState, WaInboundMessage } from "@/lib/whatsapp/provider/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.WHATSAPP_BRIDGE_TOKEN?.trim();
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

interface BridgeEvent {
  type?: "message" | "status";
  orgId?: string;
  userId?: string;
  message?: Partial<WaInboundMessage>;
  status?: { state?: WaConnState; displayName?: string | null; phone?: string | null; error?: string | null };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  let body: BridgeEvent;
  try { body = (await req.json()) as BridgeEvent; }
  catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 200 }); }

  const orgId = body.orgId?.trim();
  const userId = body.userId?.trim();
  if (!orgId || !userId) return NextResponse.json({ ok: false, error: "missing_scope" }, { status: 200 });
  const ctx = { orgId, userId };

  try {
    if (body.type === "status" && body.status?.state) {
      await ingestBridgeStatus(ctx, body.status.state, {
        displayName: body.status.displayName ?? null, phone: body.status.phone ?? null, error: body.status.error ?? null,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (body.type === "message" && body.message?.fromPhone && typeof body.message.text === "string") {
      const m = body.message;
      const msg: WaInboundMessage = {
        fromPhone: m.fromPhone as string,
        contactName: m.contactName ?? null,
        text: m.text as string,
        kind: (m.kind ?? "text") as WaInboundMessage["kind"],
        mediaRef: m.mediaRef ?? null,
        providerMessageId: m.providerMessageId ?? `${Date.now()}`,
        timestamp: m.timestamp ?? new Date().toISOString(),
      };
      const r = await ingestBridgeMessage(ctx, msg);
      return NextResponse.json({ ok: r.ok, reason: r.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "unhandled" }, { status: 200 });
  } catch (e) {
    console.error("[whatsapp-bridge] ingest failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 200 });
  }
}
