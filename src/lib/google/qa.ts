// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — SELF TEST (Part 9).
//
// Runnable gate: `npx tsx src/lib/google/qa.ts`. Combines behavioral tests of
// the pure Meet logic with source-level guards that lock the security and
// architecture invariants (encrypted tokens, PKCE+state, least privilege, no
// tokens in browser/logs, idempotent+duplicate-safe writes, Gmail maps into the
// existing Communication model with no new email model, contacts read-only +
// never auto-merge, cross-org RLS). Exits non-zero on any failure.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetCreateRequest, extractMeetLink, shouldCreateMeet } from "./meet";

const ROOT = process.cwd();
const LIB = join(ROOT, "src/lib/google");
const API = join(ROOT, "src/app/api/google");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed += 1; console.log("  ✓ " + name); }
  else { failed += 1; console.error("  ✗ " + name); }
}

// Source files.
const oauth = read(join(LIB, "oauth.ts"));
const tokens = read(join(LIB, "tokens.ts"));
const calendar = read(join(LIB, "calendar.ts"));
const gmail = read(join(LIB, "gmail.ts"));
const contacts = read(join(LIB, "contacts.ts"));
const sync = read(join(LIB, "sync.ts"));
const types = read(join(LIB, "types.ts"));
const adapter = read(join(ROOT, "src/lib/communication-os/adapters/gmail.ts"));
const cbRoute = read(join(API, "oauth/callback/route.ts"));
const startRoute = read(join(API, "oauth/route.ts"));
const webhook = read(join(API, "calendar-webhook/route.ts"));
const disconnect = read(join(API, "disconnect/route.ts"));
const mig = read(join(ROOT, "supabase/migrations/20261015090000_google_workspace.sql"));
const guard = read(join(ROOT, "scripts/check-journey-boundaries.mjs"));

console.log("\nGoogle Workspace OS (6.5) — SELF TEST\n");

// ── Part 1 · OAuth ────────────────────────────────────────────────────────────
check("1.1 PKCE S256 challenge (sha256 → base64url, method S256)",
  /createHash\("sha256"\)[\s\S]*?digest\("base64url"\)/.test(strip(oauth)) && oauth.includes('code_challenge_method: "S256"'));
check("1.2 CSRF state is HMAC-signed and verified with a timing-safe compare",
  oauth.includes("createHmac") && oauth.includes("timingSafeEqual"));
check("1.3 offline access + prompt=consent → refresh tokens issued",
  oauth.includes('access_type: "offline"') && oauth.includes('prompt: "consent"'));
check("1.4 least privilege: Contacts is READ-ONLY and no full-mail scope",
  oauth.includes("contacts.readonly") && !oauth.includes("https://mail.google.com") && !/auth\/contacts["' ]/.test(oauth.replace("contacts.readonly", "")));
check("1.5 token revocation endpoint is used on disconnect",
  oauth.includes("oauth2.googleapis.com/revoke") && disconnect.includes("revokeToken"));
check("1.6 the callback binds state to the CURRENT session user (no cross-user)",
  cbRoute.includes("payload.userId !== sc.user.id") && cbRoute.includes("payload.orgId !== sc.profile.org_id"));
check("1.7 start route redirects to Google ONLY when configured AND enabled",
  startRoute.includes("cfg.ready"));

// ── Part 7 · Security (tokens) ──────────────────────────────────────────────
check("2.1 tokens are ENCRYPTED before storage (encryptSecret on write)",
  tokens.includes("encryptSecret(input.accessToken)") && tokens.includes("encryptSecret(t.accessToken)"));
check("2.2 refresh-token ROTATION: new refresh token stored only when returned",
  /t\.refreshToken \? \{ refresh_token_encrypted: encryptSecret\(t\.refreshToken\)/.test(strip(tokens)));
check("2.3 schema stores only *_encrypted token columns (no plaintext token col)",
  mig.includes("access_token_encrypted") && mig.includes("refresh_token_encrypted") && !/\baccess_token\s+text/.test(strip(mig)));
check("2.4 browser projection (toPublic) exposes NO token field",
  !/accessToken|refreshToken|_encrypted/.test(strip(tokens).split("export function toPublic")[1] ?? ""));
check("2.5 the whole google lib is server-only (oauth/tokens/calendar/gmail/contacts/sync)",
  [oauth, tokens, calendar, gmail, contacts, sync].every((f) => f.includes('import "server-only"')));
check("2.6 no token is ever console-logged in the google lib",
  ![oauth, tokens, calendar, gmail, contacts, sync].some((f) => /console\.(log|error|warn)\([^)]*(token|Token)/.test(f)));
check("2.7 the connect audit records scope COUNT + email only — never a token",
  cbRoute.includes("scopes: grantedScopes.length") && !/metadata:\s*\{[^}]*access_token/.test(cbRoute));
check("2.8 cross-org isolation: every SELECT policy is gated on current_org_id()",
  (mig.match(/for select using \(\s*org_id = public\.current_org_id\(\)/g) ?? []).length >= 4);
check("2.9 google_connections has NO write policy (tokens are service-role only)",
  !/create policy[^;]*google_connections[^;]*for (insert|update|delete)/i.test(mig));

// ── Part 2 · Calendar ─────────────────────────────────────────────────────────
check("3.1 idempotent create: a request id is written to extendedProperties",
  calendar.includes("zono_request_id") && calendar.includes("requestId"));
check("3.2 update never STRIPS an existing Meet link unless addMeet is set",
  calendar.includes("delete (body as { conferenceData?: unknown }).conferenceData"));
check("3.3 delete is idempotent (a 410 already-gone counts as success)",
  /error\.type !== "gone"/.test(calendar));
check("3.4 recurring events: RRULE recurrence is passed through verbatim",
  calendar.includes("recurrence: input.recurrence"));
check("3.5 timezone is carried on start/end (GoogleEventDateTime.timeZone)",
  types.includes("timeZone: string | null") && calendar.includes("start: input.start"));
check("3.6 incremental sync uses syncToken and full-resyncs on a stale (410) token",
  calendar.includes("query.syncToken = syncToken") && calendar.includes("fullResyncRequired"));
check("3.7 watch channel is opened with a shared token for webhook verification",
  calendar.includes("events/watch") && calendar.includes("token"));

// ── Part 5 · Meet (behavioral) ────────────────────────────────────────────────
check("4.1 meetCreateRequest carries the requestId + hangoutsMeet solution", (() => {
  const r = meetCreateRequest("rid-123") as { createRequest?: { requestId?: string; conferenceSolutionKey?: { type?: string } } };
  return r.createRequest?.requestId === "rid-123" && r.createRequest?.conferenceSolutionKey?.type === "hangoutsMeet";
})());
check("4.2 extractMeetLink returns the hangoutLink when present",
  extractMeetLink("https://meet.google.com/abc", null) === "https://meet.google.com/abc");
check("4.3 extractMeetLink returns null when absent (never fabricated)",
  extractMeetLink(null, null) === null && extractMeetLink("", { entryPoints: [] }) === null);
check("4.4 extractMeetLink reads a video entry point from conferenceData",
  extractMeetLink(null, { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz" }] }) === "https://meet.google.com/xyz");
check("4.5 shouldCreateMeet is false when a link already exists (never duplicate)",
  shouldCreateMeet(true, "https://meet.google.com/existing") === false && shouldCreateMeet(true, null) === true);

// ── Part 3 · Gmail ──────────────────────────────────────────────────────────
check("5.1 reply preserves thread integrity (In-Reply-To + References + threadId)",
  gmail.includes('"In-Reply-To"') && gmail.includes('headers["References"]') && gmail.includes("threadId: input.threadId"));
check("5.2 attachments are METADATA only (no body bytes in the type)",
  types.includes("GmailAttachmentMeta") && !/bytes:\s*Buffer|data:\s*string/.test(types.split("GmailAttachmentMeta")[1]?.split("}")[0] ?? ""));
check("5.3 unread state is handled via label modify",
  gmail.includes("setThreadUnread") && gmail.includes("UNREAD"));
check("5.4 Gmail maps into the EXISTING model via mapGmailConversation (no new email model)",
  adapter.includes("mapGmailConversation") && !types.includes("interface Conversation") && !gmail.includes("interface Conversation"));
check("5.5 the adapter degrades to honest empty when not connected",
  gmail.includes('conn.status !== "connected"') && gmail.includes("return []"));

// ── Part 4 · Contacts ─────────────────────────────────────────────────────────
check("6.1 contacts are READ-ONLY (readonly scope; no People write call)",
  contacts.includes("people/me/connections") && !/people\.[a-z]+\.create|:batchCreate|updateContact/i.test(contacts));
check("6.2 NEVER auto-merge: staging writes only the staging table; merge is explicit",
  contacts.includes("google_contact_imports") && contacts.includes("markContactMerged") && !/from\(["'](buyers|leads|sellers|contacts)["']\)/.test(contacts));
check("6.3 staged contacts are unique per resourceName (no duplicate import)",
  mig.includes("unique (connection_id, resource_name)"));

// ── Part 6 · Sync engine ────────────────────────────────────────────────────
check("7.1 duplicate detection: unique (connection, calendar, event)",
  mig.includes("uq_google_event unique (connection_id, google_calendar_id, google_event_id)"));
check("7.2 idempotent outbound create returns the existing mapping (duplicate=true)",
  sync.includes("getMappingByInternalRef") && sync.includes("duplicate: true"));
check("7.3 conflict detection: an etag change lets Google win (source of truth)",
  sync.includes("existing.etag !== ev.etag") && sync.includes("conflicts"));
check("7.4 webhook idempotency: unique (channel, message#) processed once",
  mig.includes("uq_google_webhook unique (channel_id, message_number)") && sync.includes("recordWebhookOnce"));
check("7.5 webhook verification: timing-safe token compare, fail closed 401",
  webhook.includes("timingSafeEqual") && webhook.includes("status: 401"));
check("7.6 incoming Google events are upserted by event id (no duplicate import)",
  sync.includes("onConflict: \"connection_id,google_calendar_id,google_event_id\""));

// ── Architecture ─────────────────────────────────────────────────────────────
check("8.1 boundary guard registers src/lib/google as a Tier-A composition dir",
  guard.includes('"src/lib/google"'));
check("8.2 sync marks the connection state during work (syncing → connected)",
  sync.includes('setConnectionStatus(conn.id, "syncing")') && sync.includes("markSynced"));

console.log(`\nGoogle Workspace OS (6.5) SELF TEST: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
