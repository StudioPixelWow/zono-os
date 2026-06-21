// ============================================================================
// ZONO — Automation Copy & Communication OS · Service (server-only)
// ----------------------------------------------------------------------------
// Reads the professional Hebrew copy bundle for a library template: guidance
// (agent / manager), revenue impact, urgency, expected outcome, Decision Brain
// summary, and client / portal / website DRAFT messages (never auto-sent).
// System reference data (RLS: readable by all authenticated users).
// ============================================================================
import { createClient } from "@/lib/supabase/server";

export interface TemplateCopy {
  template_key: string; category: string; voice: string; priority_label: string | null;
  title: string; subtitle: string | null; short: string | null; full: string;
  task_title: string | null; task_description: string | null;
  agent_guidance: string; manager_guidance: string; revenue_impact: string;
  urgency_reason: string | null; expected_outcome: string | null;
  decision_brain_summary: string; success_definition: string | null;
  client_draft: string | null; portal_message: string | null; website_message: string | null;
  audit_log_text: string | null;
}

function map(row: Record<string, unknown>): TemplateCopy {
  return {
    template_key: row.template_key as string, category: row.category as string, voice: row.voice as string,
    priority_label: (row.priority_label as string) ?? null, title: row.title_he as string,
    subtitle: (row.subtitle_he as string) ?? null, short: (row.short_description_he as string) ?? null,
    full: row.full_description_he as string, task_title: (row.task_title_he as string) ?? null,
    task_description: (row.task_description_he as string) ?? null, agent_guidance: row.agent_guidance_he as string,
    manager_guidance: row.manager_guidance_he as string, revenue_impact: row.revenue_impact_he as string,
    urgency_reason: (row.urgency_reason_he as string) ?? null, expected_outcome: (row.expected_outcome_he as string) ?? null,
    decision_brain_summary: row.decision_brain_summary_he as string, success_definition: (row.success_definition_he as string) ?? null,
    client_draft: (row.client_draft_message_he as string) ?? null, portal_message: (row.portal_message_he as string) ?? null,
    website_message: (row.website_message_he as string) ?? null, audit_log_text: (row.audit_log_text_he as string) ?? null,
  };
}

export async function getCopyForTemplate(templateKey: string): Promise<TemplateCopy | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_copy_templates").select("*").eq("template_key", templateKey).maybeSingle();
  return data ? map(data as Record<string, unknown>) : null;
}

export async function getVoices(): Promise<{ key: string; name: string; description: string; tone: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_voices").select("*").order("sort_order", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((v) => ({ key: v.voice_key as string, name: v.name_he as string, description: v.description_he as string, tone: v.tone_he as string }));
}

export async function getPriorityLabels(): Promise<{ key: string; label: string; description: string; tone: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_priority_labels").select("*").order("sort_order", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({ key: p.label_key as string, label: p.label_he as string, description: p.description_he as string, tone: p.tone as string }));
}
