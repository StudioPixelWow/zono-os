// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — templates (server-only).
//
// Lists the WABA's message templates via Graph and validates template variables
// before a send. Reuses the org's encrypted token. Pure variable helpers are
// exported for QA. Complements the existing whatsapp/cloud template mapping.
// ============================================================================
import "server-only";
import { getWaOAuthConfig } from "./oauth";
import { getConnectionServiceRole, decryptToken } from "./tokens";
import { countTemplateVariables } from "./template-vars";
import type { WaTemplate } from "./types";

export { countTemplateVariables, validateTemplateVariables } from "./template-vars";

interface RawTemplate {
  id?: string; name?: string; language?: string; status?: string; category?: string;
  components?: { type?: string; text?: string }[];
}

/** List the org's WABA message templates. Honest empty when not connected. */
export async function listTemplates(orgId: string): Promise<WaTemplate[]> {
  const conn = await getConnectionServiceRole(orgId);
  if (!conn || !conn.wabaId) return [];
  const token = decryptToken(conn);
  if (!token) return [];
  const cfg = getWaOAuthConfig();
  const url = `https://graph.facebook.com/${cfg.graphVersion || "v21.0"}/${conn.wabaId}/message_templates?` +
    new URLSearchParams({ fields: "id,name,language,status,category,components", limit: "100", access_token: token }).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawTemplate[] };
    return (json.data ?? []).filter((t) => !!t.name).map((t) => {
      const bodyComp = (t.components ?? []).find((c) => (c.type ?? "").toUpperCase() === "BODY");
      return {
        id: t.id ?? t.name as string, name: t.name as string, language: t.language ?? "he",
        status: t.status ?? "UNKNOWN", category: t.category ?? null,
        variableCount: countTemplateVariables(bodyComp?.text ?? ""),
      };
    });
  } catch { return []; }
}
