// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.3 · COMMUNICATION WORKSPACE QA (offline).
// Run: npx tsx src/lib/communication-workspace/qa.ts
//
// Verifies the workspace is one inbox, composition-only, provider-only:
// pure filter/group/href logic (one inbox grouped by canonical person, no
// duplicate conversations, channel switching preserved, provider search) +
// source-level guards (consumes ONLY the Communication Provider, no adapter /
// WhatsApp / Calendar / Gmail import, no SQL, no duplicated provider usage, no
// AI reply generation, isolation left to the provider).
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalPerson, Conversation, Channel, CommunicationStateFlag } from "@/lib/communication-os/types";
import { filterConversations, groupByPerson, wsHref } from "./filters";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const APP = "src/app/(app)/communication-workspace";
const LIB = "src/lib/communication-workspace";
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string) => strip(readFileSync(p, "utf8"));
const appFiles = readdirSync(APP).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => join(APP, f));
const libFiles = readdirSync(LIB).filter((f) => f.endsWith(".ts") && f !== "qa.ts").map((f) => join(LIB, f));
const allFiles = [...appFiles, ...libFiles];

// ── Fixtures ────────────────────────────────────────────────────────────────
const conv = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id, channel: (over.channel ?? "whatsapp") as Channel, title: over.title ?? `שיחה ${id}`,
  participants: over.participants ?? [{ id: `p:${id}`, kind: "person", displayName: "דנה כהן", handle: null, channel: (over.channel ?? "whatsapp") as Channel }],
  lastActivityAt: over.lastActivityAt ?? "2026-07-22T09:00:00Z",
  unreadCount: over.unreadCount ?? 0,
  state: over.state ?? { flags: [] as CommunicationStateFlag[] },
  crmLinks: over.crmLinks ?? { lead: null, buyer: null, seller: null, journey: null, deal: null, property: null },
  attachmentCount: 0,
  summary: over.summary ?? { latestMessagePreview: "שלום", latestMessageAt: "2026-07-22T09:00:00Z", unread: over.unreadCount ?? 0, lastReplyAt: null, waiting: false, participantCount: 1 },
  ...over,
});

S("1. Filters — read state facts + provider search (no SQL)");
{
  const list = [
    conv("whatsapp:a", { unreadCount: 2, state: { flags: ["unread"] } }),
    conv("calendar:b", { channel: "calendar", state: { flags: ["resolved"] }, unreadCount: 0 }),
    conv("whatsapp:c", { state: { flags: ["waiting", "pinned"] }, title: "יוסי לוי", summary: { latestMessagePreview: "מתי נפגשים?", latestMessageAt: "t", unread: 0, lastReplyAt: null, waiting: true, participantCount: 1 } }),
  ];
  check("1.1 unread filter keeps only unreadCount>0", filterConversations(list, { filter: "unread" }).map((c) => c.id).join() === "whatsapp:a");
  check("1.2 waiting/pinned/resolved filter by state flag",
    filterConversations(list, { filter: "waiting" })[0].id === "whatsapp:c" &&
    filterConversations(list, { filter: "pinned" })[0].id === "whatsapp:c" &&
    filterConversations(list, { filter: "resolved" })[0].id === "calendar:b");
  check("1.3 channel filter keeps only that channel", filterConversations(list, { channel: "calendar" }).map((c) => c.id).join() === "calendar:b");
  check("1.4 provider search matches title / preview / participant (no fetch)",
    filterConversations(list, { q: "יוסי" }).map((c) => c.id).join() === "whatsapp:c" &&
    filterConversations(list, { q: "נפגשים" }).map((c) => c.id).join() === "whatsapp:c");
  check("1.5 'all' + empty query returns everything", filterConversations(list, { filter: "all", channel: "all", q: "" }).length === 3);
}

S("2. One inbox — grouped by canonical person, no duplicate conversations");
{
  const people: CanonicalPerson[] = [
    { personId: "person:buyer:B1", displayName: "דנה כהן", channels: [
      { channel: "whatsapp", handle: null, conversationId: "whatsapp:a" },
      { channel: "calendar", handle: null, conversationId: "calendar:b" },
    ] },
  ];
  const list = [conv("whatsapp:a", { crmLinks: { lead: null, buyer: "B1", seller: null, journey: null, deal: null, property: null } }), conv("calendar:b", { channel: "calendar", lastActivityAt: "2026-07-23T09:00:00Z" }), conv("gmail:z", { channel: "gmail" })];
  const groups = groupByPerson(list, people);
  check("2.1 conversations sharing a person collapse to ONE inbox row across channels",
    groups.length === 2 && groups.some((g) => g.person.personId === "person:buyer:B1" && g.conversations.length === 2));
  check("2.2 that row spans multiple channels (whatsapp + calendar)",
    new Set(groups.find((g) => g.person.personId === "person:buyer:B1")!.conversations.map((c) => c.channel)).size === 2);
  const allIds = groups.flatMap((g) => g.conversations.map((c) => c.id));
  check("2.3 no duplicate conversations — each appears exactly once", allIds.length === 3 && new Set(allIds).size === 3);
  check("2.4 an unclaimed conversation becomes its own row (never dropped)", groups.some((g) => g.conversations.length === 1 && g.conversations[0].id === "gmail:z"));
  check("2.5 rows ordered by most recent activity (calendar:b group first)", groups[0].conversations.some((c) => c.id === "calendar:b"));
}

S("3. Channel switching preserved — same person, distinct selectable conversations");
{
  const people: CanonicalPerson[] = [{ personId: "person:buyer:B1", displayName: "דנה", channels: [
    { channel: "whatsapp", handle: null, conversationId: "whatsapp:a" },
    { channel: "calendar", handle: null, conversationId: "calendar:b" },
  ] }];
  const groups = groupByPerson([conv("whatsapp:a"), conv("calendar:b", { channel: "calendar" })], people);
  const row = groups[0];
  check("3.1 both channels selectable under one person (distinct conversation ids)",
    row.conversations.length === 2 && row.conversations[0].id !== row.conversations[1].id);
}

S("4. wsHref — URL-driven selection preserves the rest");
{
  check("4.1 selecting a conversation preserves filter/channel/q", wsHref({ filter: "unread", channel: "whatsapp", q: "דנה" }, { c: "whatsapp:a" }) === "/communication-workspace?filter=unread&channel=whatsapp&q=%D7%93%D7%A0%D7%94&c=whatsapp%3Aa");
  check("4.2 clearing a key removes it (null)", wsHref({ filter: "unread", c: "x" }, { filter: null }) === "/communication-workspace?c=x");
  check("4.3 no params → bare path", wsHref({}, {}) === "/communication-workspace");
}

S("5. Provider-only — no adapter / channel import, consumes the Provider");
{
  check("5.1 NO channel adapter or raw channel service is imported anywhere",
    allFiles.every((f) => !/communication-os\/adapters|@\/lib\/whatsapp|@\/lib\/calendar-os|@\/lib\/gmail/.test(read(f))));
  const providers = read(join(LIB, "providers.ts"));
  check("5.2 the data layer consumes ONLY the canonical Communication Provider",
    providers.includes("@/lib/communication-os/provider") && !providers.includes("/adapters"));
  check("5.3 panels read data ONLY through the workspace provider layer (not the raw provider/adapters)",
    appFiles.filter((f) => /Panel\.tsx$/.test(f)).every((f) => {
      const s = read(f);
      return s.includes("@/lib/communication-workspace/providers") && !s.includes("communication-os/provider") && !s.includes("/adapters");
    }));
}

S("6. No duplicate provider usage / no SQL / no synchronization / no AI");
{
  const providers = read(join(LIB, "providers.ts"));
  check("6.1 loadConversation + loadMessages are request-memoized (no duplicate provider usage)",
    providers.includes("cache((id") && (providers.match(/cache\(/g) ?? []).length >= 2);
  check("6.2 no direct SQL / DB client anywhere in the workspace",
    allFiles.every((f) => !/\.from\(["']|createClient|execute_sql/.test(read(f))));
  check("6.3 no synchronization / write / ingest (read-only composition)",
    allFiles.every((f) => !/\.insert\(|\.update\(|\.upsert\(|ingest|recordInbound|sync\(/.test(read(f))));
  check("6.4 no AI reply generation / invented summaries",
    allFiles.every((f) => !/openai|generateText|generateReply|composeReply|invent/i.test(read(f))));
}

S("7. Isolation left to the provider + one inbox (grouped by person, not channel)");
{
  check("7.1 the workspace never re-scopes — no role RPC / org handling (isolation stays in the provider)",
    allFiles.every((f) => !/has_min_role|current_org_id|org_id|resolveScope/.test(read(f))));
  const inbox = read(join(APP, "InboxPanel.tsx"));
  check("7.2 the inbox groups by CANONICAL PERSON, never by channel", inbox.includes("groupByPerson") && !inbox.includes("groupByChannel"));
  check("7.3 the inbox uses listConversations() (the one provider list, no second inbox)",
    inbox.includes("listConversations") && !inbox.includes("getUnifiedInbox"));
}

console.log(`\nCommunication Workspace (6.3) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
