import { listPeople, type PersonListItem } from "@/lib/people/service";
import { PeopleListView } from "./PeopleListView";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  let people: PersonListItem[] = [];
  let failed = false;
  try {
    people = await listPeople();
  } catch (e) {
    console.error("[people] load failed:", e);
    failed = true;
  }
  return <PeopleListView people={people} failed={failed} />;
}
