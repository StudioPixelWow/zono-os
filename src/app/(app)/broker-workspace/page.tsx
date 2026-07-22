// ============================================================================
// 👤 ZONO — Broker Workspace page (/broker-workspace). STAGE 6 · Batch 6.1.
// The broker's default home screen. COMPOSITION ONLY: it fans out broker-scoped
// canonical providers into one operational dashboard and introduces no business
// logic, no new queries, no direct SQL. Every card is scoped to the signed-in
// broker (owner_id via Daily OS / owner filter via Journey Center) — no
// office-wide or manager information is ever read. Cards stream independently;
// one failing never fails the page.
// ============================================================================
import { BrokerWorkspace } from "./BrokerWorkspace";

export const dynamic = "force-dynamic";

export default function BrokerWorkspacePage() {
  return <BrokerWorkspace />;
}
