// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.4 · COMMAND CENTER QA (offline).
// Run: npx tsx src/lib/command-center/qa.ts
//
// Verifies the Command Center is ONE search runtime, composition-only,
// provider-only: pure mapping logic (omnisearch → jump commands verbatim,
// registry → navigate/quick-action, recents read-only, workspaces as nav) +
// source-level guards (no duplicate search engine, no SQL, entity search via
// the canonical omnisearch only, existing actions reused not invented,
// isolation left to the provider, exactly one palette mounted in the shell).
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SearchGroup } from "@/lib/search/service";
import { QUICK_ACTIONS } from "@/components/navigation/commandRegistry";
import {
  mapEntityGroups, mapRegistryItem, navigationCommands, quickActionCommands,
  pinnedCommands, suggestedCommands, recentCommands, flattenGroups, nonEmpty, WORKSPACE_COMMANDS,
} from "./search";
import { commandRun } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string) => strip(readFileSync(p, "utf8"));

const LIB = "src/lib/command-center";
const CMP = "src/components/command-center/CommandPalette.tsx";
const SHELL = "src/components/dashboard/DashboardShell.tsx";

S("1. Provider search → canonical JUMP commands (verbatim, correct targets)");
{
  const groups: SearchGroup[] = [
    { type: "buyer", label: "קונים", icon: "Users", hits: [{ id: "B1", title: "דנה כהן", subtitle: "קונה", href: "/buyers/B1" }] },
    { type: "property", label: "נכסים", icon: "Building", hits: [{ id: "P1", title: "קקל 54", subtitle: "קרית ביאליק", href: "/properties/P1" }] },
    { type: "journey", label: "מסעות", icon: "Route", hits: [] },
  ];
  const mapped = mapEntityGroups(groups);
  check("1.1 empty groups are dropped (honest — no fabricated group)", mapped.length === 2);
  const buyer = mapped[0].commands[0];
  check("1.2 hit fields are inherited VERBATIM (label/subtitle/href)", buyer.label === "דנה כהן" && buyer.subtitle === "קונה" && buyer.target.href === "/buyers/B1");
  check("1.3 command is a JUMP with the correct target kind", buyer.kind === "jump" && buyer.target.kind === "buyer" && buyer.target.id === "B1");
  check("1.4 property maps to the property target kind", mapped[1].commands[0].target.kind === "property");
  check("1.5 every jump command navigates (no event)", mapped.flatMap((g) => g.commands).every((c) => commandRun(c) === "navigate" && c.target.event === null));
}

S("2. Navigation — workspaces + registry, correct routes");
{
  check("2.1 the three canonical workspaces are navigation targets with correct routes",
    WORKSPACE_COMMANDS.length === 3 &&
    WORKSPACE_COMMANDS.some((c) => c.target.href === "/executive-workspace") &&
    WORKSPACE_COMMANDS.some((c) => c.target.href === "/broker-workspace") &&
    WORKSPACE_COMMANDS.some((c) => c.target.href === "/communication-workspace"));
  const nav = navigationCommands("עסק");
  check("2.2 navigation matches are navigate-kind page targets (no invented events)",
    nav.commands.every((c) => c.kind === "navigate" && (c.target.href !== null || c.target.kind === "workspace") && c.target.event === null));
  check("2.3 empty query yields no navigation matches", navigationCommands("").commands.filter((c) => c.groupKey === "navigate").length === 0);
}

S("3. Quick actions — reuse EXISTING actions, never invent");
{
  const qa = quickActionCommands("");
  check("3.1 default quick actions come from the existing QUICK_ACTIONS registry", qa.commands.length === QUICK_ACTIONS.filter((i) => !i.disabled).length);
  check("3.2 every quick action id is derived from an existing registry id (reg:qa-*)", qa.commands.every((c) => c.id.startsWith("reg:qa-")));
  const eventAction = mapRegistryItem(QUICK_ACTIONS.find((i) => i.action)!);
  check("3.3 an event action reuses the EXISTING window-event verbatim (not invented)", eventAction.target.event !== null && eventAction.target.event!.startsWith("zono:") && commandRun(eventAction) === "event");
  const hrefAction = mapRegistryItem(QUICK_ACTIONS.find((i) => i.href)!);
  check("3.4 a route action carries the existing href, no event", hrefAction.target.href !== null && hrefAction.target.event === null);
}

S("4. Results — recent (read-only), pinned, suggested");
{
  const rec = recentCommands([{ id: "B1", label: "דנה כהן", href: "/buyers/B1", category: "קונים" }]);
  check("4.1 recents map to read-only recent commands (href preserved)", rec.commands[0].kind === "recent" && rec.commands[0].target.href === "/buyers/B1");
  check("4.2 pinned come from existing favorites (navigate commands)", pinnedCommands().commands.every((c) => c.kind === "navigate"));
  check("4.3 suggested = the canonical workspaces (NOT AI suggestions/recommendations)",
    JSON.stringify(suggestedCommands().commands.map((c) => c.target.href)) === JSON.stringify(WORKSPACE_COMMANDS.map((c) => c.target.href)));
  check("4.4 nonEmpty drops empty groups; flatten preserves order",
    nonEmpty([{ key: "x", label: "x", icon: "i", commands: [] }]).length === 0 &&
    flattenGroups([suggestedCommands()]).length === 3);
}

S("5. One search runtime — no duplicate engine, no SQL, provider only");
{
  const providers = read(join(LIB, "providers.ts"));
  const search = read(join(LIB, "search.ts"));
  check("5.1 entity search consumes ONLY the canonical omnisearch (globalSearchAction)",
    providers.includes("globalSearchAction") && !/\.from\(|createClient|search_documents|new .*Search|rankSearchDocs/.test(providers));
  check("5.2 no SQL / DB client anywhere in the command center",
    [providers, search, read(join(LIB, "types.ts")), read(CMP)].every((s) => !/\.from\(["']|createClient|execute_sql/.test(s)));
  check("5.3 the search runtime only MAPS provider output (no second search engine)",
    !search.includes("globalSearchAction") && !/select\(|ilike\(|\.rpc\(/.test(search));
}

S("6. Reuse existing / no AI / isolation left to the provider");
{
  const all = [read(join(LIB, "providers.ts")), read(join(LIB, "search.ts")), read(join(LIB, "types.ts")), read(CMP)];
  check("6.1 no AI generation / recommendations / priorities",
    all.every((s) => !/openai|generateText|generateReply|AI_SUGGESTIONS|recommend|priority:\s*\d/i.test(s)));
  check("6.2 quick actions + navigation reuse the existing registry (single source of truth)",
    read(join(LIB, "search.ts")).includes("@/components/navigation/commandRegistry"));
  check("6.3 the command center never re-scopes (isolation inherited from the omnisearch)",
    all.every((s) => !/has_min_role|current_org_id|org_id|resolveScope/.test(s)));
}

S("7. Exactly ONE palette mounted in the app shell");
{
  const shell = read(SHELL);
  check("7.1 the shell mounts the new Command Center palette", /<CommandCenter\s*\/>/.test(shell) && shell.includes("@/components/command-center/CommandPalette"));
  check("7.2 the two incumbent overlays are no longer mounted (one command palette)",
    !shell.includes("ZonoCommandCenter") && !shell.includes("@/components/search/CommandPalette"));
  const cmp = read(CMP);
  check("7.3 the palette owns ⌘K/Ctrl+K and answers the existing open events",
    /metaKey \|\| e\.ctrlKey/.test(cmp) && cmp.includes("zono:command-open") && cmp.includes("zono:open-search"));
  check("7.4 realtime search is debounced (setTimeout) and streams via a transition",
    cmp.includes("setTimeout") && cmp.includes("startTransition"));
}

console.log(`\nCommand Center (6.4) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
