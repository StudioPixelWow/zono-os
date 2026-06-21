"use server";
import { revalidatePath } from "next/cache";
import {
  createWorkflowFromTemplate, setWorkflowEnabled, runWorkflow,
  approveRun, rejectRun, reverseRun, getRunActions, getRunLogs,
  type ActionSummary,
} from "./service";
import { enableTemplate, disableTemplate, runTemplateTest, duplicateTemplate } from "./library";
import { getCopyForTemplate, type TemplateCopy } from "./copy";
import type { RunEntity, TriggerContext } from "./engine";

export interface AutomationActionState { ok?: boolean; error?: string; message?: string; runId?: string }

function revalidate() {
  try { revalidatePath("/automation"); revalidatePath("/"); } catch { /* noop */ }
}

export async function createWorkflowFromTemplateAction(templateKey: string): Promise<AutomationActionState> {
  try { await createWorkflowFromTemplate(templateKey); revalidate(); return { ok: true, message: "התהליך נוצר — בדוק, הפעל והרץ" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת התהליך נכשלה" }; }
}

export async function setWorkflowEnabledAction(workflowId: string, enabled: boolean): Promise<AutomationActionState> {
  try { await setWorkflowEnabled(workflowId, enabled); revalidate(); return { ok: true, message: enabled ? "התהליך הופעל" : "התהליך הושהה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון התהליך נכשל" }; }
}

export async function runWorkflowAction(workflowId: string, entity?: RunEntity, facts?: TriggerContext): Promise<AutomationActionState> {
  try { const r = await runWorkflow(workflowId, entity, facts); revalidate(); return { ok: true, runId: r.runId, message: r.status === "blocked" ? "הריצה נחסמה — תנאים לא התקיימו" : "הריצה הוכנה וממתינה לאישור" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הרצת התהליך נכשלה" }; }
}

export async function approveRunAction(runId: string): Promise<AutomationActionState> {
  try { const r = await approveRun(runId); revalidate(); return { ok: true, message: `אושר — ${r.applied} פעולות הוחלו (${r.opportunities} הזדמנויות)` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "אישור הריצה נכשל" }; }
}

export async function rejectRunAction(runId: string): Promise<AutomationActionState> {
  try { await rejectRun(runId); revalidate(); return { ok: true, message: "הריצה נדחתה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "דחיית הריצה נכשלה" }; }
}

export async function reverseRunAction(runId: string): Promise<AutomationActionState> {
  try { const r = await reverseRun(runId); revalidate(); return { ok: true, message: `הריצה בוטלה — ${r.reversed} פעולות הוסרו` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול הריצה נכשל" }; }
}

export async function getRunDetailAction(runId: string): Promise<{ actions: ActionSummary[]; logs: { level: string; message: string; created_at: string; step_action_type: string | null }[] }> {
  const [actions, logs] = await Promise.all([getRunActions(runId), getRunLogs(runId)]);
  return { actions, logs };
}

// ── Automation Library OS actions ────────────────────────────────────────────
export async function enableTemplateAction(templateKey: string): Promise<AutomationActionState> {
  try { await enableTemplate(templateKey); revalidate(); return { ok: true, message: "התבנית הופעלה — תהליך נוצר ופעיל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הפעלת התבנית נכשלה" }; }
}
export async function disableTemplateAction(templateKey: string): Promise<AutomationActionState> {
  try { const r = await disableTemplate(templateKey); revalidate(); return { ok: true, message: `הושבתו ${r.disabled} תהליכים` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השבתת התבנית נכשלה" }; }
}
export async function runTemplateTestAction(templateKey: string): Promise<AutomationActionState> {
  try { const r = await runTemplateTest(templateKey); revalidate(); return { ok: true, runId: r.runId, message: r.status === "blocked" ? "בדיקה נחסמה — תנאים לא התקיימו" : "בדיקה הוכנה — ממתינה לאישור ביומני הריצה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "בדיקת התבנית נכשלה" }; }
}
export async function duplicateTemplateAction(templateKey: string): Promise<AutomationActionState> {
  try { await duplicateTemplate(templateKey); revalidate(); return { ok: true, message: "נוצר עותק עבודה (מושהה) — ערוך והפעל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שכפול התבנית נכשל" }; }
}
export async function getTemplateCopyAction(templateKey: string): Promise<TemplateCopy | null> {
  return getCopyForTemplate(templateKey);
}
