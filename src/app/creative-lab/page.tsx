import { getLabWorld, listOutputsAction } from "./actions";
import { WorkspaceView } from "./WorkspaceView";

export const dynamic = "force-dynamic";

export default async function CreativeLabWorkspacePage() {
  const world = await getLabWorld();
  const list = await listOutputsAction();
  return <WorkspaceView world={world} initialOutputs={list.outputs ?? []} />;
}
