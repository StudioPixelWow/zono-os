"use server";

// ============================================================================
// ZONO — Distribution automation server actions (Phase 9). Manual rule-engine
// runs + automation CRUD, all org-scoped. No cron, no scraping, no publishing.
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionAutomationService, type AutomationBoard } from "./distribution-automation-service";
import { distributionAutomationRepository } from "./distribution-automation-repository";
import type { AutomationType } from "./automation-rules";

const PATH = "/distribution";
const ok = () => { revalidatePath(PATH); return {}; };

/** Read the Automation Center board (server action for client refresh). */
export async function getDistributionAutomationsAction(): Promise<{ board: AutomationBoard }> {
  return { board: await distributionAutomationService.board() };
}

/** Create a user automation rule. */
export async function createDistributionAutomationAction(input: { name?: string; automationType: AutomationType; campaignId?: string; config?: Record<string, unknown> }): Promise<{ error?: string }> {
  if (!input.automationType) return { error: "סוג אוטומציה חסר" };
  const row = await distributionAutomationRepository.createRule({
    name: input.name?.trim() || input.automationType, automationType: input.automationType,
    campaignId: input.campaignId ?? null, config: input.config, enabled: true,
  });
  return row ? ok() : { error: "יצירת האוטומציה נכשלה" };
}

/** Update / enable an automation. */
export async function updateDistributionAutomationAction(input: { id: string; name?: string; enabled?: boolean; config?: Record<string, unknown> }): Promise<{ error?: string }> {
  if (!input.id) return { error: "אוטומציה חסרה" };
  const done = await distributionAutomationRepository.update(input.id, { name: input.name, enabled: input.enabled, config: input.config });
  return done ? ok() : { error: "עדכון האוטומציה נכשל" };
}

/** Disable an automation. */
export async function disableDistributionAutomationAction(input: { id: string }): Promise<{ error?: string }> {
  const done = await distributionAutomationRepository.update(input.id, { enabled: false });
  return done ? ok() : { error: "כיבוי האוטומציה נכשל" };
}

/** MANUAL run of the rule engine → generate signals + real tasks. */
export async function runDistributionAutomationCheckAction(): Promise<{ error?: string; created?: number; tasksCreated?: number; enough?: boolean }> {
  const res = await distributionAutomationService.runChecks();
  revalidatePath(PATH);
  return { created: res.created, tasksCreated: res.tasksCreated, enough: res.enough };
}

/** Mark a generated alert / task / recommendation handled. */
export async function markAutomationHandledAction(input: { id: string }): Promise<{ error?: string }> {
  const done = await distributionAutomationRepository.markHandled(input.id);
  return done ? ok() : { error: "סימון הטיפול נכשל" };
}
