import { getLabWorld } from "../actions";
import { BulkView } from "./BulkView";

export const dynamic = "force-dynamic";

export default async function CreativeLabBulkPage() {
  const world = await getLabWorld();
  return <BulkView world={world} />;
}
