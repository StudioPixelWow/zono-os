// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — validation (PURE).
//
// Deterministic, offline-testable validators for the registration wizard.
// No I/O — email UNIQUENESS is checked server-side against Supabase auth; here
// we validate FORMAT + password rules + required fields per step.
// ============================================================================
import type { PlanTier, RegistrationData, WizardStepKey } from "./types";

export interface FieldError { field: string; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLAN_TIERS: PlanTier[] = ["starter", "professional", "office", "enterprise"];

export const isEmail = (v: string | undefined | null): boolean => !!v && EMAIL_RE.test(v.trim());

/** Password rules: ≥8 chars, at least one letter and one digit. */
export function validatePassword(pw: string | undefined | null): FieldError | null {
  if (!pw || pw.length < 8) return { field: "password", message: "הסיסמה חייבת לכלול לפחות 8 תווים." };
  if (!/[A-Za-z֐-׿]/.test(pw) || !/[0-9]/.test(pw)) return { field: "password", message: "הסיסמה חייבת לכלול אות וספרה." };
  return null;
}

export function validatePasswordConfirmation(pw: string, confirm: string): FieldError | null {
  return pw === confirm ? null : { field: "passwordConfirm", message: "הסיסמאות אינן תואמות." };
}

/** Validate one wizard step's slice of the collected data. Password is validated
 *  separately (never stored on the draft), so the "owner" step here checks only
 *  the persisted fields. Returns [] when the step is valid. */
export function validateStep(step: WizardStepKey, data: RegistrationData, opts?: { password?: string; passwordConfirm?: string }): FieldError[] {
  const errs: FieldError[] = [];
  const need = (cond: boolean, field: string, message: string) => { if (!cond) errs.push({ field, message }); };
  switch (step) {
    case "welcome":
      break;
    case "company":
      need(!!data.officeName?.trim(), "officeName", "נא להזין שם משרד.");
      need(!!data.companyName?.trim(), "companyName", "נא להזין שם חברה.");
      need(!!data.taxId?.trim(), "taxId", "נא להזין ח.פ / עוסק.");
      need(!!data.city?.trim(), "city", "נא להזין עיר.");
      need(!!data.phone?.trim(), "phone", "נא להזין טלפון.");
      break;
    case "owner":
      need(!!data.ownerFullName?.trim(), "ownerFullName", "נא להזין שם מלא.");
      need(isEmail(data.ownerEmail), "ownerEmail", "כתובת אימייל אינה תקינה.");
      need(!!data.ownerMobile?.trim(), "ownerMobile", "נא להזין נייד.");
      if (opts) {
        const p = validatePassword(opts.password);
        if (p) errs.push(p);
        else { const c = validatePasswordConfirmation(opts.password ?? "", opts.passwordConfirm ?? ""); if (c) errs.push(c); }
      }
      break;
    case "office":
      need(typeof data.agentCount === "number" && data.agentCount! >= 0, "agentCount", "נא להזין מספר סוכנים.");
      need(Array.isArray(data.workingAreas) && data.workingAreas!.length > 0, "workingAreas", "נא לבחור אזור פעילות אחד לפחות.");
      break;
    case "plan":
      need(!!data.planTier && PLAN_TIERS.includes(data.planTier), "planTier", "נא לבחור תוכנית.");
      break;
    case "integrations":
      break; // never required — Part 1 Step 6 allows Skip
  }
  return errs;
}

/** The whole registration is valid iff every required step passes. */
export function validateAll(data: RegistrationData): FieldError[] {
  return (["company", "owner", "office", "plan"] as WizardStepKey[]).flatMap((s) => validateStep(s, data));
}
