// ============================================================================
// 📘 C9 COMPAT — canonical → Evolution REQUEST mapping (server-only, pure).
// ----------------------------------------------------------------------------
// Builds Evolution request bodies from ZONO's canonical inputs. The adapter
// passes canonical values; only this file knows Evolution's field names.
// ============================================================================
import type { WaSendInput } from "../../types";

/** Normalize a phone to WhatsApp's international digits (no +). Israeli local
 *  0-prefixed numbers become 972-prefixed. Non-Israeli input is passed through
 *  as digits. Pure. */
export function normalizeNumber(phone: string): string {
  let d = (phone ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d;
}

/** Body for POST /message/sendText/{instance}. */
export function buildSendText(input: WaSendInput): { number: string; text: string } {
  return { number: normalizeNumber(input.toPhone), text: input.text };
}

/** Body for POST /message/sendMedia/{instance}. */
export function buildSendMedia(toPhone: string, media: { url: string; mediatype: "image" | "document" | "video" | "audio"; caption?: string; fileName?: string }): {
  number: string; mediatype: string; media: string; caption?: string; fileName?: string;
} {
  return {
    number: normalizeNumber(toPhone),
    mediatype: media.mediatype,
    media: media.url,
    ...(media.caption ? { caption: media.caption } : {}),
    ...(media.fileName ? { fileName: media.fileName } : {}),
  };
}

/** Body for POST /chat/sendPresence/{instance} (typing indicator). */
export function buildPresence(toPhone: string, on: boolean): { number: string; presence: string; delay: number } {
  return { number: normalizeNumber(toPhone), presence: on ? "composing" : "paused", delay: on ? 1200 : 0 };
}

/** Body for POST /instance/create — pairs a fresh QR session for an instance.
 *  qrcode:true asks Evolution to emit a QR; the webhook config points Evolution
 *  back at ZONO's personal inbound route with a Bearer header so ZONO can
 *  authenticate inbound events. No WhatsApp credentials are supplied by ZONO. */
export function buildCreateInstance(instance: string, webhookUrl: string, webhookToken?: string | null): Record<string, unknown> {
  return {
    instanceName: instance,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
      ...(webhookToken ? { headers: { authorization: `Bearer ${webhookToken}` } } : {}),
    },
  };
}
