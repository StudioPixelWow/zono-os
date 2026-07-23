// ============================================================================
// 💳 ZONO — Self-service registration (/register). Batch 6.4. The commercial
// entry point: a multi-step onboarding wizard → Grow payment. Pre-auth (the
// account is provisioned only after a VERIFIED payment), so it lives in the
// public (auth) group. The wizard draft is created client-side on mount (a
// server action, so it can set the resume cookie).
// ============================================================================
import { RegisterWizard } from "./RegisterWizard";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterWizard />;
}
