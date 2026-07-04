"use server";
// ⚙️ ZONO — Automation OS™ · actions. PHASE 46.0. Read-only unification.
import { getAutomationHealth, getAutomationLibrary } from "./service";
import type { AutomationHealth, AutomationTemplateRef } from "./unify";

export async function getAutomationHealthAction(): Promise<{ health: AutomationHealth; library: AutomationTemplateRef[] }> {
  return { health: await getAutomationHealth(), library: getAutomationLibrary() };
}
