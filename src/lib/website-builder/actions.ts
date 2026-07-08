// ============================================================================
// 🌐 ZONO Website Builder OS™ — server actions. 38.0.
// Read + layout + template + publish delegators. Publish reuses the existing
// approval-gated publish functions. No auto-publish.
// ============================================================================
"use server";
import { getWebsiteBuilder, saveWebsiteLayout, applyWebsiteTemplate, publishWebsite, unpublishWebsite, saveWebsiteTheme, saveWebsiteContact, answerWebsiteQuestion, type WebAnswer } from "./service";
import type { BuilderTarget, BuilderView } from "./types";

export async function getWebsiteBuilderAction(target: BuilderTarget = "agent"): Promise<{ ok: boolean; result?: BuilderView | { missing: true; target: BuilderTarget }; error?: string }> {
  try { return { ok: true, result: await getWebsiteBuilder(target) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function saveWebsiteLayoutAction(target: BuilderTarget, order: string[], sections: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  return saveWebsiteLayout(target, order, sections);
}

export async function applyWebsiteTemplateAction(target: BuilderTarget, templateKey: string): Promise<{ ok: boolean; error?: string }> {
  return applyWebsiteTemplate(target, templateKey);
}

export async function publishWebsiteAction(target: BuilderTarget): Promise<{ ok: boolean; error?: string }> {
  return publishWebsite(target);
}

export async function unpublishWebsiteAction(target: BuilderTarget): Promise<{ ok: boolean; error?: string }> {
  return unpublishWebsite(target);
}

export async function saveWebsiteThemeAction(target: BuilderTarget, preset: string): Promise<{ ok: boolean; error?: string }> {
  return saveWebsiteTheme(target, preset);
}

export async function saveWebsiteContactAction(target: BuilderTarget, contact: { phone?: string | null; whatsapp?: string | null; email?: string | null }): Promise<{ ok: boolean; error?: string }> {
  return saveWebsiteContact(target, contact);
}

export async function askWebsiteAction(question: string): Promise<{ ok: boolean; result?: WebAnswer; error?: string }> {
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await answerWebsiteQuestion(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}
