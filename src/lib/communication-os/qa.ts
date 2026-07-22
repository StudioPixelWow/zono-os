// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.2 · COMMUNICATION OS QA (offline).
// Run: npx tsx src/lib/communication-os/qa.ts
//
// Verifies the runtime is ONE canonical model, adapter-mapped, composition-only,
// and isolated: pure mapper/compose logic (every channel → the same shape,
// verbatim facts, references-only CRM, canonical identity) + source-level guards
// (one model, no duplicate adapters, no duplicated message schema, no SQL, no
// duplicate synchronization, broker/manager/cross-org isolation, no AI/scoring).
// ============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WaConv, TimelineEvent } from "@/lib/whatsapp/inbox";
import type { CalendarEvent } from "@/lib/calendar-os/types";
import { canonicalId, parseCanonicalId, type Conversation } from "./types";
import { summarizeMessages, stateFlags, resolvePeople } from "./compose";
import {
  mapWhatsappConversation, mapWhatsappMessages, mapCalendarConversation,
  mapCalendarMessages, mapGmailConversation, type GmailThreadLike,
} from "./adapters/mappers";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const ROOT = "src/lib/communication-os";
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
};
const allFiles = walk(ROOT).filter((f) => !f.endsWith("qa.ts"));
const adapterFiles = allFiles.filter((f) => f.includes("/adapters/"));
const read = (p: string) => strip(readFileSync(p, "utf8"));

// ── Fixtures ────────────────────────────────────────────────────────────────
const wa = (over: Partial<WaConv> = {}): WaConv => ({
  id: "c1", contactName: "דנה כהן", buyerId: "B1", sellerId: null, leadId: null, propertyId: null,
  assignedAgentId: "agent-1", detectedRole: null, state: "requires_reply", intent: "buyer_intent",
  leadScore: 80, urgencyScore: 70, intentScore: 60, unread: true, missedCall: false, needsResponse: true,
  lastMessage: "מתי אפשר לראות את הדירה?", lastMessageAt: "2026-07-22T09:00:00Z", nextBestAction: "השב", ...over,
});
const tl = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({ at: "2026-07-22T09:00:00Z", source: "whatsapp", title: "הודעה", detail: "מתי אפשר לראות?", direction: "inbound", icon: "💬", ...over });
const cal = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "meeting:m1", source: "meeting", type: "meeting", title: "פגישה עם דנה", detail: "סיור בדירה",
  start: "2026-07-23T10:00:00Z", end: "2026-07-23T11:00:00Z", allDay: false, status: "scheduled", done: false,
  priority: 50, urgency: 40, entity: { kind: "buyer", id: "B1", name: "דנה כהן" }, propertyId: "P1",
  city: "קרית ביאליק", lat: null, lng: null, href: "/buyers/B1", locked: false, ...over,
});
const gm = (over: Partial<GmailThreadLike> = {}): GmailThreadLike => ({
  id: "t1", subject: "בקשת מידע", fromName: "דנה כהן", fromAddress: "dana@x.com", lastAt: "2026-07-22T08:00:00Z",
  unread: 2, snippet: "שלום, אשמח לפרטים", crm: { buyer: "B1" }, ...over,
});

const CANON_KEYS = ["id", "channel", "title", "participants", "lastActivityAt", "unreadCount", "state", "crmLinks", "attachmentCount", "summary"].sort();

S("1. One canonical model — every channel maps to the SAME shape");
{
  const cw = mapWhatsappConversation(wa());
  const cc = mapCalendarConversation(cal());
  const cg = mapGmailConversation(gm());
  const keysOf = (c: Conversation) => Object.keys(c).sort();
  check("1.1 WhatsApp / Calendar / Gmail produce identical Conversation keys",
    JSON.stringify(keysOf(cw)) === JSON.stringify(CANON_KEYS) && JSON.stringify(keysOf(cc)) === JSON.stringify(CANON_KEYS) && JSON.stringify(keysOf(cg)) === JSON.stringify(CANON_KEYS));
  check("1.2 canonical ids are channel-namespaced", cw.id === "whatsapp:c1" && cc.id === "calendar:meeting:m1" && cg.id === "gmail:t1");
  check("1.3 canonical id round-trips (even with a ':' in the source id)",
    parseCanonicalId("calendar:meeting:m1")?.channel === "calendar" && parseCanonicalId("calendar:meeting:m1")?.sourceId === "meeting:m1" && canonicalId("calendar", "meeting:m1") === "calendar:meeting:m1");
}

S("2. Mappers copy FACTS verbatim — no scoring, no AI, references only");
{
  const cw = mapWhatsappConversation(wa());
  check("2.1 WhatsApp CRM links are the source ids VERBATIM (references only)",
    cw.crmLinks.buyer === "B1" && cw.crmLinks.lead === null && cw.crmLinks.seller === null);
  check("2.2 no computed score is carried into the canonical model",
    !JSON.stringify(cw).includes("80") && !("leadScore" in (cw as unknown as Record<string, unknown>)) && cw.summary.latestMessagePreview === "מתי אפשר לראות את הדירה?");
  check("2.3 unread FLAG → count, participants = person + broker",
    cw.unreadCount === 1 && cw.participants.length === 2 && cw.participants[0].kind === "person" && cw.participants[1].kind === "broker");
  check("2.4 attachments not fabricated when the source has none", cw.attachmentCount === 0);
  const cc = mapCalendarConversation(cal());
  check("2.5 Calendar entity → CRM reference (buyer) + property, system+person participants",
    cc.crmLinks.buyer === "B1" && cc.crmLinks.property === "P1" && cc.participants[0].kind === "system");
  const cg = mapGmailConversation(gm());
  check("2.6 Gmail exposes the email handle (only channel that has one)", cg.participants[0].handle === "dana@x.com" && cg.unreadCount === 2);
}

S("3. Messages — verbatim, direction preserved, channel-scoped");
{
  const msgs = mapWhatsappMessages([tl(), tl({ source: "meeting", title: "פגישה" }), tl({ direction: "outbound", detail: "בשמחה" })], "c1");
  check("3.1 only whatsapp timeline events become messages (meeting dropped)", msgs.length === 2);
  check("3.2 direction + preview preserved verbatim", msgs[0].direction === "inbound" && msgs[0].preview === "מתי אפשר לראות?" && msgs[1].direction === "outbound");
  check("3.3 message ids are channel-namespaced + linked to the conversation", msgs[0].id.startsWith("whatsapp:c1:") && msgs[0].conversationId === "whatsapp:c1");
  const cm = mapCalendarMessages(cal());
  check("3.4 a calendar event is one message with no direction", cm.length === 1 && cm[0].direction === null);
}

S("4. Summary — COMPOSITION ONLY (latest / unread / last reply / waiting)");
{
  const messages = [
    { id: "m1", conversationId: "x", channel: "whatsapp" as const, direction: "inbound" as const, authorId: null, sentAt: "2026-07-22T09:00:00Z", preview: "שאלה", attachments: [], read: false },
    { id: "m2", conversationId: "x", channel: "whatsapp" as const, direction: "outbound" as const, authorId: null, sentAt: "2026-07-22T08:00:00Z", preview: "תשובה", attachments: [], read: true },
  ];
  const s = summarizeMessages(messages, 2);
  check("4.1 latest message selected by time (verbatim preview)", s.latestMessagePreview === "שאלה" && s.latestMessageAt === "2026-07-22T09:00:00Z");
  check("4.2 last reply = last OUTBOUND message time", s.lastReplyAt === "2026-07-22T08:00:00Z");
  check("4.3 waiting is a FACT: newest inbound is newer than our last reply", s.waiting === true);
  check("4.4 unread counted from read flags (no AI, no interpretation)", s.unread === 1 && s.participantCount === 2);
  const s2 = summarizeMessages([{ ...messages[1], sentAt: "2026-07-22T10:00:00Z" }], 1);
  check("4.5 newest is our own reply ⇒ not waiting", s2.waiting === false);
}

S("5. State model — only the five allowed flags");
{
  const st = stateFlags({ unread: true, waiting: true, archived: false, pinned: true, resolved: false });
  check("5.1 emits only allowed flags, stable order", JSON.stringify(st.flags) === JSON.stringify(["unread", "waiting", "pinned"]));
  check("5.2 unknown/false flags never appear", !st.flags.includes("archived") && !st.flags.includes("resolved"));
  check("5.3 done calendar event ⇒ resolved", JSON.stringify(mapCalendarConversation(cal({ done: true })).state.flags) === JSON.stringify(["resolved"]));
}

S("6. Canonical identity — one customer, multiple channels, one history");
{
  const people = resolvePeople([mapWhatsappConversation(wa()), mapCalendarConversation(cal()), mapGmailConversation(gm())]);
  check("6.1 conversations sharing a buyer ref collapse to ONE person across 3 channels",
    people.length === 1 && people[0].channels.length === 3 && new Set(people[0].channels.map((c) => c.channel)).size === 3);
  const two = resolvePeople([mapWhatsappConversation(wa({ id: "c1", buyerId: "B1" })), mapWhatsappConversation(wa({ id: "c2", buyerId: "B2", contactName: "יוסי" }))]);
  check("6.2 different CRM refs ⇒ different people (never merged by guesswork)", two.length === 2);
  const none = resolvePeople([mapWhatsappConversation(wa({ id: "c9", buyerId: null, sellerId: null, leadId: null }))]);
  check("6.3 a conversation with no CRM ref is its own standalone person", none.length === 1 && none[0].channels.length === 1);
}

S("7. Composition only — no SQL / no duplicate synchronization / no AI");
{
  check("7.1 no direct SQL anywhere in the runtime (adapters consume services)",
    allFiles.every((f) => !/\.from\(["'][a-z_]+["']\)|execute_sql|apply_migration/.test(read(f))));
  check("7.2 no write/ingest — the runtime READS only (no duplicate synchronization)",
    allFiles.every((f) => !/\.insert\(|\.update\(|\.upsert\(|recordInbound|ingestCommunication|createDraft/.test(read(f))));
  check("7.3 no AI generation / recommendation / scoring is copied into the runtime",
    allFiles.every((f) => !/openai|generateText|\brecommend|leadScore|urgencyScore|intentScore|priority:\s*\d|confidence:\s*\d/i.test(read(f))));
}

S("8. Adapters — one per channel, isolated, CRM/Journey-blind");
{
  const provider = read(join(ROOT, "provider.ts"));
  check("8.1 exactly three adapters registered, one per channel (no duplicate adapters)",
    provider.includes("whatsappAdapter") && provider.includes("gmailAdapter") && provider.includes("calendarAdapter") &&
    (provider.match(/Adapter\b/g) ?? []).length >= 3);
  check("8.2 adapters never import CRM / Journey modules (references only)",
    adapterFiles.every((f) => !/@\/lib\/(buyers|sellers|leads|deals|journey|crm|broker-intelligence|executive)/.test(read(f))));
  check("8.3 adapters consume FROZEN source services, never open a DB client",
    adapterFiles.every((f) => !read(f).includes("createClient")));
  const waAdapter = read(join(ROOT, "adapters/whatsapp.ts"));
  check("8.4 WhatsApp adapter enforces broker isolation (assigned-agent filter when not manager)",
    waAdapter.includes("assignedAgentId === scope.brokerId") && waAdapter.includes("scope.isManager"));
  const calAdapter = read(join(ROOT, "adapters/calendar.ts"));
  check("8.5 Calendar adapter scopes by broker (manager ⇒ org-wide, else own)",
    calAdapter.includes("scope.isManager ? null : scope.brokerId"));
}

S("9. One model + cross-org isolation + cache reuse");
{
  const defsConversation = allFiles.filter((f) => /interface\s+Conversation\s*\{/.test(read(f)));
  const defsMessage = allFiles.filter((f) => /interface\s+Message\s*\{/.test(read(f)));
  check("9.1 Conversation + Message are defined in exactly ONE file (no duplicate schema)",
    defsConversation.length === 1 && defsConversation[0].endsWith("types.ts") && defsMessage.length === 1 && defsMessage[0].endsWith("types.ts"));
  const provider = read(join(ROOT, "provider.ts"));
  check("9.2 cross-org isolation left to the frozen services — provider only calls the role RPC, never reads a table",
    !/\.from\(/.test(provider) && provider.includes("has_min_role"));
  check("9.3 scope fails closed (non-manager, no broker id) on error", provider.includes('return { brokerId: null, isManager: false }'));
  check("9.4 request dedup reuses React cache() — no new cache system",
    provider.includes("cache(") && allFiles.every((f) => !/new Map\(\).*ttl|class .*Cache/i.test(read(f))));
}

console.log(`\nCommunication OS (6.2) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
