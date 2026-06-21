"use server";
import { searchEverything, type SearchGroup } from "./service";

export async function globalSearchAction(query: string): Promise<SearchGroup[]> {
  try { return await searchEverything(query); } catch { return []; }
}
