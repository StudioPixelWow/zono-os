// ============================================================================
// ZONO Facebook Assistant — background service worker (v0.2).
// Talks ONLY to ZONO's canonical extension APIs. NEVER reads or transmits
// Facebook cookies, passwords, or session tokens — only the group/comment
// metadata the user themselves can see, on their explicit import, plus a boolean
// "facebook session detected" flag computed by the content script.
//
// Responsibilities:
//   • pairing  → /api/extension/facebook/pairing/complete
//   • heartbeat → /api/extension/facebook/heartbeat   (reads back scanRequested)
//   • groups   → /api/extension/facebook/groups       (P4 import)
//   • comments → /api/extension/facebook/comments      (P5 social-lead ingest)
//   • next-post / publish-result / event               (P0 human-confirmed publish)
// No new queue, no publishing model here — the server owns the canonical state.
// ============================================================================
const DEFAULT_BASE = "https://zono-os-ro2s.vercel.app";
const VERSION = "0.2.0";

async function getBase() {
  const { zonoBase } = await chrome.storage.local.get(["zonoBase"]);
  return (zonoBase || DEFAULT_BASE).replace(/\/+$/, "");
}
async function getCreds() {
  const { instanceId, secret } = await chrome.storage.local.get(["instanceId", "secret"]);
  return instanceId && secret ? { instanceId, secret } : null;
}
function authHeaders(creds) {
  return {
    "content-type": "application/json",
    "x-zono-instance-id": creds.instanceId,
    "x-zono-extension-secret": creds.secret,
  };
}

// ── Pairing ──────────────────────────────────────────────────────────────────
async function completePairing(code) {
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/pairing/complete`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, version: VERSION }),
  });
  const json = await res.json().catch(() => ({ ok: false, error: "bad response" }));
  if (!json.ok) return { ok: false, error: json.error };
  await chrome.storage.local.set({ instanceId: json.instanceId, secret: json.secret });
  return { ok: true };
}

// ── Heartbeat (returns scanRequested so we know when to import groups) ────────
async function heartbeat(facebookSessionDetected, facebookProfileName) {
  // Cache the last known Facebook-session flag (non-secret boolean) so the popup
  // can render "Facebook זוהה" on open without a network round-trip.
  await chrome.storage.local.set({ lastFbSession: facebookSessionDetected === true });
  const creds = await getCreds();
  if (!creds) return { ok: false };
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/heartbeat`, {
    method: "POST", headers: authHeaders(creds),
    body: JSON.stringify({ version: VERSION, facebookSessionDetected, facebookProfileName: facebookProfileName ?? null }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  // Pull directive: the ZONO UI asked for a group import → open the joined-groups
  // page and let the content script scan it.
  if (json && json.scanRequested) await triggerGroupScan();
  return json || { ok: false };
}

// ── Group import (P4) ────────────────────────────────────────────────────────
async function triggerGroupScan() {
  await chrome.storage.local.set({ scanPending: true, scanPendingAt: Date.now() });
  // Open (or focus) the joined-groups page; the content script picks up scanPending.
  const url = "https://www.facebook.com/groups/joins/";
  const tabs = await chrome.tabs.query({ url: "https://*.facebook.com/*" });
  if (tabs && tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

async function submitGroups(groups) {
  const creds = await getCreds();
  if (!creds || !Array.isArray(groups) || !groups.length) return { ok: false, error: "no groups" };
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/groups`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify({ groups }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({ ok: false })) : { ok: false };
  if (json && json.ok) await chrome.storage.local.set({ scanPending: false, lastImport: { ...json, at: Date.now() } });
  return json;
}

// ── Comment ingest (P5) ──────────────────────────────────────────────────────
async function submitComments(comments) {
  const creds = await getCreds();
  if (!creds || !Array.isArray(comments) || !comments.length) return { ok: false, error: "no comments" };
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/comments`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify({ comments }),
  }).catch(() => null);
  return res ? await res.json().catch(() => ({ ok: false })) : { ok: false };
}

// Watched posts: map an external FB post URL → our canonical postId, so the
// content script can attribute comments it reads to the right ZONO post.
async function watchPost(url, postId) {
  if (!url || !postId) return;
  const { watchedPosts } = await chrome.storage.local.get(["watchedPosts"]);
  const map = watchedPosts || {};
  map[url] = postId;
  await chrome.storage.local.set({ watchedPosts: map });
}
async function getWatchedPosts() {
  const { watchedPosts } = await chrome.storage.local.get(["watchedPosts"]);
  return watchedPosts || {};
}

// ── Prepared-post delivery + human-confirmed result (P0) ─────────────────────
// Returns a STRUCTURED result so the popup can tell apart:
//   • unpaired            → { ok:false, paired:false }
//   • paired, a post      → { ok:true,  paired:true, post }
//   • paired, no post     → { ok:true,  paired:true, post:null }
//   • paired, auth error  → { ok:false, paired:true, error:"auth" }   (creds KEPT)
//   • paired, net/5xx     → { ok:false, paired:true, error:"network" }(creds KEPT)
// CRITICAL: a failed fetch NEVER clears credentials. Only an explicit RESET does.
async function fetchNextPost() {
  const creds = await getCreds();
  if (!creds) return { ok: false, paired: false, post: null };
  const base = await getBase();
  let res;
  try {
    res = await fetch(`${base}/api/extension/facebook/next-post`, { headers: authHeaders(creds) });
  } catch {
    return { ok: false, paired: true, post: null, error: "network" };
  }
  // A single 401/403 is treated as retryable (transient deploy / cold start / clock
  // skew) — we do NOT wipe the pairing here. Terminal revocation is surfaced by ZONO
  // and handled by the explicit reconnect flow, never by auto-clearing local creds.
  if (res.status === 401 || res.status === 403) return { ok: false, paired: true, post: null, error: "auth" };
  if (!res.ok) return { ok: false, paired: true, post: null, error: `http_${res.status}` };
  const json = await res.json().catch(() => ({}));
  return { ok: true, paired: true, post: json && json.ok ? json.post : null };
}
async function reportResult(payload) {
  const creds = await getCreds();
  if (!creds) return false;
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/publish-result`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify(payload),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  // If a real post URL was confirmed, watch it so we can later capture its comments.
  if (json && json.ok && payload.result === "user_confirmed_published" && payload.externalPostUrl) {
    await watchPost(payload.externalPostUrl, payload.postId);
  }
  return !!(json && json.ok);
}
async function reportEvent(postId, event) {
  const creds = await getCreds();
  if (!creds) return false;
  const base = await getBase();
  const res = await fetch(`${base}/api/extension/facebook/event`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify({ postId, event }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  return !!(json && json.ok);
}

// Periodic heartbeat fallback (content script supplies the real session flag).
chrome.alarms.create("heartbeat", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "heartbeat") heartbeat(false, null); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "PAIR": sendResponse(await completePairing(msg.code)); break;
      case "SET_BASE": await chrome.storage.local.set({ zonoBase: (msg.base || "").replace(/\/+$/, "") }); sendResponse({ ok: true }); break;
      case "HEARTBEAT": sendResponse(await heartbeat(msg.facebookSessionDetected, msg.facebookProfileName)); break;
      case "SCAN_NOW": await triggerGroupScan(); sendResponse({ ok: true }); break;
      case "GROUPS_SCANNED": sendResponse(await submitGroups(msg.groups)); break;
      case "COMMENTS_SCANNED": sendResponse(await submitComments(msg.comments)); break;
      case "GET_WATCHED": sendResponse({ watched: await getWatchedPosts() }); break;
      case "NEXT_POST": sendResponse(await fetchNextPost()); break;
      case "EVENT": sendResponse({ ok: await reportEvent(msg.postId, msg.event) }); break;
      case "REPORT": sendResponse({ ok: await reportResult(msg.payload) }); break;
      // Popup hydration: report the persisted connection state (non-secret). Lets the
      // popup render CONNECTED immediately on open without a pairing round-trip.
      case "STATE": {
        const creds = await getCreds();
        const base = await getBase();
        const { lastFbSession, lastImport } = await chrome.storage.local.get(["lastFbSession", "lastImport"]);
        sendResponse({ paired: !!creds, zonoBase: base, fbSessionDetected: lastFbSession === true, lastImport: lastImport ?? null });
        break;
      }
      // EXPLICIT disconnect ONLY. This is the single place local credentials are
      // cleared. Refresh-next-post and error handling never reach this path.
      case "RESET": await chrome.storage.local.remove(["instanceId", "secret", "lastFbSession"]); sendResponse({ ok: true }); break;
      default: sendResponse({ ok: false, error: "unknown" });
    }
  })();
  return true; // async
});
