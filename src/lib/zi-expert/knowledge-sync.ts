// ============================================================================
// ZI Expert™ Knowledge Engine — built-in knowledge sync (Phase 23, SERVER-ONLY).
// syncZIKnowledgeBase() seeds/updates the built-in (system) articles. It is
// IDEMPOTENT (keyed by slug), preserves custom ORG articles (never touches
// source_type='org'), versions built-in content, and regenerates chunks. Uses
// the service-role client because system rows are global (organization_id null).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BUILTIN_ARTICLES } from "./knowledge-docs";
import type { KnowledgeArticleSeed } from "./knowledge-types";

export interface KnowledgeSyncResult {
  ok: boolean;
  inserted: number;
  updated: number;
  unchanged: number;
  chunks: number;
  error?: string;
}

type DB = ReturnType<typeof createServiceRoleClient>;

/** Split an article body into retrievable chunks by "## " headings. Pure. */
export function chunkContent(content: string): { ordinal: number; heading: string | null; content: string }[] {
  const out: { ordinal: number; heading: string | null; content: string }[] = [];
  const sections = content.split(/\n(?=## )/);
  let ordinal = 0;
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const m = /^##\s+(.+)/.exec(trimmed);
    const heading = m ? m[1].trim() : null;
    const body = m ? trimmed.replace(/^##\s+.+\n?/, "").trim() : trimmed;
    if (!body) continue;
    out.push({ ordinal: ordinal++, heading, content: body });
  }
  return out;
}

async function upsertSystemArticle(db: DB, seed: KnowledgeArticleSeed): Promise<"inserted" | "updated" | "unchanged" | "failed"> {
  // Find the existing system row by slug (organization_id IS NULL).
  const { data: existing } = await db
    .from("zi_knowledge_articles" as never)
    .select("id,version,content")
    .eq("slug", seed.slug).eq("source_type", "system").is("organization_id", null)
    .maybeSingle();
  const row = existing as { id: string; version: number; content: string } | null;

  const payload = {
    organization_id: null,
    slug: seed.slug, title: seed.title, category: seed.category, module: seed.module,
    summary: seed.summary, content: seed.content, keywords: seed.keywords,
    role_visibility: seed.roleVisibility, permissions: {},
    source_type: "system", source_path: seed.sourcePath, version: seed.version,
    published: seed.published, routes: seed.routes, deleted_at: null,
  };

  if (!row) {
    const { data: ins, error } = await db.from("zi_knowledge_articles" as never).insert(payload as never).select("id").single();
    if (error || !ins) return "failed";
    await regenChunks(db, (ins as { id: string }).id, seed);
    return "inserted";
  }
  // Idempotent: only rewrite when the content actually changed.
  if (row.content === seed.content) return "unchanged";
  const { error } = await db.from("zi_knowledge_articles" as never).update(payload as never).eq("id", row.id);
  if (error) return "failed";
  await regenChunks(db, row.id, seed);
  return "updated";
}

async function regenChunks(db: DB, articleId: string, seed: KnowledgeArticleSeed): Promise<number> {
  await db.from("zi_knowledge_chunks" as never).delete().eq("article_id", articleId);
  const chunks = chunkContent(seed.content).map((c) => ({
    organization_id: null, article_id: articleId, slug: seed.slug,
    ordinal: c.ordinal, heading: c.heading, content: c.content, keywords: seed.keywords,
  }));
  if (chunks.length) await db.from("zi_knowledge_chunks" as never).insert(chunks as never);
  return chunks.length;
}

/**
 * Seed/update the built-in ZONO knowledge. Idempotent; preserves org articles.
 * Safe to run repeatedly (e.g. from a script or a deploy hook).
 */
export async function syncZIKnowledgeBase(): Promise<KnowledgeSyncResult> {
  try {
    const db = createServiceRoleClient();
    const res: KnowledgeSyncResult = { ok: true, inserted: 0, updated: 0, unchanged: 0, chunks: 0 };

    // Ensure a "ZONO Built-in" source row exists (idempotent).
    const { data: src } = await db.from("zi_knowledge_sources" as never)
      .select("id").eq("name", "ZONO Built-in").is("organization_id", null).maybeSingle();
    if (!src) {
      await db.from("zi_knowledge_sources" as never).insert({
        organization_id: null, name: "ZONO Built-in", source_type: "system",
        description: "מאגר הידע המובנה של ZONO — נטען אוטומטית, לא נמחק ידנית.",
      } as never);
    }

    for (const seed of BUILTIN_ARTICLES) {
      const outcome = await upsertSystemArticle(db, seed);
      if (outcome === "inserted") res.inserted++;
      else if (outcome === "updated") res.updated++;
      else if (outcome === "unchanged") res.unchanged++;
      else { res.ok = false; res.error = `failed: ${seed.slug}`; }
      res.chunks += chunkContent(seed.content).length;
    }
    return res;
  } catch (e) {
    return { ok: false, inserted: 0, updated: 0, unchanged: 0, chunks: 0, error: e instanceof Error ? e.message : "sync_failed" };
  }
}
