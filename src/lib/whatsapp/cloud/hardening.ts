// ============================================================================
// 💬 ZONO — WhatsApp Cloud API · hardening (pure). PHASE 48.1.
// Error classification, template mapping, media metadata, and outbound payload
// builders for template/media/document/location. Pure & deterministic; the
// server service performs the network I/O and storage writes.
// ============================================================================
import { normalizePhone } from "./core";

// ── Error classification (STEP 8) ────────────────────────────────────────────
export type WaErrorKind = "auth" | "rate_limit" | "invalid_recipient" | "template_error" | "media_error" | "provider_down" | "unknown";
export interface ClassifiedError { kind: WaErrorKind; retriable: boolean; httpStatus: number | null; code: number | null; message: string }

export function classifyError(httpStatus: number | null, metaCode: number | null, message = ""): ClassifiedError {
  const mk = (kind: WaErrorKind, retriable: boolean): ClassifiedError => ({ kind, retriable, httpStatus, code: metaCode, message });
  if (httpStatus === 401 || httpStatus === 403 || metaCode === 190 || metaCode === 0 || metaCode === 10) return mk("auth", false);
  if (httpStatus === 429 || metaCode === 4 || metaCode === 80007 || metaCode === 130429 || metaCode === 131048) return mk("rate_limit", true);
  if (metaCode === 131026 || metaCode === 131047 || metaCode === 131051 || metaCode === 131045) return mk("invalid_recipient", false);
  if (metaCode === 131052 || metaCode === 131053) return mk("media_error", false);
  if ((metaCode != null && metaCode >= 132000 && metaCode <= 132100)) return mk("template_error", false);
  if ((httpStatus != null && httpStatus >= 500) || metaCode === 131000 || metaCode === 133000) return mk("provider_down", true);
  return mk("unknown", false);
}

// ── Template mapping (STEP 5) ────────────────────────────────────────────────
export interface WaTemplate { name: string; status: string; language: string; category: string; components: unknown[]; id: string | null }
type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
export function mapTemplate(t: unknown): WaTemplate | null {
  const r = (t && typeof t === "object" ? t : {}) as Row;
  const name = s(r.name); if (!name) return null;
  return {
    name, id: s(r.id), status: s(r.status) ?? "UNKNOWN", language: s(r.language) ?? "he",
    category: s(r.category) ?? "UTILITY", components: Array.isArray(r.components) ? (r.components as unknown[]) : [],
  };
}
export function mapTemplates(payload: unknown): WaTemplate[] {
  const data = ((payload as Row | undefined)?.data);
  return (Array.isArray(data) ? data : []).map(mapTemplate).filter((x): x is WaTemplate => x !== null);
}

// ── Media metadata (STEP 3/4) ────────────────────────────────────────────────
export interface MediaMeta { media_id: string; mime: string | null; filename: string | null; storage_bucket: string | null; storage_path: string | null; downloaded: boolean }
export function mediaPath(orgId: string, messageWaId: string, mediaId: string, mime: string | null): string {
  const ext = mimeToExt(mime);
  return `whatsapp/${orgId}/${messageWaId}/${mediaId}${ext ? "." + ext : ""}`;
}
export function mimeToExt(mime: string | null): string | null {
  if (!mime) return null;
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "video/mp4": "mp4", "application/pdf": "pdf" };
  return map[mime.split(";")[0].trim()] ?? (mime.includes("/") ? mime.split("/")[1] : null);
}

// ── Outbound payload builders (STEP 6) ───────────────────────────────────────
const wa = (to: string) => normalizePhone(to).replace(/^0/, "972");
export function buildMediaPayload(to: string, kind: "image" | "audio" | "video" | "document", ref: { id?: string; link?: string; caption?: string; filename?: string }): Record<string, unknown> {
  const media: Row = {}; if (ref.id) media.id = ref.id; if (ref.link) media.link = ref.link; if (ref.caption) media.caption = ref.caption; if (ref.filename && kind === "document") media.filename = ref.filename;
  return { messaging_product: "whatsapp", to: wa(to), type: kind, [kind]: media };
}
export function buildLocationPayload(to: string, loc: { lat: number; lng: number; name?: string; address?: string }): Record<string, unknown> {
  return { messaging_product: "whatsapp", to: wa(to), type: "location", location: { latitude: loc.lat, longitude: loc.lng, name: loc.name ?? "", address: loc.address ?? "" } };
}

// ── Self-check (extends the connector QA) ────────────────────────────────────
export interface HCheck { name: string; pass: boolean }
export interface HSelfCheck { ok: boolean; total: number; passed: number; checks: HCheck[] }
export function runHardeningSelfCheck(): HSelfCheck {
  const checks: HCheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });

  add("error: auth (401 / code 190) not retriable", classifyError(401, null).kind === "auth" && !classifyError(null, 190).retriable);
  add("error: rate_limit (429) retriable", classifyError(429, null).kind === "rate_limit" && classifyError(429, null).retriable);
  add("error: invalid recipient (131026)", classifyError(400, 131026).kind === "invalid_recipient");
  add("error: template error (132012)", classifyError(400, 132012).kind === "template_error");
  add("error: media error (131052)", classifyError(400, 131052).kind === "media_error");
  add("error: provider down (5xx) retriable", classifyError(503, null).kind === "provider_down" && classifyError(503, null).retriable);
  add("error: unknown fallback", classifyError(400, 999999).kind === "unknown");

  const tmpls = mapTemplates({ data: [{ name: "welcome", status: "APPROVED", language: "he", category: "UTILITY", components: [{ type: "BODY" }] }, { status: "APPROVED" /* no name */ }] });
  add("templates: map + drop nameless", tmpls.length === 1 && tmpls[0].name === "welcome" && tmpls[0].status === "APPROVED" && tmpls[0].components.length === 1);

  add("media: path + ext from mime", mediaPath("o1", "wamid.1", "M1", "image/jpeg") === "whatsapp/o1/wamid.1/M1.jpg" && mimeToExt("audio/ogg") === "ogg");

  const media = buildMediaPayload("0501234567", "image", { id: "M1", caption: "hi" });
  add("outbound media payload: 972 + type + media id", media.to === "972501234567" && media.type === "image" && (media.image as Row).id === "M1");
  const doc = buildMediaPayload("0501234567", "document", { id: "D1", filename: "f.pdf" });
  add("outbound document payload: filename kept", (doc.document as Row).filename === "f.pdf");
  const loc = buildLocationPayload("0501234567", { lat: 32.08, lng: 34.78, name: "TA" });
  add("outbound location payload: lat/lng", (loc.location as Row).latitude === 32.08 && loc.type === "location");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
