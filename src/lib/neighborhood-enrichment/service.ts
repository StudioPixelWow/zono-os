/**
 * AI Neighborhood Enrichment (server-only). Processes uploaded localities
 * city-by-city, in CSV order, calling OpenAI for each city's real neighborhoods,
 * validating + normalizing + de-duping, and saving to `neighborhoods` (research
 * table) + mirroring confident ones into `israel_neighborhoods` so the live
 * system uses them. Chunked + resumable (state in the queue table) + retried.
 * Manager+ only. Best-effort per city — one failure never stops the run.
 */
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeNeighborhoodName } from "@/lib/transactions/engine";
import { canonicalCityName } from "@/lib/transactions/providers";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, agent: 40, viewer: 20 };
const MAX_ATTEMPTS = 3;

async function requireManager() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let rank = 40;
  if (profile.role_id) {
    const { data: role } = await supabase.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    rank = ROLE_RANK[role?.key ?? "agent"] ?? 40;
  }
  if (rank < ROLE_RANK.manager) throw new Error("נדרשת הרשאת מנהל.");
  return { userId: user.id };
}

export function isEnrichmentConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ── Queue ────────────────────────────────────────────────────────────────────
export interface CityInput { city_code: string; city_name: string; row_index: number }

export async function queueCities(rows: CityInput[]): Promise<{ queued: number }> {
  await requireManager();
  const admin = createServiceRoleClient();
  const clean = rows
    .map((r) => ({ city_code: String(r.city_code).trim(), city_name: String(r.city_name).trim(), row_index: r.row_index }))
    .filter((r) => r.city_code && r.city_name);
  // Upsert: new cities → pending; existing → refresh name/order, keep status.
  let queued = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const chunk = clean.slice(i, i + 500);
    const { error } = await admin.from("neighborhood_enrichment_cities").upsert(
      chunk.map((c) => ({ city_code: c.city_code, city_name: c.city_name, row_index: c.row_index })) as never,
      { onConflict: "city_code", ignoreDuplicates: false },
    );
    if (!error) queued += chunk.length;
  }
  return { queued };
}

export interface EnrichmentStatus {
  configured: boolean;
  total: number; pending: number; done: number; empty: number; failed: number;
  neighborhoods: number; remaining: number;
}

export async function getEnrichmentStatus(): Promise<EnrichmentStatus> {
  await requireManager();
  const supabase = await createClient();
  const [{ data: cities }, { count: hoods }] = await Promise.all([
    supabase.from("neighborhood_enrichment_cities").select("status,attempts").limit(20000),
    supabase.from("neighborhoods").select("id", { count: "exact", head: true }),
  ]);
  const rows = (cities ?? []) as { status: string; attempts: number }[];
  const by = (s: string) => rows.filter((r) => r.status === s).length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const retryable = rows.filter((r) => r.status === "failed" && r.attempts < MAX_ATTEMPTS).length;
  return {
    configured: isEnrichmentConfigured(),
    total: rows.length, pending, done: by("done"), empty: by("empty"), failed,
    neighborhoods: hoods ?? 0, remaining: pending + retryable,
  };
}

// ── AI research ────────────────────────────────────────────────────────────────
interface AiHood { neighborhood_name: string; confidence_score: number; reason?: string }

async function researchCity(cityName: string, cityCode: string): Promise<{ list: AiHood[]; raw: unknown } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const prompt = `אתה חוקר דאטה גאוגרפי של נדל"ן בישראל.
החזר JSON של שכונות אמיתיות עבור היישוב הבא:
יישוב: ${cityName}
סמל יישוב: ${cityCode}
כללים:
- החזר רק שמות שכונות אמיתיים, מוכרים, או בשימוש מקומי.
- אל תיצור אזורים מלאכותיים/כיווניים (צפון/דרום/מרכז היישוב וכו') אלא אם זה שם שכונה אמיתי בשימוש.
- אל תכלול רחובות.
- אל תכלול ערים שכנות.
- אם זה קיבוץ/מושב/יישוב קטן ללא שכונות פנימיות אמיתיות — החזר מערך ריק.
- העדף שמות בעברית.
- כלול confidence_score בין 0 ל-1 לכל שכונה.
- כלול reason קצר מדוע השכונה כנראה אמיתית.
החזר JSON בלבד בפורמט: {"neighborhoods":[{"neighborhood_name":"...","confidence_score":0.92,"reason":"..."}]}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "אתה חוקר דאטה גאוגרפי. ענה ב-JSON תקין בלבד." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return null; }
    const arr = Array.isArray(parsed) ? parsed : (parsed as { neighborhoods?: unknown })?.neighborhoods;
    if (!Array.isArray(arr)) return { list: [], raw: parsed };
    const list: AiHood[] = [];
    for (const it of arr) {
      const name = typeof it?.neighborhood_name === "string" ? it.neighborhood_name.trim() : "";
      if (!name || name.length > 50) continue;
      const score = typeof it?.confidence_score === "number" ? Math.max(0, Math.min(1, it.confidence_score)) : 0.5;
      list.push({ neighborhood_name: name, confidence_score: score, reason: typeof it?.reason === "string" ? it.reason : undefined });
    }
    return { list, raw: parsed };
  } catch {
    return null;
  }
}

const confLevel = (s: number) => (s >= 0.75 ? "high" : s >= 0.5 ? "medium" : "low");

// ── Process one batch (chunked, resumable) ───────────────────────────────────
export interface BatchResult { processed: number; done: number; empty: number; failed: number; remaining: number; cities: { city: string; count: number; status: string }[] }

export async function processNextBatch(limit = 4): Promise<BatchResult> {
  await requireManager();
  if (!isEnrichmentConfigured()) throw new Error("OPENAI_API_KEY לא מוגדר — לא ניתן להריץ העשרה.");
  const admin = createServiceRoleClient();

  const { data: queue } = await admin
    .from("neighborhood_enrichment_cities")
    .select("*")
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order("row_index", { ascending: true })
    .limit(limit);
  const cities = (queue ?? []) as { id: string; city_code: string; city_name: string; attempts: number }[];

  const out: BatchResult = { processed: 0, done: 0, empty: 0, failed: 0, remaining: 0, cities: [] };

  for (const c of cities) {
    out.processed++;
    try {
      const research = await researchCity(c.city_name, c.city_code);
      if (research === null) throw new Error("AI לא החזיר תשובה");

      // Normalize + dedupe within the city.
      const seen = new Set<string>();
      const rows: Record<string, unknown>[] = [];
      const canonical = canonicalCityName(c.city_name) ?? c.city_name.trim();
      const mirror: Record<string, unknown>[] = [];
      for (const h of research.list) {
        const norm = normalizeNeighborhoodName(h.neighborhood_name);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        rows.push({
          city_code: c.city_code, city_name: c.city_name, neighborhood_name: h.neighborhood_name,
          normalized_name: norm, confidence_score: h.confidence_score, confidence_level: confLevel(h.confidence_score),
          source_type: "ai_generated_research", status: "pending_verification",
          raw_ai_response: { reason: h.reason ?? null } as never,
        });
        if (h.confidence_score >= 0.5) {
          mirror.push({
            city_name: canonical, name_he: h.neighborhood_name, normalized_name: norm, place_type: "neighbourhood",
            source: "ai_generated_research", confidence_score: Math.round(h.confidence_score * 100), is_verified: false,
          });
        }
      }

      if (rows.length) {
        await admin.from("neighborhoods").upsert(rows as never, { onConflict: "city_code,normalized_name" });
        if (mirror.length) await admin.from("israel_neighborhoods").upsert(mirror as never, { onConflict: "city_name,normalized_name" });
      }

      const status = rows.length ? "done" : "empty";
      const summary = rows.length
        ? `high:${rows.filter((r) => r.confidence_level === "high").length} · medium:${rows.filter((r) => r.confidence_level === "medium").length} · low:${rows.filter((r) => r.confidence_level === "low").length}`
        : "אין שכונות מוכרות";
      await admin.from("neighborhood_enrichment_cities").update({
        status, attempts: c.attempts + 1, neighborhoods_count: rows.length, confidence_summary: summary, error: null,
      } as never).eq("id", c.id);
      if (status === "done") out.done++; else out.empty++;
      out.cities.push({ city: c.city_name, count: rows.length, status });
    } catch (e) {
      const attempts = c.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending"; // keep retrying until max
      await admin.from("neighborhood_enrichment_cities").update({
        status, attempts, error: e instanceof Error ? e.message : "failed",
      } as never).eq("id", c.id);
      out.failed++;
      out.cities.push({ city: c.city_name, count: 0, status });
    }
  }

  const { count: remaining } = await admin
    .from("neighborhood_enrichment_cities")
    .select("id", { count: "exact", head: true })
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`);
  out.remaining = remaining ?? 0;
  return out;
}

// ── Reports / export ─────────────────────────────────────────────────────────
export interface CoverageRow { city_code: string; city_name: string; neighborhoods_count: number; confidence_summary: string | null; status: string }

export async function getCoverageReport(limit = 300): Promise<CoverageRow[]> {
  await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from("neighborhood_enrichment_cities")
    .select("city_code,city_name,neighborhoods_count,confidence_summary,status")
    .order("row_index", { ascending: true }).limit(limit);
  return (data ?? []) as CoverageRow[];
}

export interface ExportRow { city_code: string; city_name: string; neighborhood_name: string; normalized_name: string | null; confidence_score: number | null; confidence_level: string | null; status: string | null }

export async function exportNeighborhoods(): Promise<ExportRow[]> {
  await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from("neighborhoods")
    .select("city_code,city_name,neighborhood_name,normalized_name,confidence_score,confidence_level,status")
    .order("city_name", { ascending: true }).limit(60000);
  return (data ?? []) as ExportRow[];
}

export async function resetEnrichmentQueue(): Promise<void> {
  await requireManager();
  const admin = createServiceRoleClient();
  await admin.from("neighborhood_enrichment_cities").delete().neq("city_code", "");
}
