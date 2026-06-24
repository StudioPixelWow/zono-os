// ============================================================================
// ZONO Facebook Assistant — background service worker (skeleton).
// Sends heartbeats to ZONO and fetches the next prepared post. NEVER reads or
// transmits Facebook cookies, passwords, or session tokens. Only a boolean
// "facebook session detected" flag (computed by the content script) is sent.
// ============================================================================
const ZONO_BASE = "https://app.zono.example"; // set to your ZONO deployment origin
const VERSION = "0.1.0";

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

// Pairing: exchange a user-entered code for an instanceId + secret (stored locally).
async function completePairing(code) {
  const res = await fetch(`${ZONO_BASE}/api/extension/facebook/pairing/complete`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, version: VERSION }),
  });
  const json = await res.json();
  if (!json.ok) return { ok: false, error: json.error };
  await chrome.storage.local.set({ instanceId: json.instanceId, secret: json.secret });
  return { ok: true };
}

// Heartbeat: report version + fb-session-detected flag (no credentials).
async function heartbeat(facebookSessionDetected, facebookProfileName) {
  const creds = await getCreds();
  if (!creds) return;
  await fetch(`${ZONO_BASE}/api/extension/facebook/heartbeat`, {
    method: "POST", headers: authHeaders(creds),
    body: JSON.stringify({ version: VERSION, facebookSessionDetected, facebookProfileName: facebookProfileName ?? null }),
  }).catch(() => {});
}

async function fetchNextPost() {
  const creds = await getCreds();
  if (!creds) return null;
  const res = await fetch(`${ZONO_BASE}/api/extension/facebook/next-post`, { headers: authHeaders(creds) });
  const json = await res.json();
  return json.ok ? json.post : null;
}

async function reportResult(payload) {
  const creds = await getCreds();
  if (!creds) return false;
  const res = await fetch(`${ZONO_BASE}/api/extension/facebook/publish-result`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify(payload),
  });
  const json = await res.json();
  return !!json.ok;
}

// Lightweight interaction event (opened | copied) — NOT a publish.
async function reportEvent(postId, event) {
  const creds = await getCreds();
  if (!creds) return false;
  const res = await fetch(`${ZONO_BASE}/api/extension/facebook/event`, {
    method: "POST", headers: authHeaders(creds), body: JSON.stringify({ postId, event }),
  });
  const json = await res.json();
  return !!json.ok;
}

// Periodic heartbeat (the content script supplies the session flag via message).
chrome.alarms.create("heartbeat", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "heartbeat") heartbeat(false, null);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "PAIR") sendResponse(await completePairing(msg.code));
    else if (msg.type === "HEARTBEAT") { await heartbeat(msg.facebookSessionDetected, msg.facebookProfileName); sendResponse({ ok: true }); }
    else if (msg.type === "NEXT_POST") sendResponse({ post: await fetchNextPost() });
    else if (msg.type === "EVENT") sendResponse({ ok: await reportEvent(msg.postId, msg.event) });
    else if (msg.type === "REPORT") sendResponse({ ok: await reportResult(msg.payload) });
  })();
  return true; // async response
});
