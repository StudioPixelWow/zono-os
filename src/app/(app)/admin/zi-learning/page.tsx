import { ZiLearningAdminView } from "./ZiLearningAdminView";

export const dynamic = "force-dynamic";

// ZI Interactive Learning admin (Phase 25) — read-only overview of content +
// the topics users most asked about but ZI couldn't answer well (content gaps).
export default function ZiLearningPage() {
  return <ZiLearningAdminView />;
}
