import {
  getExecutiveCommandCenter,
  getTodaysFocus,
  type ExecutiveCommandCenter as ExecCC,
  type FocusItem,
} from "@/lib/decision-intelligence/service";
import { ExecutiveCommandCenter } from "./ExecutiveCommandCenter";

export const dynamic = "force-dynamic";

const EMPTY: ExecCC = {
  profile: null,
  attention: [],
  opportunities: [],
  queue: [],
  recommendations: [],
  upcomingCommitments: [],
  revenuePipeline: 0,
};

export default async function CommandPage() {
  let data: ExecCC = EMPTY;
  let focus: FocusItem[] = [];
  try {
    [data, focus] = await Promise.all([getExecutiveCommandCenter(), getTodaysFocus()]);
  } catch (e) {
    console.error("[decision] command center load failed:", e);
  }

  return (
    <div className="flex flex-col gap-6">
      <ExecutiveCommandCenter data={data} focus={focus} />
    </div>
  );
}
