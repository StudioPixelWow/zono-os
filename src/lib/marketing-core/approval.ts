// ============================================================================
// 📣 Marketing Core — approval system (pure). 33.0.
// Multi-gate approval model. NOTHING executes automatically — a campaign can only
// advance when a human approves each required gate. Publishing/execution gates
// exist but are never auto-satisfied in this phase (no publishing).
// ============================================================================
import type { Campaign, CampaignApproval, ApprovalType, ApprovalState } from "./types";

const REQUIRED: ApprovalType[] = ["campaign", "creative", "budget", "publishing", "execution"];

export function defaultApprovals(): CampaignApproval[] {
  return REQUIRED.map((type) => ({ type, state: "pending" as ApprovalState, required: true, note: null }));
}

export function setApproval(approvals: CampaignApproval[], type: ApprovalType, state: ApprovalState, note: string | null = null): CampaignApproval[] {
  return approvals.map((a) => (a.type === type ? { ...a, state, note } : a));
}

export function approvalStatus(approvals: CampaignApproval[]): "none" | "partial" | "complete" {
  const req = approvals.filter((a) => a.required);
  const done = req.filter((a) => a.state === "approved").length;
  if (done === 0) return "none";
  return done === req.length ? "complete" : "partial";
}

/** A campaign may advance to the next status only when the current gate passed.
 *  Publishing + execution remain gated in this phase (no publishing). */
export function canAdvance(campaign: Campaign): { ok: boolean; blockedBy: ApprovalType | null } {
  const order: ApprovalType[] = ["campaign", "creative", "budget", "publishing", "execution"];
  for (const t of order) {
    const a = campaign.approvals.find((x) => x.type === t);
    if (a && a.required && a.state !== "approved") return { ok: false, blockedBy: t };
  }
  return { ok: true, blockedBy: null };
}

export function pendingGates(campaign: Campaign): CampaignApproval[] {
  return campaign.approvals.filter((a) => a.required && a.state === "pending");
}
