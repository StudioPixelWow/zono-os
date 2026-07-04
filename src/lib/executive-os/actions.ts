"use server";
// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ · actions. PHASE 45.0. Read-only.
// ============================================================================
import { getExecutiveOS, answerExecutiveQuestion, type ExecAsk } from "./service";
import type { ExecutiveOS } from "./types";

export async function getExecutiveOSAction(): Promise<{ os: ExecutiveOS }> { return { os: await getExecutiveOS() }; }
export async function askExecutiveAction(question: string): Promise<{ result: ExecAsk }> { return { result: await answerExecutiveQuestion(question) }; }
