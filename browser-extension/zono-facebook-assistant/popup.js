// ============================================================================
// ZONO Facebook Assistant — popup logic (v0.3).
// PERSISTENT CONNECTED STATE: a paired extension always renders connected. A
// failed or empty "רענן פוסט הבא" NEVER reverts to the onboarding/pairing screen
// and NEVER clears credentials — only the explicit "נתק תוסף" does. Every publish
// is human-driven; there is no DOM auto-click here. Uses global decideView /
// isConnectedView from popup-logic.js.
// ============================================================================
const $ = (id) => document.getElementById(id);
let currentPost = null;

function send(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

// Apply a decided view to the cards. Connected chrome stays visible for every
// paired view; the pairing/onboarding cards appear ONLY when unpaired.
function applyView(decided, fb) {
  const connected = isConnectedView(decided.view);
  $("connCard").style.display = connected ? "block" : "none";
  $("groupsCard").style.display = connected ? "block" : "none";
  $("pairCard").style.display = connected ? "none" : "block";
  $("baseCard").style.display = connected ? "none" : "block";
  $("postCard").style.display = decided.view === "POST_READY" ? "block" : "none";
  $("statusMsg").textContent = decided.msg || "";
  if (connected && typeof fb === "boolean") {
    $("connFb").textContent = fb ? "Facebook זוהה ✓" : "Facebook לא זוהה — פתח פייסבוק מחובר בדפדפן.";
  }
}

function renderPost(post) {
  currentPost = post;
  if (!post) return;
  $("dest").textContent = post.destinationName || "יעד פרסום";
  $("text").textContent = [post.text, (post.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  const img = post.imageUrls && post.imageUrls[0];
  const thumb = $("thumb"); const openImg = $("openImgBtn");
  if (img) { thumb.src = img; thumb.style.display = "block"; openImg.style.display = "inline-block"; }
  else { thumb.removeAttribute("src"); thumb.style.display = "none"; openImg.style.display = "none"; }
}

// Non-destructive: request the next post, decide the view, keep the user CONNECTED
// on empty/error. Credentials are never touched here.
async function refresh() {
  const r = (await send("NEXT_POST", {})) || { paired: false };
  const decided = decideView(r);
  applyView(decided);
  if (decided.view === "POST_READY") renderPost(r.post);
  else currentPost = null;
}

// Bootstrap: hydrate persisted pairing state, render connected immediately, then
// fetch the next post. Reopening the popup never requires pairing again.
async function init() {
  const st = (await send("STATE", {})) || {};
  if (st.zonoBase) $("base").value = st.zonoBase;
  if (st.lastImport) $("scanMsg").textContent = `יובאו ${st.lastImport.imported ?? 0} · עודכנו ${st.lastImport.updated ?? 0}`;
  applyView({ view: st.paired ? "NO_POST" : "UNPAIRED", msg: "" }, st.fbSessionDetected);
  if (st.paired) await refresh();
}

$("baseBtn").addEventListener("click", async () => { await send("SET_BASE", { base: $("base").value.trim() }); $("pairMsg").textContent = "הכתובת נשמרה"; });
$("scanBtn").addEventListener("click", async () => { await send("SCAN_NOW", {}); $("scanMsg").textContent = "פותח את רשימת הקבוצות שלך וסורק… הקבוצות יופיעו ב-ZONO בסיום."; });

$("pairBtn").addEventListener("click", async () => {
  const code = $("code").value.trim(); if (!code) return;
  const res = await send("PAIR", { code });
  $("pairMsg").textContent = res.ok ? "חובר בהצלחה ✓" : `שגיאה: ${res.error || "קוד לא תקין"}`;
  if (res.ok) { applyView({ view: "NO_POST", msg: "" }); await refresh(); }
});

// EXPLICIT disconnect ONLY — the sole path that clears local credentials.
$("resetBtn").addEventListener("click", async () => {
  await send("RESET", {});
  currentPost = null;
  applyView({ view: "UNPAIRED", msg: "התוסף נותק. הזן קוד חיבור חדש כדי להתחבר מחדש." });
});

$("copyBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  await navigator.clipboard.writeText(currentPost.text || "");
  $("postMsg").textContent = "הטקסט הועתק";
  send("EVENT", { postId: currentPost.postId, event: "copied" });
});
$("openBtn").addEventListener("click", () => {
  if (currentPost && currentPost.destinationUrl) { chrome.tabs.create({ url: currentPost.destinationUrl }); send("EVENT", { postId: currentPost.postId, event: "opened" }); }
});
$("openImgBtn").addEventListener("click", () => {
  const url = currentPost && currentPost.imageUrls && currentPost.imageUrls[0];
  if (url) chrome.tabs.create({ url });
});
$("publishedBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  const url = prompt("הדבק קישור לפוסט שפורסם (לא חובה):") || null;
  const r = await send("REPORT", { payload: { postId: currentPost.postId, result: "user_confirmed_published", externalPostUrl: url } });
  $("postMsg").textContent = r.ok ? "דווח כפורסם ✓" : "הדיווח נכשל";
  if (r.ok) await refresh();
});
$("failedBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  const reason = prompt("מה הסיבה לכשל? (לא חובה)") || null;
  await send("REPORT", { payload: { postId: currentPost.postId, result: "failed", errorMessage: reason } });
  await refresh();
});
$("skipBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  await send("REPORT", { payload: { postId: currentPost.postId, result: "user_skipped" } });
  await refresh();
});
$("refreshBtn").addEventListener("click", refresh);

init();
