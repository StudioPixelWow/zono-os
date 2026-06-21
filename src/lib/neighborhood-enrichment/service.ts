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
  // Use COUNT queries (head:true) so we get true totals — fetching rows would be
  // capped by PostgREST max-rows (1000) and undercount large uploads.
  const [totalR, pendingR, doneR, emptyR, failedR, retryableR, hoodsR] = await Promise.all([
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }),
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }).eq("status", "empty"),
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("neighborhood_enrichment_cities").select("id", { count: "exact", head: true }).eq("status", "failed").lt("attempts", MAX_ATTEMPTS),
    supabase.from("neighborhoods").select("id", { count: "exact", head: true }),
  ]);
  const pending = pendingR.count ?? 0;
  const retryable = retryableR.count ?? 0;
  return {
    configured: isEnrichmentConfigured(),
    total: totalR.count ?? 0, pending, done: doneR.count ?? 0, empty: emptyR.count ?? 0, failed: failedR.count ?? 0,
    neighborhoods: hoodsR.count ?? 0, remaining: pending + retryable,
  };
}

// ── AI research ────────────────────────────────────────────────────────────────
interface AiHood { neighborhood_name: string; confidence_score: number; reason?: string }

/**
 * Calls OpenAI for a city's real neighborhoods. On any API/parse failure it
 * THROWS a descriptive error (status code + short body) instead of swallowing
 * it — so the queue's `error` column and the live log show the real reason
 * (e.g. "OpenAI 401: invalid api key", "OpenAI 429: insufficient_quota") rather
 * than a generic "no response". A truly empty (but successful) answer returns
 * an empty list, which is a valid "no known neighborhoods" result.
 */
async function researchCity(cityName: string, cityCode: string): Promise<{ list: AiHood[]; raw: unknown }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY חסר בסביבה");
  const prompt = `אתה חוקר דאטה גאוגרפי של נדל"ן בישראל, עם ידע מקיף על חלוקת השכונות והרבעים של יישובי ישראל.
מטרה: החזר רשימה **מקיפה ומלאה ככל האפשר** של כל השכונות, הרבעים והאזורים המוכרים ביישוב הבא — לא רק את המרכזיים.
יישוב: ${cityName}
סמל יישוב: ${cityCode}
כללים:
- כלול את כל השכונות, הרבעים (למשל "רובע יזרעאל"), השיכונים והאזורים המוכרים ביישוב — שאף לרשימה מלאה, גם 20-40 שכונות אם קיימות.
- כלול שכונות ותיקות, שכונות חדשות, רבעים רשמיים, ושמות אזורים בשימוש מקומי.
- אל תיצור שמות מומצאים. אל תיצור אזורים כיווניים גנריים (צפון/דרום/מרכז היישוב) אלא אם זה שם רובע/אזור אמיתי בשימוש (כמו "צפון הכרם").
- אל תכלול רחובות בודדים.
- אל תכלול ערים/יישובים שכנים.
- אם זה קיבוץ/מושב/יישוב קטן באמת ללא חלוקה פנימית — החזר מערך ריק.
- העדף שמות בעברית.
- כלול confidence_score בין 0 ל-1 לכל שכונה (גבוה לשכונות ידועות ומתועדות).
- כלול reason קצר.
החזר JSON בלבד בפורמט: {"neighborhoods":[{"neighborhood_name":"...","confidence_score":0.92,"reason":"..."}]}`;
  // Default to a stronger model: gpt-4o-mini under-returns (it gave 3 for עכו
  // where the full list is ~30). gpt-4o has far better recall of real Israeli
  // neighborhoods. Override with OPENAI_ENRICHMENT_MODEL if desired.
  const model = process.env.OPENAI_ENRICHMENT_MODEL || "gpt-4o";
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 4000, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "אתה חוקר דאטה גאוגרפי עם ידע מקיף על שכונות ורבעים בישראל. ענה ב-JSON תקין בלבד, עם רשימה מלאה." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch (e) {
    // Network / timeout / abort — surface it, don't hide it.
    throw new Error(`שגיאת רשת מול OpenAI: ${e instanceof Error ? e.message : "unknown"}`);
  }
  if (!res.ok) {
    // Capture the real OpenAI error (status + a short snippet of the body) so the
    // user can tell 401 (bad key) from 429 (quota) from model-access issues.
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string; type?: string } };
      detail = body.error?.message || body.error?.code || body.error?.type || "";
    } catch { try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ } }
    throw new Error(`OpenAI ${res.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI החזיר תשובה ריקה");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("OpenAI החזיר JSON לא תקין"); }
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
}

const confLevel = (s: number) => (s >= 0.75 ? "high" : s >= 0.5 ? "medium" : "low");

// ── Process one batch (chunked, resumable) ───────────────────────────────────
export interface BatchResult { processed: number; done: number; empty: number; failed: number; remaining: number; cities: { city: string; count: number; status: string; error?: string }[]; lastError?: string }

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
      const msg = e instanceof Error ? e.message : "failed";
      const attempts = c.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending"; // keep retrying until max
      await admin.from("neighborhood_enrichment_cities").update({
        status, attempts, error: msg,
      } as never).eq("id", c.id);
      out.failed++;
      out.lastError = msg;
      out.cities.push({ city: c.city_name, count: 0, status, error: msg });
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
